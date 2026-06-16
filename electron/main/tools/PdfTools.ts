/**
 * PDF 处理工具 - 合并 / 拆分 / 水印 / 旋转 / 提取 / 元信息
 *
 * 通过内嵌 Python + pypdf 实现 PDF 页面级编辑与重组。
 * 与 RemoteTools 调用模式一致：execFileAsync(python, [script, JSON.stringify(config)])
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { Tool, ToolGroup } from './ToolManager';
import { getPathManager } from '../config/PathManager';

const execFileAsync = promisify(execFile);

function getPythonPath(): string {
  return getPathManager().getPythonPath();
}

function getScriptsDir(): string {
  return path.join(path.dirname(getPythonPath()), '..', 'scripts');
}

/**
 * 调用 pdf_process.py 执行指定 action
 */
async function runPdfScript(config: Record<string, any>): Promise<any> {
  const pythonPath = getPythonPath();
  const scriptPath = path.join(getScriptsDir(), 'pdf_process.py');

  if (!fs.existsSync(pythonPath)) {
    return { error: '内嵌 Python 环境未找到，无法执行 PDF 操作' };
  }
  if (!fs.existsSync(scriptPath)) {
    return { error: 'PDF 脚本未找到: ' + scriptPath };
  }

  try {
    const { stdout } = await execFileAsync(pythonPath, [scriptPath, JSON.stringify(config)], {
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const result = JSON.parse(stdout);
    if (result.error) {
      return { error: result.error };
    }
    if (result.success === false) {
      return { error: result.error || 'PDF 操作失败' };
    }
    return { content: JSON.stringify(result, null, 2) };
  } catch (err: any) {
    if (err.killed) {
      return { error: 'PDF 操作超时（120s）' };
    }
    // 尝试解析 stderr
    const stderr = err.stderr || '';
    if (stderr) {
      return { error: `PDF 操作异常: ${stderr.split('\n').slice(-3).join(' ')}` };
    }
    return { error: `PDF 操作异常: ${err.message}` };
  }
}

// ==================== pdf_info ====================

const pdfInfoTool: Tool = {
  name: 'pdf_info',
  description: '查看 PDF 元信息（页数、页面尺寸、元数据、是否加密、文件大小）',
  parameters: {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'PDF 文件路径（相对工作空间或绝对路径）' },
    },
    required: ['file'],
  },
  handler: async (args: any) => runPdfScript({ action: 'info', file: args.file }),
};

// ==================== pdf_merge ====================

const pdfMergeTool: Tool = {
  name: 'pdf_merge',
  description: '合并多个 PDF 为一个文件',
  parameters: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        items: { type: 'string' },
        description: '要合并的 PDF 文件路径列表（按顺序）',
      },
      output: { type: 'string', description: '合并后输出路径' },
    },
    required: ['files', 'output'],
  },
  handler: async (args: any) => runPdfScript({
    action: 'merge',
    files: args.files,
    output: args.output,
  }),
};

// ==================== pdf_split ====================

const pdfSplitTool: Tool = {
  name: 'pdf_split',
  description: '拆分 PDF：每页一个文件，或按指定页码范围分组',
  parameters: {
    type: 'object',
    properties: {
      file: { type: 'string', description: '要拆分的 PDF 文件路径' },
      output_dir: { type: 'string', description: '输出目录（默认与源文件同目录）' },
      mode: {
        type: 'string',
        enum: ['each', 'ranges'],
        description: 'each=每页一个文件；ranges=按 ranges 分组',
      },
      ranges: {
        type: 'array',
        items: { type: 'string' },
        description: 'mode=ranges 时的页码组，如 ["1-3", "4,5", "6-8"]',
      },
    },
    required: ['file'],
  },
  handler: async (args: any) => runPdfScript({
    action: 'split',
    file: args.file,
    output_dir: args.output_dir,
    mode: args.mode || 'each',
    ranges: args.ranges,
  }),
};

// ==================== pdf_watermark ====================

const pdfWatermarkTool: Tool = {
  name: 'pdf_watermark',
  description: '为 PDF 添加平铺文字水印（支持透明度、旋转角度、颜色）',
  parameters: {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'PDF 文件路径' },
      output: { type: 'string', description: '输出路径（默认覆盖源文件）' },
      text: { type: 'string', description: '水印文字' },
      opacity: { type: 'number', description: '透明度 0-1，默认 0.2' },
      angle: { type: 'number', description: '旋转角度，默认 30' },
      font_size: { type: 'number', description: '字号，默认 60' },
      color: {
        type: 'string',
        enum: ['gray', 'red', 'blue', 'black'],
        description: '颜色，默认 gray',
      },
    },
    required: ['file', 'text'],
  },
  handler: async (args: any) => runPdfScript({
    action: 'watermark',
    file: args.file,
    output: args.output,
    text: args.text,
    opacity: args.opacity,
    angle: args.angle,
    font_size: args.font_size,
    color: args.color,
  }),
};

// ==================== pdf_rotate ====================

const pdfRotateTool: Tool = {
  name: 'pdf_rotate',
  description: '旋转 PDF 页面（90/180/270 度，可指定页码）',
  parameters: {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'PDF 文件路径' },
      output: { type: 'string', description: '输出路径（默认覆盖源文件）' },
      angle: {
        type: 'number',
        enum: [90, 180, 270],
        description: '旋转角度',
      },
      pages: { type: 'string', description: '要旋转的页码，如 "1,3,5-8"；省略=全部' },
    },
    required: ['file', 'angle'],
  },
  handler: async (args: any) => runPdfScript({
    action: 'rotate',
    file: args.file,
    output: args.output,
    angle: args.angle,
    pages: args.pages,
  }),
};

// ==================== pdf_extract_pages ====================

const pdfExtractTool: Tool = {
  name: 'pdf_extract_pages',
  description: '提取 PDF 指定页为新 PDF 文件',
  parameters: {
    type: 'object',
    properties: {
      file: { type: 'string', description: '源 PDF 文件路径' },
      output: { type: 'string', description: '输出 PDF 路径' },
      pages: {
        type: 'string',
        description: '要提取的页码，如 "1,3,5-8"',
      },
    },
    required: ['file', 'output', 'pages'],
  },
  handler: async (args: any) => runPdfScript({
    action: 'extract',
    file: args.file,
    output: args.output,
    pages: args.pages,
  }),
};

// ==================== 导出 ====================

export const pdfTools: Tool[] = [
  pdfInfoTool,
  pdfMergeTool,
  pdfSplitTool,
  pdfWatermarkTool,
  pdfRotateTool,
  pdfExtractTool,
];

export const pdfToolGroup: ToolGroup = {
  name: 'pdf',
  description: 'PDF 处理（合并/拆分/水印/旋转/提取/元信息）',
  tools: pdfTools,
  keywords: ['pdf', 'PDF', '合并', '拆分', '水印', '旋转', '提取'],
  triggers: {
    keywords: ['PDF合并', 'PDF拆分', '加PDF水印', '旋转PDF', '提取PDF页面'],
    fileExtensions: ['.pdf'],
    dependentTools: [],
  },
};
