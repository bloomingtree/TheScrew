import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Image, Archive, Database, File, FileCode, Table, Presentation } from 'lucide-react';
import { extractTextFromContent } from '../../../utils/messageContent';
import type { PendingFileInfo } from '../../../types';

// 附件类型定义（避免跨模块引用问题）
interface Attachment {
  id: string;
  messageId: string;
  fileName: string;
  fileType: 'image' | 'document' | 'archive' | 'data' | 'unknown';
  mimeType: string;
  fileSize: number;
  checksum: string;
  storageType: 'embedded' | 'external';
  storagePath?: string;
  extractedContent?: {
    text?: string;
    preview?: string;
    pageCount?: number;
    sheetCount?: number;
  };
  createdAt: number;
  status: 'pending' | 'processing' | 'ready' | 'error';
  error?: string;
}

interface UserMessageProps {
  message: {
    role: 'user';
    content: string | any[];
    timestamp?: number;
    images?: string[];
    attachments?: Attachment[];
    pendingFiles?: PendingFileInfo[];
  };
}

/**
 * 根据文件类型获取对应图标组件
 */
function getFileIcon(fileType: Attachment['fileType'] | PendingFileInfo['fileType']): React.ComponentType<any> {
  switch (fileType) {
    case 'image':
      return Image;
    case 'document':
      return FileText;
    case 'archive':
      return Archive;
    case 'data':
      return Database;
    case 'code':
      return FileCode;
    default:
      return File;
  }
}

/**
 * 从文本中剥离文件上下文（📎 表格），返回用户纯文本
 */
function stripFileContext(text: string): string {
  // 匹配 📎 开头的文件上下文块（包含表格和路径信息）
  const index = text.indexOf('\n\n📎');
  if (index >= 0) {
    return text.substring(0, index).trim();
  }
  return text;
}

/**
 * 格式化文件大小显示
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return bytes + ' B';
  }
  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + ' KB';
  }
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const UserMessage: React.FC<UserMessageProps> = ({ message }) => {
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 提取文本内容（处理多模态格式）
  const rawText = extractTextFromContent(message.content);
  // 剥离文件上下文表格，只显示用户输入的文字
  const displayText = stripFileContext(rawText);

  // 是否有拖拽文件（pendingFiles 或从文本推断）
  const hasPendingFiles = message.pendingFiles && message.pendingFiles.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative mb-3 flex justify-end items-end"
    >
      <div className="flex flex-col items-end max-w-[85%]">
        {/* 消息气泡 */}
        <div className="rounded-xl overflow-hidden bg-[#fff8f0] shadow-md">
          <div className="px-3 py-2">
            {/* 图片 */}
            {message.images && message.images.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {message.images.map((img, idx) => (
                  <img
                    key={idx}
                    src={img}
                    alt={`上传的图片${idx + 1}`}
                    className="max-w-[200px] rounded-lg"
                  />
                ))}
              </div>
            )}

            {/* 附件（老方式） */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {message.attachments.map((attachment) => {
                  const Icon = getFileIcon(attachment.fileType);
                  return (
                    <motion.div
                      key={attachment.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-white border border-gray-200 shadow-sm"
                    >
                      <Icon size={14} className="text-gray-500" />
                      <span className="text-xs text-gray-700">{attachment.fileName}</span>
                      <span className="text-xs text-gray-400">({formatFileSize(attachment.fileSize)})</span>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* 拖拽文件 — 以附件图标展示 */}
            {hasPendingFiles && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {message.pendingFiles!.map((file, idx) => {
                  const Icon = getFileIcon(file.fileType);
                  return (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/80 border border-gray-200/60 shadow-sm"
                    >
                      <Icon size={12} className="text-gray-500 flex-shrink-0" />
                      <span className="text-xs text-gray-700 truncate max-w-[120px]">{file.fileName}</span>
                      <span className="text-[10px] text-gray-400 flex-shrink-0">({formatFileSize(file.fileSize)})</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 文本内容 — 仅显示用户输入，不含文件上下文 */}
            {displayText && (
              <div className="prose prose-sm max-w-none prose-p:max-w-none prose-headings:max-w-none">
                <p className="my-1 leading-relaxed text-sm w-full">
                  {displayText}
                </p>
              </div>
            )}
          </div>
        </div>
        {/* 时间戳 */}
        {message.timestamp && (
          <div className="text-[10px] mt-1 whitespace-nowrap font-mono" style={{ color: 'rgb(153, 153, 153)' }}>
            {formatTime(message.timestamp)}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default UserMessage;
