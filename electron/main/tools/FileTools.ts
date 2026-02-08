import { readdir, readFile, stat, writeFile } from 'fs/promises';
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
          description: '要编辑的文件路径（相对于工作空间）',
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
    handler: async ({ filepath, old_text, new_text }) => {
      try {
        if (!workspacePath) {
          return { success: false, error: '工作空间未设置' };
        }

        const fullPath = path.resolve(workspacePath, filepath);

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

        // 替换文本
        const newContent = content.replaceAll(old_text, new_text);

        // 写回文件
        await writeFile(fullPath, newContent, 'utf-8');

        // 统计替换次数
        const replaceCount = (content.match(new RegExp(escapeRegExp(old_text), 'g')) || []).length;

        return {
          success: true,
          message: `成功编辑文件: ${filepath}`,
          filepath,
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

使用场景：
- 创建新的配置文件
- 生成代码文件
- 保存文档内容
- 写入数据文件

注意：
- 如果文件已存在，会被完全覆盖
- 自动创建必要的父目录
- 建议使用相对路径`,
    parameters: {
      type: 'object',
      properties: {
        filepath: {
          type: 'string',
          description: '要写入的文件路径（相对于工作空间）',
        },
        content: {
          type: 'string',
          description: '要写入的内容',
        },
      },
      required: ['filepath', 'content'],
    },
    handler: async ({ filepath, content }) => {
      try {
        if (!workspacePath) {
          return { success: false, error: '工作空间未设置' };
        }

        const fullPath = path.resolve(workspacePath, filepath);

        // 确保父目录存在
        const dir = path.dirname(fullPath);
        await import('fs/promises').then(fs => fs.mkdir(dir, { recursive: true }));

        // 写入文件
        await writeFile(fullPath, content, 'utf-8');

        return {
          success: true,
          message: `成功写入文件: ${filepath}`,
          filepath,
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

