/**
 * SearchTools - 纯 Node.js 实现的 grep/glob 搜索工具
 * 不依赖外部命令（findstr/grep），原生支持 Unicode/中文
 * 提供上下文行、大小写控制、排除模式等高级功能
 */

import { createReadStream } from 'fs';
import { opendir, stat as statAsync, writeFile, mkdir } from 'fs/promises';
import * as readline from 'readline';
import * as path from 'path';
import { Tool } from './ToolManager';
import { getWorkspacePath, SEARCH_CONFIG } from './FileTools';
import { getPathManager } from '../config/PathManager';

// ==================== 常量 ====================

const MAX_GREP_RESULTS = 100;
const MAX_GREP_LINE_LENGTH = 2000;
const MAX_GLOB_RESULTS = 200;
const MAX_FILE_SIZE_FOR_SEARCH = 1024 * 1024; // 1MB
const MAX_CONCURRENT_FILE_READS = 5;
const MAX_TRAVERSAL_DEPTH = 30;

/**
 * 结果超出 maxResults 时的完整收集上限（用于保存完整结果到文件）。
 * 超过此上限的匹配放弃收集，但会在 hint 中说明。
 */
const FULL_COLLECT_LIMIT = 2000;

const GREP_LINE_SUFFIX = `... (truncated to ${MAX_GREP_LINE_LENGTH} chars)`;

/** 二进制文件扩展名 - 跳过内容搜索 */
const SKIP_EXTENSIONS = new Set([
  '.zip', '.exe', '.dll', '.so', '.dylib', '.bin', '.obj', '.o', '.a',
  '.lib', '.pdb', '.dSYM', '.woff', '.woff2', '.ttf', '.eot', '.ico',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.svg',
  '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.7z', '.tar', '.gz', '.bz2', '.xz', '.rar', '.iso', '.dmg',
  '.sqlite', '.db', '.mdb', '.class', '.jar', '.war', '.pyc',
  '.lock', '.map', '.wasm',
]);

// ==================== 辅助类型 ====================

/**
 * 结果被截断时，把完整结果保存到 tool-results 目录（与 OutputTruncator 同一位置），
 * 每行一条，供 AI 通过 read 的 offset/limit 分页读取。
 * 保存失败返回 undefined，调用方回退到普通截断提示。
 */
async function saveFullResults(lines: string[], toolName: string): Promise<string | undefined> {
  try {
    const dir = path.join(getPathManager().getDataPath(), 'tool-results');
    await mkdir(dir, { recursive: true });
    const filename = `${toolName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.txt`;
    const filePath = path.join(dir, filename);
    await writeFile(filePath, lines.join('\n'), 'utf-8');
    return filePath;
  } catch (error) {
    console.error(`[SearchTools] Failed to save full ${toolName} results:`, error);
    return undefined;
  }
}

interface GrepMatch {
  file: string;
  line: number;
  content: string;
  context: {
    before: string[];
    after: string[];
  };
}

interface GlobEntry {
  path: string;
  name: string;
  size: number;
  modified: number;
}

// ==================== grep 工具（Node.js 原生实现） ====================

const grepTool: Tool = {
  name: 'grep',
  description: `在文件中搜索匹配的文本内容（纯 Node.js 实现，完美支持中文和正则表达式）

**必需参数**：
- pattern: 搜索模式（正则表达式或纯文本）

**可选参数**：
- path: 搜索的目录路径（相对于指定命名空间根目录，默认为根目录）
- namespace: 命名空间，workspace（工作空间，默认）或 config（.config 配置目录——搜索长期记忆用 namespace="config", path="memory"）
- include: 文件过滤模式（如 "*.ts"、"*.py"、"*.md"）
- contextLines: 上下文行数（显示匹配行前后各 N 行，默认 2）
- maxResults: 最大返回结果数（默认 ${MAX_GREP_RESULTS}）
- caseSensitive: 是否区分大小写（默认 false）

**结果格式**：
- 每个匹配包含文件路径、行号、匹配内容和上下文行
- 自动跳过二进制文件和超过 1MB 的大文件
- 自动忽略 node_modules、.git、dist 等目录
- 结果超过 maxResults 时，完整结果（最多 ${FULL_COLLECT_LIMIT} 条）自动保存到文件，可用 read 的 offset/limit 分页读取（见返回的 hint）

**使用示例**：
- 搜索函数定义：pattern="function\\s+\\w+", include="*.ts"
- 搜索中文字符串：pattern="用户配置", include="*.ts"
- 带上下文搜索：pattern="TODO|FIXME", contextLines=3
- 区分大小写：pattern="MyClass", caseSensitive=true`,

  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: '搜索模式（支持正则表达式，也支持纯文本）',
      },
      include: {
        type: 'string',
        description: '文件过滤模式（如 "*.ts"、"*.py"、"*.md"），支持逗号分隔多个模式',
      },
      path: {
        type: 'string',
        description: '搜索的目录路径（相对于指定命名空间根目录，默认为根目录）',
      },
      namespace: {
        type: 'string',
        description: '命名空间：workspace（工作空间）或 config（.config 配置目录，可搜索 memory/ 长期记忆）',
        enum: ['workspace', 'config'],
        default: 'workspace',
      },
      contextLines: {
        type: 'number',
        description: '匹配行前后显示的上下文行数（默认 2）',
      },
      maxResults: {
        type: 'number',
        description: `最大返回结果数（默认 ${MAX_GREP_RESULTS}）`,
      },
      caseSensitive: {
        type: 'boolean',
        description: '是否区分大小写（默认 false）',
      },
    },
    required: ['pattern'],
  },

  handler: async ({ pattern, include, path: searchPath, namespace = 'workspace', contextLines, maxResults, caseSensitive }) => {
    try {
      const rootPath = namespace === 'config' ? getPathManager().getConfigPath() : getWorkspacePath();
      if (!rootPath) {
        return { success: false, error: '工作空间未设置' };
      }

      const searchDir = searchPath
        ? path.resolve(rootPath, searchPath)
        : rootPath;

      const ctxLines = contextLines ?? 2;
      const maxRes = maxResults ?? MAX_GREP_RESULTS;
      const caseSens = caseSensitive ?? false;

      // 构建正则表达式（安全处理无效正则）
      const regex = buildSearchRegex(pattern, caseSens);
      if (!regex) {
        return { success: false, error: `无效的搜索模式: "${pattern}"` };
      }

      // 构建文件过滤正则
      const includeRegex = include ? buildIncludeRegex(include) : null;

      // 收集所有可搜索的文件
      const files: string[] = [];
      await collectFiles(searchDir, searchDir, files, includeRegex, 0);

      // 搜索文件内容
      // 注意：收集上限为 FULL_COLLECT_LIMIT 而非 maxRes —— 超出 maxResults 的匹配
      // 会保存到文件供 read 分页读取，而不是直接丢弃
      const results: GrepMatch[] = [];
      let hitCollectLimit = false;

      // 限制并发读取
      const batches = batchArray(files, MAX_CONCURRENT_FILE_READS);

      for (const batch of batches) {
        if (results.length >= FULL_COLLECT_LIMIT) {
          hitCollectLimit = true;
          break;
        }

        const batchResults = await Promise.all(
          batch.map(filePath => searchFileContent(filePath, searchDir, regex, ctxLines, FULL_COLLECT_LIMIT - results.length))
        );

        for (const batchResult of batchResults) {
          if (!batchResult) continue;
          for (const match of batchResult) {
            if (results.length >= FULL_COLLECT_LIMIT) {
              hitCollectLimit = true;
              break;
            }
            results.push(match);
          }
        }
      }

      if (results.length === 0) {
        return {
          success: true,
          results: [],
          totalMatches: 0,
          filesSearched: files.length,
          truncated: false,
          message: '未找到匹配的内容',
        };
      }

      const truncated = results.length > maxRes || hitCollectLimit;
      const displayResults = results.slice(0, maxRes);

      // 截断时保存完整结果到文件（每行一条，格式 文件:行号:内容）
      let hint: string | undefined;
      if (truncated) {
        const savedPath = await saveFullResults(
          results.map(m => `${m.file}:${m.line}: ${m.content}`),
          'grep'
        );
        hint = savedPath
          ? `共 ${results.length}${hitCollectLimit ? '+' : ''} 条匹配，仅返回前 ${maxRes} 条。完整结果已保存至 ${savedPath}（每行一条，格式 文件:行号:内容），可用 read 的 offset/limit 参数分页读取`
          : `结果已截断，仅显示前 ${maxRes} 条匹配。请缩小搜索范围获取更精确的结果。`;
      }

      return {
        success: true,
        results: displayResults,
        totalMatches: results.length,
        filesSearched: files.length,
        truncated,
        ...(hint ? { hint } : {}),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

// ==================== glob 工具（改进版） ====================

const globTool: Tool = {
  name: 'glob',
  description: `按文件名模式搜索文件（改进的 glob 匹配）

**必需参数**：
- pattern: Glob 模式（如 "**/*.ts"、"src/**/*.py"、"docs/*.md"）

**可选参数**：
- path: 搜索的目录路径（相对于指定命名空间根目录，默认为根目录）
- namespace: 命名空间，workspace（工作空间，默认）或 config（.config 配置目录——查找长期记忆文件用 namespace="config", path="memory"）
- exclude: 排除模式（逗号分隔，如 "node_modules,.git,dist"）
- maxResults: 最大返回文件数（默认 ${MAX_GLOB_RESULTS}）

**结果限制**：
- 按修改时间排序（最近的在前）
- 自动忽略常见的无关目录
- 结果超过 maxResults 时，完整列表（最多 ${FULL_COLLECT_LIMIT} 个）自动保存到文件，可用 read 的 offset/limit 分页读取（见返回的 hint）

**使用示例**：
- 查找所有 TS 文件：pattern="**/*.ts"
- 查找并排除测试文件：pattern="**/*.ts", exclude="*.test.ts,*.spec.ts"
- 查找配置文件：pattern="**/*.config.{js,ts,json}"
- 限制结果数：pattern="**/*", maxResults=50`,

  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob 模式（如 "**/*.ts"、"src/**/*.py"）',
      },
      path: {
        type: 'string',
        description: '搜索的目录路径（相对于指定命名空间根目录，默认为根目录）',
      },
      namespace: {
        type: 'string',
        description: '命名空间：workspace（工作空间）或 config（.config 配置目录，可查找 memory/ 长期记忆文件）',
        enum: ['workspace', 'config'],
        default: 'workspace',
      },
      exclude: {
        type: 'string',
        description: '排除模式（逗号分隔，如 "node_modules,.git,*.test.ts"）',
      },
      maxResults: {
        type: 'number',
        description: `最大返回文件数（默认 ${MAX_GLOB_RESULTS}）`,
      },
    },
    required: ['pattern'],
  },

  handler: async ({ pattern, path: searchPath, namespace = 'workspace', exclude, maxResults }) => {
    try {
      const rootPath = namespace === 'config' ? getPathManager().getConfigPath() : getWorkspacePath();
      if (!rootPath) {
        return { success: false, error: '工作空间未设置' };
      }

      const searchDir = searchPath
        ? path.resolve(rootPath, searchPath)
        : rootPath;

      const maxRes = maxResults ?? MAX_GLOB_RESULTS;

      // 构建 glob 正则
      const globRegex = globToRegex(pattern);
      const regex = new RegExp(globRegex, 'i');

      // 构建排除正则
      const excludeRegexes = exclude
        ? exclude.split(',').map((p: string) => p.trim()).filter(Boolean).map((p: string) => new RegExp(globToRegex(p), 'i'))
        : [];

      // 递归查找匹配的文件（收集上限为 FULL_COLLECT_LIMIT，超出 maxResults 的保存到文件）
      const matches: GlobEntry[] = [];
      const hitCollectLimit = await globSearch(searchDir, searchDir, regex, excludeRegexes, matches, 0, FULL_COLLECT_LIMIT);

      // 按修改时间排序（最近的在前）
      matches.sort((a, b) => b.modified - a.modified);

      // 截断结果
      const truncated = matches.length > maxRes || hitCollectLimit;
      const results = matches.slice(0, maxRes);

      // 截断时保存完整结果到文件（每行一个路径）
      let hint: string | undefined;
      if (truncated) {
        const savedPath = await saveFullResults(
          matches.map(f => f.path),
          'glob'
        );
        hint = savedPath
          ? `共 ${matches.length}${hitCollectLimit ? '+' : ''} 个文件匹配，仅返回前 ${maxRes} 个（按修改时间排序）。完整列表已保存至 ${savedPath}（每行一个路径），可用 read 的 offset/limit 参数分页读取`
          : `共 ${matches.length} 个文件匹配，仅显示前 ${maxRes} 个（按修改时间排序）。`;
      }

      return {
        success: true,
        files: results.map(f => f.path),
        count: results.length,
        totalMatches: matches.length,
        truncated,
        ...(hint ? { hint } : {}),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

// ==================== 核心辅助函数 ====================

/**
 * 构建搜索正则表达式，安全处理无效正则
 * 如果输入不是有效的正则，则退回到纯文本 includes() 匹配
 */
function buildSearchRegex(pattern: string, caseSensitive: boolean): RegExp | null {
  try {
    // 尝试作为正则表达式解析
    return new RegExp(pattern, caseSensitive ? 'u' : 'ui');
  } catch {
    // 无效正则，转义为纯文本搜索
    try {
      const escaped = escapeRegExp(pattern);
      return new RegExp(escaped, caseSensitive ? 'u' : 'ui');
    } catch {
      return null;
    }
  }
}

/**
 * 构建文件名过滤正则
 * 支持逗号分隔的多个模式，如 "*.ts,*.tsx"
 */
function buildIncludeRegex(include: string): RegExp {
  const patterns = include.split(',').map(p => p.trim()).filter(Boolean);
  const regexParts = patterns.map(p => {
    const globStr = globToRegex(p);
    return `(${globStr})`;
  });
  return new RegExp(regexParts.join('|'), 'i');
}

/**
 * 递归收集可搜索的文件路径
 * 使用 opendir 替代 readdir 以提升内存效率
 */
async function collectFiles(
  currentDir: string,
  basePath: string,
  results: string[],
  includeRegex: RegExp | null,
  depth: number,
  typeFilter: Set<string> | null = null,
): Promise<void> {
  if (depth > MAX_TRAVERSAL_DEPTH) return;

  let dir;
  try {
    dir = await opendir(currentDir);
  } catch {
    return;
  }

  try {
    for await (const entry of dir) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // 跳过忽略的目录
        if (SEARCH_CONFIG.IGNORED_DIRS.has(entry.name)) continue;
        await collectFiles(fullPath, basePath, results, includeRegex, depth + 1, typeFilter);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();

        // 跳过二进制文件
        if (SKIP_EXTENSIONS.has(ext)) continue;

        // 文件类型过滤
        if (typeFilter && !typeFilter.has(ext)) continue;

        // include 模式过滤
        if (includeRegex) {
          const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/');
          if (!includeRegex.test(relativePath) && !includeRegex.test(entry.name)) continue;
        }

        // 大小检查（快速跳过大文件）
        try {
          const stats = await statAsync(fullPath);
          if (stats.size > MAX_FILE_SIZE_FOR_SEARCH) continue;
        } catch {
          continue;
        }

        results.push(fullPath);
      }
    }
  } finally {
    // for await 循环结束（含 break/异常）时 Node 会自动关闭目录句柄，
    // 对已关闭句柄再调用 close() 会抛 ERR_DIR_CLOSED，故忽略该错误
    try { await dir.close(); } catch { /* already closed by iterator */ }
  }
}

/**
 * 搜索单个文件的内容，返回匹配行（带上下文）
 */
async function searchFileContent(
  filePath: string,
  basePath: string,
  regex: RegExp,
  contextLines: number,
  maxMatches: number,
): Promise<GrepMatch[] | null> {
  return new Promise((resolve) => {
    const matches: GrepMatch[] = [];
    const beforeBuffer: string[] = [];
    const pendingAfter: { match: GrepMatch; remaining: number }[] = [];
    let lineNumber = 0;
    let truncated = false;

    const rl = readline.createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line: string) => {
      if (truncated) return;
      lineNumber++;

      // 二进制内容检测：含 NUL 字节直接放弃该文件
      if (line.includes('\u0000')) {
        truncated = true;
        rl.close();
        return;
      }

      // 补全前一个匹配的 after 上下文
      for (const p of pendingAfter) {
        if (p.remaining > 0) {
          p.match.context.after.push(line.length > MAX_GREP_LINE_LENGTH ? line.substring(0, MAX_GREP_LINE_LENGTH) + GREP_LINE_SUFFIX : line);
          p.remaining--;
        }
      }
      while (pendingAfter.length > 0 && pendingAfter[0].remaining === 0) {
        pendingAfter.shift();
      }

      regex.lastIndex = 0;
      if (regex.test(line)) {
        const content = line.length > MAX_GREP_LINE_LENGTH
          ? line.substring(0, MAX_GREP_LINE_LENGTH) + GREP_LINE_SUFFIX
          : line;
        const match: GrepMatch = {
          file: path.relative(basePath, filePath).replace(/\\/g, '/'),
          line: lineNumber,
          content,
          context: {
            before: [...beforeBuffer],
            after: [],
          },
        };
        matches.push(match);
        if (contextLines > 0) {
          pendingAfter.push({ match, remaining: contextLines });
        }
        if (matches.length >= maxMatches) {
          truncated = true;
          rl.close();
          return;
        }
      }

      beforeBuffer.push(line);
      if (beforeBuffer.length > contextLines) {
        beforeBuffer.shift();
      }
    });

    rl.on('close', () => {
      resolve(matches.length > 0 ? matches : null);
    });

    rl.on('error', () => {
      resolve(null);
    });
  });
}

// ==================== glob 辅助函数 ====================

/**
 * 将 glob 模式转换为正则表达式
 * 支持: ** (跨目录匹配), * (单级匹配), ? (单字符匹配), {} (分组)
 */
function globToRegex(pattern: string): string {
  let result = '';
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        // ** - 匹配任意路径（包括路径分隔符）
        result += '.*';
        i += 2;
        // 跳过紧跟的路径分隔符（**/ 或 **\）
        if (pattern[i] === '/' || pattern[i] === '\\') {
          i++;
        }
      } else {
        // * - 匹配除路径分隔符外的任意字符
        result += '[^/\\\\]*';
        i++;
      }
    } else if (ch === '?') {
      // ? - 匹配单个非路径分隔符字符
      result += '[^/\\\\]';
      i++;
    } else if (ch === '{') {
      // {a,b,c} - 分组匹配
      const closeIdx = pattern.indexOf('}', i);
      if (closeIdx !== -1) {
        const group = pattern.substring(i + 1, closeIdx);
        const options = group.split(',').map(opt => escapeRegExp(opt));
        result += `(${options.join('|')})`;
        i = closeIdx + 1;
      } else {
        result += '\\{';
        i++;
      }
    } else if (ch === '[') {
      // 字符类 - 透传给正则
      const closeIdx = pattern.indexOf(']', i);
      if (closeIdx !== -1) {
        result += pattern.substring(i, closeIdx + 1);
        i = closeIdx + 1;
      } else {
        result += '\\[';
        i++;
      }
    } else if (isRegExpSpecialChar(ch)) {
      result += '\\' + ch;
      i++;
    } else {
      result += ch;
      i++;
    }
  }

  // 确保完整匹配
  return `^${result}$`;
}

/**
 * 判断字符是否是正则特殊字符
 */
function isRegExpSpecialChar(ch: string): boolean {
  return '.+^${}()|[]\\'.includes(ch);
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 递归搜索匹配 glob 模式的文件
 * 使用 opendir 实现更高效的目录遍历
 * 返回值：是否因达到收集上限而提前停止（用于 hint 标注 "+"）
 */
async function globSearch(
  currentDir: string,
  basePath: string,
  regex: RegExp,
  excludeRegexes: RegExp[],
  results: GlobEntry[],
  depth: number,
  maxCollect: number,
): Promise<boolean> {
  if (results.length >= maxCollect) return true;
  if (depth > MAX_TRAVERSAL_DEPTH) return false;

  let dir;
  try {
    dir = await opendir(currentDir);
  } catch {
    return false;
  }

  try {
    for await (const entry of dir) {
      if (results.length >= maxCollect) break;

      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        // 跳过忽略的目录
        if (SEARCH_CONFIG.IGNORED_DIRS.has(entry.name)) continue;

        // 检查排除模式
        if (excludeRegexes.some(re => re.test(relativePath) || re.test(entry.name))) continue;

        await globSearch(fullPath, basePath, regex, excludeRegexes, results, depth + 1, maxCollect);
      } else if (entry.isFile()) {
        // 检查排除模式
        if (excludeRegexes.some(re => re.test(relativePath) || re.test(entry.name))) continue;

        // 检查匹配
        if (regex.test(relativePath) || regex.test(entry.name)) {
          try {
            const stats = await statAsync(fullPath);
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
  } finally {
    // 同上：迭代器会自动关闭句柄，忽略重复 close 的 ERR_DIR_CLOSED
    try { await dir.close(); } catch { /* already closed by iterator */ }
  }
  return results.length >= maxCollect;
}

/**
 * 将数组拆分为指定大小的批次
 */
function batchArray<T>(arr: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < arr.length; i += batchSize) {
    batches.push(arr.slice(i, i + batchSize));
  }
  return batches;
}

// ==================== 导出 ====================

export const searchTools: Tool[] = [grepTool, globTool];
