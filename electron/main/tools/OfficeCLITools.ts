/**
 * OfficeCLI Tools（单工具版）
 *
 * 通过命令行工具 officecli-lite 操作 Word、Excel、PowerPoint 文档。
 * 2026-09-09 工具收敛：原 18 个 office_* 工具合并为 1 个 `office` 工具
 * （command enum + params + data），用法速查写进 description（Claude Code 风格）。
 *
 * 依赖：officecli-lite 二进制（轻量版，内存优化适配 Win7/8GB）
 */

import { execFile, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { getPathManager } from '../config/PathManager';
import { Tool } from './ToolManager';

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

// ==================== 输出截断 ====================
const OFFICE_MAX_OUTPUT_CHARS = 30000;

/**
 * 截断 office 输出，防止撑爆上下文
 */
function truncateOfficeOutput(output: string): string {
  if (output.length <= OFFICE_MAX_OUTPUT_CHARS) return output;

  const headSize = 6000;
  const tailSize = 2000;
  const totalSize = output.length;
  const omitted = totalSize - headSize - tailSize;

  const head = output.substring(0, headSize);
  const tail = output.substring(totalSize - tailSize);

  return `${head}\n\n... [输出已截断，省略 ${omitted.toLocaleString()} 字符（共 ${(totalSize / 1024).toFixed(1)}KB）。请使用 office({command:"get"}) 获取具体元素的详细内容] ...\n\n${tail}`;
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

// 通过 stdin 执行 officecli 命令（batch/merge 等大数据场景）
export function execOfficeCLIWithStdin(args: string[], stdinData: string, timeout: number = 120000): Promise<string> {
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

// ==================== 单工具定义 ====================

const officeTool: Tool = {
  name: 'office',
  description: `操作 Word/Excel/PowerPoint 文档（officecli-lite）。command 取值：

**读取类**
- create：创建空白文档。params: {filename 已是顶层参数}
- view：文档结构大纲（JSON）。推荐先 view 再 get 定位元素
- get：读指定元素。params: {element_path, property?}（如 element_path="/body/p[1]"，property 默认 text）
- find：全文搜索。params: {pattern}
- validate：OOXML 结构校验（仅 .docx）
- raw：读原始 XML。params: {xpath}

**修改类**
- set：改元素属性。params: {element_path, props:{text,bold,...}}
- add：添加元素。params: {parent_path, type:"paragraph|pageBreak|table|row|column", text?, rows?, cols?}
- remove：删除元素。params: {element_path}
- batch：批量操作序列（data 传 JSON 操作数组，走 stdin 管道，无命令行长度限制）
- merge：模板数据合并。data 传 JSON

**模板/PPT 类**
- apply_style：把模板文档格式（字体/样式/页边距）应用到目标文档（仅 .docx）。params: {target, template}
- clone：以 .pptx 为样式模板克隆新空白演示文稿（主题/母版/版式全复制，不含页）。params: {target, template}，target 不能已存在
- layouts：列出 pptx 所有版式（编号/名称/占位符）。配合 newslide
- newslide：按版式加一页幻灯片。params: {layout, title?, subtitle?, texts?}（texts 为 JSON 数组或字符串，\\n 分段）

示例：
- office({command:"view", filename:"报表.xlsx"})
- office({command:"set", filename:"报表.xlsx", params:{element_path:"sheet1!B3", props:{value:"=SUM(B1:B2)"}}})
- office({command:"batch", filename:"报告.docx", data:'[{"op":"add","path":"/body","type":"paragraph","text":"第一段"},{"op":"add","path":"/body","type":"paragraph","text":"第二段"}]'})

详细用法（尤其 batch 操作格式、PPT 模板工作流）见 docx/xlsx/pptx-template 技能。`,
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        enum: ['create', 'view', 'get', 'set', 'add', 'remove', 'find', 'validate', 'merge', 'batch', 'raw', 'apply_style', 'clone', 'layouts', 'newslide'],
        description: '子命令，见上方速查表',
      },
      filename: { type: 'string', description: '目标文档路径（clone/apply_style 用 params.target/template）' },
      params: { type: 'object', description: '子命令参数对象（element_path/props/parent_path/type/pattern/xpath/target/template/layout/title/subtitle/texts 等）' },
      data: { type: 'string', description: 'batch 的操作序列 JSON / merge 的数据 JSON（传对象会自动序列化）' },
    },
    required: ['command'],
  },
  handler: async (args: any) => {
    const p = args.params || {};
    try {
      switch (args.command) {
        case 'create': {
          if (!args.filename) return { success: false, error: 'create 需要 filename 参数' };
          const result = await execOfficeCLI(['create', args.filename]);
          return { success: true, output: result, filename: args.filename };
        }
        case 'view': {
          const result = await execOfficeCLI(['view', args.filename, '--json']);
          return { success: true, output: truncateOfficeOutput(result) };
        }
        case 'get': {
          const result = await execOfficeCLI(['get', args.filename, p.element_path, p.property || 'text', '--json']);
          return { success: true, output: truncateOfficeOutput(result) };
        }
        case 'find': {
          const result = await execOfficeCLI(['find', args.filename, p.pattern, '--json']);
          return { success: true, output: truncateOfficeOutput(result) };
        }
        case 'validate': {
          if (!/\.(docx)$/i.test(args.filename ?? '')) {
            return { success: false, error: `validate 目前仅支持 .docx 文件（校验表格结构等 OOXML 规则），收到的是 "${args.filename ?? ''}"` };
          }
          const result = await execOfficeCLI(['validate', args.filename, '--json']);
          return { success: true, output: truncateOfficeOutput(result) };
        }
        case 'raw': {
          const result = await execOfficeCLI(['raw', args.filename, '--xpath', p.xpath, '--json']);
          return { success: true, output: truncateOfficeOutput(result) };
        }
        case 'set': {
          const cmdArgs = ['set', args.filename, p.element_path];
          for (const [key, value] of Object.entries(p.props || {})) {
            cmdArgs.push(`${key}=${value}`);
          }
          const result = await execOfficeCLI(cmdArgs);
          return { success: true, output: result };
        }
        case 'add': {
          const cmdArgs = ['add', args.filename, p.parent_path, p.type];
          if (p.rows !== undefined) cmdArgs.push('--rows', String(p.rows));
          if (p.cols !== undefined) cmdArgs.push('--cols', String(p.cols));
          if (p.text !== undefined) cmdArgs.push('--text', String(p.text));
          const result = await execOfficeCLI(cmdArgs);
          return { success: true, output: result };
        }
        case 'remove': {
          const result = await execOfficeCLI(['remove', args.filename, p.element_path]);
          return { success: true, output: result };
        }
        case 'batch': {
          // 防御性校验：AI 可能传对象/数组而非 JSON 字符串
          let payload = args.data;
          if (typeof payload !== 'string') {
            try {
              payload = JSON.stringify(payload);
            } catch {
              return { success: false, error: 'data 必须是 JSON 字符串或可序列化对象' };
            }
          }
          const result = await execOfficeCLIWithStdin(['batch', args.filename], payload, 120000);
          return { success: true, output: truncateOfficeOutput(result) };
        }
        case 'merge': {
          let payload = args.data;
          if (typeof payload !== 'string') {
            try {
              payload = JSON.stringify(payload);
            } catch {
              return { success: false, error: 'data 必须是 JSON 字符串或可序列化对象' };
            }
          }
          const result = await execOfficeCLI(['merge', args.filename, '--data', payload, '--json'], 120000);
          return { success: true, output: result };
        }
        case 'apply_style': {
          const result = await execOfficeCLI(['applyStyle', p.target, p.template]);
          return { success: true, output: result };
        }
        case 'clone': {
          const result = await execOfficeCLI(['clone', p.target, p.template, '--json']);
          return { success: true, output: truncateOfficeOutput(result) };
        }
        case 'layouts': {
          const result = await execOfficeCLI(['layouts', args.filename, '--json']);
          return { success: true, output: truncateOfficeOutput(result) };
        }
        case 'newslide': {
          const cmdArgs = ['newslide', args.filename, '--layout', String(p.layout)];
          if (p.title !== undefined) cmdArgs.push('--title', p.title);
          if (p.subtitle !== undefined) cmdArgs.push('--subtitle', p.subtitle);
          let texts = p.texts;
          if (texts !== undefined && typeof texts !== 'string') {
            texts = JSON.stringify(texts);
          }
          if (texts !== undefined) cmdArgs.push('--texts', texts);
          const result = await execOfficeCLI(cmdArgs, 60000);
          return { success: true, output: truncateOfficeOutput(result) };
        }
        default:
          return { success: false, error: `未知 command "${args.command}"。可用：create/view/get/set/add/remove/find/validate/merge/batch/raw/apply_style/clone/layouts/newslide` };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  },
};

// ==================== 导出 ====================

export const officeCLITools: Tool[] = [officeTool];

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
