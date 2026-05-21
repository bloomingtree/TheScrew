/**
 * OfficeCLI Tools
 * 通过命令行工具 officecli 操作 Word、Excel、PowerPoint 文档
 *
 * 依赖：officecli 二进制（自动下载）
 */

import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { getPathManager } from '../config/PathManager';
import { Tool } from './ToolManager';

// OfficeCLI 配置
interface OfficeCLIConfig {
  binaryPath: string;
  defaultTimeout: number;
  batchTimeout: number;
  workingDir: string;
}

// 获取 officecli 二进制路径
function getBinaryPath(): string {
  const pathManager = getPathManager();
  const binDir = path.join(pathManager.getConfigPath(), 'bin');
  // Windows
  if (process.platform === 'win32') {
    return path.join(binDir, 'officecli.exe');
  }
  // macOS / Linux
  return path.join(binDir, 'officecli');
}

// 检查 officecli 是否可用
function isAvailable(): boolean {
  const binaryPath = getBinaryPath();
  return fs.existsSync(binaryPath);
}

// 执行 officecli 命令
function execOfficeCLI(args: string[], timeout: number = 30000, cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const binaryPath = getBinaryPath();

    if (!fs.existsSync(binaryPath)) {
      reject(new Error('OfficeCLI 未安装。请运行安装脚本或手动下载 officecli。'));
      return;
    }

    const options: any = {
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      cwd: cwd || process.cwd(),
    };

    execFile(binaryPath, args, options, (error, stdout, stderr) => {
      if (error) {
        // 合并 stdout 和 stderr，某些工具将错误信息输出到 stdout
        const fullOutput = `${stderr || ''}${stdout ? '\n' + stdout : ''}`.trim();
        let errorMsg = `OfficeCLI 执行失败: ${error.message}`;
        if (fullOutput) {
          errorMsg += `\n${fullOutput}`;
        }
        // 检测文件被占用的情况，添加明确的提示
        const isFileLocked = /being used by another process|used by another|共享冲突|锁定|locked|access denied|EPERM|permission denied/i.test(fullOutput + error.message);
        if (isFileLocked) {
          errorMsg += '\n\n[提示] 该文件可能被其他程序（如 Word/Excel/WPS）打开，请提醒用户关闭该文件后重试。';
        }
        reject(new Error(errorMsg));
        return;
      }
      resolve(typeof stdout === 'string' ? stdout : stdout.toString('utf-8'));
    });
  });
}

// ==================== 工具定义 ====================

const officeCreateTool: Tool = {
  name: 'office_create',
  description: '创建 Word (.docx)、Excel (.xlsx) 或 PowerPoint (.pptx) 空白文档',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '文件名，含扩展名（如 report.docx）' },
      template: { type: 'string', description: '可选模板路径' },
    },
    required: ['filename'],
  },
  handler: async (args: any) => {
    const cmdArgs = ['create', args.filename];
    if (args.template) cmdArgs.push('--template', args.template);
    const result = await execOfficeCLI(cmdArgs);
    return { success: true, output: result, filename: args.filename };
  },
};

const officeViewTool: Tool = {
  name: 'office_view',
  description: '查看文档内容。支持 outline（大纲）、text（文本）、stats（统计）等视图',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '文件路径' },
      view: { type: 'string', description: '视图类型：outline | text | stats | styles', default: 'outline' },
      json: { type: 'boolean', description: '是否以 JSON 格式输出', default: true },
    },
    required: ['filename'],
  },
  handler: async (args: any) => {
    const cmdArgs = ['view', args.filename, args.view || 'outline'];
    if (args.json !== false) cmdArgs.push('--json');
    const result = await execOfficeCLI(cmdArgs);
    return { success: true, output: result };
  },
};

const officeGetTool: Tool = {
  name: 'office_get',
  description: '获取文档中指定路径的元素内容。路径格式：/body/p[1]（段落的路径寻址）',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '文件路径' },
      element_path: { type: 'string', description: '元素路径（如 /body/p[1], /slide[1]/shape[1]）' },
      json: { type: 'boolean', description: '是否以 JSON 格式输出', default: true },
    },
    required: ['filename', 'element_path'],
  },
  handler: async (args: any) => {
    const cmdArgs = ['get', args.filename, args.element_path];
    if (args.json !== false) cmdArgs.push('--json');
    const result = await execOfficeCLI(cmdArgs);
    return { success: true, output: result };
  },
};

const officeSetTool: Tool = {
  name: 'office_set',
  description: '修改文档元素的属性（如文本、样式等）',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '文件路径' },
      element_path: { type: 'string', description: '元素路径' },
      props: {
        type: 'object',
        description: '要设置的属性（如 {text: "Hello", bold: true}）',
      },
    },
    required: ['filename', 'element_path', 'props'],
  },
  handler: async (args: any) => {
    const cmdArgs = ['set', args.filename, args.element_path];
    for (const [key, value] of Object.entries(args.props || {})) {
      cmdArgs.push('--prop', `${key}=${value}`);
    }
    const result = await execOfficeCLI(cmdArgs);
    return { success: true, output: result };
  },
};

const officeAddTool: Tool = {
  name: 'office_add',
  description: '向文档添加元素（如段落、幻灯片、行等）',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '文件路径' },
      parent_path: { type: 'string', description: '父元素路径（如 /body, /slide[1]）' },
      type: { type: 'string', description: '元素类型（如 paragraph, slide, row）' },
      props: { type: 'object', description: '元素属性' },
    },
    required: ['filename', 'parent_path', 'type'],
  },
  handler: async (args: any) => {
    const cmdArgs = ['add', args.filename, args.parent_path, '--type', args.type];
    for (const [key, value] of Object.entries(args.props || {})) {
      cmdArgs.push('--prop', `${key}=${value}`);
    }
    const result = await execOfficeCLI(cmdArgs);
    return { success: true, output: result };
  },
};

const officeRemoveTool: Tool = {
  name: 'office_remove',
  description: '删除文档中的元素',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '文件路径' },
      element_path: { type: 'string', description: '要删除的元素路径' },
    },
    required: ['filename', 'element_path'],
  },
  handler: async (args: any) => {
    const result = await execOfficeCLI(['remove', args.filename, args.element_path]);
    return { success: true, output: result };
  },
};

const officeQueryTool: Tool = {
  name: 'office_query',
  description: '查询文档中符合条件的元素（如所有标题段落）',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '文件路径' },
      selector: { type: 'string', description: '选择器（如 "paragraph[style=Heading1]"）' },
      json: { type: 'boolean', description: '是否以 JSON 格式输出', default: true },
    },
    required: ['filename', 'selector'],
  },
  handler: async (args: any) => {
    const cmdArgs = ['query', args.filename, args.selector];
    if (args.json !== false) cmdArgs.push('--json');
    const result = await execOfficeCLI(cmdArgs);
    return { success: true, output: result };
  },
};

const officeValidateTool: Tool = {
  name: 'office_validate',
  description: '校验文档结构是否有效',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '文件路径' },
    },
    required: ['filename'],
  },
  handler: async (args: any) => {
    const result = await execOfficeCLI(['validate', args.filename]);
    return { success: true, output: result };
  },
};

const officeMergeTool: Tool = {
  name: 'office_merge',
  description: '将数据合并到模板文档',
  parameters: {
    type: 'object',
    properties: {
      template: { type: 'string', description: '模板文件路径' },
      output: { type: 'string', description: '输出文件路径' },
      data: { type: 'string', description: '数据 JSON 文件路径' },
    },
    required: ['template', 'output', 'data'],
  },
  handler: async (args: any) => {
    const result = await execOfficeCLI(['merge', args.template, args.output, args.data], 120000);
    return { success: true, output: result };
  },
};

const officeBatchTool: Tool = {
  name: 'office_batch',
  description: '批量执行多个操作（通过 JSON 文件定义操作序列）',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '文件路径' },
      operations: { type: 'string', description: '操作序列 JSON 文件路径' },
    },
    required: ['filename', 'operations'],
  },
  handler: async (args: any) => {
    const result = await execOfficeCLI(['batch', args.filename, '--input', args.operations], 120000);
    return { success: true, output: result };
  },
};

// ==================== L2: 移动/交换操作 ====================

const officeMoveTool: Tool = {
  name: 'office_move',
  description: '将文档元素移动到新位置（如移动段落顺序、调整幻灯片位置）',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '文件路径' },
      element_path: { type: 'string', description: '要移动的元素路径（如 /body/p[3]）' },
      target_path: { type: 'string', description: '目标位置路径（如 /body/p[1]）' },
    },
    required: ['filename', 'element_path', 'target_path'],
  },
  handler: async (args: any) => {
    const result = await execOfficeCLI(['move', args.filename, args.element_path, '--to', args.target_path]);
    return { success: true, output: result };
  },
};

const officeSwapTool: Tool = {
  name: 'office_swap',
  description: '交换两个文档元素的位置',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '文件路径' },
      path_a: { type: 'string', description: '第一个元素路径（如 /body/p[1]）' },
      path_b: { type: 'string', description: '第二个元素路径（如 /body/p[3]）' },
    },
    required: ['filename', 'path_a', 'path_b'],
  },
  handler: async (args: any) => {
    const result = await execOfficeCLI(['swap', args.filename, args.path_a, args.path_b]);
    return { success: true, output: result };
  },
};

// ==================== L3: 原始 XML 操作 ====================

const officeRawTool: Tool = {
  name: 'office_raw',
  description: '读取文档原始 XML 内容（通过 XPath 定位）。用于高级自定义操作',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '文件路径' },
      xpath: { type: 'string', description: 'XPath 表达式（如 //w:p[1]/w:r/w:t）' },
      part: { type: 'string', description: '文档部件（如 word/document.xml, xl/workbook.xml, ppt/slides/slide1.xml）' },
    },
    required: ['filename', 'xpath'],
  },
  handler: async (args: any) => {
    const cmdArgs = ['raw', args.filename, '--xpath', args.xpath];
    if (args.part) cmdArgs.push('--part', args.part);
    const result = await execOfficeCLI(cmdArgs);
    return { success: true, output: result };
  },
};

const officeRawSetTool: Tool = {
  name: 'office_raw_set',
  description: '直接修改文档原始 XML 内容（通过 XPath 定位）。谨慎使用，可能破坏文档结构',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '文件路径' },
      xpath: { type: 'string', description: 'XPath 表达式' },
      xml_content: { type: 'string', description: '要设置的 XML 内容' },
      part: { type: 'string', description: '文档部件（如 word/document.xml）' },
    },
    required: ['filename', 'xpath', 'xml_content'],
  },
  handler: async (args: any) => {
    const cmdArgs = ['raw', args.filename, '--xpath', args.xpath, '--set', args.xml_content];
    if (args.part) cmdArgs.push('--part', args.part);
    const result = await execOfficeCLI(cmdArgs);
    return { success: true, output: result };
  },
};

// ==================== 导出 ====================

// 所有 OfficeCLI 工具
export const officeCLITools: Tool[] = [
  // L1: 读取/查看
  officeCreateTool,
  officeViewTool,
  officeGetTool,
  officeQueryTool,
  officeValidateTool,
  // L2: DOM 操作
  officeSetTool,
  officeAddTool,
  officeRemoveTool,
  officeMoveTool,
  officeSwapTool,
  // L2: 批量操作
  officeMergeTool,
  officeBatchTool,
  // L3: 原始 XML
  officeRawTool,
  officeRawSetTool,
];

// 注册到 ToolManager 的工具组
export const officeCLIToolGroup = {
  name: 'officecli',
  description: 'Office 文档操作工具（Word/Excel/PowerPoint）',
  tools: officeCLITools,
  keywords: ['word', 'excel', 'powerpoint', 'docx', 'xlsx', 'pptx', 'office', '文档', '报告', '表格', '演示'],
  triggers: {
    keywords: ['word', 'excel', 'powerpoint', 'docx', 'xlsx', 'pptx', 'office'],
    fileExtensions: ['.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt'],
    dependentTools: [],
  },
};

// 导出检查函数
export { isAvailable, getBinaryPath, execOfficeCLI };
