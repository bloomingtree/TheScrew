/**
 * 附件管理 IPC 处理器
 *
 * 提供文件上传、列表、删除等功能
 */

import { ipcMain, dialog } from 'electron';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import type { Attachment } from '../../../src/types';
import { getAttachmentStore } from '../store/AttachmentStore';
import { getContentExtractor } from '../processors/ContentExtractor';

// 文件大小限制（可配置）
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const EMBEDDED_SIZE_THRESHOLD = 10 * 1024 * 1024; // 10MB

// 文件类型分类
const FILE_TYPE_CATEGORIES = {
  image: new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico']),
  document: new Set([
    '.txt',
    '.md',
    '.markdown',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.csv',
    '.ppt',
    '.pptx',
    '.pdf',
    '.rtf',
  ]),
  archive: new Set(['.zip', '.tar', '.gz', '.7z', '.rar', '.bz2']),
  data: new Set(['.json', '.xml', '.yaml', '.yml', '.toml', '.csv', '.tsv']),
};

// MIME 类型映射
const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
  '.7z': 'application/x-7z-compressed',
};

/**
 * 根据文件扩展名获取文件类型
 */
function getFileType(ext: string): Attachment['fileType'] {
  const lowerExt = ext.toLowerCase();
  for (const [type, extensions] of Object.entries(FILE_TYPE_CATEGORIES)) {
    if (extensions.has(lowerExt)) {
      return type as Attachment['fileType'];
    }
  }
  return 'unknown';
}

/**
 * 根据文件扩展名获取 MIME 类型
 */
function getMimeType(ext: string): string {
  const lowerExt = ext.toLowerCase();
  return MIME_TYPES[lowerExt] || 'application/octet-stream';
}

/**
 * 计算文件的 SHA256 校验和
 */
async function calculateChecksum(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * 获取支持的文件扩展名列表
 */
function getSupportedExtensions(): string[] {
  const extensions = new Set<string>();
  for (const exts of Object.values(FILE_TYPE_CATEGORIES)) {
    exts.forEach((ext) => extensions.add(ext.substring(1))); // 去掉点号
  }
  return Array.from(extensions);
}

/**
 * 处理单个文件，生成附件元数据
 */
async function processFile(filePath: string, messageId: string): Promise<Attachment | null> {
  try {
    const fileStats = await stat(filePath);
    const fileSize = fileStats.size;

    // 检查文件大小
    if (fileSize > MAX_FILE_SIZE) {
      console.error(`[Attachment] File too large: ${fileSize} > ${MAX_FILE_SIZE}`);
      return null;
    }

    const fileName = path.basename(filePath);
    const ext = path.extname(filePath);
    const checksum = await calculateChecksum(filePath);

    // 检查是否已存在（去重）
    const store = getAttachmentStore();
    const existing = await store.exists(checksum);
    if (existing) {
      console.log(`[Attachment] File already exists, reusing: ${existing.id}`);
      return existing;
    }

    // 确定存储策略
    const storageType: Attachment['storageType'] =
      fileSize < EMBEDDED_SIZE_THRESHOLD ? 'embedded' : 'external';

    // 创建附件元数据
    const attachment: Attachment = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      messageId,
      fileName,
      fileType: getFileType(ext),
      mimeType: getMimeType(ext),
      fileSize,
      checksum,
      storageType,
      createdAt: Date.now(),
      status: storageType === 'embedded' ? 'processing' : 'pending',
    };

    // 如果是内嵌存储，读取文件内容
    if (storageType === 'embedded') {
      const buffer = await readFile(filePath);

      if (attachment.fileType === 'image') {
        // 图片转换为 base64 data URL
        const base64 = buffer.toString('base64');
        attachment.extractedContent = {
          preview: `data:${attachment.mimeType};base64,${base64}`,
        };
        attachment.status = 'ready';
      } else if (attachment.fileType === 'document' || attachment.fileType === 'data') {
        // 文档文件，使用 ContentExtractor 提取内容
        try {
          const extractor = getContentExtractor();
          const extracted = await extractor.extract(filePath, attachment.fileType);
          attachment.extractedContent = {
            text: extracted.text,
            preview: extracted.preview,
            pageCount: extracted.pageCount,
            sheetCount: extracted.sheetCount,
          };
          attachment.status = 'ready';
        } catch (extractError) {
          // 提取失败，尝试作为文本处理
          try {
            const text = buffer.toString('utf-8');
            attachment.extractedContent = {
              text,
              preview: text.slice(0, 1000),
            };
            attachment.status = 'ready';
          } catch {
            // 二进制文件，仅存储预览信息
            attachment.extractedContent = {
              preview: `[二进制文件: ${fileName}, ${fileSize} 字节]`,
            };
            attachment.status = 'ready';
          }
        }
      } else {
        // 其他类型，尝试作为文本处理
        try {
          const text = buffer.toString('utf-8');
          attachment.extractedContent = {
            text,
            preview: text.slice(0, 1000),
          };
          attachment.status = 'ready';
        } catch {
          // 二进制文件，仅存储预览信息
          attachment.extractedContent = {
            preview: `[二进制文件: ${fileName}, ${fileSize} 字节]`,
          };
          attachment.status = 'ready';
        }
      }
    } else {
      // 外部存储，需要复制文件
      attachment.status = 'pending';
    }

    // 保存到存储
    await store.save(attachment, storageType === 'external' ? filePath : undefined);

    return attachment;
  } catch (error: any) {
    console.error(`[Attachment] Failed to process file:`, error);
    return null;
  }
}

/**
 * 注册附件处理器的 IPC 处理函数
 */
export function registerAttachmentHandlers(): void {
  /**
   * 选择并上传文件
   */
  ipcMain.handle(
    'attachment:selectFiles',
    async (_, options: { multiple?: boolean; messageId?: string }) => {
      try {
        const messageId = options.messageId || `temp-${Date.now()}`;

        const result = await dialog.showOpenDialog({
          properties: options.multiple
            ? ['openFile', 'multiSelections']
            : ['openFile'],
          filters: [
            {
              name: '所有支持文件',
              extensions: getSupportedExtensions(),
            },
            {
              name: 'Office 文档',
              extensions: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'],
            },
            {
              name: '图片',
              extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'],
            },
            {
              name: '文本文件',
              extensions: ['txt', 'md', 'markdown'],
            },
            {
              name: '数据文件',
              extensions: ['json', 'xml', 'csv'],
            },
          ],
        });

        if (result.canceled || result.filePaths.length === 0) {
          return { canceled: true };
        }

        const attachments: Attachment[] = [];

        for (const filePath of result.filePaths) {
          const attachment = await processFile(filePath, messageId);
          if (attachment) {
            attachments.push(attachment);
          }
        }

        return { canceled: false, attachments };
      } catch (error: any) {
        console.error('[Attachment] selectFiles error:', error);
        return { canceled: true, error: error.message };
      }
    }
  );

  /**
   * 获取消息的所有附件
   */
  ipcMain.handle('attachment:listByMessage', async (_, messageId: string) => {
    try {
      const store = getAttachmentStore();
      const attachments = await store.getByMessageId(messageId);
      return { success: true, attachments };
    } catch (error: any) {
      console.error('[Attachment] listByMessage error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 删除附件
   */
  ipcMain.handle('attachment:delete', async (_, attachmentId: string) => {
    try {
      const store = getAttachmentStore();
      await store.delete(attachmentId);
      return { success: true };
    } catch (error: any) {
      console.error('[Attachment] delete error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 获取附件内容（用于预览）
   */
  ipcMain.handle('attachment:getContent', async (_, attachmentId: string) => {
    try {
      const store = getAttachmentStore();
      const attachment = await store.get(attachmentId);

      if (!attachment) {
        return { success: false, error: 'Attachment not found' };
      }

      return {
        success: true,
        attachment,
      };
    } catch (error: any) {
      console.error('[Attachment] getContent error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 更新附件的消息 ID（当临时附件关联到实际消息时）
   */
  ipcMain.handle('attachment:updateMessageId', async (_, attachmentId: string, messageId: string) => {
    try {
      const store = getAttachmentStore();
      const attachment = await store.get(attachmentId);

      if (!attachment) {
        return { success: false, error: 'Attachment not found' };
      }

      // 如果消息 ID 没变，不需要更新
      if (attachment.messageId === messageId) {
        return { success: true };
      }

      const oldMessageId = attachment.messageId;

      // 更新附件的消息 ID
      await store.update(attachmentId, { messageId });

      // 更新消息索引
      const data = (store as any).store.store;
      if (data.messageAttachments[oldMessageId]) {
        data.messageAttachments[oldMessageId] = data.messageAttachments[
          oldMessageId
        ].filter((id: string) => id !== attachmentId);
        if (data.messageAttachments[oldMessageId].length === 0) {
          delete data.messageAttachments[oldMessageId];
        }
      }
      if (!data.messageAttachments[messageId]) {
        data.messageAttachments[messageId] = [];
      }
      data.messageAttachments[messageId].push(attachmentId);
      (store as any).store.set(data);

      return { success: true };
    } catch (error: any) {
      console.error('[Attachment] updateMessageId error:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('[IPC] Attachment handlers registered');
}
