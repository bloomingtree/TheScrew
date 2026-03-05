import { ipcMain } from 'electron';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
const JSZip = require('jszip');

// ============================================================================
// Word 文档预览 IPC 处理器
// ============================================================================

export interface WordParagraph {
  index: number;
  text: string;
  length: number;
  level?: number;  // 1=heading1, 2=heading2, etc.
}

export interface WordTableCell {
  text: string;
}

export interface WordTableRow {
  index: number;
  cells: WordTableCell[];
}

export interface WordTable {
  index: number;
  rows: WordTableRow[];
}

export interface WordPreviewData {
  filepath: string;
  structure: {
    paragraphs: WordParagraph[];
    tables: WordTable[];
  };
  html: string;
  metadata: {
    path: string;
    size?: number;
    modified?: string;
  };
  // 保存原始文档数据用于编辑
  originalXml?: string;
}

export type EditLocation =
  | { type: 'paragraph'; index: number }
  | { type: 'table'; tableIndex: number; rowIndex: number; columnIndex: number };

/**
 * 使用 mammoth 库解析 DOCX
 * 使用自定义样式映射来正确识别标题
 */
async function parseDocxWithMammoth(filepath: string): Promise<WordPreviewData> {
  try {
    // 使用 require 而不是 import，在 Electron 环境中更可靠
    let mammoth: any;
    try {
      mammoth = require('mammoth');
    } catch (requireError) {
      console.error('[Word] Failed to load mammoth:', requireError);
      throw new Error('mammoth 库未安装或无法加载。请确保已运行: npm install mammoth');
    }

    const buffer = await readFile(filepath);
    const { stat } = await import('fs/promises');
    const stats = await stat(filepath);

    console.log('[Word] Parsing DOCX file:', filepath, 'Size:', buffer.length);

    // 使用 mammoth 转换为 HTML，使用自定义样式映射
    const result = await mammoth.convertToHtml(
      { buffer: buffer },
      {
        // 自定义样式映射：将 Word 标题样式转换为 HTML h1-h6 标签
        styleMap: [
          // 英文样式名称（带空格）
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Heading 5'] => h5:fresh",
          "p[style-name='Heading 6'] => h6:fresh",
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Subtitle'] => h2:fresh",
          // 英文样式名称（不带空格）
          "p[style-name='Heading1'] => h1:fresh",
          "p[style-name='Heading2'] => h2:fresh",
          "p[style-name='Heading3'] => h3:fresh",
          "p[style-name='Heading4'] => h4:fresh",
          "p[style-name='Heading5'] => h5:fresh",
          "p[style-name='Heading6'] => h6:fresh",
          // 中文名称的标题样式
          "p[style-name='标题 1'] => h1:fresh",
          "p[style-name='标题 2'] => h2:fresh",
          "p[style-name='标题 3'] => h3:fresh",
          "p[style-name='标题 4'] => h4:fresh",
          "p[style-name='标题 5'] => h5:fresh",
          "p[style-name='标题 6'] => h6:fresh",
          "p[style-name='标题1'] => h1:fresh",
          "p[style-name='标题2'] => h2:fresh",
          "p[style-name='标题3'] => h3:fresh",
          "p[style-name='标题4'] => h4:fresh",
          "p[style-name='标题5'] => h5:fresh",
          "p[style-name='标题6'] => h6:fresh",
        ].join('\n')
      }
    );

    const html = result.value;
    const messages = result.messages;

    console.log('[Word] HTML generated, length:', html.length);

    // 记录警告信息
    if (messages.length > 0) {
      const warnings = messages.filter((m: any) => m.type === 'warning');
      if (warnings.length > 0) {
        console.log('[Mammoth] Warnings:', warnings.map((m: any) => m.message));
      }
    }

    // 使用 JSZip 读取原始文档结构，保存原始 XML
    let originalXml = '';
    try {
      const zip = await JSZip.loadAsync(buffer);
      const documentXml = await zip.file('word/document.xml')?.async('string');
      if (documentXml) {
        originalXml = documentXml;
      }
    } catch (err) {
      console.warn('[Word] Could not extract original XML:', err);
    }

    // 提取段落和表格结构
    const paragraphs: WordParagraph[] = [];
    const tables: WordTable[] = [];

    let paraIndex = 0;
    let tableIndex = 0;

    // 使用正则解析 HTML，提取所有段落和标题
    // 匹配 <h1>-<h6> 和 <p> 标签
    const tagRegex = /<(h[1-6]|p)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
    let match;

    while ((match = tagRegex.exec(html)) !== null) {
      const [fullMatch, tag, content] = match;
      const text = content.replace(/<[^>]+>/g, '').trim();

      // 确定标题级别
      let level: number | undefined;
      if (tag === 'h1') level = 1;
      else if (tag === 'h2') level = 2;
      else if (tag === 'h3') level = 3;
      else if (tag === 'h4') level = 4;
      else if (tag === 'h5') level = 5;
      else if (tag === 'h6') level = 6;

      // 即使是空段落也添加，以便保留文档结构
      paragraphs.push({
        index: paraIndex++,
        text,
        length: text.length,
        level,
      });
    }

    console.log('[Word] Extracted', paragraphs.length, 'paragraphs');

    // 从 HTML 中提取表格
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;

    while ((tableMatch = tableRegex.exec(html)) !== null) {
      const [fullTable, tableContent] = tableMatch;
      const rows: WordTableRow[] = [];

      // 提取表格行
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch;
      let rowIndex = 0;

      while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
        const [, rowContent] = rowMatch;

        // 提取单元格
        const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        let cellMatch;
        const cells: WordTableCell[] = [];

        while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
          const [, cellContent] = cellMatch;
          cells.push({
            text: cellContent.replace(/<[^>]+>/g, '').trim(),
          });
        }

        if (cells.length > 0) {
          rows.push({
            index: rowIndex++,
            cells,
          });
        }
      }

      if (rows.length > 0) {
        tables.push({
          index: tableIndex++,
          rows,
        });
      }
    }

    console.log('[Word] Extracted', tables.length, 'tables');

    return {
      filepath,
      structure: {
        paragraphs,
        tables,
      },
      html,
      metadata: {
        path: filepath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
      },
      originalXml,
    };
  } catch (error: any) {
    console.error('[Word] Error parsing DOCX:', error);
    throw new Error(`解析 DOCX 文件失败: ${error.message}`);
  }
}

/**
 * 保存修改后的 DOCX 文件
 * 使用 JSZip 直接修改 document.xml 中的文本内容
 */
async function saveDocxFile(filepath: string, paragraphIndex: number, newText: string): Promise<boolean> {
  try {
    console.log('[Word] Saving DOCX file:', filepath, 'paragraph:', paragraphIndex);

    const buffer = await readFile(filepath);
    const zip = await JSZip.loadAsync(buffer);

    // 读取 document.xml
    const documentXml = await zip.file('word/document.xml')?.async('string');
    if (!documentXml) {
      throw new Error('无法读取文档内容');
    }

    // 替换指定段落的文本
    // 查找第 paragraphIndex 个 <w:t> 标签并替换其内容
    let currentPara = 0;
    const modifiedXml = documentXml.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, (match: string, content: string) => {
      // 跳过空段落
      if (!content.trim()) return match;

      // 如果是目标段落，替换内容
      if (currentPara === paragraphIndex) {
        console.log('[Word] Replacing paragraph', currentPara, 'with:', newText);
        // XML 转义
        const escapedText = newText
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `<w:t>${escapedText}</w:t>`;
      }
      currentPara++;
      return match;
    });

    // 更新 zip 文件
    zip.file('word/document.xml', modifiedXml);

    // 生成并保存
    const outputBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    await writeFile(filepath, outputBuffer);

    console.log('[Word] File saved successfully');
    return true;
  } catch (error: any) {
    console.error('[Word] Error saving DOCX:', error);
    throw new Error(`保存 DOCX 文件失败: ${error.message}`);
  }
}

export function registerWordHandlers() {
  // 预览 Word 文档
  ipcMain.handle('word:preview', async (_event, filepath: string) => {
    try {
      console.log('[Word] Preview requested for:', filepath);
      const ext = path.extname(filepath).toLowerCase();
      if (ext !== '.docx') {
        throw new Error('不支持的文件格式，仅支持 .docx 文件');
      }

      const data = await parseDocxWithMammoth(filepath);
      return { success: true, data };
    } catch (error: any) {
      console.error('[Word] Preview error:', error);
      return { success: false, error: error.message };
    }
  });

  // 编辑 Word 文档 - 保存单个段落
  ipcMain.handle('word:edit', async (_event, filepath: string, location: EditLocation, newContent: string) => {
    try {
      console.log('[Word] Edit requested for:', filepath, 'location:', location, 'content:', newContent);

      if (location.type === 'paragraph') {
        const success = await saveDocxFile(filepath, location.index, newContent);
        return { success, message: '保存成功' };
      } else {
        return { success: false, error: '暂不支持表格编辑' };
      }
    } catch (error: any) {
      console.error('[Word] Edit error:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('[IPC] Word preview handlers registered');
}
