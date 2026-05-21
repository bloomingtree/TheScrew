import { ipcMain } from 'electron';
import { readFile, stat } from 'fs/promises';
import path from 'path';

// ============================================================================
// PDF 文件预览 IPC 处理器
// ============================================================================

export interface PDFPage {
  index: number;
  text: string;
  width?: number;
  height?: number;
}

export interface PDFPreviewData {
  filepath: string;
  pages: PDFPage[];
  metadata: {
    path: string;
    size?: number;
    modified?: string;
    pageCount: number;
    title?: string;
    author?: string;
  };
}

/**
 * 解析 PDF 文件
 */
async function parsePdfFile(filepath: string): Promise<PDFPreviewData> {
  try {
    const buffer = await readFile(filepath);
    const { stat } = await import('fs/promises');
    const stats = await stat(filepath);

    // 尝试使用 pdf-parse 库
    let pdfParse: any;
    try {
      pdfParse = require('pdf-parse');
    } catch {
      throw new Error('pdf-parse 库未安装。请运行: npm install pdf-parse');
    }

    const pdfData = await pdfParse(buffer);

    // 提取元数据
    const info = pdfData.info || {};
    const title = info.Title || '';
    const author = info.Author || '';

    // pdf-parse 返回完整文本，按页分割需要用 numpages
    // pdf-parse 不直接提供分页文本，但我们知道总页数
    const fullText = pdfData.text || '';
    const pageCount = pdfData.numpages || 1;

    // 尝试按 formfeed (\f) 分页，这是 pdf-parse 的默认分页符
    const pageTexts = fullText.split('\f');

    // 如果分页符分割不够，则均匀分配
    const pages: PDFPage[] = [];
    if (pageTexts.length >= pageCount) {
      for (let i = 0; i < pageCount; i++) {
        pages.push({
          index: i,
          text: (pageTexts[i] || '').trim(),
        });
      }
    } else {
      // pdf-parse 只返回全文，按近似行数分页
      const lines = fullText.split('\n');
      const linesPerPage = Math.ceil(lines.length / pageCount);
      for (let i = 0; i < pageCount; i++) {
        const startLine = i * linesPerPage;
        const pageText = lines.slice(startLine, startLine + linesPerPage).join('\n');
        pages.push({
          index: i,
          text: pageText.trim(),
        });
      }
    }

    return {
      filepath,
      pages,
      metadata: {
        path: filepath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        pageCount,
        title,
        author,
      },
    };
  } catch (error: any) {
    throw new Error(`解析 PDF 文件失败: ${error.message}`);
  }
}

export function registerPdfHandlers() {
  // 预览 PDF 文件（返回文件 Buffer 用于 react-pdf 渲染）
  ipcMain.handle('pdf:preview', async (_event, filepath: string) => {
    try {
      const ext = path.extname(filepath).toLowerCase();
      if (ext !== '.pdf') {
        throw new Error('仅支持 .pdf 文件');
      }
      const buffer = await readFile(filepath);
      const stats = await stat(filepath);

      return {
        success: true,
        data: {
          buffer: buffer.toString('base64'),
          metadata: {
            path: filepath,
            size: stats.size,
            modified: stats.mtime.toISOString(),
          },
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  console.log('[IPC] PDF preview handlers registered');
}
