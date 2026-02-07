import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { Tool } from './ToolManager';
import { outputTruncator } from '../utils/OutputTruncator';

let workspacePath: string | null = null;

/**
 * 搜索配置常量
 */
const SEARCH_CONFIG = {
  /** 默认忽略的目录列表 */
  IGNORED_DIRS: new Set([
    // Windows 系统目录
    'System Volume Information',
    '$RECYCLE.BIN',
    'Recovery',
    'Windows',
    'Program Files',
    'Program Files (x86)',
    'ProgramData',
    // Node.js 项目
    'node_modules',
    '.yarn',
    '.pnpm-store',
    // Git
    '.git',
    // IDE
    '.idea',
    '.vscode',
    '.vs',
    'dist',
    'build',
    'out',
    // macOS
    '.DS_Store',
    '.Spotlight-V100',
    '.Trashes',
    // Linux
    '.cache',
    '.local',
  ]),

  /** 最大搜索深度（防止无限递归） */
  MAX_DEPTH: 50,

  /** 最大返回结果数量 */
  MAX_RESULTS: 1000,
};

export function setWorkspacePath(path: string | null) {
  workspacePath = path;
}

export function getWorkspacePath(): string | null {
  return workspacePath;
}

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
        if (!workspacePath) {
          return { success: false, error: '工作空间未设置，请先让用户设置工作空间' };
        }

        const files = await listFiles(workspacePath, false, workspacePath);

        return {
          success: true,
          path: workspacePath,
          name: path.basename(workspacePath),
          files: files.filter(f => f.type === 'file'),
          directories: files.filter(f => f.type === 'directory'),
          description: `当前工作空间位于 ${workspacePath}，是一个项目目录，包含了 ${files.filter(f => f.type === 'file').length} 个文件和 ${files.filter(f => f.type === 'directory').length} 个目录。`,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'list_directory',
    description: '列出目录内容（支持递归）',
    parameters: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: '要列出的目录路径（相对于工作空间）',
        },
        recursive: {
          type: 'boolean',
          description: '是否递归列出子目录',
          default: false,
        },
      },
      required: ['directory'],
    },
    handler: async ({ directory, recursive = false }) => {
      try {
        if (!workspacePath) {
          return { success: false, error: '工作空间未设置' };
        }

        const fullPath = path.resolve(workspacePath, directory);
        const files = await listFiles(fullPath, recursive, workspacePath);

        return {
          success: true,
          files,
          count: files.length,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'read_file',
    description: '读取文件内容',
    parameters: {
      type: 'object',
      properties: {
        filepath: {
          type: 'string',
          description: '要读取的文件路径（相对于工作空间）',
        },
      },
      required: ['filepath'],
    },
    handler: async ({ filepath, _toolCallId }) => {
      try {
        if (!workspacePath) {
          return { success: false, error: '工作空间未设置' };
        }

        const fullPath = path.resolve(workspacePath, filepath);
        const content = await readFile(fullPath, 'utf-8');
        const stats = await stat(fullPath);

        // 使用统一截断器
        const truncationResult = await outputTruncator.truncate(
          content,
          _toolCallId || randomUUID(),
          'read_file'
        );

        return {
          success: true,
          content: truncationResult.displayContent,
          path: filepath,
          size: stats.size,
          ...truncationResult.metadata,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'search_files',
    description: '按文件名搜索文件',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: '搜索模式（支持通配符 * 和 ?）',
        },
        directory: {
          type: 'string',
          description: '搜索的目录（相对于工作空间，默认为工作空间根目录）',
          default: '.',
        },
        extensions: {
          type: 'array',
          items: { type: 'string' },
          description: '文件扩展名过滤（如 ["txt", "md"]）',
        },
      },
      required: ['pattern'],
    },
    handler: async ({ pattern, directory = '.', extensions = [] }) => {
      try {
        if (!workspacePath) {
          return { success: false, error: '工作空间未设置' };
        }

        const fullPath = path.resolve(workspacePath, directory);
        const results = await searchFilesRecursive(fullPath, pattern, extensions, workspacePath);

        return {
          success: true,
          results,
          count: results.length,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'search_in_files',
    description: '在文件内容中搜索关键词',
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: '要搜索的关键词',
        },
        directory: {
          type: 'string',
          description: '搜索的目录（相对于工作空间）',
          default: '.',
        },
        extensions: {
          type: 'array',
          items: { type: 'string' },
          description: '限制搜索的文件扩展名',
        },
      },
      required: ['keyword'],
    },
    handler: async ({ keyword, directory = '.', extensions = [], _toolCallId }) => {
      try {
        if (!workspacePath) {
          return { success: false, error: '工作空间未设置' };
        }

        const fullPath = path.resolve(workspacePath, directory);
        const results = await searchInFilesRecursive(fullPath, keyword, extensions, workspacePath);

        // 将结果序列化为字符串
        const resultString = JSON.stringify(results, null, 2);

        // 应用截断
        const truncationResult = await outputTruncator.truncate(
          resultString,
          _toolCallId || randomUUID(),
          'search_in_files'
        );

        return {
          success: true,
          results: JSON.parse(truncationResult.displayContent),
          count: results.length,
          ...truncationResult.metadata,
        };
      } catch (error: any) {
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
          description: '文件路径（相对于工作空间）',
        },
      },
      required: ['filepath'],
    },
    handler: async ({ filepath }) => {
      try {
        if (!workspacePath) {
          return { success: false, error: '工作空间未设置' };
        }

        const fullPath = path.resolve(workspacePath, filepath);
        const stats = await stat(fullPath);

        return {
          success: true,
          path: filepath,
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

  // ==================== 工具集激活 ====================

  {
    name: 'activate_toolset',
    description: `
激活指定的工具集以获取详细的工具定义。

可用工具集：
- word: Word 文档处理：创建、编辑、修订跟踪、批注、验证
- pptx: PowerPoint 演示文稿：创建、重排幻灯片、批量替换、缩略图
- xlsx: Excel 表格处理：读取、编辑、公式计算、样式处理
- pdf: PDF 操作：合并、拆分、表单填充、表格提取
- batch: 批量处理：批量替换、批量创建、批量操作
- template: 模板系统：Word 模板、提示词模板、助手工具模板
- ooxml: OOXML 验证：验证和修复 Office 文档结构

使用场景：
- 需要处理 Word 文档时，激活 "word" 工具集
- 需要编辑 PPT 时，激活 "pptx" 工具集
- 需要批量操作时，激活 "batch" 工具集
- 需要处理 Excel 表格时，激活 "xlsx" 工具集
- 需要操作 PDF 时，激活 "pdf" 工具集

注意：激活工具集会增加上下文大小，请仅激活需要的工具集。
`.trim(),
    parameters: {
      type: 'object',
      properties: {
        toolset: {
          type: 'string',
          enum: ['word', 'pptx', 'xlsx', 'pdf', 'batch', 'template', 'ooxml'],
          description: '要激活的工具集名称',
        },
      },
      required: ['toolset'],
    },
    handler: async ({ toolset }) => {
      // 这个工具的 handler 在 chat.ts 中特殊处理
      // 因为它需要动态更新工具定义列表
      return {
        success: true,
        message: `工具集 "${toolset}" 激活请求已收到，请等待系统确认`,
      };
    },
  },

  {
    name: 'get_active_toolsets',
    description: '获取当前已激活的工具集列表',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      // 这个工具的 handler 在 ToolManager 中处理
      return {
        success: true,
        activeGroups: ['base'],
        message: '当前仅激活基础工具集，使用 activate_toolset 激活更多工具集',
      };
    },
  },
];

async function listFiles(
  dirPath: string,
  recursive: boolean,
  basePath: string,
  currentDepth: number = 0
): Promise<any[]> {
  // 深度限制检查
  if (recursive && currentDepth >= SEARCH_CONFIG.MAX_DEPTH) {
    console.warn(`[listFiles] Reached max depth ${SEARCH_CONFIG.MAX_DEPTH} at ${dirPath}`);
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
        });
        const subFiles = await listFiles(fullPath, recursive, basePath, currentDepth + 1);
        files.push(...subFiles);
      } else {
        files.push({
          type: 'directory',
          name: entry.name,
          path: relativePath,
        });
      }
    } else {
      files.push({
        type: 'file',
        name: entry.name,
        path: relativePath,
        extension: path.extname(entry.name),
        size: stats.size,
      });
    }
  }

  return files;
}

async function searchFilesRecursive(
  dirPath: string,
  pattern: string,
  extensions: string[],
  basePath: string,
  results: any[] = [],
  currentDepth: number = 0
): Promise<any[]> {
  // 深度限制检查
  if (currentDepth >= SEARCH_CONFIG.MAX_DEPTH) {
    console.warn(`[searchFiles] Reached max depth ${SEARCH_CONFIG.MAX_DEPTH} at ${dirPath}`);
    return results;
  }

  // 结果数量限制检查
  if (results.length >= SEARCH_CONFIG.MAX_RESULTS) {
    console.warn(`[searchFiles] Reached max results ${SEARCH_CONFIG.MAX_RESULTS}`);
    return results;
  }

  let entries: any[];
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch (error: any) {
    // 跳过无权限访问的目录
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      console.warn(`[searchFiles] Skipping directory (no permission): ${dirPath}`);
      return results;
    }
    throw error;
  }

  for (const entry of entries) {
    // 检查是否达到结果上限
    if (results.length >= SEARCH_CONFIG.MAX_RESULTS) {
      break;
    }

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(basePath, fullPath);

    if (entry.isDirectory()) {
      // 跳过忽略的目录
      if (SEARCH_CONFIG.IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      await searchFilesRecursive(fullPath, pattern, extensions, basePath, results, currentDepth + 1);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      const matchesExtension = extensions.length === 0 || extensions.includes(ext.slice(1));

      if (matchesExtension && matchesPattern(entry.name, pattern)) {
        try {
          const stats = await stat(fullPath);
          results.push({
            name: entry.name,
            path: relativePath,
            extension: ext,
            size: stats.size,
          });
        } catch (statError: any) {
          // 跳过无法获取状态的文件
          console.warn(`[searchFiles] Cannot stat file: ${fullPath}`);
        }
      }
    }
  }

  return results;
}

function matchesPattern(filename: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(filename);
}

async function searchInFilesRecursive(
  dirPath: string,
  keyword: string,
  extensions: string[],
  basePath: string,
  results: any[] = [],
  currentDepth: number = 0
): Promise<any[]> {
  // 深度限制检查
  if (currentDepth >= SEARCH_CONFIG.MAX_DEPTH) {
    console.warn(`[searchInFiles] Reached max depth ${SEARCH_CONFIG.MAX_DEPTH} at ${dirPath}`);
    return results;
  }

  // 结果数量限制检查
  if (results.length >= SEARCH_CONFIG.MAX_RESULTS) {
    console.warn(`[searchInFiles] Reached max results ${SEARCH_CONFIG.MAX_RESULTS}`);
    return results;
  }

  let entries: any[];
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch (error: any) {
    // 跳过无权限访问的目录
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      console.warn(`[searchInFiles] Skipping directory (no permission): ${dirPath}`);
      return results;
    }
    throw error;
  }

  for (const entry of entries) {
    // 检查是否达到结果上限
    if (results.length >= SEARCH_CONFIG.MAX_RESULTS) {
      break;
    }

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(basePath, fullPath);

    if (entry.isDirectory()) {
      // 跳过忽略的目录
      if (SEARCH_CONFIG.IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      await searchInFilesRecursive(fullPath, keyword, extensions, basePath, results, currentDepth + 1);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      const matchesExtension = extensions.length === 0 || extensions.includes(ext.slice(1));

      if (matchesExtension) {
        try {
          const content = await readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          const matches: number[] = [];

          lines.forEach((line, index) => {
            if (line.toLowerCase().includes(keyword.toLowerCase())) {
              matches.push(index + 1);
            }
          });

          if (matches.length > 0) {
            results.push({
              name: entry.name,
              path: relativePath,
              extension: ext,
              matchCount: matches.length,
              lineNumbers: matches.slice(0, 10),
            });
          }
        } catch (e: any) {
          // 跳过无法读取的文件（可能是二进制文件或权限问题）
          if (e.code !== 'EPERM' && e.code !== 'EACCES') {
            console.warn(`[searchInFiles] Cannot read file: ${fullPath}`, e.message);
          }
        }
      }
    }
  }

  return results;
}