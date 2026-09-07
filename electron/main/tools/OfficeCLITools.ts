/**
 * OfficeCLI Tools
 * 通过命令行工具 officecli 操作 Word、Excel、PowerPoint 文档
 *
 * 依赖：officecli-lite 二进制（轻量版，内存优化适配 Win7/8GB）
 */

import { execFile, spawn } from 'child_process';
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

// 获取 CLI 调用方式（支持 node-v12 + bundle 双文件模式，兼容 Win7）
function getCLICommand(): { cmd: string; baseArgs: string[] } {
  const pathManager = getPathManager();
  const binDir = path.join(pathManager.getConfigPath(), 'bin');

  // 优先使用 Node.js 12 + bundle（Win7 兼容）
  const nodeExe = path.join(binDir, 'node-v12.exe');
  const bundle = path.join(binDir, 'officecli-bundle.js');
  if (fs.existsSync(nodeExe) && fs.existsSync(bundle)) {
    return { cmd: nodeExe, baseArgs: [bundle] };
  }

  // 回退到单文件 exe（Win8+）
  if (process.platform === 'win32') {
    return { cmd: path.join(binDir, 'officecli.exe'), baseArgs: [] };
  }
  return { cmd: path.join(binDir, 'officecli'), baseArgs: [] };
}

// 检查 officecli 是否可用
export function isOfficeCLIAvailable(): boolean {
  const { cmd } = getCLICommand();
  return fs.existsSync(cmd);
}

// ==================== 输出截断常量 ====================
const OFFICE_MAX_OUTPUT_CHARS = 30000;

/**
 * 截断 office 输出，防止撑爆上下文
 */
function truncateOfficeOutput(output: string, toolName: string): string {
  if (output.length <= OFFICE_MAX_OUTPUT_CHARS) return output;

  const headSize = 6000;
  const tailSize = 2000;
  const totalSize = output.length;
  const omitted = totalSize - headSize - tailSize;

  const head = output.substring(0, headSize);
  const tail = output.substring(totalSize - tailSize);

  return `${head}\n\n... [${toolName} 输出已截断，省略 ${omitted.toLocaleString()} 字符（共 ${(totalSize / 1024).toFixed(1)}KB）。请使用 office_get 获取具体元素的详细内容] ...\n\n${tail}`;
}

// 执行 officecli 命令
export function execOfficeCLI(args: string[], timeout: number = 30000, cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { cmd, baseArgs } = getCLICommand();

    if (!fs.existsSync(cmd)) {
      reject(new Error('OfficeCLI 未安装。请运行安装脚本或手动下载 officecli。'));
      return;
    }

    const options: any = {
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      cwd: cwd || process.cwd(),
    };

    execFile(cmd, [...baseArgs, ...args], options, (error, stdout, stderr) => {
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

// 通过 stdin 执行 officecli 命令
function execOfficeCLIWithStdin(args: string[], stdinData: string, timeout: number = 120000): Promise<string> {
  return new Promise((resolve, reject) => {
    const { cmd, baseArgs } = getCLICommand();
    if (!fs.existsSync(cmd)) {
      reject(new Error('OfficeCLI 未安装'));
      return;
    }
    const child = spawn(cmd, [...baseArgs, ...args], { cwd: process.cwd() });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
    child.stdin.write(stdinData);
    child.stdin.end();
    const timer = setTimeout(() => { child.kill(); reject(new Error('Timeout')); }, timeout);
    child.on('close', (code: number) => {
      clearTimeout(timer);
      if (code !== 0) {
        // 优先使用 stdout/stderr 中的实际错误信息，避免显示空错误
        const detail = (stderr || '').trim() || (stdout || '').trim() || `exit code ${code}`;
        reject(new Error(`OfficeCLI 执行失败 (code=${code}): ${detail}`));
      } else {
        resolve(stdout);
      }
    });
    child.on('error', (err: Error) => { clearTimeout(timer); reject(err); });
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
    },
    required: ['filename'],
  },
  handler: async (args: any) => {
    const result = await execOfficeCLI(['create', args.filename]);
    return { success: true, output: result, filename: args.filename };
  },
};

const officeViewTool: Tool = {
  name: 'office_view',
  description: `查看文档结构和内容概览。

**推荐用法**：
1. 先用 office_view 查看文档整体结构
2. 再用 office_get 获取感兴趣的特定元素内容`,
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '文件路径' },
      json: { type: 'boolean', description: '是否以 JSON 格式输出', default: true },
    },
    required: ['filename'],
  },
  handler: async (args: any) => {
    const cmdArgs = ['view', args.filename, '--json'];
    const result = await execOfficeCLI(cmdArgs);
    return { success: true, output: truncateOfficeOutput(result, 'office_view') };
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
      property: { type: 'string', description: '要获取的属性名（如 text, style），默认 text', default: 'text' },
      json: { type: 'boolean', description: '是否以 JSON 格式输出', default: true },
    },
    required: ['filename', 'element_path'],
  },
  handler: async (args: any) => {
    const cmdArgs = ['get', args.filename, args.element_path, args.property || 'text', '--json'];
    const result = await execOfficeCLI(cmdArgs);
    return { success: true, output: truncateOfficeOutput(result, 'office_get') };
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
      cmdArgs.push(`${key}=${value}`);
    }
    const result = await execOfficeCLI(cmdArgs);
    return { success: true, output: result };
  },
};

const officeAddTool: Tool = {
  name: 'office_add',
  description: '向文档添加元素（段落、表格、表格行/列、分页等）。type=table 时可指定 rows/cols；type=paragraph 时可指定 text 设置初始文本',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '文件路径' },
      parent_path: { type: 'string', description: '父元素路径（如 /body, /slide[1], /table[1]）' },
      type: { type: 'string', description: '元素类型：paragraph | pageBreak | table | row | column' },
      text: { type: 'string', description: '当 type=paragraph 时的初始文本（可选）' },
      rows: { type: 'number', description: '当 type=table 时的行数（默认 2）' },
      cols: { type: 'number', description: '当 type=table 时的列数（默认 2）' },
    },
    required: ['filename', 'parent_path', 'type'],
  },
  handler: async (args: any) => {
    const cmdArgs = ['add', args.filename, args.parent_path, args.type];
    if (args.rows !== undefined) cmdArgs.push('--rows', String(args.rows));
    if (args.cols !== undefined) cmdArgs.push('--cols', String(args.cols));
    if (args.text !== undefined) cmdArgs.push('--text', String(args.text));
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
  description: '在文档中搜索文本内容',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '文件路径' },
      pattern: { type: 'string', description: '搜索文本模式' },
      json: { type: 'boolean', description: '是否以 JSON 格式输出', default: true },
    },
    required: ['filename', 'pattern'],
  },
  handler: async (args: any) => {
    const cmdArgs = ['find', args.filename, args.pattern, '--json'];
    const result = await execOfficeCLI(cmdArgs);
    return { success: true, output: truncateOfficeOutput(result, 'office_query') };
  },
};

const officeValidateTool: Tool = {
  name: 'office_validate',
  description: '校验文档 OOXML 结构合法性（cell 块级性、表格列对齐、tblGrid 存在性等）。仅支持 .docx；.pptx/.xlsx 暂不支持',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '文件路径（仅 .docx）' },
    },
    required: ['filename'],
  },
  handler: async (args: any) => {
    if (/\.(docx)$/i.test(args.filename ?? '')) {
      const result = await execOfficeCLI(['validate', args.filename, '--json']);
      return { success: true, output: truncateOfficeOutput(result, 'office_validate') };
    }
    return { success: false, error: `office_validate 目前仅支持 .docx 文件（校验表格结构等 OOXML 规则），收到的是 "${args.filename ?? ''}"。.pptx/.xlsx 及其他格式暂不支持。` };
  },
};

const officeMergeTool: Tool = {
  name: 'office_merge',
  description: '将数据合并到模板文档',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '模板文件路径' },
      data: { type: 'string', description: '数据 JSON 字符串' },
    },
    required: ['filename', 'data'],
  },
  handler: async (args: any) => {
    const result = await execOfficeCLI(['merge', args.filename, '--data', args.data, '--json'], 120000);
    return { success: true, output: result };
  },
};

const officeBatchTool: Tool = {
  name: 'office_batch',
  description: '批量执行多个操作（通过 JSON 字符串定义操作序列）',
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '文件路径' },
      operations: { type: 'string', description: '操作序列 JSON 字符串' },
    },
    required: ['filename', 'operations'],
  },
  handler: async (args: any) => {
    // 防御性校验：AI 可能传入对象/数组而非 JSON 字符串
    let ops = args.operations;
    if (typeof ops !== 'string') {
      try {
        ops = JSON.stringify(ops);
      } catch {
        return { success: false, error: 'operations 必须是 JSON 字符串或可序列化对象' };
      }
    }
    try {
      const result = await execOfficeCLIWithStdin(['batch', args.filename], ops, 120000);
      return { success: true, output: truncateOfficeOutput(result, 'office_batch') };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
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
    return { success: false, error: '元素移动功能在轻量版中暂不可用。请使用 office_remove + office_add 组合实现。' };
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
    return { success: false, error: '元素交换功能在轻量版中暂不可用。请使用 office_get 获取内容后手动重排。' };
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
    },
    required: ['filename', 'xpath'],
  },
  handler: async (args: any) => {
    const result = await execOfficeCLI(['raw', args.filename, '--xpath', args.xpath, '--json']);
    return { success: true, output: truncateOfficeOutput(result, 'office_raw') };
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
    },
    required: ['filename', 'xpath', 'xml_content'],
  },
  handler: async (args: any) => {
    return { success: false, error: '原始 XML 写入功能在轻量版中暂不可用。请使用 office_set 修改元素属性。' };
  },
};

// ==================== 导出 ====================

// L4: 模板格式应用
const officeApplyStyleTool: Tool = {
  name: 'office_apply_style',
  description: `将模板文档的格式（字体、标题样式、页边距、页面大小等）应用到目标文档。
典型场景：用一个已排好版的 Word 文档作为模板，将其标题设为黑体、正文设为宋体四号、页边距等参数应用到另一个文档。
仅支持 .docx 格式。目标文档的内容不变，仅替换格式样式。`,
  parameters: {
    type: 'object',
    properties: {
      target: { type: 'string', description: '目标文档路径（将被修改格式的文档）' },
      template: { type: 'string', description: '模板文档路径（提供格式的文档）' },
    },
    required: ['target', 'template'],
  },
  handler: async (args: any) => {
    const result = await execOfficeCLI(['applyStyle', args.target, args.template]);
    return { success: true, output: result };
  },
};

// ==================== L5: PPT 样式模板复用 ====================

const officeCloneTemplateTool: Tool = {
  name: 'office_clone_template',
  description: `以一个已有 .pptx 为样式模板，创建新的空白演示文稿。
完整复制模板的主题字体、配色、幻灯片母版、所有版式（含背景图）和媒体资源，但不含任何幻灯片页。
之后用 office_layouts 查看可用版式，用 office_newslide 按版式逐页添加内容。
这是"按某个 PPT 的样式做新 PPT"的标准做法：先 clone 模板，再逐页 newslide。
工作区模板库位于 .config/templates/pptx/（用户收藏的模板及其用法档案 .profile.md），优先从库中选取模板源；学习新模板入库的流程见 pptx-template 技能。
注意：目标文件不能已存在（不会覆盖）。`,
  parameters: {
    type: 'object',
    properties: {
      target: { type: 'string', description: '新文件路径（不能已存在）' },
      template: { type: 'string', description: '样式来源模板 .pptx 路径' },
    },
    required: ['target', 'template'],
  },
  handler: async (args: any) => {
    const result = await execOfficeCLI(['clone', args.target, args.template, '--json']);
    return { success: true, output: truncateOfficeOutput(result, 'office_clone_template') };
  },
};

const officeLayoutsTool: Tool = {
  name: 'office_layouts',
  description: `列出 .pptx 的所有幻灯片版式：编号、名称、类型、背景、占位符（标题/正文等）及主题字体。
配合 office_newslide 使用：先本命令查看版式编号和占位符结构，再选合适版式加页。仅支持 .pptx。`,
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: 'pptx 文件路径' },
    },
    required: ['filename'],
  },
  handler: async (args: any) => {
    const result = await execOfficeCLI(['layouts', args.filename, '--json']);
    return { success: true, output: truncateOfficeOutput(result, 'office_layouts') };
  },
};

const officeNewSlideTool: Tool = {
  name: 'office_newslide',
  description: `为 .pptx 按指定版式添加一页幻灯片，自动复制版式中的占位符并填入文本。
文字的字体、字号、颜色、位置全部由版式/母版/主题继承，无需手动设置样式。
先用 office_layouts 查版式编号。仅支持 .pptx。`,
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: 'pptx 文件路径' },
      layout: { type: 'number', description: '版式编号（见 office_layouts 输出的 layout 字段）' },
      title: { type: 'string', description: '标题占位符文本（title/ctrTitle 类型）' },
      subtitle: { type: 'string', description: '副标题占位符文本（subTitle 类型）' },
      texts: { type: 'string', description: '其余占位符文本，按顺序填充。JSON 数组（如 ["要点一","要点二"]）或单个字符串；文本内 \\n 分段' },
    },
    required: ['filename', 'layout'],
  },
  handler: async (args: any) => {
    const cmdArgs = ['newslide', args.filename, '--layout', String(args.layout)];
    if (args.title !== undefined) cmdArgs.push('--title', args.title);
    if (args.subtitle !== undefined) cmdArgs.push('--subtitle', args.subtitle);
    let texts = args.texts;
    if (texts !== undefined && typeof texts !== 'string') {
      texts = JSON.stringify(texts);
    }
    if (texts !== undefined) cmdArgs.push('--texts', texts);
    const result = await execOfficeCLI(cmdArgs, 60000);
    return { success: true, output: truncateOfficeOutput(result, 'office_newslide') };
  },
};

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
  // L4: 模板格式
  officeApplyStyleTool,
  // L5: PPT 样式模板复用
  officeCloneTemplateTool,
  officeLayoutsTool,
  officeNewSlideTool,
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
// 注意：isAvailable 是 isOfficeCLIAvailable 的内部别名（保留兼容）
const isAvailable = isOfficeCLIAvailable;
export { isAvailable, getCLICommand };
