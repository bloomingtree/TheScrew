/**
 * 内容提取器
 * 从各种文件类型中提取文本内容，用于 AI 处理
 */

import { readFile } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ExtractedContent {
  text?: string;           // 完整文本内容
  preview?: string;        // 预览片段（前 1000 字符）
  pageCount?: number;      // 页数（用于文档）
  sheetCount?: number;     // 工作表数（用于 Excel）
  sheetNames?: string[];   // 工作表名称
  error?: string;          // 错误信息
}

/**
 * 内容提取器类
 */
export class ContentExtractor {
  /**
   * 根据文件类型提取内容
   */
  async extract(filePath: string, fileType: string): Promise<ExtractedContent> {
    const ext = filePath.toLowerCase();

    switch (fileType) {
      case 'document':
        if (ext.endsWith('.docx') || ext.endsWith('.doc')) {
          return await this.extractWord(filePath);
        }
        if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
          return await this.extractExcel(filePath);
        }
        if (ext.endsWith('.pptx') || ext.endsWith('.ppt')) {
          return await this.extractPowerPoint(filePath);
        }
        // 默认作为文本处理
        return await this.extractText(filePath);

      case 'data':
        return await this.extractText(filePath);

      case 'image':
        // 图片不提取文本内容
        return { preview: '[图片文件]' };

      default:
        // 尝试作为文本提取
        return await this.extractText(filePath);
    }
  }

  /**
   * 提取 Word 文档内容
   */
  private async extractWord(filePath: string): Promise<ExtractedContent> {
    try {
      // 方法 1: 尝试使用 mammoth 库（更轻量）
      try {
        const mammoth = await import('mammoth');
        const buffer = await readFile(filePath);
        const result = await mammoth.extractRawText({ buffer: buffer });
        const text = result.value;

        return {
          text,
          preview: text.slice(0, 1000),
        };
      } catch (mammothError) {
        // 方法 2: 使用 pandoc
        return await this.extractWithPandoc(filePath);
      }
    } catch (error: any) {
      return {
        preview: `[Word 文档提取失败: ${error.message}]`,
        error: error.message,
      };
    }
  }

  /**
   * 提取 Excel 表格内容
   */
  private async extractExcel(filePath: string): Promise<ExtractedContent> {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.readFile(filePath);

      const sheetNames = workbook.SheetNames;
      const sheets: string[] = [];

      // 提取所有工作表的内容
      const allText: string[] = [];
      allText.push(`# Excel 文件: ${filePath}`);
      allText.push(`工作表数量: ${sheetNames.length}\n`);

      for (const sheetName of sheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        allText.push(`## 工作表: ${sheetName}`);

        // 将数据转换为文本表格
        if (jsonData.length > 0) {
          // 找出最大列数
          const maxCols = Math.max(...jsonData.map((row) => row.length));

          for (const row of jsonData) {
            // 填充空单元格，确保对齐
            const paddedRow = [...row];
            while (paddedRow.length < maxCols) {
              paddedRow.push(null);
            }
            // 用制表符分隔单元格
            const rowText = paddedRow
              .map((cell) => (cell === null || cell === undefined ? '' : String(cell)))
              .join('\t');
            allText.push(rowText);
          }
        } else {
          allText.push('(空工作表)');
        }

        allText.push(''); // 工作表之间的空行
        sheets.push(sheetName);
      }

      const text = allText.join('\n');

      return {
        text,
        preview: text.slice(0, 1000),
        sheetCount: sheetNames.length,
        sheetNames,
      };
    } catch (error: any) {
      return {
        preview: `[Excel 提取失败: ${error.message}]`,
        error: error.message,
      };
    }
  }

  /**
   * 提取 PowerPoint 内容
   */
  private async extractPowerPoint(filePath: string): Promise<ExtractedContent> {
    try {
      // 使用 pandoc 提取 PowerPoint
      return await this.extractWithPandoc(filePath);
    } catch (error: any) {
      return {
        preview: `[PowerPoint 提取失败: ${error.message}]`,
        error: error.message,
      };
    }
  }

  /**
   * 提取文本文件内容
   */
  private async extractText(filePath: string): Promise<ExtractedContent> {
    try {
      const content = await readFile(filePath, 'utf-8');

      return {
        text: content,
        preview: content.slice(0, 1000),
      };
    } catch (error: any) {
      // 如果 UTF-8 解码失败，尝试其他编码或返回错误
      return {
        preview: `[文本文件提取失败: ${error.message}]`,
        error: error.message,
      };
    }
  }

  /**
   * 使用 pandoc 提取文档内容
   */
  private async extractWithPandoc(filePath: string): Promise<ExtractedContent> {
    try {
      // 使用 pandoc 转换为 markdown
      const { stdout } = await execAsync(
        `pandoc "${filePath}" -t markdown --wrap=none`,
        { maxBuffer: 10 * 1024 * 1024 } // 10MB 缓冲区
      );

      const text = stdout.trim();

      return {
        text,
        preview: text.slice(0, 1000),
      };
    } catch (error: any) {
      // pandoc 不可用或失败
      const errorMsg = error.stderr || error.message;
      return {
        preview: `[文档提取失败: ${errorMsg}]`,
        error: errorMsg,
      };
    }
  }

  /**
   * 检查是否支持某种文件类型
   */
  static isSupported(filePath: string): boolean {
    const ext = filePath.toLowerCase();
    const supportedExts = [
      '.txt', '.md', '.markdown', '.json', '.xml', '.yaml', '.yml', '.toml',
      '.csv', '.tsv',
      '.docx', '.doc',
      '.xlsx', '.xls',
      '.pptx', '.ppt',
      '.pdf',
    ];
    return supportedExts.some((e) => ext.endsWith(e));
  }

  /**
   * 获取文件类型分类
   */
  static getFileType(filePath: string): 'image' | 'document' | 'archive' | 'data' | 'unknown' {
    const ext = filePath.toLowerCase();
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico'];
    const documentExts = ['.txt', '.md', '.markdown', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.ppt', '.pptx', '.pdf'];
    const archiveExts = ['.zip', '.tar', '.gz', '.7z', '.rar'];
    const dataExts = ['.json', '.xml', '.yaml', '.yml', '.toml'];

    if (imageExts.some((e) => ext.endsWith(e))) return 'image';
    if (documentExts.some((e) => ext.endsWith(e))) return 'document';
    if (archiveExts.some((e) => ext.endsWith(e))) return 'archive';
    if (dataExts.some((e) => ext.endsWith(e))) return 'data';
    return 'unknown';
  }
}

// 单例实例
let contentExtractorInstance: ContentExtractor | null = null;

export function getContentExtractor(): ContentExtractor {
  if (!contentExtractorInstance) {
    contentExtractorInstance = new ContentExtractor();
  }
  return contentExtractorInstance;
}
