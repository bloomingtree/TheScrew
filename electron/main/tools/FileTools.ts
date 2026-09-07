import { readdir, readFile, stat, writeFile, open } from 'fs/promises';
import { createReadStream } from 'fs';
import readline from 'readline';
import path from 'path';
import { app } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Tool } from './ToolManager';
import { getPathManager, CONFIG_DIR_NAME } from '../config/PathManager';
import { execOfficeCLI, isOfficeCLIAvailable } from './OfficeCLITools';

const execFileAsync = promisify(execFile);

// ==================== read 常量 ====================
const READ_FILE_DEFAULT_LIMIT = 2000;   // 默认读取行数
const READ_FILE_MAX_LINE_LENGTH = 2000; // 单行最大字符数
const READ_FILE_MAX_BYTES = 50 * 1024;  // 最大读取 50KB
const READ_FILE_LINE_SUFFIX = `... (line truncated to ${READ_FILE_MAX_LINE_LENGTH} chars)`;

// 二进制文件扩展名（不含 PDF / 图片 / Office 文档，这些有专用读取器）
const BINARY_EXTENSIONS = new Set([
  '.zip', '.exe', '.dll', '.so', '.dylib', '.bin', '.obj', '.o', '.a',
  '.lib', '.pdb', '.dSYM', '.woff', '.woff2', '.ttf', '.eot', '.ico',
  '.svg',
  '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm',
  '.7z', '.tar', '.gz', '.bz2', '.xz', '.rar', '.iso', '.dmg',
  '.sqlite', '.db', '.mdb', '.class', '.jar', '.war', '.pyc',
]);

// 使用 globalThis 确保跨 chunk 共享（Vite 内联模块会导致模块变量重复）
const _workspaceKey = Symbol.for('zero-employee:getWorkspacePath()');

export function setWorkspacePath(p: string | null) {
  (globalThis as any)[_workspaceKey] = p;
  clearReadSnapshots(); // 切换工作空间后旧快照无意义
}

export function getWorkspacePath(): string | null {
  return (globalThis as any)[_workspaceKey] ?? null;
}

// ==================== 文件读取状态跟踪（过期内容防护） ====================
// 记录 agent 最后一次 read / 成功编辑 / 成功写入某文件时的 mtime+size 快照；
// edit / edit_lines / write（覆盖已有文件）前检查文件是否已变化，
// 防止 agent 基于过期内容编辑（bash/officecli/用户手动编辑等外部修改均会被捕获）。
interface FileReadSnapshot {
  mtimeMs: number;
  size: number;
}

const _fileReadStateKey = Symbol.for('zero-employee:fileReadState');

function getFileReadState(): Map<string, FileReadSnapshot> {
  let m = (globalThis as any)[_fileReadStateKey] as Map<string, FileReadSnapshot> | undefined;
  if (!m) {
    m = new Map();
    (globalThis as any)[_fileReadStateKey] = m;
  }
  return m;
}

/** 归一化快照 key（Windows 文件系统不区分大小写） */
function snapshotKey(fullPath: string): string {
  return process.platform === 'win32' ? fullPath.toLowerCase() : fullPath;
}

/** 记录文件快照（read / edit / write 成功后调用） */
function recordReadSnapshot(fullPath: string, stats: { mtimeMs: number; size: number }): void {
  getFileReadState().set(snapshotKey(fullPath), { mtimeMs: stats.mtimeMs, size: stats.size });
}

/** 切换工作空间时清空快照（旧路径的快照无意义） */
function clearReadSnapshots(): void {
  getFileReadState().clear();
}

function formatSnapshotTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * 编辑前检查文件是否在 agent 最后一次读取之后被修改过。
 * - 文件不存在：返回 null（由后续读取逻辑报 ENOENT）
 * - 从未读取过：返回错误（禁止凭记忆编辑）
 * - mtime 或 size 变化：返回错误（要求重新 read）
 * - 无变化：返回 null（放行）
 */
async function checkFileFreshness(fullPath: string, filepath: string): Promise<string | null> {
  let stats;
  try {
    stats = await stat(fullPath);
  } catch {
    return null; // 文件不存在：write 创建新文件的场景，或已删除，交给后续逻辑处理
  }

  const snapshot = getFileReadState().get(snapshotKey(fullPath));
  if (!snapshot) {
    return `【过期内容防护】本次会话尚未读取过 "${filepath}"，不能凭记忆直接编辑。请先执行 read 读取当前内容，再执行编辑。`;
  }

  if (snapshot.mtimeMs !== stats.mtimeMs || snapshot.size !== stats.size) {
    return `【过期内容防护】"${filepath}" 在上次读取之后已被修改，为避免基于过期内容编辑，本次操作已被拦截。
- 上次读取时：${formatSnapshotTime(snapshot.mtimeMs)}，${snapshot.size} 字节
- 当前状态：${formatSnapshotTime(stats.mtimeMs)}，${stats.size} 字节
可能的修改来源：bash / officecli 命令、其他工具调用或用户手动编辑。
请重新执行 read 获取最新内容后再编辑（如使用 edit_lines 按行号编辑，务必以最新行号为准）。`;
  }

  return null;
}

/**
 * Office 文档读取提示：引导 AI 使用 office_* 系列工具进行元素级操作
 */
const OFFICE_EDIT_HINT = '\n\n---\n[提示] 如需查看文档结构、查询或修改具体元素（段落/单元格/形状等），请使用 office_view、office_get、office_query 等工具。';

/**
 * 尝试通过 OfficeCLI（office_view --json）读取 Office 文档结构化大纲。
 * - 适用于 .docx / .xlsx / .pptx
 * - 返回 markdown 化的内容 + 编辑 hint；OfficeCLI 不可用或调用失败时返回 null（由调用方回退）
 */
async function tryReadOfficeViaCLI(
  filepath: string,
  fullPath: string,
  ext: string,
  size: number,
  namespace: string,
): Promise<any | null> {
  if (!isOfficeCLIAvailable()) return null;
  try {
    const raw = await execOfficeCLI(['view', fullPath, '--json'], 30000);
    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // 非 JSON 输出（可能是错误信息或纯文本），直接当作 content
      return {
        success: true,
        content: (typeof raw === 'string' ? raw : '') + OFFICE_EDIT_HINT,
        path: filepath,
        namespace,
        fullPath,
        fileType: ext.startsWith('.doc') ? 'word' : ext.startsWith('.xls') ? 'excel' : 'ppt',
        size,
      };
    }

    // 把 JSON 结构压成 markdown 大纲（AI 友好）
    const md = officeJsonToMarkdown(parsed, ext);
    return {
      success: true,
      content: md + OFFICE_EDIT_HINT,
      path: filepath,
      namespace,
      fullPath,
      fileType: ext.startsWith('.doc') ? 'word' : ext.startsWith('.xls') ? 'excel' : 'ppt',
      size,
      structured: parsed,
    };
  } catch (error: any) {
    // CLI 调用失败：返回 null 让调用方走 fallback
    console.warn(`[FileTools] OfficeCLI view failed for ${filepath}:`, error?.message);
    return null;
  }
}

/**
 * 把 office_view 的 JSON 输出转换为 AI 友好的 markdown 摘要。
 * 容错处理：常见字段缺失时退化为 JSON 片段。
 */
function officeJsonToMarkdown(parsed: any, ext: string): string {
  if (!parsed || typeof parsed !== 'object') return '';
  const lines: string[] = [];

  // PowerPoint：slides[]
  if (Array.isArray(parsed.slides)) {
    lines.push(`# PowerPoint 文档（共 ${parsed.slides.length} 张幻灯片）\n`);
    parsed.slides.forEach((sl: any, i: number) => {
      lines.push(`## 幻灯片 ${i + 1}${sl?.title ? `：${sl.title}` : ''}`);
      if (Array.isArray(sl.shapes)) {
        sl.shapes.forEach((sh: any) => {
          const text = typeof sh === 'string' ? sh : (sh?.text || sh?.content || '');
          if (text) lines.push(`- ${text}`);
        });
      }
      if (sl?.notes) lines.push(`_备注：${sl.notes}_`);
      lines.push('');
    });
    return lines.join('\n');
  }

  // Excel：sheets[]
  if (Array.isArray(parsed.sheets)) {
    lines.push(`# Excel 文档（共 ${parsed.sheets.length} 个工作表）\n`);
    parsed.sheets.forEach((sh: any) => {
      lines.push(`## 工作表：${sh?.name || '(未命名)'}（${sh?.rowCount ?? '?'} 行 × ${sh?.colCount ?? '?'} 列）`);
      lines.push('（详细数据请用 office_get 获取具体范围）');
      lines.push('');
    });
    return lines.join('\n');
  }

  // Word：paragraphs[] 或 sections[]
  if (Array.isArray(parsed.paragraphs) || Array.isArray(parsed.sections)) {
    const items = parsed.paragraphs || parsed.sections;
    lines.push(`# Word 文档（共 ${items.length} 个段落/节）\n`);
    items.forEach((p: any) => {
      const text = typeof p === 'string' ? p : (p?.text || p?.content || '');
      const style = typeof p === 'object' ? (p?.style || p?.heading || '') : '';
      const prefix = style ? `**[${style}]** ` : '';
      if (text) lines.push(`${prefix}${text}`);
    });
    return lines.join('\n');
  }

  // 兜底：直接打印 JSON（截断到 6000 字符）
  const json = JSON.stringify(parsed, null, 2);
  return json.length > 6000 ? json.substring(0, 6000) + '\n... (JSON 已截断，请用 office_get 获取详细元素)' : json;
}

/**
 * 搜索配置常量
 */
export const SEARCH_CONFIG = {
  /** 默认忽略的目录列表 */
  IGNORED_DIRS: new Set([
    'System Volume Information',
    '$RECYCLE.BIN',
    'Recovery',
    'Windows',
    'Program Files',
    'Program Files (x86)',
    'ProgramData',
    'node_modules',
    '.yarn',
    '.pnpm-store',
    '.git',
    '.idea',
    '.vscode',
    '.vs',
    'dist',
    'build',
    'out',
    '.DS_Store',
    '.Spotlight-V100',
    '.Trashes',
    '.cache',
    '.local',
  ]),
  MAX_DEPTH: 50,
  MAX_FILES: 5000,
};

export const fileTools: Tool[] = [
  {
    name: 'get_workspace',
    description: '获取工作空间信息，包括文件列表和目录结构',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      try {
        if (!getWorkspacePath()) {
          return { success: false, error: '工作空间未设置，请先让用户设置工作空间' };
        }

        const files = await listFiles(getWorkspacePath(), false, getWorkspacePath());

        return {
          success: true,
          path: getWorkspacePath(),
          name: path.basename(getWorkspacePath()),
          files: files.filter(f => f.type === 'file'),
          directories: files.filter(f => f.type === 'directory'),
          description: `当前工作空间位于 ${getWorkspacePath()}，是一个项目目录，包含了 ${files.filter(f => f.type === 'file').length} 个文件和 ${files.filter(f => f.type === 'directory').length} 个目录。`,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'ls',
    description: `列出目录内容（支持递归）

**必需参数**：
- directory: 目录路径（如 "." 表示当前目录，"src" 表示 src 目录）

**可选参数**：
- recursive: 是否递归列出子目录（默认 false）
- namespace: 命名空间，workspace（工作空间）或 config（${CONFIG_DIR_NAME} 配置目录，默认 workspace）

**警告**：recursive=true 时会递归遍历所有子目录，对于大型目录可能导致性能问题。
- 有深度限制（${SEARCH_CONFIG.MAX_DEPTH} 层）和文件数量限制（${SEARCH_CONFIG.MAX_FILES} 个文件）
- 会自动忽略 node_modules、.git、dist、build 等常见目录

使用示例：
- 列出工作空间根目录：directory=".", namespace="workspace"
- 列出配置目录：directory="skills", namespace="config"
- 递归列出：directory="src", recursive=true

**返回值说明**：
- 返回结果包含 \`path\`（相对路径）和 \`fullPath\`（绝对路径）
- \`fullPath\` 可直接用于 bash 命令执行脚本，不依赖当前工作目录`,
    parameters: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: '要列出的目录路径（相对于指定命名空间的根目录）',
        },
        namespace: {
          type: 'string',
          description: `命名空间：workspace（工作空间）或 config（${CONFIG_DIR_NAME} 配置目录）`,
          enum: ['workspace', 'config'],
          default: 'workspace',
        },
        recursive: {
          type: 'boolean',
          description: '是否递归列出子目录（警告：大目录可能很慢）',
          default: false,
        },
      },
      required: ['directory'],
    },
    handler: async ({ directory, namespace = 'workspace', recursive = false }) => {
      try {
        if (!getWorkspacePath()) {
          return { success: false, error: '工作空间未设置' };
        }

        let rootPath: string;
        if (namespace === 'config') {
          rootPath = getPathManager().getConfigPath();
        } else {
          rootPath = getWorkspacePath();
        }

        const fullPath = path.resolve(rootPath, directory);
        const fileCount = { current: 0, max: SEARCH_CONFIG.MAX_FILES };
        const files = await listFiles(fullPath, recursive, rootPath, 0, fileCount);

        const truncated = fileCount.current >= fileCount.max;
        const result: any = {
          success: true,
          files,
          count: files.length,
        };

        if (truncated) {
          result.warning = `结果已截断：文件数量超过限制（${fileCount.max}），仅显示部分结果`;
        }

        return result;
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'read',
    description: `读取文件内容，支持文本文件、Office 文档（.docx/.xlsx/.pptx，自动路由到 OfficeCLI 获取结构化大纲）、PDF 文档（.pdf）和图片文件。支持从工作空间或配置目录（${CONFIG_DIR_NAME}）读取文件。

**Office 文档**：本工具会自动识别 .docx/.xlsx/.pptx 并通过 OfficeCLI 读取结构化内容（含 hint 提示后续使用 office_view/office_get 做元素级操作），无需先调用 read 再切换到 office_view。

**必需参数**：
- filepath: 文件路径（如 "README.md" 或 "skills/docx/SKILL.md"）

**可选参数**：
- offset: 起始行号（从 1 开始，默认 1）
- limit: 最大读取行数（默认 ${READ_FILE_DEFAULT_LIMIT}）
- namespace: 命名空间，workspace（工作空间）或 config（${CONFIG_DIR_NAME} 配置目录，默认 workspace）
- sheet: Excel 工作表名（仅 xlsx 文件，不指定则读取所有工作表）
- extract_images: 是否提取文档中的图片（仅 docx 文件，默认 false）
- pages: PDF 页码范围，如 "1-5,8,10-12"（仅 PDF 文件）
- mode: 读取模式：auto（自动识别）、text（强制文本读取）、document（强制文档读取，默认 auto）

使用示例：
- 读取整个小文件：filepath="README.md"
- 分页读取大文件：filepath="large.log", offset=1, limit=100
- 读取第 200-300 行：filepath="src/index.ts", offset=200, limit=100
- 读取配置文件：filepath="skills/docx/SKILL.md", namespace="config"
- 读取 Word 文档：filepath="report.docx"（自动结构化）
- 读取 Excel：filepath="data.xlsx"（自动结构化）
- 读取 PowerPoint：filepath="slides.pptx"（自动结构化）
- 读取 PDF 文件：filepath="document.pdf"
- 读取 PDF 指定页：filepath="document.pdf", pages="1-5,8"
- 读取图片信息：filepath="photo.jpg"

**限制**：
- 单次最多读取 ${READ_FILE_DEFAULT_LIMIT} 行
- 总读取大小不超过 ${READ_FILE_MAX_BYTES / 1024}KB
- 单行超过 ${READ_FILE_MAX_LINE_LENGTH} 字符会被截断
- 二进制文件（.exe, .dll 等）无法读取

**返回值说明**：
- 返回结果包含 \`path\`（相对路径）、\`namespace\` 和 \`fullPath\`（绝对路径）
- \`fullPath\` 可直接用于 bash 命令执行脚本，不依赖当前工作目录`,
    parameters: {
      type: 'object',
      properties: {
        filepath: {
          type: 'string',
          description: '要读取的文件路径（相对于指定命名空间的根目录）',
        },
        namespace: {
          type: 'string',
          description: `命名空间：workspace（工作空间）或 config（${CONFIG_DIR_NAME} 配置目录）`,
          enum: ['workspace', 'config'],
          default: 'workspace',
        },
        offset: {
          type: 'number',
          description: `起始行号（从 1 开始，默认 1）`,
        },
        limit: {
          type: 'number',
          description: `最大读取行数（默认 ${READ_FILE_DEFAULT_LIMIT}）`,
        },
        sheet: {
          type: 'string',
          description: 'Excel 工作表名（仅 xlsx 文件有效）',
        },
        extract_images: {
          type: 'boolean',
          description: '是否提取文档中的图片（仅 docx 文件有效）',
          default: false,
        },
        pages: {
          type: 'string',
          description: 'PDF 页码范围，如 "1-5,8,10-12"（仅 PDF 文件有效）',
        },
        mode: {
          type: 'string',
          description: '读取模式：auto（自动识别文件类型）、text（强制文本读取）、document（强制文档读取）',
          enum: ['auto', 'text', 'document'],
          default: 'auto',
        },
      },
      required: ['filepath'],
    },
    handler: async ({ filepath, namespace = 'workspace', offset, limit, sheet, extract_images = false, pages, mode = 'auto', _toolCallId }) => {
      try {
        if (!getWorkspacePath()) {
          return { success: false, error: '工作空间未设置' };
        }

        let rootPath: string;
        if (namespace === 'config') {
          rootPath = getPathManager().getConfigPath();
        } else {
          rootPath = getWorkspacePath();
        }

        const fullPath = path.resolve(rootPath, filepath);
        const stats = await stat(fullPath);

        if (stats.isDirectory()) {
          return { success: false, error: `"${filepath}" 是目录，不是文件。请使用 ls 列出目录内容。` };
        }

        // 记录快照（供 edit/edit_lines/write 的过期内容防护使用）
        recordReadSnapshot(fullPath, stats);

        // 文件类型检测与路由
        const ext = path.extname(filepath).toLowerCase();

        // Word 文档路由
        if (mode !== 'text' && ['.doc', '.docx'].includes(ext)) {
          // 优先尝试 OfficeCLI（提供结构化大纲）；失败则回退到 Python 提取纯文本
          const cliResult = await tryReadOfficeViaCLI(filepath, fullPath, ext, stats.size, namespace);
          if (cliResult) return cliResult;
          try {
            const content = await readWordDocument(fullPath, extract_images);
            return {
              success: true,
              content: content + OFFICE_EDIT_HINT,
              path: filepath,
              namespace,
              fullPath,
              fileType: 'word',
              size: stats.size,
            };
          } catch (error: any) {
            return { success: false, error: `读取 Word 文件失败: ${error.message}` };
          }
        }

        // Excel 文档路由
        if (mode !== 'text' && ['.xls', '.xlsx', '.xlsm'].includes(ext)) {
          // 2026-09-07：优先用 Python 读出全部单元格数据（Markdown 表格，data_only）。
          // 原先优先走 OfficeCLI view，但它只返回 sheet 结构（"? 行 × ? 列"占位），
          // AI 拿不到实际数据，被迫每次现场写 python 脚本，浪费大量轮次。
          // Python 失败时回退 OfficeCLI 结构大纲。
          try {
            const content = await readExcelDocument(fullPath, sheet);
            return {
              success: true,
              content: content + OFFICE_EDIT_HINT +
                '\n[说明] 以上为单元格数据（公式单元格显示计算后的缓存值；由 openpyxl 等工具生成且未在 Excel 中打开过的文件公式缓存为空，如需原始公式请用 bash + python data_only=False 读取）。',
              path: filepath,
              namespace,
              fullPath,
              fileType: 'excel',
              size: stats.size,
            };
          } catch {
            const cliResult = await tryReadOfficeViaCLI(filepath, fullPath, ext, stats.size, namespace);
            if (cliResult) return cliResult;
            return {
              success: false,
              error: '读取 Excel 文件失败：Python 读取器与 OfficeCLI 均不可用。请检查内嵌 Python 环境（.config/bin）或用 bash + openpyxl 读取。',
            };
          }
        }

        // PowerPoint 文档路由（仅通过 OfficeCLI 读取，Python 不支持）
        if (mode !== 'text' && ['.ppt', '.pptx'].includes(ext)) {
          const cliResult = await tryReadOfficeViaCLI(filepath, fullPath, ext, stats.size, namespace);
          if (cliResult) return cliResult;
          return {
            success: false,
            error: `读取 PowerPoint 文件失败：OfficeCLI 不可用。请确认已安装 officecli-lite 二进制（.config/bin/）`,
            hint: 'OfficeCLI 未安装时无法读取 .pptx；可让用户使用 PowerPoint 导出 PDF 后再读',
          };
        }

        // PDF 文档路由
        if (mode !== 'text' && ext === '.pdf') {
          try {
            const content = await readPDFDocument(fullPath, pages);
            return {
              success: true,
              content,
              path: filepath,
              namespace,
              fullPath,
              fileType: 'pdf',
              size: stats.size,
            };
          } catch (error: any) {
            return { success: false, error: `读取 PDF 文件失败: ${error.message}` };
          }
        }

        // 图片文件路由
        if (['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp', '.gif'].includes(ext)) {
          try {
            const content = await readImageFile(fullPath);
            return {
              success: true,
              content,
              path: filepath,
              namespace,
              fullPath,
              fileType: 'image',
              size: stats.size,
            };
          } catch (error: any) {
            return { success: false, error: `读取图片文件失败: ${error.message}` };
          }
        }

        // 二进制文件检测
        if (BINARY_EXTENSIONS.has(ext)) {
          return {
            success: false,
            error: `无法读取二进制文件 "${filepath}"（${ext} 格式）`,
            hint: '二进制文件请使用对应的工具处理，或通过 bash 命令操作',
          };
        }

        // 文件大小检查
        if (stats.size > 10 * READ_FILE_MAX_BYTES) {
          // 超过 500KB，必须使用分页读取
          if (!offset || !limit) {
            return {
              success: false,
              error: `文件过大 (${(stats.size / 1024).toFixed(1)}KB)，请使用 offset 和 limit 参数分页读取`,
              hint: `建议：先使用 offset=1, limit=${READ_FILE_DEFAULT_LIMIT} 读取前 ${READ_FILE_DEFAULT_LIMIT} 行`,
              fileSize: stats.size,
            };
          }
        }

        // 参数校验
        const startLine = Math.max(1, Math.floor(offset ?? 1));
        const maxLines = Math.min(READ_FILE_DEFAULT_LIMIT, Math.floor(limit ?? READ_FILE_DEFAULT_LIMIT));

        // 流式行读取
        const result = await readLines(fullPath, startLine, maxLines);

        return {
          success: true,
          content: result.content,
          path: filepath,
          namespace,
          fullPath,
          size: stats.size,
          lineRange: `${result.startLine}-${result.endLine}`,
          totalLines: result.totalLines,
          truncated: result.truncated,
        };
      } catch (error: any) {
        if (error.code === 'EISDIR') {
          return { success: false, error: `"${filepath}" 是目录，不是文件。请使用 ls 列出目录内容。` };
        }
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'get_file_info',
    description: '获取文件详细信息（大小、修改时间等）',
    parameters: {
      type: 'object',
      properties: {
        filepath: {
          type: 'string',
          description: '文件路径（相对于指定命名空间的根目录）',
        },
        namespace: {
          type: 'string',
          description: `命名空间：workspace（工作空间）或 config（${CONFIG_DIR_NAME} 配置目录）`,
          enum: ['workspace', 'config'],
          default: 'workspace',
        },
      },
      required: ['filepath'],
    },
    handler: async ({ filepath, namespace = 'workspace' }) => {
      try {
        if (!getWorkspacePath()) {
          return { success: false, error: '工作空间未设置' };
        }

        let rootPath: string;
        if (namespace === 'config') {
          rootPath = getPathManager().getConfigPath();
        } else {
          rootPath = getWorkspacePath();
        }

        const fullPath = path.resolve(rootPath, filepath);
        const stats = await stat(fullPath);

        return {
          success: true,
          path: filepath,
          namespace,
          name: path.basename(filepath),
          extension: path.extname(filepath),
          size: stats.size,
          modified: stats.mtime,
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  // ==================== 文件编辑 ====================

  {
    name: 'edit',
    description: `通过文本替换精确编辑文件（精确字符串替换工具）。

**工作方式**：默认要求 old_text 在文件中**恰好出现一次**，将其替换为 new_text。多处匹配会报错并列出行号，此时请在 old_text 中包含更多上下文（前后几行）使其唯一。

**三种编辑模式**：
1. 修改：old_text = 原文本，new_text = 新文本
2. 删除行：old_text = 要删除的整行内容（含换行），new_text = ""
3. 插入行：old_text = 插入位置的锚点行（唯一），new_text = 锚点行 + 新增内容

**必需参数**：
- filepath: 文件路径
- old_text: 要被替换的文本（必须与文件内容完全一致，包括缩进）
- new_text: 替换后的文本（删除时传空字符串）

**可选参数**：
- replace_all: 替换所有匹配（默认 false，仅替换唯一匹配）
- namespace: workspace 或 config（默认 workspace）

**注意**：
- old_text 必须完全匹配（区分大小写、区分缩进）——建议先 read 再复制粘贴
- 替换成功后返回 diff 预览（- 表示删除行，+ 表示新增行），请检查是否符预期
- 文件为 CRLF（\\r\\n）换行时，old_text 用 \\n 也能自动适配
- 编辑前请务必先用 read 读过该文件，不要凭记忆编辑（系统会强制校验：未读取过或文件在读取后被外部修改过，编辑会被拦截并要求重新 read）`,
    parameters: {
      type: 'object',
      properties: {
        filepath: {
          type: 'string',
          description: '要编辑的文件路径（相对于指定命名空间的根目录）',
        },
        namespace: {
          type: 'string',
          description: `命名空间：workspace（工作空间）或 config（${CONFIG_DIR_NAME} 配置目录）`,
          enum: ['workspace', 'config'],
          default: 'workspace',
        },
        old_text: {
          type: 'string',
          description: '要被替换的文本（必须完全匹配，包含足够上下文使其在文件中唯一）',
        },
        new_text: {
          type: 'string',
          description: '替换后的新文本（删除时传空字符串）',
        },
        replace_all: {
          type: 'boolean',
          description: '是否替换所有匹配（默认 false：要求唯一匹配，多处匹配时报错）',
          default: false,
        },
      },
      required: ['filepath', 'old_text', 'new_text'],
    },
    handler: async ({ filepath, namespace = 'workspace', old_text, new_text, replace_all = false }) => {
      try {
        if (!getWorkspacePath()) {
          return { success: false, error: '工作空间未设置' };
        }

        if (!old_text) {
          return { success: false, error: 'old_text 不能为空。插入内容请用锚点行作为 old_text，new_text = 锚点行 + 新内容' };
        }

        let rootPath: string;
        if (namespace === 'config') {
          rootPath = getPathManager().getConfigPath();
        } else {
          rootPath = getWorkspacePath();
        }

        const fullPath = path.resolve(rootPath, filepath);

        // 过期内容防护：文件在上次读取后被修改过则拦截
        const staleError = await checkFileFreshness(fullPath, filepath);
        if (staleError) return { success: false, error: staleError };

        // 读取文件内容
        const content = await readFile(fullPath, 'utf-8');

        // CRLF 适配：文件为 CRLF 而 old_text 为 LF 时自动转换匹配
        let matchText = old_text;
        let replaceText = new_text;
        if (!content.includes(matchText) && content.includes('\r\n') && matchText.includes('\n') && !matchText.includes('\r\n')) {
          matchText = matchText.replace(/\n/g, '\r\n');
          replaceText = replaceText.replace(/\n/g, '\r\n');
        }

        // 定位所有匹配的行号
        const occurrenceLines = findOccurrenceLines(content, matchText);

        if (occurrenceLines.length === 0) {
          return {
            success: false,
            error: `在文件中未找到要替换的文本（请检查大小写和缩进是否完全一致）`,
            hint: '建议先用 read 读取文件，从输出中精确复制要替换的内容（注意保留缩进和空格）',
          };
        }

        if (occurrenceLines.length > 1 && !replace_all) {
          return {
            success: false,
            error: `old_text 在文件中出现 ${occurrenceLines.length} 次（第 ${occurrenceLines.join('、')} 行），无法确定替换哪一个`,
            hint: '请在 old_text 中包含更多上下文（前后相邻的行）使其唯一，或确认要全部替换时传 replace_all: true',
          };
        }

        // 执行替换：默认仅替换第一处，replace_all 时替换全部
        let newContent: string;
        if (replace_all) {
          newContent = content.split(matchText).join(replaceText);
        } else {
          const idx = content.indexOf(matchText);
          newContent = content.substring(0, idx) + replaceText + content.substring(idx + matchText.length);
        }

        if (newContent === content) {
          return { success: true, message: '内容无变化', filepath, namespace, diff: '(无改动)' };
        }

        // 写回文件
        await writeFile(fullPath, newContent, 'utf-8');

        // 刷新快照，连续编辑同一文件不会误报
        try { recordReadSnapshot(fullPath, await stat(fullPath)); } catch { /* 忽略 */ }

        return {
          success: true,
          message: `成功编辑文件: ${filepath}（${replace_all ? `替换 ${occurrenceLines.length} 处` : `替换第 ${occurrenceLines[0]} 行附近 1 处`}）`,
          filepath,
          namespace,
          replaceCount: replace_all ? occurrenceLines.length : 1,
          diff: makeDiff(content, newContent),
          totalLines: newContent.split('\n').length,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'edit_lines',
    description: `按行号编辑文件（行级编辑工具），适合精确删除/插入/替换某几行，尤其适合目标行内容在文件中重复出现的场景。

**三种操作（operation 参数）**：
1. delete: 删除 start_line 到 end_line 的行（含边界）
2. insert: 在 insert_after 行之后插入 text（insert_after=0 表示插入到文件开头）
3. replace: 将 start_line 到 end_line 的行替换为 text

**必需参数**：
- filepath: 文件路径
- operation: "delete" | "insert" | "replace"
- text: 要插入/替换为的内容（insert 和 replace 必填，delete 不需要；支持多行）

**条件必需参数**：
- start_line, end_line: operation 为 delete/replace 时必填（1 开始，含边界）
- insert_after: operation 为 insert 时必填（在该行之后插入，0 = 文件开头）

**可选参数**：
- namespace: workspace 或 config（默认 workspace）

**使用示例**：
- 删除第 10-15 行：operation="delete", start_line=10, end_line=15
- 在第 5 行后插入 3 行：operation="insert", insert_after=5, text="第一行\\n第二行\\n第三行"
- 替换第 8-9 行为 1 行：operation="replace", start_line=8, end_line=9, text="新内容"

**注意**：
- 行号以 read 输出的行号为准（从 1 开始）；read 输出格式为 "行号│ 内容"，│ 前面的数字就是行号
- 文件被其他操作修改后行号会变化，编辑前建议重新 read（系统会强制校验：未读取过或文件在读取后被外部修改过，编辑会被拦截）
- 成功后返回 diff 预览（- 删除行 / + 新增行），请核对`,
    parameters: {
      type: 'object',
      properties: {
        filepath: {
          type: 'string',
          description: '要编辑的文件路径（相对于指定命名空间的根目录）',
        },
        namespace: {
          type: 'string',
          description: `命名空间：workspace（工作空间）或 config（${CONFIG_DIR_NAME} 配置目录）`,
          enum: ['workspace', 'config'],
          default: 'workspace',
        },
        operation: {
          type: 'string',
          description: '操作类型：delete（删除行）、insert（插入行）、replace（替换行）',
          enum: ['delete', 'insert', 'replace'],
        },
        start_line: {
          type: 'number',
          description: '起始行号（1 开始，含边界；delete/replace 必填）',
        },
        end_line: {
          type: 'number',
          description: '结束行号（含边界；delete/replace 必填，可省略则等于 start_line）',
        },
        insert_after: {
          type: 'number',
          description: '在该行之后插入内容（insert 必填；0 表示插入到文件开头）',
        },
        text: {
          type: 'string',
          description: '要插入/替换为的内容（支持多行，用 \\n 分隔；delete 不需要）',
        },
      },
      required: ['filepath', 'operation'],
    },
    handler: async ({ filepath, namespace = 'workspace', operation, start_line, end_line, insert_after, text }) => {
      try {
        if (!getWorkspacePath()) {
          return { success: false, error: '工作空间未设置' };
        }

        let rootPath: string;
        if (namespace === 'config') {
          rootPath = getPathManager().getConfigPath();
        } else {
          rootPath = getWorkspacePath();
        }

        const fullPath = path.resolve(rootPath, filepath);

        // 过期内容防护：文件在上次读取后被修改过则拦截（行号尤其容易漂移）
        const staleError = await checkFileFreshness(fullPath, filepath);
        if (staleError) return { success: false, error: staleError };

        const content = await readFile(fullPath, 'utf-8');

        // 保持原文件换行风格
        const eol = content.includes('\r\n') ? '\r\n' : '\n';
        const lines = content.split(eol);

        // 参数校验
        if (operation === 'insert') {
          if (insert_after === undefined || insert_after === null) {
            return { success: false, error: 'insert 操作必须提供 insert_after 参数（0 = 文件开头）' };
          }
          // 实际行数：文件不以换行结尾时 split 不会产生尾部空串，行数 = lines.length
          // （此时 insert_after = 行数 N 表示"在最后一行之后追加"，slice 天然支持）
          const actualLines = lines.length - (content.endsWith(eol) ? 1 : 0);
          if (insert_after < 0 || insert_after > actualLines) {
            return { success: false, error: `insert_after 超出范围：文件共 ${actualLines} 行（有效范围 0-${actualLines}，0 = 文件开头，${actualLines} = 末尾追加）` };
          }
          if (!text) {
            return { success: false, error: 'insert 操作必须提供 text 参数' };
          }
        } else {
          if (!start_line || start_line < 1) {
            return { success: false, error: `${operation} 操作必须提供有效的 start_line（≥1）` };
          }
          const end = end_line ?? start_line;
          const maxLine = lines.length - (content.endsWith(eol) ? 1 : 0);
          if (end < start_line) {
            return { success: false, error: `end_line (${end}) 不能小于 start_line (${start_line})` };
          }
          if (end > maxLine) {
            return { success: false, error: `行号超出范围：文件共 ${maxLine} 行，end_line=${end} 超出` };
          }
          if (operation === 'replace' && text === undefined) {
            return { success: false, error: 'replace 操作必须提供 text 参数（删除行请用 delete 操作）' };
          }
        }

        let newLines: string[];
        let summary: string;

        if (operation === 'delete') {
          const end = end_line ?? start_line;
          newLines = [...lines.slice(0, start_line - 1), ...lines.slice(end)];
          summary = `删除第 ${start_line}-${end} 行（共 ${end - start_line + 1} 行）`;
        } else if (operation === 'insert') {
          const insertLines = (text as string).split('\n');
          newLines = [...lines.slice(0, insert_after), ...insertLines, ...lines.slice(insert_after)];
          summary = `在第 ${insert_after} 行后插入 ${insertLines.length} 行`;
        } else {
          const end = end_line ?? start_line;
          const replaceLines = (text as string).split('\n');
          newLines = [...lines.slice(0, start_line - 1), ...replaceLines, ...lines.slice(end)];
          summary = `将第 ${start_line}-${end} 行（${end - start_line + 1} 行）替换为 ${replaceLines.length} 行`;
        }

        const newContent = newLines.join(eol);
        if (newContent === content) {
          return { success: true, message: '内容无变化', filepath, namespace, diff: '(无改动)' };
        }

        await writeFile(fullPath, newContent, 'utf-8');

        // 刷新快照，连续编辑同一文件不会误报
        try { recordReadSnapshot(fullPath, await stat(fullPath)); } catch { /* 忽略 */ }

        return {
          success: true,
          message: `成功编辑文件: ${filepath}（${summary}）`,
          filepath,
          namespace,
          operation,
          diff: makeDiff(content, newContent),
          totalLines: newLines.length - (newContent.endsWith(eol) ? 1 : 0),
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'write',
    description: `创建新文件或覆盖现有文件的内容。

**必需参数**：
- filepath: 文件路径（如 "test.txt" 或 "docs/README.md"）
- content: 文件内容

使用场景：
- 创建新的配置文件
- 生成代码文件
- 保存文档内容
- 写入数据文件

使用示例：
- 写入工作空间文件：filepath="output.txt", content="内容"
- 写入配置目录文件：filepath="config.json", namespace="config", content='{"key": "value"}'

注意：
- 如果文件已存在，会被完全覆盖（覆盖已有文件前需先 read 过该文件；文件在读取后被修改过会被拦截，需重新 read）
- 自动创建必要的父目录
- 建议使用相对路径`,
    parameters: {
      type: 'object',
      properties: {
        filepath: {
          type: 'string',
          description: '要写入的文件路径（相对于指定命名空间的根目录）',
        },
        namespace: {
          type: 'string',
          description: `命名空间：workspace（工作空间）或 config（${CONFIG_DIR_NAME} 配置目录）`,
          enum: ['workspace', 'config'],
          default: 'workspace',
        },
        content: {
          type: 'string',
          description: '要写入的内容',
        },
      },
      required: ['filepath', 'content'],
    },
    handler: async ({ filepath, namespace = 'workspace', content }) => {
      try {
        if (!getWorkspacePath()) {
          return { success: false, error: '工作空间未设置' };
        }

        let rootPath: string;
        if (namespace === 'config') {
          rootPath = getPathManager().getConfigPath();
        } else {
          rootPath = getWorkspacePath();
        }

        const fullPath = path.resolve(rootPath, filepath);

        // 过期内容防护：覆盖已存在的文件前，检查文件是否在上次读取后被修改过
        const staleError = await checkFileFreshness(fullPath, filepath);
        if (staleError) return { success: false, error: staleError };

        // 确保父目录存在
        const dir = path.dirname(fullPath);
        await import('fs/promises').then(fs => fs.mkdir(dir, { recursive: true }));

        // 写入文件
        await writeFile(fullPath, content, 'utf-8');

        // 记录快照（write 后可继续 edit，无需重新 read）
        try { recordReadSnapshot(fullPath, await stat(fullPath)); } catch { /* 忽略 */ }

        return {
          success: true,
          message: `成功写入文件: ${filepath}`,
          filepath,
          namespace,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },
];

// ==================== 文档读取辅助函数 ====================

/**
 * 获取内嵌 Python 解释器路径
 */
function getPythonPath(): string {
  return getPathManager().getPythonPath();
}

/**
 * 获取 Python 脚本目录路径
 */
function getPythonScriptsDir(): string {
  const pythonDir = path.dirname(getPythonPath());
  return path.join(pythonDir, '..', 'scripts');
}

/**
 * 使用 Python 读取 Word 文档
 */
async function readWordDocument(filePath: string, extractImages?: boolean): Promise<string> {
  const pythonPath = getPythonPath();
  const scriptPath = path.join(getPythonScriptsDir(), 'read_word.py');

  const args = [scriptPath, filePath];
  if (extractImages) args.push('--extract-images');

  try {
    const { stdout, stderr } = await execFileAsync(pythonPath, args, { timeout: 30000 });
    const result = JSON.parse(stdout);

    if (result.error) throw new Error(result.error);

    let output = result.content;
    if (result.metadata) {
      output = `[Word \u6587\u6863 - ${result.metadata.paragraphs} \u6bb5\u843d, ${result.metadata.tables} \u8868\u683c]\n\n${output}`;
    }
    if (result.images?.length) {
      output += `\n\n[\u63d0\u53d6\u4e86 ${result.images.length} \u5f20\u56fe\u7247]`;
    }

    return output;
  } catch (error: any) {
    // If JSON.parse fails, provide a helpful error message
    if (error instanceof SyntaxError) {
      throw new Error(`Python \u811a\u672c\u8f93\u51fa\u89e3\u6790\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5 read_word.py \u811a\u672c`);
    }
    throw error;
  }
}

/**
 * 使用 Python 读取 Excel 文档
 */
async function readExcelDocument(filePath: string, sheet?: string): Promise<string> {
  const pythonPath = getPythonPath();
  const scriptPath = path.join(getPythonScriptsDir(), 'read_excel.py');

  const args = [scriptPath, filePath];
  if (sheet) args.push('--sheet', sheet);

  try {
    const { stdout, stderr } = await execFileAsync(pythonPath, args, { timeout: 30000 });
    const result = JSON.parse(stdout);

    if (result.error) throw new Error(result.error);

    let output = result.content;
    if (result.metadata) {
      output = `[Excel \u6587\u4ef6 - \u5de5\u4f5c\u8868: ${result.metadata.sheets.join(', ')}]\n\n${output}`;
    }

    return output;
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      throw new Error(`Python \u811a\u672c\u8f93\u51fa\u89e3\u6790\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5 read_excel.py \u811a\u672c`);
    }
    throw error;
  }
}

/**
 * 解析页码范围字符串
 * 支持格式："1-5,8,10-12" -> [startPage, endPage]
 */
function parsePageRange(pages: string): [number, number] {
  const parts = pages.split(',');
  let minPage = Infinity, maxPage = -1;
  for (const part of parts) {
    const trimmed = part.trim();
    const rangeParts = trimmed.split('-').map(Number);
    if (rangeParts.length === 2 && !isNaN(rangeParts[0]) && !isNaN(rangeParts[1])) {
      minPage = Math.min(minPage, rangeParts[0] - 1);
      maxPage = Math.max(maxPage, rangeParts[1]);
    } else {
      const pageNum = parseInt(trimmed, 10);
      if (!isNaN(pageNum)) {
        minPage = Math.min(minPage, pageNum - 1);
        maxPage = Math.max(maxPage, pageNum);
      }
    }
  }
  return [minPage === Infinity ? 0 : minPage, maxPage === -1 ? 0 : maxPage];
}

/**
 * 使用 Python (pypdf) 读取 PDF 文档
 * 对于扫描件 PDF，自动尝试 MinerU OCR
 */
async function readPDFDocument(filePath: string, pages?: string): Promise<string> {
  const pythonPath = getPythonPath();
  const scriptPath = path.join(getPythonScriptsDir(), 'read_pdf.py');

  const args = [scriptPath, filePath];
  if (pages) {
    const [start, end] = parsePageRange(pages);
    if (start > 0) args.push('--start-page', String(start));
    if (end > 0) args.push('--end-page', String(end));
  }

  try {
    const { stdout, stderr } = await execFileAsync(pythonPath, args, { timeout: 30000 });
    const parsed = JSON.parse(stdout);

    if (parsed.error) throw new Error(parsed.error);

    let output = `[PDF \u6587\u4ef6 - ${parsed.metadata.totalPages} \u9875]`;
    if (!parsed.metadata.isTextBased) {
      output += ' (\u53ef\u80fd\u662f\u626b\u63cf\u4ef6\uff0c\u5efa\u8bae\u4f7f\u7528 OCR \u6a21\u5f0f)';
    }
    output += `\n\n${parsed.content}`;

    // If content is too short (scanned PDF), try MinerU if available
    if (!parsed.metadata.isTextBased && parsed.content.length < 100) {
      try {
        const { getMinerUAdapter } = require('./MinerUAdapter');
        const minerU = getMinerUAdapter();
        if (minerU.enabled) {
          const minerUResult = await minerU.parseFile(filePath, {
            parseMethod: 'ocr',
          });
          if (minerUResult.content.length > parsed.content.length) {
            output = `[PDF \u6587\u4ef6 - ${parsed.metadata.totalPages} \u9875, MinerU OCR \u89e3\u6790]\n\n${minerUResult.content}`;
            if (minerUResult.images?.length) {
              output += `\n\n[\u63d0\u53d6\u4e86 ${minerUResult.images.length} \u5f20\u56fe\u7247]`;
            }
          }
        } else {
          output += '\n\n\u26a0\ufe0f \u8be5 PDF \u53ef\u80fd\u662f\u626b\u63cf\u4ef6\u3002\u5982\u9700 OCR \u8bc6\u522b\uff0c\u8bf7\u914d\u7f6e MinerU \u670d\u52a1\u3002';
        }
      } catch (e: any) {
        output += `\n\n\u26a0\ufe0f MinerU OCR \u5931\u8d25: ${e.message}`;
      }
    }

    return output;
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      throw new Error(`Python \u811a\u672c\u8f93\u51fa\u89e3\u6790\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5 read_pdf.py \u811a\u672c`);
    }
    throw error;
  }
}

/**
 * 读取图片文件基本信息
 */
async function readImageFile(filePath: string): Promise<string> {
  const imageBuffer = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png'
    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ext === '.gif' ? 'image/gif'
    : ext === '.webp' ? 'image/webp'
    : ext === '.bmp' ? 'image/bmp'
    : ext === '.tiff' || ext === '.tif' ? 'image/tiff'
    : 'image/png';

  return `[\u56fe\u7247\u6587\u4ef6: ${path.basename(filePath)}]\n\u5927\u5c0f: ${(imageBuffer.length / 1024).toFixed(1)} KB\n\u7c7b\u578b: ${mimeType}\n\n\u26a0\ufe0f \u56fe\u7247\u5185\u5bb9\u7406\u89e3\u9700\u8981\u591a\u6a21\u6001 LLM \u652f\u6301\uff0c\u5f53\u524d\u4ec5\u663e\u793a\u57fa\u672c\u4fe1\u606f\u3002`;
}

/**
 * 定位 text 在 content 中所有出现位置的行号（1 开始）
 */
function findOccurrenceLines(content: string, text: string): number[] {
  const lines: number[] = [];
  let idx = content.indexOf(text);
  while (idx !== -1) {
    lines.push(content.substring(0, idx).split('\n').length);
    idx = content.indexOf(text, idx + 1);
  }
  return lines;
}

/**
 * 生成简易 diff 预览：定位首个和末个差异行，带前后 context 行上下文
 * - 开头的空格为未变更行，- 为删除行，+ 为新增行
 */
function makeDiff(oldContent: string, newContent: string, context = 3): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start++;

  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd--;
    newEnd--;
  }

  // 无差异
  if (start > oldEnd && start > newEnd) return '(无改动)';

  const parts: string[] = [`@@ 第 ${start + 1} 行附近 @@`];
  const from = Math.max(0, start - context);
  for (let i = from; i < start; i++) parts.push(` ${oldLines[i]}`);
  for (let i = start; i <= oldEnd; i++) parts.push(`-${oldLines[i]}`);
  for (let i = start; i <= newEnd; i++) parts.push(`+${newLines[i]}`);
  const tailTo = Math.min(oldLines.length - 1, oldEnd + context);
  for (let i = oldEnd + 1; i <= tailTo; i++) parts.push(` ${oldLines[i]}`);

  // 限制 diff 输出长度，防止大改动撑爆上下文
  const diff = parts.join('\n');
  if (diff.length > 4000) {
    return diff.substring(0, 4000) + '\n... (diff 过长已截断，可用 read 查看完整内容)';
  }
  return diff;
}

/**
 * 流式行读取 - 内存友好
 * 参照 OpenCode 的 read 工具实现
 */
async function readLines(
  filePath: string,
  startLine: number,
  maxLines: number,
): Promise<{
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
}> {
  return new Promise((resolve, reject) => {
    const lines: string[] = [];
    let currentLine = 0;
    let totalLines = 0;
    let totalBytes = 0;
    let reachedEnd = false;
    let truncated = false;

    const rl = readline.createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line: string) => {
      currentLine++;
      totalBytes += Buffer.byteLength(line, 'utf-8');

      // 先统计总行数（即使还没到 startLine）
      if (currentLine < startLine) {
        return;
      }

      // 检查是否已读完需要的行数
      const linesRead = currentLine - startLine + 1;
      if (linesRead > maxLines) {
        // 继续计数但不再收集
        return;
      }

      // 检查字节限制
      if (totalBytes > READ_FILE_MAX_BYTES) {
        truncated = true;
        rl.close();
        return;
      }

      // 截断超长行
      if (line.length > READ_FILE_MAX_LINE_LENGTH) {
        line = line.substring(0, READ_FILE_MAX_LINE_LENGTH) + READ_FILE_LINE_SUFFIX;
      }

      lines.push(`${currentLine}│ ${line}`);
    });

    rl.on('close', () => {
      reachedEnd = true;
      totalLines = currentLine;

      const endLine = Math.min(startLine + maxLines - 1, totalLines);
      const hasMore = totalLines > endLine;

      let content = lines.join('\n');

      // 添加尾部信息
      if (truncated) {
        content += `\n\n[文件过大，已截断。文件共 ${totalLines} 行，已读取至第 ${endLine} 行。请使用 offset=${endLine + 1} 继续读取]`;
      } else if (hasMore) {
        content += `\n\n[显示第 ${startLine}-${endLine} 行，共 ${totalLines} 行。使用 offset=${endLine + 1} 读取后续内容]`;
      }

      resolve({
        content,
        startLine,
        endLine,
        totalLines,
        truncated: truncated || hasMore,
      });
    });

    rl.on('error', (err) => {
      reject(err);
    });
  });
}

async function listFiles(
  dirPath: string,
  recursive: boolean,
  basePath: string,
  currentDepth: number = 0,
  fileCount: { current: number; max: number } = { current: 0, max: SEARCH_CONFIG.MAX_FILES }
): Promise<any[]> {
  // 深度限制检查
  if (recursive && currentDepth >= SEARCH_CONFIG.MAX_DEPTH) {
    console.warn(`[listFiles] Reached max depth ${SEARCH_CONFIG.MAX_DEPTH} at ${dirPath}`);
    return [];
  }

  // 文件数量限制检查
  if (recursive && fileCount.current >= fileCount.max) {
    console.warn(`[listFiles] Reached max files ${fileCount.max}, stopping recursion`);
    return [];
  }

  let entries: any[];
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch (error: any) {
    // 跳过无权限访问的目录
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      console.warn(`[listFiles] Skipping directory (no permission): ${dirPath}`);
      return [];
    }
    throw error;
  }

  const files: any[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(basePath, fullPath);

    // 跳过忽略的目录（仅在递归模式下生效）
    if (recursive && entry.isDirectory() && SEARCH_CONFIG.IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    let stats: any;
    try {
      stats = await stat(fullPath);
    } catch (statError: any) {
      // 跳过无法获取状态的文件/目录
      console.warn(`[listFiles] Cannot stat: ${fullPath}`);
      continue;
    }

    if (entry.isDirectory()) {
      if (recursive) {
        files.push({
          type: 'directory',
          name: entry.name,
          path: relativePath,
          fullPath: fullPath,
        });
        const subFiles = await listFiles(fullPath, recursive, basePath, currentDepth + 1, fileCount);
        files.push(...subFiles);

        // 检查是否在子目录遍历中达到了限制
        if (fileCount.current >= fileCount.max) {
          console.warn(`[listFiles] Reached max files ${fileCount.max} in subdirectory`);
          break;
        }
      } else {
        files.push({
          type: 'directory',
          name: entry.name,
          path: relativePath,
          fullPath: fullPath,
        });
      }
    } else {
      files.push({
        type: 'file',
        name: entry.name,
        path: relativePath,
        fullPath: fullPath,
        extension: path.extname(entry.name),
        size: stats.size,
      });
      fileCount.current++;
    }
  }

  return files;
}

