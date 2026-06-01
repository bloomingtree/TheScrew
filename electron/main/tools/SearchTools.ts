/**
 * SearchTools - grep 和 glob 搜索工具
 * 参照 OpenCode 的 grep.ts 和 glob.ts 实现
 * 提供有限制的搜索结果，防止撑爆上下文
 */

import { execFile } from 'child_process';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import { Tool } from './ToolManager';
import { getWorkspacePath } from './FileTools';
import { SEARCH_CONFIG } from './FileTools';

// ==================== 常量 ====================

const MAX_GREP_RESULTS = 100;
const MAX_GREP_LINE_LENGTH = 2000;
const MAX_GLOB_RESULTS = 100;
const GREP_LINE_SUFFIX = `... (truncated to ${MAX_GREP_LINE_LENGTH} chars)`;

// ==================== grep 工具 ====================

const grepTool: Tool = {
  name: 'grep',
  description: `在文件中搜索匹配的文本内容（类似 grep -rn）

**必需参数**：
- pattern: 搜索模式（正则表达式或纯文本）

**可选参数**：
- path: 搜索的目录路径（默认为工作空间根目录）
- include: 文件过滤模式（如 "*.ts"、"*.py"、"*.md"）

**结果限制**：
- 最多返回 ${MAX_GREP_RESULTS} 条匹配
- 每行截断到 ${MAX_GREP_LINE_LENGTH} 字符

**使用示例**：
- 搜索函数定义：pattern="function\\s+\\w+", include="*.ts"
- 搜索配置项：pattern="port.*=", include="*.json"
- 全局搜索：pattern="TODO|FIXME"`,
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: '搜索模式（支持正则表达式）',
      },
      include: {
        type: 'string',
        description: '文件过滤模式（如 "*.ts"、"*.py"、"*.md"）',
      },
      path: {
        type: 'string',
        description: '搜索的目录路径（默认为工作空间根目录）',
      },
    },
    required: ['pattern'],
  },
  handler: async ({ pattern, include, path: searchPath }) => {
    try {
      const workspace = getWorkspacePath();
      if (!workspace) {
        return { success: false, error: '工作空间未设置' };
      }

      const searchDir = searchPath
        ? path.resolve(workspace, searchPath)
        : workspace;

      // Windows: 使用 findstr，其他: 使用 grep
      const isWindows = process.platform === 'win32';
      let command: string;
      let args: string[];

      if (isWindows) {
        // findstr /n /s /r /c:"pattern" include path
        const includePattern = include
          ? include.replace(/\*/g, '.*').replace(/\./g, '\\.')
          : '.*';
        command = 'findstr';
        args = ['/n', '/s', '/r', `/c:${pattern}`, include || '*', searchDir];
      } else {
        command = 'grep';
        args = ['-rn', '--extended-regexp'];
        if (include) {
          args.push(`--include=${include}`);
        }
        args.push(pattern, searchDir);
      }

      const result = await execCommand(command, args, 30000);

      if (!result.stdout) {
        return {
          success: true,
          matches: [],
          count: 0,
          message: '未找到匹配的内容',
        };
      }

      // 解析结果
      const lines = result.stdout.split('\n').filter(Boolean);
      const matches: string[] = [];
      const seen = new Set<string>();

      for (const line of lines) {
        if (matches.length >= MAX_GREP_RESULTS) break;

        // 去重（同一文件同一行）
        const dedupeKey = line.substring(0, 200);
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        // 截断超长行
        let displayLine = line;
        if (displayLine.length > MAX_GREP_LINE_LENGTH) {
          displayLine = displayLine.substring(0, MAX_GREP_LINE_LENGTH) + GREP_LINE_SUFFIX;
        }

        matches.push(displayLine);
      }

      const truncated = lines.length > MAX_GREP_RESULTS;

      return {
        success: true,
        matches,
        count: matches.length,
        totalMatches: lines.length,
        truncated,
        ...(truncated ? { hint: `共 ${lines.length} 条匹配，仅显示前 ${MAX_GREP_RESULTS} 条。请缩小搜索范围获取更精确的结果。` } : {}),
      };
    } catch (error: any) {
      // grep 返回 exit code 1 表示没有匹配，不算错误
      if (error.code === 1 || (error.message && error.message.includes('no match'))) {
        return {
          success: true,
          matches: [],
          count: 0,
          message: '未找到匹配的内容',
        };
      }
      return { success: false, error: error.message };
    }
  },
};

// ==================== glob 工具 ====================

const globTool: Tool = {
  name: 'glob',
  description: `按文件名模式搜索文件（类似 glob 匹配）

**必需参数**：
- pattern: Glob 模式（如 "**/*.ts"、"src/**/*.py"、"docs/*.md"）

**可选参数**：
- path: 搜索的目录路径（默认为工作空间根目录）

**结果限制**：
- 最多返回 ${MAX_GLOB_RESULTS} 个文件
- 按修改时间排序（最近的在前）
- 自动忽略 node_modules、.git、dist 等目录

**使用示例**：
- 查找所有 TS 文件：pattern="**/*.ts"
- 查找某个目录下的文件：pattern="src/components/**/*.tsx"
- 查找配置文件：pattern="**/*.config.{js,ts,json}"`,
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob 模式（如 "**/*.ts"、"src/**/*.py"）',
      },
      path: {
        type: 'string',
        description: '搜索的目录路径（默认为工作空间根目录）',
      },
    },
    required: ['pattern'],
  },
  handler: async ({ pattern, path: searchPath }) => {
    try {
      const workspace = getWorkspacePath();
      if (!workspace) {
        return { success: false, error: '工作空间未设置' };
      }

      const searchDir = searchPath
        ? path.resolve(workspace, searchPath)
        : workspace;

      // 将 glob 模式转换为正则
      const globRegex = globToRegex(pattern);
      const regex = new RegExp(globRegex, 'i');

      // 递归查找匹配的文件
      const matches: Array<{ path: string; name: string; size: number; modified: number }> = [];
      await globSearch(searchDir, searchDir, regex, matches, 0);

      // 按修改时间排序（最近的在前）
      matches.sort((a, b) => b.modified - a.modified);

      // 截断结果
      const truncated = matches.length > MAX_GLOB_RESULTS;
      const results = matches.slice(0, MAX_GLOB_RESULTS);

      return {
        success: true,
        files: results.map(f => f.path),
        count: results.length,
        totalMatches: matches.length,
        truncated,
        ...(truncated ? { hint: `共 ${matches.length} 个文件匹配，仅显示前 ${MAX_GLOB_RESULTS} 个（按修改时间排序）。` } : {}),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

// ==================== 辅助函数 ====================

/**
 * 执行命令并返回 stdout
 */
function execCommand(command: string, args: string[], timeout: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      timeout,
      maxBuffer: 5 * 1024 * 1024, // 5MB
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error && error.code !== 1) {
        reject(error);
      } else {
        resolve({ stdout: stdout || '', stderr: stderr || '' });
      }
    });
  });
}

/**
 * 将 glob 模式转换为正则表达式
 */
function globToRegex(pattern: string): string {
  return pattern
    .replace(/\*\*/g, '§§')  // 临时替换 **
    .replace(/\*/g, '[^/\\\\]*')  // * 匹配非路径分隔符
    .replace(/§§/g, '.*')    // ** 匹配任意
    .replace(/\?/g, '[^/\\\\]')   // ? 匹配单个非路径分隔符
    .replace(/\.(?![\*])/g, '\\.'); // 转义 .
}

/**
 * 递归搜索匹配的文件
 */
async function globSearch(
  currentDir: string,
  basePath: string,
  regex: RegExp,
  results: Array<{ path: string; name: string; size: number; modified: number }>,
  depth: number,
): Promise<void> {
  if (results.length >= MAX_GLOB_RESULTS * 2) return; // 多收集一些用于排序后截断
  if (depth > 30) return;

  let entries;
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= MAX_GLOB_RESULTS * 2) break;

    // 跳过忽略的目录
    if (entry.isDirectory() && SEARCH_CONFIG.IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      await globSearch(fullPath, basePath, regex, results, depth + 1);
    } else if (regex.test(relativePath) || regex.test(entry.name)) {
      try {
        const stats = await stat(fullPath);
        results.push({
          path: relativePath,
          name: entry.name,
          size: stats.size,
          modified: stats.mtimeMs,
        });
      } catch {
        // 跳过无法访问的文件
      }
    }
  }
}

export const searchTools: Tool[] = [grepTool, globTool];
