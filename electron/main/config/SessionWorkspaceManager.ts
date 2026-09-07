/**
 * SessionWorkspaceManager
 * 管理会话专属工作空间 + 全局共享空间
 *
 * 设计：混合架构
 * - 会话附属空间：每个对话有独立的附件/输出目录
 * - 全局共享空间：跨会话共享的文档和模板
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { getPathManager } from './PathManager';

export interface SessionWorkspace {
  sessionId: string;
  workspacePath: string;
  sharedDocumentsPath: string;
  createdAt: number;
  lastAccessedAt: number;
  metadata: {
    totalFiles: number;
    totalSize: number;
    tags: string[];
  };
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  type: string;
  category: 'image' | 'document' | 'code' | 'data' | 'other';
  modifiedAt: number;
}

class SessionWorkspaceManagerClass {
  private pathManager = getPathManager();

  /**
   * 获取或创建会话工作空间
   */
  async getSessionWorkspace(sessionId: string): Promise<SessionWorkspace> {
    const wsPath = this.pathManager.getSessionWorkspacePath(sessionId);
    const attachmentsPath = this.pathManager.getSessionAttachmentsPath(sessionId);
    const outputsPath = this.pathManager.getSessionOutputsPath(sessionId);

    // 确保目录存在
    await fs.mkdir(attachmentsPath, { recursive: true });
    await fs.mkdir(outputsPath, { recursive: true });

    // 读取或创建元数据
    const metaPath = path.join(wsPath, 'workspace.json');
    let metadata: SessionWorkspace | null = null;

    try {
      const data = await fs.readFile(metaPath, 'utf-8');
      metadata = JSON.parse(data);
      metadata.lastAccessedAt = Date.now();
    } catch {
      // 新建
      metadata = {
        sessionId,
        workspacePath: wsPath,
        sharedDocumentsPath: this.pathManager.getGlobalWorkspacePath(),
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        metadata: { totalFiles: 0, totalSize: 0, tags: [] },
      };
    }

    // 保存更新后的元数据
    await fs.mkdir(wsPath, { recursive: true });
    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');

    return metadata;
  }

  /**
   * 保存拖拽文件到会话空间
   */
  async saveDroppedFile(
    sessionId: string,
    fileName: string,
    buffer: Buffer
  ): Promise<{ savedPath: string; size: number }> {
    const ws = await this.getSessionWorkspace(sessionId);
    const attachmentsPath = path.join(ws.workspacePath, 'attachments');
    await fs.mkdir(attachmentsPath, { recursive: true });

    // 防止文件名冲突
    const targetPath = await this.getUniquePath(attachmentsPath, fileName);
    await fs.writeFile(targetPath, buffer);

    return {
      savedPath: targetPath,
      size: buffer.length,
    };
  }

  /**
   * 获取不冲突的文件路径
   */
  private async getUniquePath(dir: string, fileName: string): Promise<string> {
    const targetPath = path.join(dir, fileName);
    try {
      await fs.access(targetPath);
      // 文件已存在，添加时间戳前缀
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      const timestamp = Date.now();
      return path.join(dir, `${base}_${timestamp}${ext}`);
    } catch {
      return targetPath;
    }
  }

  /**
   * 将文件提升到全局共享空间
   */
  async promoteToGlobal(sessionId: string, filePath: string): Promise<string> {
    const globalPath = this.pathManager.getGlobalWorkspacePath();
    const documentsPath = path.join(globalPath, 'documents');
    await fs.mkdir(documentsPath, { recursive: true });

    const fileName = path.basename(filePath);
    const targetPath = await this.getUniquePath(documentsPath, fileName);

    await fs.copyFile(filePath, targetPath);
    return targetPath;
  }

  /**
   * 获取 AI 可见的文件列表（会话 + 全局）
   */
  async getAccessibleFiles(sessionId: string): Promise<FileInfo[]> {
    const files: FileInfo[] = [];

    // 会话附件
    const ws = await this.getSessionWorkspace(sessionId);
    const sessionFiles = await this.listFiles(path.join(ws.workspacePath, 'attachments'));
    files.push(...sessionFiles);

    // 全局文档
    const globalDocsPath = path.join(this.pathManager.getGlobalWorkspacePath(), 'documents');
    try {
      const globalFiles = await this.listFiles(globalDocsPath);
      files.push(...globalFiles);
    } catch {
      // 全局目录可能不存在
    }

    return files;
  }

  /**
   * 列出目录中的文件
   */
  private async listFiles(dirPath: string): Promise<FileInfo[]> {
    const files: FileInfo[] = [];
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = path.join(dirPath, entry.name);
          const stat = await fs.stat(filePath);
          files.push({
            name: entry.name,
            path: filePath,
            size: stat.size,
            type: path.extname(entry.name).toLowerCase(),
            category: this.categorizeFile(entry.name),
            modifiedAt: stat.mtimeMs,
          });
        }
      }
    } catch {
      // 目录不存在
    }
    return files;
  }

  /**
   * 根据文件扩展名分类
   */
  private categorizeFile(fileName: string): FileInfo['category'] {
    const ext = path.extname(fileName).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) return 'image';
    if (['.docx', '.xlsx', '.pptx', '.pdf', '.doc', '.xls', '.ppt'].includes(ext)) return 'document';
    if (['.ts', '.js', '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h', '.tsx', '.jsx'].includes(ext)) return 'code';
    if (['.json', '.csv', '.yaml', '.yml', '.xml', '.toml', '.ini'].includes(ext)) return 'data';
    return 'other';
  }

  /**
   * 清理过期会话空间
   */
  async cleanupStaleSessions(maxAgeDays: number = 30): Promise<number> {
    const sessionsPath = this.pathManager.getSessionWorkspacesPath();
    let cleanedCount = 0;

    try {
      const entries = await fs.readdir(sessionsPath, { withFileTypes: true });
      const now = Date.now();
      const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const metaPath = path.join(sessionsPath, entry.name, 'workspace.json');
          try {
            const data = await fs.readFile(metaPath, 'utf-8');
            const meta = JSON.parse(data);
            if (now - meta.lastAccessedAt > maxAge) {
              await fs.rm(path.join(sessionsPath, entry.name), { recursive: true, force: true });
              cleanedCount++;
            }
          } catch {
            // 无元数据，检查目录修改时间
            const dirPath = path.join(sessionsPath, entry.name);
            const stat = await fs.stat(dirPath);
            if (now - stat.mtimeMs > maxAge) {
              await fs.rm(dirPath, { recursive: true, force: true });
              cleanedCount++;
            }
          }
        }
      }
    } catch {
      // sessions 目录不存在
    }

    return cleanedCount;
  }

  /**
   * 获取工具推荐映射
   */
  getToolRecommendation(category: string, ext: string): string {
    const TOOL_RECOMMENDATIONS: Record<string, string> = {
      image: '已内嵌，可直接查看',
      text: '使用 read 读取全文',
      code: '使用 read 读取源码',
      docx: '使用 office_view 查看大纲，office_get 读取具体段落',
      xlsx: '使用 office_view text 查看数据，office_get 获取单元格',
      pptx: '使用 office_view outline 查看结构，office_get 读取幻灯片',
      pdf: '使用 read 读取文本内容',
      other: '使用 read 尝试读取，或 get_file_info 查看详情',
    };

    // 先用扩展名精确匹配
    if (TOOL_RECOMMENDATIONS[ext.replace('.', '')]) {
      return TOOL_RECOMMENDATIONS[ext.replace('.', '')];
    }
    return TOOL_RECOMMENDATIONS[category] || TOOL_RECOMMENDATIONS.other;
  }

  /**
   * 构建文件上下文消息（注入到用户消息中）
   */
  buildFileContext(files: FileInfo[]): string {
    if (files.length === 0) return '';

    const header = '📎 用户提供了以下文件：\n';
    const tableHeader = '| # | 文件名 | 类型 | 大小 | 推荐读取方式 |\n' +
                        '|---|--------|------|------|-------------|\n';

    const rows = files.map((f, i) => {
      const typeLabel = this.getTypeLabel(f.category, f.type);
      const recommendation = this.getToolRecommendation(f.category, f.type);
      return `| ${i + 1} | ${f.name} | ${typeLabel} | ${this.formatSize(f.size)} | ${recommendation} |`;
    }).join('\n');

    return header + tableHeader + rows +
      `\n\n路径：${path.dirname(files[0].path)}\n请根据需要使用相应工具读取文件内容。`;
  }

  private getTypeLabel(category: string, ext: string): string {
    const labels: Record<string, string> = {
      image: '图片',
      document: '文档',
      code: '代码',
      data: '数据',
      other: '文件',
    };
    // 特殊扩展名
    if (ext === '.docx') return 'Word 文档';
    if (ext === '.xlsx') return 'Excel 表格';
    if (ext === '.pptx') return 'PPT 演示';
    if (ext === '.pdf') return 'PDF 文档';
    return labels[category] || '文件';
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

// 单例
let instance: SessionWorkspaceManagerClass | null = null;

export function getSessionWorkspaceManager(): SessionWorkspaceManagerClass {
  if (!instance) {
    instance = new SessionWorkspaceManagerClass();
  }
  return instance;
}

export default SessionWorkspaceManagerClass;
