import { ipcMain } from 'electron';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import PizZip from 'pizzip';
import { getWorkspacePath } from '../tools/FileTools';

// 编辑位置类型
export type EditLocation =
  | { type: 'paragraph'; index: number }
  | { type: 'table'; tableIndex: number; rowIndex: number; columnIndex: number };

// 预览数据类型
export interface WordPreviewData {
  filepath: string;
  structure: {
    paragraphs: Array<{ index: number; text: string; length: number; level?: number }>;
    tables: Array<{
      index: number;
      rows: Array<{
        index: number;
        cells: Array<{ text: string }>;
      }>;
    }>;
  };
  html: string;
  metadata: {
    path: string;
    size?: number;
    modified?: string;
  };
}

/**
 * 将Word文档转换为HTML用于预览
 */
async function wordToHtml(filepath: string): Promise<string> {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) {
    throw new Error('工作空间未设置');
  }

  const fullPath = path.resolve(workspacePath, filepath);
  const content = await readFile(fullPath);
  const zip = new PizZip(content);

  // 读取document.xml
  const docXml = zip.file('word/document.xml')?.asText() || '';

  // 简单的Word XML转HTML
  let html = '<div class="word-preview">';

  // 提取段落
  const paragraphRegex = /<w:p[^>]*>[\s\S]*?<\/w:p>/g;
  const textRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  const paragraphs = docXml.match(paragraphRegex) || [];

  for (const paragraphXml of paragraphs) {
    const textMatches = paragraphXml.match(textRegex);
    const text = textMatches
      ? textMatches.map(m => m.replace(/<[^>]*>/g, '')).join('')
      : '';

    // 检测标题（通过样式）
    if (paragraphXml.includes('w:val="Heading1"')) {
      html += `<h1>${text}</h1>`;
    } else if (paragraphXml.includes('w:val="Heading2"')) {
      html += `<h2>${text}</h2>`;
    } else if (paragraphXml.includes('w:val="Heading3"')) {
      html += `<h3>${text}</h3>`;
    } else {
      html += `<p class="mb-4">${text || '&nbsp;'}</p>`;
    }
  }

  // 提取表格
  const tableRegex = /<w:tbl[^>]*>[\s\S]*?<\/w:tbl>/g;
  const tables = docXml.match(tableRegex) || [];

  for (const tableXml of tables) {
    html += '<table class="w-full border-collapse border border-gray-300 my-4">';

    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows = tableXml.match(rowRegex) || [];

    let isFirstRow = true;
    for (const rowXml of rows) {
      html += '<tr>';

      const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
      const cells = rowXml.match(cellRegex) || [];

      for (const cellXml of cells) {
        const cellText = cellXml.replace(/<[^>]*>/g, '').trim();
        const cellTag = isFirstRow ? 'th' : 'td';
        const cellClass = isFirstRow
          ? 'px-4 py-2 bg-gray-100 font-semibold border border-gray-300'
          : 'px-4 py-2 border border-gray-300';
        html += `<${cellTag} class="${cellClass}">${cellText}</${cellTag}>`;
      }

      html += '</tr>';
      isFirstRow = false;
    }

    html += '</table>';
  }

  html += '</div>';
  return html;
}

/**
 * 获取Word文档结构
 */
async function getWordStructure(filepath: string) {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) {
    throw new Error('工作空间未设置');
  }

  const fullPath = path.resolve(workspacePath, filepath);
  const content = await readFile(fullPath);
  const zip = new PizZip(content);

  const docXml = zip.file('word/document.xml')?.asText() || '';

  // 提取段落
  const paragraphRegex = /<w:p[^>]*>[\s\S]*?<\/w:p>/g;
  const textRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  const paragraphs: Array<{ index: number; text: string; length: number; level?: number }> = [];
  let paragraphMatch;
  let paraIndex = 0;

  while ((paragraphMatch = paragraphRegex.exec(docXml)) !== null) {
    const paragraphXml = paragraphMatch[0];
    const textMatches = paragraphXml.match(textRegex);
    const text = textMatches
      ? textMatches.map(m => m.replace(/<[^>]*>/g, '')).join('')
      : '';

    // 检测标题级别
    let level: number | undefined = undefined;
    if (paragraphXml.includes('w:val="Heading1"')) {
      level = 1;
    } else if (paragraphXml.includes('w:val="Heading2"')) {
      level = 2;
    } else if (paragraphXml.includes('w:val="Heading3"')) {
      level = 3;
    } else if (paragraphXml.includes('w:val="Heading4"')) {
      level = 4;
    } else if (paragraphXml.includes('w:val="Heading5"')) {
      level = 5;
    } else if (paragraphXml.includes('w:val="Heading6"')) {
      level = 6;
    }

    paragraphs.push({
      index: paraIndex++,
      text: text,
      length: text.length,
      level: level,
    });
  }

  // 提取表格
  const tableRegex = /<w:tbl[^>]*>[\s\S]*?<\/w:tbl>/g;
  const tables: Array<{
    index: number;
    rows: Array<{
      index: number;
      cells: Array<{ text: string }>;
    }>;
  }> = [];
  let tableMatch;
  let tableIndex = 0;

  while ((tableMatch = tableRegex.exec(docXml)) !== null) {
    const tableXml = tableMatch[0];
    const rows: Array<{ index: number; cells: Array<{ text: string }> }> = [];

    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    let rowMatch;
    let rowIndex = 0;

    while ((rowMatch = rowRegex.exec(tableXml)) !== null) {
      const rowXml = rowMatch[0];
      const cells: Array<{ text: string }> = [];

      const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
      let cellMatch;

      while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
        const cellText = cellMatch[0].replace(/<[^>]*>/g, '').trim();
        cells.push({ text: cellText });
      }

      rows.push({ index: rowIndex++, cells });
    }

    tables.push({ index: tableIndex++, rows });
  }

  return { paragraphs, tables };
}

/**
 * 编辑Word文档内容
 * 注意：此功能已迁移到 Office Skills
 * 请使用 ToolManager 中的 Office 工具进行编辑
 */
async function editWordContent(
  filepath: string,
  location: EditLocation,
  newContent: string
): Promise<void> {
  // WordTools 已卸载，编辑功能由 Office Skills 接管
  // TODO: 实现基于 Office Skills 的编辑功能
  throw new Error('Word 编辑功能已迁移到 Office Skills，请使用 ToolManager 中的相关工具');
}

/**
 * 注册Word相关的IPC处理器
 */
export function registerWordHandlers() {
  // 预览Word文档
  ipcMain.handle('word:preview', async (_event, filepath: string): Promise<WordPreviewData> => {
    try {
      const workspacePath = getWorkspacePath();
      if (!workspacePath) {
        throw new Error('工作空间未设置');
      }

      const fullPath = path.resolve(workspacePath, filepath);
      const stats = await stat(fullPath);

      const structure = await getWordStructure(filepath);
      const html = await wordToHtml(filepath);

      return {
        filepath,
        structure,
        html,
        metadata: {
          path: filepath,
          size: stats.size,
          modified: stats.mtime.toISOString(),
        },
      };
    } catch (error: any) {
      throw new Error(`预览失败: ${error.message}`);
    }
  });

  // 解析Word文档（用于右侧面板）
  ipcMain.handle('word:parseDocument', async (_event, filepath: string) => {
    try {
      const workspacePath = getWorkspacePath();
      if (!workspacePath) {
        return { success: false, error: '工作空间未设置' };
      }

      const fullPath = path.resolve(workspacePath, filepath);
      const stats = await stat(fullPath);

      const structure = await getWordStructure(filepath);
      const html = await wordToHtml(filepath);

      return {
        success: true,
        data: {
          filepath,
          structure,
          html,
          metadata: {
            path: filepath,
            fullPath,
            size: stats.size,
            modified: stats.mtime.toISOString(),
          },
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 编辑Word文档
  ipcMain.handle('word:edit', async (_event, filepath: string, location: EditLocation, newContent: string) => {
    try {
      await editWordContent(filepath, location, newContent);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
