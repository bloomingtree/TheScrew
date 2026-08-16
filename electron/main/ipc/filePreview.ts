import { ipcMain, BrowserWindow } from 'electron';
import { readFile, writeFile, stat } from 'fs/promises';
import { watch as fsWatch, type FSWatcher } from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

// ============================================================================
// 预览文件变更监听（支持多窗口、多文件，防抖通知）
// ============================================================================
const previewWatchers = new Map<string, FSWatcher>();
const previewDebounceTimers = new Map<string, NodeJS.Timeout>();

function broadcastPreviewChanged(filepath: string) {
  // 防抖：同一文件多次变更只在 300ms 后通知一次
  const norm = path.resolve(filepath);
  const existing = previewDebounceTimers.get(norm);
  if (existing) clearTimeout(existing);
  previewDebounceTimers.set(
    norm,
    setTimeout(() => {
      previewDebounceTimers.delete(norm);
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('filePreview:fileChanged', { path: norm });
      }
    }, 300)
  );
}

function startPreviewWatch(filepath: string) {
  const norm = path.resolve(filepath);
  // 已在监听则跳过
  if (previewWatchers.has(norm)) return;
  try {
    const watcher = fsWatch(norm, { persistent: false }, (_event, _filename) => {
      broadcastPreviewChanged(norm);
    });
    watcher.on('error', () => {
      previewWatchers.delete(norm);
    });
    previewWatchers.set(norm, watcher);
  } catch {
    // 文件不存在或无权限，静默忽略
  }
}

function stopPreviewWatch(filepath: string) {
  const norm = path.resolve(filepath);
  const w = previewWatchers.get(norm);
  if (w) {
    try {
      w.close();
    } catch {
      // ignore
    }
    previewWatchers.delete(norm);
  }
}

// ============================================================================
// 文件预览 IPC 处理器
// ============================================================================

export interface TextFilePreviewData {
  filepath: string;
  content: string;
  encoding: string;
  lineCount: number;
  metadata: {
    path: string;
    size?: number;
    modified?: string;
    extension: string;
  };
}

export interface ExcelCell {
  value: string | number;
  formula?: string;
}

export interface ExcelRow {
  index: number;
  cells: ExcelCell[];
}

export interface ExcelSheet {
  name: string;
  index: number;
  rows: ExcelRow[];
}

export interface ExcelPreviewData {
  filepath: string;
  sheets: ExcelSheet[];
  activeSheet: number;
  metadata: {
    path: string;
    size?: number;
    modified?: string;
    sheetCount: number;
  };
}

export interface ImagePreviewData {
  filepath: string;
  base64: string;
  metadata: {
    path: string;
    size?: number;
    modified?: string;
    width?: number;
    height?: number;
    extension: string;
  };
}

export type PreviewData = TextFilePreviewData | ExcelPreviewData | ImagePreviewData;

/**
 * 支持的文本文件扩展名
 */
const TEXT_FILE_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.xml', '.html', '.htm', '.css', '.scss', '.sass',
  '.js', '.jsx', '.ts', '.tsx', '.vue', '.py', '.rb', '.php', '.java', '.c', '.cpp', '.h',
  '.cs', '.go', '.rs', '.swift', '.kt', '.scala', '.groovy', '.sh', '.bash', '.zsh',
  '.yaml', '.yml', '.toml', '.ini', '.conf', '.config', '.env', '.gitignore',
  '.sql', '.csv', '.tsv', '.log', '.dockerfile', '.makefile', '.cmake',
]);

/**
 * 支持的图片文件扩展名
 */
const IMAGE_FILE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico',
]);

/**
 * 判断是否为 Word 文件
 */
function isWordFile(filepath: string): boolean {
  const ext = path.extname(filepath).toLowerCase();
  return ext === '.docx';
}

/**
 * 判断是否为 PPTX 文件
 */
function isPptxFile(filepath: string): boolean {
  const ext = path.extname(filepath).toLowerCase();
  return ext === '.pptx';
}

/**
 * 判断是否为 PDF 文件
 */
function isPdfFile(filepath: string): boolean {
  const ext = path.extname(filepath).toLowerCase();
  return ext === '.pdf';
}

/**
 * 判断是否为文本文件
 */
function isTextFile(filepath: string): boolean {
  const ext = path.extname(filepath).toLowerCase();
  return TEXT_FILE_EXTENSIONS.has(ext);
}

/**
 * 判断是否为图片文件
 */
function isImageFile(filepath: string): boolean {
  const ext = path.extname(filepath).toLowerCase();
  return IMAGE_FILE_EXTENSIONS.has(ext);
}

/**
 * 判断是否为 Excel 文件
 */
function isExcelFile(filepath: string): boolean {
  const ext = path.extname(filepath).toLowerCase();
  return ext === '.xlsx' || ext === '.xls';
}

/**
 * 预览文本文件
 */
async function previewTextFile(filepath: string): Promise<TextFilePreviewData> {
  try {
    const content = await readFile(filepath, 'utf-8');
    const stats = await stat(filepath);
    const lines = content.split('\n');

    return {
      filepath,
      content,
      encoding: 'utf-8',
      lineCount: lines.length,
      metadata: {
        path: filepath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        extension: path.extname(filepath),
      },
    };
  } catch (error: any) {
    throw new Error(`读取文本文件失败: ${error.message}`);
  }
}

/**
 * 预览图片文件
 */
async function previewImageFile(filepath: string): Promise<ImagePreviewData> {
  try {
    const stats = await stat(filepath);
    const buffer = await readFile(filepath);
    const base64 = `data:${getMimeType(filepath)};base64,${buffer.toString('base64')}`;

    // 获取图片尺寸（需要使用 sharp 或其他库，这里暂时省略）
    const metadata = {
      path: filepath,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      extension: path.extname(filepath),
    };

    return {
      filepath,
      base64,
      metadata,
    };
  } catch (error: any) {
    throw new Error(`读取图片文件失败: ${error.message}`);
  }
}

/**
 * 预览 Excel 文件
 * 注意：Vite 打包后 XLSX.readFile() 依赖的 fs 不可用，需用手动读取 buffer + XLSX.read()
 */
async function previewExcelFile(filepath: string): Promise<ExcelPreviewData> {
  try {
    const stats = await stat(filepath);
    const buffer = await readFile(filepath);

    // 用 XLSX.read(buffer) 替代 XLSX.readFile(path)，避免 ESM 环境中 fs 不可用的问题
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const sheets: ExcelSheet[] = [];

    workbook.SheetNames.forEach((sheetName: string, index: number) => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      const rows: ExcelRow[] = [];

      jsonData.forEach((rowData: any[], rowIndex: number) => {
        const cells: ExcelCell[] = [];
        rowData.forEach((cellValue: any) => {
          cells.push({
            value: cellValue ?? '',
          });
        });

        if (cells.length > 0) {
          rows.push({
            index: rowIndex,
            cells,
          });
        }
      });

      sheets.push({
        name: sheetName,
        index,
        rows,
      });
    });

    return {
      filepath,
      sheets,
      activeSheet: 0,
      metadata: {
        path: filepath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        sheetCount: sheets.length,
      },
    };
  } catch (error: any) {
    throw new Error(`解析 Excel 文件失败: ${error.message}`);
  }
}

/**
 * 获取文件的 MIME 类型
 */
function getMimeType(filepath: string): string {
  const ext = path.extname(filepath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * 获取文件预览
 */
async function getFilePreview(filepath: string): Promise<PreviewData> {
  const ext = path.extname(filepath).toLowerCase();

  if (isImageFile(filepath)) {
    return await previewImageFile(filepath);
  }

  if (isExcelFile(filepath)) {
    return await previewExcelFile(filepath);
  }

  if (isTextFile(filepath)) {
    return await previewTextFile(filepath);
  }

  // 默认尝试作为文本文件处理
  try {
    return await previewTextFile(filepath);
  } catch {
    throw new Error(`不支持的文件格式: ${ext}`);
  }
}

/**
 * 获取文件类型信息
 */
function getFileType(filepath: string): string {
  const ext = path.extname(filepath).toLowerCase();

  if (isImageFile(filepath)) return 'image';
  if (isExcelFile(filepath)) return 'excel';
  if (isWordFile(filepath)) return 'word';
  if (isPptxFile(filepath)) return 'pptx';
  if (isPdfFile(filepath)) return 'pdf';
  if (TEXT_FILE_EXTENSIONS.has(ext)) return 'text';

  return 'unknown';
}

export function registerFilePreviewHandlers() {
  // 获取文件预览
  ipcMain.handle('file:preview', async (_event, filepath: string) => {
    try {
      const data = await getFilePreview(filepath);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 获取文件类型
  ipcMain.handle('file:getType', async (_event, filepath: string) => {
    try {
      const type = getFileType(filepath);
      return { success: true, type };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 检查文件是否支持预览
  ipcMain.handle('file:canPreview', async (_event, filepath: string) => {
    try {
      const type = getFileType(filepath);
      const canPreview = type !== 'unknown';
      return { success: true, canPreview, type };
    } catch (error: any) {
      return { success: false, error: error.message, canPreview: false };
    }
  });

  // 监听预览文件变更（组件挂载时调用）
  ipcMain.handle('filePreview:watch', async (_event, filepath: string) => {
    try {
      startPreviewWatch(filepath);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 停止监听预览文件变更（组件卸载时调用）
  ipcMain.handle('filePreview:unwatch', async (_event, filepath: string) => {
    try {
      stopPreviewWatch(filepath);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 保存文本文件
  ipcMain.handle('file:saveText', async (_event, filepath: string, content: string) => {
    try {
      // 验证是否为文本文件
      if (!isTextFile(filepath)) {
        return { success: false, error: '只支持保存文本文件' };
      }

      await writeFile(filepath, content, 'utf-8');
      console.log('[FilePreview] Saved text file:', filepath, 'Size:', content.length);

      return { success: true };
    } catch (error: any) {
      console.error('[FilePreview] Error saving text file:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('[IPC] File preview handlers registered');
}
