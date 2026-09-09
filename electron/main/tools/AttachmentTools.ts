/**
 * 附件相关 AI 工具
 *
 * 让 AI 能够处理用户上传的附件文件
 */

import path from 'path';
import { writeFile, mkdir } from 'fs/promises';
import type { Tool } from './ToolManager';
import { getWorkspacePath, setWorkspacePath } from './FileTools';
import { getAttachmentStore } from '../store/AttachmentStore';
import { getContentExtractor } from '../processors/ContentExtractor';

/**
 * 辅助函数：获取当前消息中的附件
 */
async function getCurrentMessageAttachments(): Promise<any[]> {
  const store = getAttachmentStore();

  // 获取所有附件，按创建时间倒序排列
  const allAttachments = await store.getAll();
  const recentAttachments = allAttachments
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10); // 只返回最近 10 个附件

  return recentAttachments.map((att) => ({
    id: att.id,
    fileName: att.fileName,
    fileType: att.fileType,
    fileSize: att.fileSize,
    mimeType: att.mimeType,
    status: att.status,
    hasContent: !!att.extractedContent?.text,
    storageType: att.storageType,
    storagePath: att.storagePath,
  }));
}

/**
 * 辅助函数：根据 ID 获取附件
 */
async function getAttachmentById(attachmentId: string): Promise<any | null> {
  const store = getAttachmentStore();
  const attachment = await store.get(attachmentId);

  if (!attachment) {
    return null;
  }

  return {
    id: attachment.id,
    fileName: attachment.fileName,
    fileType: attachment.fileType,
    fileSize: attachment.fileSize,
    mimeType: attachment.mimeType,
    storagePath: attachment.storagePath,
    extractedContent: attachment.extractedContent,
  };
}

/**
 * 附件相关工具集
 */
export const attachmentTools: Tool[] = [
  {
    name: 'list_attachments',
    description: `列出最近上传的附件文件

**使用场景**：
- 查看用户上传了哪些文件
- 了解可用的附件资源

**返回值说明**：
- attachments: 附件列表，包含文件名、类型、大小等信息
- hasContent: 标识是否已提取文本内容`,
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      try {
        const attachments = await getCurrentMessageAttachments();

        return {
          success: true,
          attachments,
          count: attachments.length,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'get_attachment_content',
    description: `获取附件的详细信息和内容

**使用场景**：
- 获取特定附件的完整文本内容
- 查看附件的详细信息

**参数说明**：
- attachment_id: 附件 ID（必需）

**返回值说明**：
- fileName: 文件名
- fileType: 文件类型
- content: 提取的文本内容（如果有）
- preview: 内容预览片段（前 1000 字符）`,
    parameters: {
      type: 'object',
      properties: {
        attachment_id: {
          type: 'string',
          description: '附件 ID',
        },
      },
      required: ['attachment_id'],
    },
    handler: async ({ attachment_id }) => {
      try {
        const attachment = await getAttachmentById(attachment_id);

        if (!attachment) {
          return { success: false, error: 'Attachment not found' };
        }

        const result: any = {
          success: true,
          fileName: attachment.fileName,
          fileType: attachment.fileType,
          fileSize: attachment.fileSize,
        };

        // 如果有提取的内容
        if (attachment.extractedContent) {
          if (attachment.extractedContent.text) {
            result.content = attachment.extractedContent.text;
          }
          if (attachment.extractedContent.preview) {
            result.preview = attachment.extractedContent.preview;
          }
          if (attachment.extractedContent.sheetCount) {
            result.sheetCount = attachment.extractedContent.sheetCount;
          }
          if (attachment.extractedContent.sheetNames) {
            result.sheetNames = attachment.extractedContent.sheetNames;
          }
        }

        return result;
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'upload_file',
    description: `将附件保存到工作空间，以便后续处理

**使用场景**：
- 将用户上传的附件保存到工作空间目录
- 为后续处理准备文件

**参数说明**：
- attachment_id: 附件 ID（必需）
- target_path: 目标路径（可选，默认保存到 workspace/uploads 目录）
- filename: 目标文件名（可选，默认使用原文件名）

**返回值说明**：
- filepath: 保存的文件路径（相对于 workspace）
- filesize: 文件大小
- type: 文件类型`,
    parameters: {
      type: 'object',
      properties: {
        attachment_id: {
          type: 'string',
          description: '附件 ID',
        },
        target_path: {
          type: 'string',
          description: '目标路径（相对于 workspace，默认为 uploads/）',
        },
        filename: {
          type: 'string',
          description: '目标文件名（可选，默认使用原文件名）',
        },
      },
      required: ['attachment_id'],
    },
    handler: async ({ attachment_id, target_path, filename }) => {
      try {
        const workspacePath = getWorkspacePath();
        if (!workspacePath) {
          return { success: false, error: '工作空间未设置' };
        }

        const store = getAttachmentStore();
        const attachment = await store.get(attachment_id);

        if (!attachment) {
          return { success: false, error: 'Attachment not found' };
        }

        // 确定目标路径和文件名
        const targetDir = target_path || 'uploads';
        const targetFileName = filename || attachment.fileName;
        const relativePath = path.join(targetDir, targetFileName);
        const fullPath = path.join(workspacePath, relativePath);

        // 确保目录存在
        await mkdir(path.dirname(fullPath), { recursive: true });

        // 如果有外部存储路径，直接复制文件
        if (attachment.storagePath && attachment.storageType === 'external') {
          const { copyFile } = await import('fs/promises');
          await copyFile(attachment.storagePath, fullPath);
        } else if (attachment.extractedContent?.text) {
          // 如果有提取的文本内容，直接保存
          await writeFile(fullPath, attachment.extractedContent.text, 'utf-8');
        } else if (attachment.extractedContent?.preview && attachment.fileType === 'image') {
          // 如果是图片，保存 base64 数据
          const base64Data = attachment.extractedContent.preview.split(',')[1];
          const buffer = Buffer.from(base64Data, 'base64');
          await writeFile(fullPath, buffer);
        } else {
          return { success: false, error: '无法保存附件：没有可用的文件数据' };
        }

        return {
          success: true,
          filepath: relativePath,
          fullPath,
          filesize: attachment.fileSize,
          type: attachment.fileType,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },
];
