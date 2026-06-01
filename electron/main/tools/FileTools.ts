import { readdir, readFile, stat, writeFile, open } from 'fs/promises';
import { createReadStream } from 'fs';
import readline from 'readline';
import path from 'path';
import { app } from 'electron';
import { Tool } from './ToolManager';
import { getPathManager, CONFIG_DIR_NAME } from '../config/PathManager';

// ==================== read_file 常量 ====================
const READ_FILE_DEFAULT_LIMIT = 2000;   // 默认读取行数
const READ_FILE_MAX_LINE_LENGTH = 2000; // 单行最大字符数
const READ_FILE_MAX_BYTES = 50 * 1024;  // 最大读取 50KB
const READ_FILE_LINE_SUFFIX = `... (line truncated to ${READ_FILE_MAX_LINE_LENGTH} chars)`;

// 二进制文件扩展名
const BINARY_EXTENSIONS = new Set([
  '.zip', '.exe', '.dll', '.so', '.dylib', '.bin', '.obj', '.o', '.a',
  '.lib', '.pdb', '.dSYM', '.woff', '.woff2', '.ttf', '.eot', '.ico',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.svg',
  '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
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
    description: `读取文件内容，支持分页读取大文件。支持从工作空间或配置目录（${CONFIG_DIR_NAME}）读取文件。

**必需参数**：
- filepath: 文件路径（如 "README.md" 或 "skills/docx/SKILL.md"）

**可选参数**：
- offset: 起始行号（从 1 开始，默认 1）
- limit: 最大读取行数（默认 ${READ_FILE_DEFAULT_LIMIT}）
- namespace: 命名空间，workspace（工作空间）或 config（${CONFIG_DIR_NAME} 配置目录，默认 workspace）

使用示例：
- 读取整个小文件：filepath="README.md"
- 分页读取大文件：filepath="large.log", offset=1, limit=100
- 读取第 200-300 行：filepath="src/index.ts", offset=200, limit=100
- 读取配置文件：filepath="skills/docx/SKILL.md", namespace="config"

**限制**：
- 单次最多读取 ${READ_FILE_DEFAULT_LIMIT} 行
- 总读取大小不超过 ${READ_FILE_MAX_BYTES / 1024}KB
- 单行超过 ${READ_FILE_MAX_LINE_LENGTH} 字符会被截断
- 二进制文件无法读取

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
      },
      required: ['filepath'],
    },
    handler: async ({ filepath, namespace = 'workspace', offset, limit, _toolCallId }) => {
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

        // 二进制文件检测
        const ext = path.extname(filepath).toLowerCase();
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

