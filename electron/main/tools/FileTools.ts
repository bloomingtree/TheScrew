import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';
import { Tool } from './ToolManager';

let workspacePath: string | null = null;

export function setWorkspacePath(path: string | null) {
  workspacePath = path;
}

export function getWorkspacePath(): string | null {
  return workspacePath;
}

export const fileTools: Tool[] = [
  {
    name: 'get_workspace',
    description: '获取当前工作空间的信息。工作空间相当于一个项目目录，文件夹下的所有文件都是为了实现某个明确的目标或功能而组合在一起的。通过了解工作空间，你可以更好地理解项目结构和文件关系。',
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
          description: `当前工作空间位于 ${workspacePath}，是一个项目目录，包含了 ${files.filter(f => f.type === 'file').length} 个文件和 ${files.filter(f => f.type === 'directory').length} 个目录。这个文件夹下的所有文件都是为了实现某个明确的目标或功能而组合在一起的。`,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'list_directory',
    description: '列出指定目录中的文件和文件夹',
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
    description: '读取指定文件的内容',
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
    handler: async ({ filepath }) => {
      try {
        if (!workspacePath) {
          return { success: false, error: '工作空间未设置' };
        }

        const fullPath = path.resolve(workspacePath, filepath);
        let content = await readFile(fullPath, 'utf-8');
        const stats = await stat(fullPath);

        const maxSize = 10000;
        if (content.length > maxSize) {
          content = content.substring(0, maxSize) + `\n...[文件已截断，共${stats.size}字节，仅显示前${maxSize}字节]`;
        }

        return {
          success: true,
          content,
          size: stats.size,
          path: filepath,
          truncated: content.length !== stats.size,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'search_files',
    description: '在工作空间中搜索文件（按文件名）',
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
    handler: async ({ keyword, directory = '.', extensions = [] }) => {
      try {
        if (!workspacePath) {
          return { success: false, error: '工作空间未设置' };
        }

        const fullPath = path.resolve(workspacePath, directory);
        const results = await searchInFilesRecursive(fullPath, keyword, extensions, workspacePath);

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
    name: 'get_file_info',
    description: '获取文件的详细信息',
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
];

async function listFiles(
  dirPath: string,
  recursive: boolean,
  basePath: string
): Promise<any[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files: any[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(basePath, fullPath);
    const stats = await stat(fullPath);

    if (entry.isDirectory()) {
      if (recursive) {
        files.push({
          type: 'directory',
          name: entry.name,
          path: relativePath,
        });
        const subFiles = await listFiles(fullPath, recursive, basePath);
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
  results: any[] = []
): Promise<any[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(basePath, fullPath);

    if (entry.isDirectory()) {
      await searchFilesRecursive(fullPath, pattern, extensions, basePath, results);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      const matchesExtension = extensions.length === 0 || extensions.includes(ext.slice(1));

      if (matchesExtension && matchesPattern(entry.name, pattern)) {
        const stats = await stat(fullPath);
        results.push({
          name: entry.name,
          path: relativePath,
          extension: ext,
          size: stats.size,
        });
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
  results: any[] = []
): Promise<any[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(basePath, fullPath);

    if (entry.isDirectory()) {
      await searchInFilesRecursive(fullPath, keyword, extensions, basePath, results);
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
        } catch (e) {
          console.warn(`Cannot read file: ${fullPath}`);
        }
      }
    }
  }

  return results;
}