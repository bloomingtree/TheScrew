/**
 * Office 一键生成工具（docx_build / docx_append / xlsx_build）
 *
 * 通过内嵌 Python + python-docx/openpyxl，一次调用生成完整排版的 Word/Excel。
 * 与 officecli 的 DOM 级操作互补：整篇文档生成用本工具（快），局部修改用 office_set/office_add（准）。
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

async function runBuildScript(config: Record<string, any>): Promise<any> {
  // 防御：模型可能把整个参数对象序列化成 JSON 字符串传入
  let cfg = config;
  if (typeof cfg === 'string') {
    try { cfg = JSON.parse(cfg); } catch { /* 保持原样，交给脚本报错 */ }
  }
  // 防御 2：模型（qwen 系已知行为）可能把全部参数包进 data 字段（字符串或对象）传入。
  // 解包合并到顶层：data 内字段补充顶层缺失的字段，顶层显式字段优先。
  if (cfg && typeof cfg === 'object' && cfg.data !== undefined && cfg.action) {
    let data = cfg.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { data = undefined; }
    }
    if (data && typeof data === 'object') {
      if (Array.isArray(data)) {
        // data 直接是数组：按 action 归位为 sheets/blocks
        if (cfg.action === 'xlsx_build' && !cfg.sheets) cfg.sheets = data;
        if (cfg.action !== 'xlsx_build' && !cfg.blocks) cfg.blocks = data;
      } else {
        for (const [k, v] of Object.entries(data)) {
          if (cfg[k] === undefined && v !== undefined) cfg[k] = v;
        }
      }
      delete cfg.data;
    }
  }
  // 缺参预检：在调用 Python 前给出可操作报错（否则 Python 侧 KeyError 'output'
  // 之类的天书错误会让模型连续盲试）
  if (cfg && typeof cfg === 'object') {
    // data 解包后字段名可能是 filename（工具层叫法）而非 output（Python 层叫法）
    if (!cfg.output && cfg.filename) cfg.output = cfg.filename;
    const missing: string[] = [];
    if (!cfg.output) missing.push('filename（输出文件路径）');
    if (cfg.action === 'xlsx_build' && !cfg.sheets) missing.push('sheets（工作表数组）');
    if ((cfg.action === 'docx_build' || cfg.action === 'docx_append') && !cfg.blocks) missing.push('blocks（内容块数组）');
    if (missing.length > 0) {
      return {
        success: false,
        error: `参数缺失：${missing.join('、')}。请把参数作为独立顶层字段直接传入，` +
          `例如 ${cfg.action}({filename: "输出.xlsx", sheets: [{name:"Sheet1", header:[...], rows:[[...]]}]})。` +
          `不要把参数整体包进 data 字段或序列化成 JSON 字符串。`,
      };
    }
  }
  const pythonPath = getPythonPath();
  const scriptPath = path.join(getScriptsDir(), 'office_build.py');

  if (!fs.existsSync(pythonPath)) {
    return { success: false, error: '内嵌 Python 环境未找到' };
  }
  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: '生成脚本未找到: ' + scriptPath };
  }

  try {
    const { stdout } = await execFileAsync(pythonPath, [scriptPath, JSON.stringify(cfg)], {
      timeout: 120000,
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    const result = JSON.parse(stdout);
    if (result.error) {
      return { success: false, error: result.error };
    }
    if (result.success === false) {
      return { success: false, error: result.error || '文档生成失败' };
    }
    return {
      content: JSON.stringify(result, null, 2),
      /** 供前端 EditedFilesBar/预览识别 */
      file: result.output,
      success: true,
    };
  } catch (err: any) {
    if (err.killed) {
      return { success: false, error: '文档生成超时（120s）' };
    }
    const stderr = err.stderr || '';
    if (stderr) {
      return { success: false, error: `文档生成异常: ${stderr.split('\n').slice(-3).join(' ')}` };
    }
    return { success: false, error: `文档生成异常: ${err.message}` };
  }
}

// ==================== docx_build ====================

const DOCX_BLOCKS_SCHEMA = `内容块数组，每块 {type, ...}：
- {type:"h1"|"h2"|"h3"|"h4", text} — 标题（黑体，进目录）
- {type:"p", text, align?:"left|center|right|justify", bold?, indent?:bool(默认true首行缩进2字符)}
- {type:"bullets"|"numbered", items:[string]}
- {type:"table", header:[...], rows:[[...]], caption?, aligns?:["left","right",...], widths?:[厘米...], header_fill?}
- {type:"kv", items:{"键":"值"}} — 键值信息表（两列）
- {type:"quote", text} — 楷体引用段
- {type:"image", path, width_cm?, caption?}
- {type:"toc"} — 目录域（打开后右键更新域）
- {type:"pagebreak"} / {type:"spacer", size?} / {type:"title", text}（文中居中大标题）`;

const docxBuildTool: Tool = {
  name: 'docx_build',
  description: `一次调用生成完整排版的 Word 文档（.docx）。中文公文/商务排版自动套用：大标题黑体居中、正文宋体小四首行缩进2字符、1.5倍行距、标题分级黑体、表格自动表头灰底加粗、页脚页码。
生成整篇 Word 报告/方案/通知的首选工具，远快于逐段 office_add。
blocks 内容块类型：${DOCX_BLOCKS_SCHEMA}`,
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '输出文件路径（.docx，相对路径按工作区解析）' },
      title: { type: 'string', description: '文档大标题（居中二号黑体）' },
      subtitle: { type: 'string', description: '副标题（可选）' },
      meta: { type: 'array', items: { type: 'string' }, description: '标题下方居中信息行，如 ["编制单位：XX","日期：2026-08-31"]' },
      cover: { type: 'boolean', description: 'true 时标题+信息单独成封面页（默认 false）' },
      toc: { type: 'boolean', description: 'true 时在正文前插入目录域（默认 false）' },
      blocks: { type: 'array', items: { type: 'object' }, description: DOCX_BLOCKS_SCHEMA },
      style: {
        type: 'object',
        description: '排版覆盖（全部可选）：body_font(宋体) body_size(12) heading_font(黑体) h1/h2/h3_size(16/14/12) line_spacing(1.5) first_line_indent(2) margin(2.54cm)',
      },
    },
    required: ['filename', 'blocks'],
  },
  handler: async (args: any) => runBuildScript({
    action: 'docx_build',
    output: args.filename,
    title: args.title,
    subtitle: args.subtitle,
    meta: args.meta,
    cover: args.cover,
    toc: args.toc,
    blocks: args.blocks,
    // 兼容：模型可能把 blocks 包进 data（JSON 字符串或对象）传
    data: args.data,
    style: args.style,
  }),
};

// ==================== docx_append ====================

const docxAppendTool: Tool = {
  name: 'docx_append',
  description: `向已有 .docx 末尾追加内容块（不改动已有内容和样式）。块类型与 docx_build 相同：${DOCX_BLOCKS_SCHEMA}`,
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '已有 docx 文件路径' },
      blocks: { type: 'array', items: { type: 'object' }, description: DOCX_BLOCKS_SCHEMA },
    },
    required: ['filename', 'blocks'],
  },
  handler: async (args: any) => runBuildScript({
    action: 'docx_append',
    output: args.filename,
    blocks: args.blocks,
    data: args.data,
  }),
};

// ==================== xlsx_build ====================

const XLSX_SHEETS_SCHEMA = `工作表数组，每表：{
  name: "Sheet名",
  title?: "A1大标题（跨列合并居中）",
  header: ["列名",...],
  rows: [["值",...],...] 或 [{列名:值},...],
  widths?: [12,...] 或省略(自动列宽),
  number_formats?: {列名或列号: "0.0%"|"#,##0.00"|...},
  total_row?: ["合计","","=SUM(C{first}:C{last})"],
  wrap?: bool, landscape?: bool
}
公式：单元格值以 = 开头即公式。行号占位符 {i}(当前数据行) {first}/{last}(数据区首末行) {row}(合计行自身)；无占位符的公式按"表头第1行"书写并自动平移。`;

const xlsxBuildTool: Tool = {
  name: 'xlsx_build',
  description: `一次调用生成完整格式化的 Excel 工作簿（.xlsx），支持多 Sheet。自动套用：蓝色表头白字加粗、自动列宽（中文自适应）、冻结表头、自动筛选、细边框、合计行（双线上边框）。
生成数据表/台账/汇总表的首选工具，远快于逐格 office_set。
sheets 结构：${XLSX_SHEETS_SCHEMA}`,
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: '输出文件路径（.xlsx）' },
      sheets: { type: 'array', items: { type: 'object' }, description: XLSX_SHEETS_SCHEMA },
    },
    required: ['filename', 'sheets'],
  },
  handler: async (args: any) => runBuildScript({
    action: 'xlsx_build',
    output: args.filename,
    sheets: args.sheets,
    data: args.data,
  }),
};

// ==================== 导出 ====================

export const officeGenTools: Tool[] = [docxBuildTool, docxAppendTool, xlsxBuildTool];

export const officeGenToolGroup: ToolGroup = {
  name: 'officegen',
  description: 'Word/Excel 一键生成（整篇排版，快于逐元素操作）',
  tools: officeGenTools,
  keywords: ['word', 'excel', 'docx', 'xlsx', '报告', '台账', '汇总', '表格', '文档'],
  triggers: {
    keywords: ['生成word', '写word', '生成报告', '做表格', '生成excel', '写excel', '台账', '汇总表'],
    fileExtensions: ['.docx', '.xlsx'],
    dependentTools: [],
  },
};
