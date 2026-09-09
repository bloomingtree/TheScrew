/**
 * KnowledgeTools - 本地知识库引擎
 * 零外部依赖，纯 Node.js 实现（fs, path, crypto, readline）
 * 用于在低性能/老旧机器上运行的知识库索引与搜索
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as readline from 'readline';
import { execFile } from 'child_process';
import { Tool } from './ToolManager';
import { getPathManager } from '../config/PathManager';

// ==================== 类型定义 ====================

interface FileIndexEntry {
  hash: string;
  chunks: number;
  lastIndexed: string;
  size: number;
  fileType: string;
}

interface Chunk {
  id: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
}

interface KBMeta {
  totalFiles: number;
  totalChunks: number;
  totalSize: number;
  lastIndexed: string;
  fileTypes: Record<string, number>;
}

// ==================== 常量 ====================

/** 工作空间路径 Symbol key - 与 FileTools 保持一致 */
const WORKSPACE_KEY = Symbol.for('zero-employee:getWorkspacePath()');

/** 忽略的文件扩展名（二进制、媒体、压缩、字体等） */
const IGNORED_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
  '.mp3', '.mp4', '.avi', '.mov', '.wav', '.flac',
  '.zip', '.rar', '.7z', '.tar', '.gz',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.map', '.lock', '.wasm',
]);

/** 忽略的目录名 */
const IGNORED_DIRECTORIES = new Set([
  'node_modules', '.git', 'dist', 'build', '.cache',
  '.config', '__pycache__', '.next', '.nuxt',
]);

/** 可直接读取文本的文件扩展名 */
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.csv', '.log', '.yaml', '.yml', '.xml',
  '.html', '.htm', '.css', '.js', '.ts', '.tsx', '.jsx',
  '.py', '.java', '.c', '.cpp', '.h', '.go', '.rs', '.rb',
  '.sh', '.bat', '.ps1', '.sql', '.r', '.swift', '.kt',
  '.vue', '.svelte', '.ini', '.conf', '.cfg', '.toml',
  '.env', '.gitignore', '.dockerignore',
]);

/** 需要通过 officecli 提取文本的文件扩展名 */
const OFFICE_EXTENSIONS = new Set(['.docx', '.xlsx', '.pptx', '.pdf']);

/** 分块大小 */
const MAX_CHUNK_SIZE = 500;
const MIN_CHUNK_MERGE_SIZE = 100;

/** 大文件阈值（1MB） */
const LARGE_FILE_THRESHOLD = 1 * 1024 * 1024;

/** chunks.json 大文件阈值（10MB） */
const LARGE_CHUNKS_THRESHOLD = 10 * 1024 * 1024;

// ==================== 工具函数 ====================

/**
 * 获取工作空间根路径
 */
function getWorkspacePath(): string | null {
  return (globalThis as any)[WORKSPACE_KEY] ?? null;
}

/**
 * 获取知识库数据目录
 */
function getKBDir(): string {
  const workspace = getWorkspacePath();
  if (!workspace) {
    throw new Error('工作空间未设置');
  }
  return path.join(workspace, '.config', 'data', 'kb');
}

/**
 * 确保目录存在
 */
async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

/**
 * 原子写入 JSON 文件（先写临时文件再重命名）
 */
async function atomicWriteJSON(filePath: string, data: any): Promise<void> {
  const tmpPath = filePath + '.tmp';
  await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.promises.rename(tmpPath, filePath);
}

/**
 * 读取 JSON 文件，文件不存在或解析失败返回默认值
 */
async function readJSONFile<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * 计算 MD5 哈希
 */
function computeMD5(content: string): string {
  return crypto.createHash('md5').update(content, 'utf-8').digest('hex');
}

/**
 * 通过 officecli 提取文档文本
 */
function extractOfficeText(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    // 尝试多个可能的 officecli 路径
    const candidates = [
      path.join(process.resourcesPath || '', 'bin', 'officecli.exe'),
      path.join(getPathManager().getConfigPath(), 'bin', 'officecli.exe'),
    ];

    // macOS / Linux 路径
    if (process.platform !== 'win32') {
      candidates.push(
        path.join(process.resourcesPath || '', 'bin', 'officecli'),
        path.join(getPathManager().getConfigPath(), 'bin', 'officecli'),
      );
    }

    let binaryPath: string | null = null;
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        binaryPath = candidate;
        break;
      }
    }

    if (!binaryPath) {
      resolve(null);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const format = ext === '.pdf' ? 'text' : 'text';

    execFile(
      binaryPath,
      ['view', '--file', filePath, '--format', format],
      { timeout: 30000, maxBuffer: 10 * 1024 * 1024, windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        resolve(typeof stdout === 'string' ? stdout : Buffer.from(stdout as any).toString('utf-8'));
      },
    );
  });
}

/**
 * 读取文件内容，返回文本
 * 大文件（>1MB）使用流式读取
 */
async function readFileContent(filePath: string): Promise<string> {
  const stats = await fs.promises.stat(filePath);

  if (stats.size > LARGE_FILE_THRESHOLD) {
    return readFileContentStream(filePath);
  }

  return fs.promises.readFile(filePath, 'utf-8');
}

/**
 * 流式读取大文件内容
 */
function readFileContentStream(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line: string) => {
      chunks.push(line);
    });

    rl.on('close', () => {
      resolve(chunks.join('\n'));
    });

    rl.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * 文本分块算法
 * 1. 按双换行符（\n\n）切分为段落
 * 2. 长段落按句子切分
 * 3. 仍过长的直接硬切分
 * 4. 合并过小的相邻块
 */
function splitIntoChunks(text: string, maxChunkSize: number = MAX_CHUNK_SIZE): Array<{ content: string; startLine: number; endLine: number }> {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const lines = text.split('\n');
  const paragraphs: Array<{ text: string; startLine: number; endLine: number }> = [];

  // 按双换行符切分段落
  let currentParagraph = '';
  let paraStartLine = 1;
  let currentLineNum = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (line.trim() === '' && currentParagraph.trim() !== '') {
      // 空行 = 段落分隔
      paragraphs.push({
        text: currentParagraph.trim(),
        startLine: paraStartLine,
        endLine: currentLineNum - 1,
      });
      currentParagraph = '';
      paraStartLine = lineNum + 1;
    } else {
      if (currentParagraph === '') {
        paraStartLine = lineNum;
      }
      currentParagraph += (currentParagraph ? '\n' : '') + line;
    }
    currentLineNum = lineNum;
  }

  // 处理最后一个段落
  if (currentParagraph.trim()) {
    paragraphs.push({
      text: currentParagraph.trim(),
      startLine: paraStartLine,
      endLine: lines.length,
    });
  }

  // 将段落进一步分割为合适的块
  const rawChunks: Array<{ content: string; startLine: number; endLine: number }> = [];

  for (const para of paragraphs) {
    if (para.text.length <= maxChunkSize) {
      rawChunks.push({
        content: para.text,
        startLine: para.startLine,
        endLine: para.endLine,
      });
    } else {
      // 按句子分割
      const sentenceChunks = splitBySentences(para.text, para.startLine, maxChunkSize);
      rawChunks.push(...sentenceChunks);
    }
  }

  // 合并过小的相邻块
  const mergedChunks: Array<{ content: string; startLine: number; endLine: number }> = [];
  let i = 0;

  while (i < rawChunks.length) {
    const chunk = rawChunks[i];

    if (chunk.content.length < MIN_CHUNK_MERGE_SIZE && i + 1 < rawChunks.length) {
      // 合并与下一块
      const next = rawChunks[i + 1];
      const merged = chunk.content + '\n\n' + next.content;
      if (merged.length <= maxChunkSize * 1.5) {
        mergedChunks.push({
          content: merged,
          startLine: chunk.startLine,
          endLine: next.endLine,
        });
        i += 2;
        continue;
      }
    }

    mergedChunks.push(chunk);
    i++;
  }

  return mergedChunks;
}

/**
 * 按句子分割长文本
 */
function splitBySentences(
  text: string,
  startLine: number,
  maxChunkSize: number,
): Array<{ content: string; startLine: number; endLine: number }> {
  // 句子分隔符：中英文句号、感叹号、问号
  const sentenceRegex = /([。！？.!?])\s*/g;
  const parts = text.split(sentenceRegex);

  // 重新组合句子（分隔符归属前一句）
  const sentences: string[] = [];
  let current = '';

  for (let i = 0; i < parts.length; i++) {
    current += parts[i];
    // 如果下一个部分是分隔符，继续追加
    if (i + 1 < parts.length && /^[。！？.!?]\s*$/.test(parts[i + 1])) {
      current += parts[i + 1];
      i++;
      // 分隔符后可能还有空白
      if (i + 1 < parts.length && /^\s+$/.test(parts[i + 1])) {
        i++;
      }
    } else if (current.trim()) {
      sentences.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) {
    sentences.push(current.trim());
  }

  // 将句子合并为不超过 maxChunkSize 的块
  const chunks: Array<{ content: string; startLine: number; endLine: number }> = [];
  let buffer = '';
  let bufferStartLine = startLine;

  // 估算行号分布
  const totalLen = text.length;
  const totalLines = text.split('\n').length;

  for (const sentence of sentences) {
    if (buffer.length + sentence.length + 1 > maxChunkSize && buffer.length > 0) {
      // 估算当前块的结束行号
      const estimatedEndLine = Math.min(
        startLine + totalLines - 1,
        bufferStartLine + Math.round((buffer.length / totalLen) * totalLines),
      );
      chunks.push({
        content: buffer.trim(),
        startLine: bufferStartLine,
        endLine: Math.max(bufferStartLine, estimatedEndLine),
      });
      bufferStartLine = estimatedEndLine + 1;
      buffer = sentence;
    } else {
      buffer += (buffer ? ' ' : '') + sentence;
    }
  }

  if (buffer.trim()) {
    chunks.push({
      content: buffer.trim(),
      startLine: bufferStartLine,
      endLine: startLine + totalLines - 1,
    });
  }

  // 兜底：如果仍有超长块，硬切分
  const finalChunks: Array<{ content: string; startLine: number; endLine: number }> = [];
  for (const chunk of chunks) {
    if (chunk.content.length <= maxChunkSize) {
      finalChunks.push(chunk);
    } else {
      let offset = 0;
      while (offset < chunk.content.length) {
        const slice = chunk.content.substring(offset, offset + maxChunkSize);
        const chunkLines = slice.split('\n').length;
        finalChunks.push({
          content: slice,
          startLine: chunk.startLine + offset > 0 ? Math.round((offset / chunk.content.length) * (chunk.endLine - chunk.startLine)) : chunk.startLine,
          endLine: chunk.startLine + Math.round(((offset + slice.length) / chunk.content.length) * (chunk.endLine - chunk.startLine)),
        });
        offset += maxChunkSize;
      }
    }
  }

  return finalChunks;
}

/**
 * 递归遍历目录，收集文件
 */
async function walkDirectory(
  dirPath: string,
  recursive: boolean,
  basePath: string,
): Promise<string[]> {
  const results: string[] = [];
  let entries: fs.Dirent[];

  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (recursive && !IGNORED_DIRECTORIES.has(entry.name)) {
        const subFiles = await walkDirectory(fullPath, recursive, basePath);
        results.push(...subFiles);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!IGNORED_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * 判断文件是否可提取文本
 */
function isTextFile(ext: string): boolean {
  return TEXT_EXTENSIONS.has(ext);
}

function isOfficeFile(ext: string): boolean {
  return OFFICE_EXTENSIONS.has(ext);
}

/**
 * 分词：中文按单字，英文按空格，统一小写
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];

  // CJK 字符正则
  const cjkRegex = /[\u4e00-\u9fff\u3400-\u4dbf]/;

  // 先提取 CJK 字符（每个字符单独作为 token）
  const cjkMatches = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]+/g) || [];
  for (const match of cjkMatches) {
    for (const char of match) {
      tokens.push(char);
    }
  }

  // 提取非 CJK 部分，按空格/标点分割
  const nonCjkParts = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]+/g, ' ');
  const words = nonCjkParts
    .split(/[\s\p{P}]+/u)
    .map(w => w.toLowerCase().trim())
    .filter(w => w.length > 0);

  tokens.push(...words);

  return tokens;
}

// ==================== 工具定义 ====================

const kbTrainTool: Tool = {
  name: 'kb_train',
  description: `将文件或目录索引到本地知识库。支持文本文件（.txt, .md, .json, .csv, .py, .js, .ts 等）和 Office 文档（.docx, .xlsx, .pptx, .pdf）。

**必需参数**：
- paths: 文件或目录路径数组（相对于工作空间根目录）

**可选参数**：
- recursive: 是否递归子目录（默认 true）
- force: 是否强制重新索引未变更的文件（默认 false）

**行为说明**：
1. 遍历指定路径，收集可索引的文件
2. 跳过二进制文件（.exe, .dll, .png 等）和特殊目录（node_modules, .git 等）
3. 计算文件 MD5 哈希，仅索引有变更的文件（除非 force=true）
4. 将文件内容分割为 ~500 字符的知识块
5. 保存索引信息到 .config/data/kb/ 目录

**使用示例**：
- 索引整个工作空间：paths=["."]
- 索引指定目录：paths=["docs", "src"]
- 重新索引：paths=["."], force=true`,
  parameters: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: '文件或目录路径数组（相对于工作空间根目录）',
      },
      recursive: {
        type: 'boolean',
        description: '是否递归子目录（默认 true）',
        default: true,
      },
      force: {
        type: 'boolean',
        description: '是否强制重新索引未变更的文件（默认 false）',
        default: false,
      },
    },
    required: ['paths'],
  },
  handler: async ({ paths, recursive = true, force = false }) => {
    const startTime = Date.now();

    try {
      const workspace = getWorkspacePath();
      if (!workspace) {
        return { success: false, error: '工作空间未设置，请先设置工作空间' };
      }

      if (!paths || !Array.isArray(paths) || paths.length === 0) {
        return { success: false, error: 'paths 参数不能为空' };
      }

      const kbDir = getKBDir();
      await ensureDir(kbDir);

      // 加载现有索引
      const indexPath = path.join(kbDir, 'index.json');
      const chunksPath = path.join(kbDir, 'chunks.json');
      const metaPath = path.join(kbDir, 'meta.json');

      const index: Record<string, FileIndexEntry> = await readJSONFile(indexPath, {});
      let allChunks: Chunk[] = await readJSONFile(chunksPath, []);

      let filesProcessed = 0;
      let filesSkipped = 0;
      let chunksCreated = 0;
      const warnings: string[] = [];

      // 收集所有待索引文件
      const allFiles: string[] = [];

      for (const inputPath of paths) {
        const resolvedPath = path.resolve(workspace, inputPath);
        const stats = await fs.promises.stat(resolvedPath).catch(() => null);

        if (!stats) {
          warnings.push(`路径不存在: ${inputPath}`);
          continue;
        }

        if (stats.isFile()) {
          allFiles.push(resolvedPath);
        } else if (stats.isDirectory()) {
          const dirFiles = await walkDirectory(resolvedPath, recursive, workspace);
          allFiles.push(...dirFiles);
        } else {
          warnings.push(`跳过非文件非目录: ${inputPath}`);
        }
      }

      // 去重
      const uniqueFiles = [...new Set(allFiles)];

      // 处理每个文件
      for (const filePath of uniqueFiles) {
        const ext = path.extname(filePath).toLowerCase();
        const relativePath = path.relative(workspace, filePath).replace(/\\/g, '/');

        // 判断文件类型
        if (!isTextFile(ext) && !isOfficeFile(ext)) {
          filesSkipped++;
          continue;
        }

        // 读取文件内容并计算哈希
        let content: string | null = null;

        if (isTextFile(ext)) {
          try {
            content = await readFileContent(filePath);
          } catch (err: any) {
            warnings.push(`读取文件失败: ${relativePath} - ${err.message}`);
            filesSkipped++;
            continue;
          }
        } else if (isOfficeFile(ext)) {
          const officeText = await extractOfficeText(filePath);
          if (officeText) {
            content = officeText;
          } else {
            warnings.push(`无法提取文档文本（officecli 不可用）: ${relativePath}`);
            filesSkipped++;
            continue;
          }
        }

        if (!content || content.trim().length === 0) {
          filesSkipped++;
          continue;
        }

        // 计算哈希并检查是否需要重新索引
        const hash = computeMD5(content);
        const existingEntry = index[relativePath];

        if (existingEntry && existingEntry.hash === hash && !force) {
          filesSkipped++;
          continue;
        }

        // 获取文件大小
        let fileSize = 0;
        try {
          fileSize = (await fs.promises.stat(filePath)).size;
        } catch {
          // 使用文本长度估算
          fileSize = Buffer.byteLength(content, 'utf-8');
        }

        // 移除该文件旧的 chunks
        allChunks = allChunks.filter(c => c.filePath !== relativePath);

        // 分块
        const fileChunks = splitIntoChunks(content);

        // 创建 Chunk 对象
        for (const chunk of fileChunks) {
          allChunks.push({
            id: crypto.randomUUID(),
            filePath: relativePath,
            content: chunk.content,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
          });
          chunksCreated++;
        }

        // 更新索引
        index[relativePath] = {
          hash,
          chunks: fileChunks.length,
          lastIndexed: new Date().toISOString(),
          size: fileSize,
          fileType: ext,
        };

        filesProcessed++;
      }

      // 更新 meta
      const fileTypes: Record<string, number> = {};
      let totalSize = 0;

      for (const entry of Object.values(index)) {
        fileTypes[entry.fileType] = (fileTypes[entry.fileType] || 0) + 1;
        totalSize += entry.size;
      }

      const meta: KBMeta = {
        totalFiles: Object.keys(index).length,
        totalChunks: allChunks.length,
        totalSize,
        lastIndexed: new Date().toISOString(),
        fileTypes,
      };

      // 持久化
      await atomicWriteJSON(indexPath, index);
      await atomicWriteJSON(chunksPath, allChunks);
      await atomicWriteJSON(metaPath, meta);

      const timeMs = Date.now() - startTime;

      return {
        success: true,
        filesProcessed,
        filesSkipped,
        chunksCreated,
        chunksTotal: allChunks.length,
        timeMs,
        ...(warnings.length > 0 ? { warnings } : {}),
      };
    } catch (error: any) {
      return { success: false, error: `知识库训练失败: ${error.message}` };
    }
  },
};

const kbSearchTool: Tool = {
  name: 'kb_search',
  description: `在本地知识库中进行全文搜索。支持中文、英文和混合查询。

**必需参数**：
- query: 搜索关键词（支持中文单字分词、英文空格分词）

**可选参数**：
- limit: 返回结果数量上限（默认 10）
- fileType: 按文件扩展名过滤（如 "md", "docx", "py"）

**搜索算法**：
1. 查询词分词：中文字符逐字分词，英文按空格分词
2. 评分：关键词匹配 +10 分，每多出现一次 +2 分，文件路径匹配 +5 分
3. 完整短语匹配额外 +20 分

**使用示例**：
- 搜索知识：query="数据库连接配置"
- 按类型搜索：query="API 接口", fileType="md"
- 限制结果数：query="错误处理", limit=5`,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词（支持中英文混合）',
      },
      limit: {
        type: 'number',
        description: '返回结果数量上限（默认 10）',
        default: 10,
      },
      fileType: {
        type: 'string',
        description: '按文件扩展名过滤（如 "md", "docx", "py"，不含点号）',
      },
    },
    required: ['query'],
  },
  handler: async ({ query, limit = 10, fileType }) => {
    try {
      const workspace = getWorkspacePath();
      if (!workspace) {
        return { success: false, error: '工作空间未设置' };
      }

      if (!query || query.trim().length === 0) {
        return { success: false, error: 'query 参数不能为空' };
      }

      const kbDir = getKBDir();
      const chunksPath = path.join(kbDir, 'chunks.json');

      // 检查知识库是否存在
      try {
        await fs.promises.access(chunksPath);
      } catch {
        return {
          success: false,
          error: '知识库未初始化，请先使用 kb_train 命令训练知识库',
        };
      }

      // 读取 chunks
      const stats = await fs.promises.stat(chunksPath);
      let allChunks: Chunk[];

      if (stats.size > LARGE_CHUNKS_THRESHOLD) {
        // 大文件：流式读取并处理
        allChunks = await readLargeChunksFile(chunksPath);
      } else {
        allChunks = await readJSONFile<Chunk[]>(chunksPath, []);
      }

      if (allChunks.length === 0) {
        return {
          success: true,
          results: [],
          totalMatches: 0,
          query,
          message: '知识库为空，请先使用 kb_train 索引文件',
        };
      }

      // 过滤文件类型
      let filteredChunks = allChunks;
      if (fileType) {
        const ext = fileType.startsWith('.') ? fileType : '.' + fileType;
        filteredChunks = allChunks.filter(c => path.extname(c.filePath).toLowerCase() === ext.toLowerCase());
      }

      // 分词
      const queryTokens = tokenize(query);
      const lowerQuery = query.toLowerCase();

      // 计算每个 chunk 的相关性分数
      const scored = filteredChunks.map(chunk => {
        let score = 0;
        const lowerContent = chunk.content.toLowerCase();
        const lowerFilePath = chunk.filePath.toLowerCase();

        // 关键词匹配
        for (const token of queryTokens) {
          const lowerToken = token.toLowerCase();

          // 内容匹配
          let matchCount = 0;
          let searchPos = 0;
          while (true) {
            const idx = lowerContent.indexOf(lowerToken, searchPos);
            if (idx === -1) break;
            matchCount++;
            searchPos = idx + 1;
          }

          if (matchCount > 0) {
            score += 10; // 首次出现
            score += Math.min((matchCount - 1) * 2, 20); // 额外出现，上限 20
          }

          // 文件路径匹配
          if (lowerFilePath.includes(lowerToken)) {
            score += 5;
          }
        }

        // 完整短语匹配
        if (lowerContent.includes(lowerQuery)) {
          score += 20;
        }

        return { chunk, score };
      });

      // 按分数排序，取 top N
      const results = scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => ({
          filePath: s.chunk.filePath,
          content: s.chunk.content,
          score: s.score,
          startLine: s.chunk.startLine,
          endLine: s.chunk.endLine,
        }));

      return {
        success: true,
        results,
        totalMatches: scored.filter(s => s.score > 0).length,
        query,
      };
    } catch (error: any) {
      return { success: false, error: `搜索失败: ${error.message}` };
    }
  },
};

const kbStatusTool: Tool = {
  name: 'kb_status',
  description: `获取本地知识库的统计信息，包括已索引的文件数、分块数、文件类型分布等。

无需任何参数。

**返回内容**：
- totalFiles: 已索引文件总数
- totalChunks: 知识块总数
- totalSize: 已索引文件总大小
- lastIndexed: 最后一次索引时间
- fileTypes: 按文件类型统计数量`,
  parameters: {
    type: 'object',
    properties: {},
  },
  handler: async () => {
    try {
      const workspace = getWorkspacePath();
      if (!workspace) {
        return { success: false, error: '工作空间未设置' };
      }

      const kbDir = getKBDir();
      const metaPath = path.join(kbDir, 'meta.json');

      // 检查 meta 文件是否存在
      try {
        await fs.promises.access(metaPath);
      } catch {
        return {
          success: true,
          initialized: false,
          message: '知识库未初始化，请使用 kb_train 命令训练',
        };
      }

      const meta: KBMeta = await readJSONFile(metaPath, {
        totalFiles: 0,
        totalChunks: 0,
        totalSize: 0,
        lastIndexed: '',
        fileTypes: {},
      });

      return {
        success: true,
        initialized: true,
        totalFiles: meta.totalFiles,
        totalChunks: meta.totalChunks,
        totalSize: meta.totalSize,
        totalSizeFormatted: formatBytes(meta.totalSize),
        lastIndexed: meta.lastIndexed,
        fileTypes: meta.fileTypes,
      };
    } catch (error: any) {
      return { success: false, error: `获取知识库状态失败: ${error.message}` };
    }
  },
};

const kbRemoveTool: Tool = {
  name: 'kb_remove',
  description: `从本地知识库中移除指定文件或目录的索引。

**必需参数**：
- paths: 要移除的文件或目录路径数组（相对于工作空间根目录）

**行为说明**：
1. 移除匹配路径的所有知识块
2. 如果路径是目录，则移除该目录下所有文件的索引
3. 自动更新索引和统计信息

**使用示例**：
- 移除单个文件：paths=["docs/old-report.md"]
- 移除整个目录：paths=["docs/archive"]`,
  parameters: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: '要移除的文件或目录路径数组（相对于工作空间根目录）',
      },
    },
    required: ['paths'],
  },
  handler: async ({ paths }) => {
    try {
      const workspace = getWorkspacePath();
      if (!workspace) {
        return { success: false, error: '工作空间未设置' };
      }

      if (!paths || !Array.isArray(paths) || paths.length === 0) {
        return { success: false, error: 'paths 参数不能为空' };
      }

      const kbDir = getKBDir();
      const indexPath = path.join(kbDir, 'index.json');
      const chunksPath = path.join(kbDir, 'chunks.json');
      const metaPath = path.join(kbDir, 'meta.json');

      const index: Record<string, FileIndexEntry> = await readJSONFile(indexPath, {});
      let allChunks: Chunk[] = await readJSONFile(chunksPath, []);

      let filesRemoved = 0;
      let chunksRemoved = 0;

      for (const inputPath of paths) {
        // 规范化路径
        const normalizedPath = inputPath.replace(/\\/g, '/');

        // 查找匹配的索引条目（文件精确匹配 或 目录前缀匹配）
        const matchedFiles: string[] = [];

        for (const filePath of Object.keys(index)) {
          if (filePath === normalizedPath || filePath.startsWith(normalizedPath + '/')) {
            matchedFiles.push(filePath);
          }
        }

        // 也尝试 resolve 后的路径匹配
        const resolvedPath = path.resolve(workspace, inputPath).replace(/\\/g, '/');
        for (const filePath of Object.keys(index)) {
          const fullFilePath = path.resolve(workspace, filePath).replace(/\\/g, '/');
          if (fullFilePath === resolvedPath || fullFilePath.startsWith(resolvedPath + '/')) {
            if (!matchedFiles.includes(filePath)) {
              matchedFiles.push(filePath);
            }
          }
        }

        // 移除匹配的文件
        for (const filePath of matchedFiles) {
          // 移除 chunks
          const beforeCount = allChunks.length;
          allChunks = allChunks.filter(c => c.filePath !== filePath);
          chunksRemoved += beforeCount - allChunks.length;

          // 移除索引
          delete index[filePath];
          filesRemoved++;
        }
      }

      // 更新 meta
      const fileTypes: Record<string, number> = {};
      let totalSize = 0;

      for (const entry of Object.values(index)) {
        fileTypes[entry.fileType] = (fileTypes[entry.fileType] || 0) + 1;
        totalSize += entry.size;
      }

      const meta: KBMeta = {
        totalFiles: Object.keys(index).length,
        totalChunks: allChunks.length,
        totalSize,
        lastIndexed: new Date().toISOString(),
        fileTypes,
      };

      // 持久化
      await atomicWriteJSON(indexPath, index);
      await atomicWriteJSON(chunksPath, allChunks);
      await atomicWriteJSON(metaPath, meta);

      return {
        success: true,
        filesRemoved,
        chunksRemoved,
      };
    } catch (error: any) {
      return { success: false, error: `移除索引失败: ${error.message}` };
    }
  },
};

// ==================== 单工具封装（2026-09-09 四工具合并） ====================

/**
 * kb - 知识库管理单工具，operation 分发到 train/remove/status
 */
const kbTool: Tool = {
  name: 'kb',
  description: `本地知识库管理（零依赖索引引擎）。operation 取值：

- **train**：索引文件/目录到知识库。paths（路径数组，相对工作空间根）；可选 recursive=true / force=false（强制重建未变更文件）。跳过二进制与 node_modules/.git；按 MD5 增量索引；内容切成 ~500 字符知识块存入 .config/data/kb/
- **remove**：移除索引。paths（文件精确匹配，目录前缀匹配）
- **status**：查看统计（文件数/块数/大小/类型分布）

支持文本（.txt/.md/.json/.py/.js 等）与 Office 文档（.docx/.xlsx/.pptx/.pdf，需 officecli）。

示例：
- kb({operation:"train", paths:["docs", "src"]})
- kb({operation:"train", paths:["."], force:true})
- kb({operation:"remove", paths:["docs/archive"]})
- kb({operation:"status"})`,
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['train', 'remove', 'status'],
        description: '操作类型，见上方速查表',
      },
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: '（train/remove）文件或目录路径数组（相对工作空间根目录）',
      },
      recursive: {
        type: 'boolean',
        description: '（train）是否递归子目录，默认 true',
        default: true,
      },
      force: {
        type: 'boolean',
        description: '（train）是否强制重新索引未变更的文件，默认 false',
        default: false,
      },
    },
    required: ['operation'],
  },
  handler: async (args: any) => {
    const { operation, ...rest } = args;
    switch (operation) {
      case 'train':
        return kbTrainTool.handler(rest);
      case 'remove':
        return kbRemoveTool.handler(rest);
      case 'status':
        return kbStatusTool.handler(rest);
      default:
        return { success: false, error: `未知 operation "${operation}"。可用：train / remove / status（搜索请用 kb_search）` };
    }
  },
};

// ==================== 辅助函数 ====================

/**
 * 流式读取大型 chunks.json
 */
async function readLargeChunksFile(filePath: string): Promise<Chunk[]> {
  // 对于大文件，直接用 JSON.parse 配合流式缓冲
  // 虽然不是真正的流式解析，但比逐行拼接可靠得多
  const content = await fs.promises.readFile(filePath, 'utf-8');
  return JSON.parse(content) as Chunk[];
}

/**
 * 格式化字节大小
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

// ==================== 导出 ====================

export const knowledgeTools: Tool[] = [
  kbTool,
  kbSearchTool,
];

/**
 * 知识库工具组定义 - 用于 ToolManager 注册
 */
export const knowledgeToolGroup = {
  name: 'knowledge',
  description: '本地知识库工具（索引、搜索、管理）',
  tools: knowledgeTools,
  keywords: ['知识库', '搜索', '索引', '训练', 'kb', 'knowledge', 'RAG', '检索'],
  triggers: {
    keywords: ['知识库', '索引', '搜索文件内容', 'kb', 'kb_search'],
    fileExtensions: [],
    dependentTools: [],
  },
};
