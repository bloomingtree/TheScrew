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

// ==================== read_file 常量 ====================
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
}

export function getWorkspacePath(): string | null {
  return (globalThis as any)[_workspaceKey] ?? null;
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
    name: 'list_directory',
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
    name: 'read_file',
    description: `读取文件内容，支持文本文件、Office 文档（.docx/.xlsx/.pptx，自动路由到 OfficeCLI 获取结构化大纲）、PDF 文档（.pdf）和图片文件。支持从工作空间或配置目录（${CONFIG_DIR_NAME}）读取文件。

**Office 文档**：本工具会自动识别 .docx/.xlsx/.pptx 并通过 OfficeCLI 读取结构化内容（含 hint 提示后续使用 office_view/office_get 做元素级操作），无需先调用 read_file 再切换到 office_view。

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
          return { success: false, error: `"${filepath}" 是目录，不是文件。请使用 list_directory 列出目录内容。` };
        }

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
          const cliResult = await tryReadOfficeViaCLI(filepath, fullPath, ext, stats.size, namespace);
          if (cliResult) return cliResult;
          try {
            const content = await readExcelDocument(fullPath, sheet);
            return {
              success: true,
              content: content + OFFICE_EDIT_HINT,
              path: filepath,
              namespace,
              fullPath,
              fileType: 'excel',
              size: stats.size,
            };
          } catch (error: any) {
            return { success: false, error: `读取 Excel 文件失败: ${error.message}` };
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
          return { success: false, error: `"${filepath}" 是目录，不是文件。请使用 list_directory 列出目录内容。` };
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
    name: 'edit_file',
    description: `通过文本替换编辑文件内容。将文件中出现的所有 old_text 替换为 new_text。

使用场景：
- 修改变量名或函数名
- 替换配置文件中的值
- 批量替换文件中的文本
- 修正文档中的错误

注意：
- old_text 必须完全匹配（区分大小写）
- 所有匹配的文本都会被替换
- 如果文件中不包含 old_text，操作会返回错误
- 建议先使用 read_file 查看内容，确认要替换的文本`,
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
          description: '要被替换的文本（必须完全匹配）',
        },
        new_text: {
          type: 'string',
          description: '替换后的新文本',
        },
      },
      required: ['filepath', 'old_text', 'new_text'],
    },
    handler: async ({ filepath, namespace = 'workspace', old_text, new_text }) => {
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

        // 读取文件内容
        const content = await readFile(fullPath, 'utf-8');

        // 检查 old_text 是否存在
        if (!content.includes(old_text)) {
          return {
            success: false,
            error: `在文件中未找到要替换的文本: "${old_text}"`,
            hint: '请确认文本完全匹配（区分大小写），可以使用 read_file 先查看文件内容'
          };
        }

        // 替换文本 (ES2020 compatible)
        const newContent = content.split(old_text).join(new_text);

        // 写回文件
        await writeFile(fullPath, newContent, 'utf-8');

        // 统计替换次数
        const replaceCount = (content.match(new RegExp(escapeRegExp(old_text), 'g')) || []).length;

        return {
          success: true,
          message: `成功编辑文件: ${filepath}`,
          filepath,
          namespace,
          replaceCount,
          old_text,
          new_text,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'write_file',
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
- 如果文件已存在，会被完全覆盖
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

        // 确保父目录存在
        const dir = path.dirname(fullPath);
        await import('fs/promises').then(fs => fs.mkdir(dir, { recursive: true }));

        // 写入文件
        await writeFile(fullPath, content, 'utf-8');

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
 * 转义正则表达式特殊字符
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

