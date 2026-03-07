/**
 * 附件存储管理器
 *
 * 负责附件元数据的持久化存储、文件去重、物理文件管理
 */

import Store from 'electron-store';
import { join } from 'path';
import { app } from 'electron';
import { mkdir, unlink, copyFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import type { Attachment } from '../../../src/types';

export interface AttachmentStoreData {
  attachments: Record<string, Attachment>;
  messageAttachments: Record<string, string[]>; // messageId -> attachmentIds
  fileIndex: Record<string, string>; // checksum -> attachmentId (去重索引)
}

/**
 * 附件存储管理器
 */
export class AttachmentStore {
  private store: Store<AttachmentStoreData>;
  private attachmentDir: string;

  constructor() {
    this.store = new Store<AttachmentStoreData>({
      name: 'attachments',
      defaults: {
        attachments: {},
        messageAttachments: {},
        fileIndex: {},
      },
    });

    // 附件存储目录：userData/attachments
    this.attachmentDir = join(app.getPath('userData'), 'attachments');
    this.ensureDirectory();
  }

  /**
   * 确保附件目录存在
   */
  private async ensureDirectory(): Promise<void> {
    if (!existsSync(this.attachmentDir)) {
      await mkdir(this.attachmentDir, { recursive: true });
    }
  }

  /**
   * 保存附件
   * @param attachment 附件元数据
   * @param sourcePath 源文件路径（如果需要复制文件）
   * @returns 保存后的附件元数据
   */
  async save(attachment: Attachment, sourcePath?: string): Promise<Attachment> {
    await this.ensureDirectory();

    // 如果有源文件且是外部存储，复制到附件目录
    if (sourcePath && attachment.storageType === 'external') {
      const ext = attachment.fileName.includes('.')
        ? attachment.fileName.substring(attachment.fileName.lastIndexOf('.'))
        : '';
      const targetPath = join(this.attachmentDir, `${attachment.id}${ext}`);
      await copyFile(sourcePath, targetPath);
      attachment.storagePath = targetPath;
    }

    // 保存元数据
    const data = this.store.store;
    data.attachments[attachment.id] = attachment;

    // 更新消息索引
    if (!data.messageAttachments[attachment.messageId]) {
      data.messageAttachments[attachment.messageId] = [];
    }
    if (!data.messageAttachments[attachment.messageId].includes(attachment.id)) {
      data.messageAttachments[attachment.messageId].push(attachment.id);
    }

    // 更新文件去重索引
    data.fileIndex[attachment.checksum] = attachment.id;

    this.store.set(data);

    return attachment;
  }

  /**
   * 获取附件
   * @param id 附件 ID
   * @returns 附件元数据，不存在则返回 null
   */
  async get(id: string): Promise<Attachment | null> {
    const data = this.store.store;
    return data.attachments[id] || null;
  }

  /**
   * 获取消息的所有附件
   * @param messageId 消息 ID
   * @returns 附件列表
   */
  async getByMessageId(messageId: string): Promise<Attachment[]> {
    const data = this.store.store;
    const attachmentIds = data.messageAttachments[messageId] || [];
    const attachments: Attachment[] = [];

    for (const id of attachmentIds) {
      if (data.attachments[id]) {
        attachments.push(data.attachments[id]);
      }
    }

    return attachments;
  }

  /**
   * 检查文件是否已存在（基于 checksum 去重）
   * @param checksum SHA256 校验和
   * @returns 已存在的附件，不存在则返回 null
   */
  async exists(checksum: string): Promise<Attachment | null> {
    const data = this.store.store;
    const attachmentId = data.fileIndex[checksum];

    if (attachmentId) {
      return this.get(attachmentId);
    }

    return null;
  }

  /**
   * 更新附件
   * @param id 附件 ID
   * @param updates 要更新的字段
   */
  async update(id: string, updates: Partial<Attachment>): Promise<void> {
    const data = this.store.store;
    const attachment = data.attachments[id];

    if (!attachment) {
      throw new Error(`Attachment not found: ${id}`);
    }

    data.attachments[id] = { ...attachment, ...updates };
    this.store.set(data);
  }

  /**
   * 删除附件
   * @param id 附件 ID
   */
  async delete(id: string): Promise<void> {
    const data = this.store.store;
    const attachment = data.attachments[id];

    if (!attachment) {
      return;
    }

    // 删除物理文件
    if (attachment.storagePath && existsSync(attachment.storagePath)) {
      try {
        await unlink(attachment.storagePath);
      } catch (err) {
        console.warn(`[AttachmentStore] Failed to delete file: ${attachment.storagePath}`, err);
      }
    }

    // 删除元数据
    delete data.attachments[id];

    // 更新消息索引
    if (data.messageAttachments[attachment.messageId]) {
      data.messageAttachments[attachment.messageId] = data.messageAttachments[
        attachment.messageId
      ].filter((aid) => aid !== id);
      // 如果消息没有附件了，删除该消息的索引
      if (data.messageAttachments[attachment.messageId].length === 0) {
        delete data.messageAttachments[attachment.messageId];
      }
    }

    // 更新去重索引
    delete data.fileIndex[attachment.checksum];

    this.store.set(data);
  }

  /**
   * 获取所有附件
   * @returns 所有附件的数组
   */
  async getAll(): Promise<Attachment[]> {
    const data = this.store.store;
    return Object.values(data.attachments);
  }

  /**
   * 清空所有附件（用于测试或重置）
   */
  async clear(): Promise<void> {
    const data = this.store.store;

    // 删除所有物理文件
    for (const attachment of Object.values(data.attachments)) {
      if (attachment.storagePath && existsSync(attachment.storagePath)) {
        try {
          await unlink(attachment.storagePath);
        } catch (err) {
          console.warn(`[AttachmentStore] Failed to delete file: ${attachment.storagePath}`, err);
        }
      }
    }

    // 清空元数据
    this.store.set({
      attachments: {},
      messageAttachments: {},
      fileIndex: {},
    });
  }

  /**
   * 获取附件目录路径
   */
  getAttachmentDir(): string {
    return this.attachmentDir;
  }
}

// 单例实例
let attachmentStoreInstance: AttachmentStore | null = null;

export function getAttachmentStore(): AttachmentStore {
  if (!attachmentStoreInstance) {
    attachmentStoreInstance = new AttachmentStore();
  }
  return attachmentStoreInstance;
}
