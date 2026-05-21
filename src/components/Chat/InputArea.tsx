import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { flushSync } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Paperclip, X, StopCircle, Brain } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useConfigStore } from '../../store/configStore';
import { useConversationStore } from '../../store/conversationStore';
import TokenIndicator from './TokenIndicator';
import AttachmentList from './AttachmentList';
import FilePreviewBar, { PendingFile } from './FilePreviewBar';
import VisionFallbackDialog from './VisionFallbackDialog';
import type { Attachment, PendingFileInfo } from '../../types';

export interface InputAreaHandle {
  handleDroppedFiles: (files: File[]) => void;
}

interface InputAreaProps {
  onNewChat?: () => void;
}

const InputArea = forwardRef<InputAreaHandle, InputAreaProps>(({ onNewChat }, ref) => {
  const [input, setInput] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [visionFallbackOpen, setVisionFallbackOpen] = useState(false);
  const [pendingImageFiles, setPendingImageFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

const { messages, isStreaming, addMessage, updateLastMessage, updateLastMessageToolCalls, setMessages, setStreaming, setToolCalls, setToolResults, startToolExecution, completeToolExecution, setTokenUsage } = useChatStore();
  const { apiKey, appSettings, setThinkingMode, loadAppSettings } = useConfigStore();
  const { currentConversationId, generateTitle } = useConversationStore();

  // 加载应用设置
  useEffect(() => {
    loadAppSettings();
  }, []);

  // 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    handleDroppedFiles,
  }));

  // 文件类型分类
  const categorizeFile = (fileName: string): PendingFile['fileType'] => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
    if (['docx', 'xlsx', 'pptx', 'pdf', 'doc', 'xls', 'ppt'].includes(ext)) return 'document';
    if (['ts', 'js', 'py', 'java', 'go', 'rs', 'cpp', 'c', 'tsx', 'jsx'].includes(ext)) return 'code';
    if (['json', 'csv', 'yaml', 'yml', 'xml', 'toml'].includes(ext)) return 'data';
    return 'other';
  };

  // 注意：拖拽事件已提升到 ChatArea，此处不再处理

  // 处理拖拽文件
  const handleDroppedFiles = async (files: File[]) => {
    if (!currentConversationId) return;

    // 检查是否有图片，需要验证模型能力
    const imageFiles = files.filter(f => categorizeFile(f.name) === 'image');
    const nonImageFiles = files.filter(f => categorizeFile(f.name) !== 'image');

    // 先处理非图片文件
    for (const file of nonImageFiles) {
      await saveFileToWorkspace(file);
    }

    // 图片需要检查模型能力
    if (imageFiles.length > 0) {
      try {
        const config = useConfigStore.getState().getActiveConfig();
        if (config?.model) {
          const capabilities = config.capabilities ||
            await window.electronAPI.config.detectCapabilities(config.model);

          if (capabilities.vision) {
            // 模型支持视觉，正常处理
            for (const file of imageFiles) {
              await saveFileToWorkspace(file);
            }
          } else {
            // 不支持视觉，弹出选择对话框
            setPendingImageFiles(imageFiles);
            setVisionFallbackOpen(true);
          }
        }
      } catch {
        // 检测失败，直接保存
        for (const file of imageFiles) {
          await saveFileToWorkspace(file);
        }
      }
    }
  };

  // 保存文件到工作空间
  const saveFileToWorkspace = async (file: File) => {
    if (!currentConversationId) return;

    const fileId = `pf-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const fileType = categorizeFile(file.name);

    // 添加 saving 状态
    setPendingFiles(prev => [...prev, {
      id: fileId,
      fileName: file.name,
      fileSize: file.size,
      fileType,
      savedPath: '',
      status: 'saving',
    }]);

    try {
      const buffer = await file.arrayBuffer();
      const result = await window.electronAPI.sessionWorkspace.saveDroppedFile(
        currentConversationId,
        file.name,
        buffer,
      );

      if (result.success && result.savedPath) {
        // 如果是图片且模型支持视觉，同时添加到 images 状态
        if (fileType === 'image') {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result as string;
            setImages(prev => [...prev, base64]);
          };
          reader.readAsDataURL(file);
        }

        setPendingFiles(prev =>
          prev.map(f => f.id === fileId ? {
            ...f,
            savedPath: result.savedPath!,
            status: 'ready' as const,
          } : f)
        );
      } else {
        setPendingFiles(prev =>
          prev.map(f => f.id === fileId ? { ...f, status: 'error' as const } : f)
        );
      }
    } catch {
      setPendingFiles(prev =>
        prev.map(f => f.id === fileId ? { ...f, status: 'error' as const } : f)
      );
    }
  };

  // 视觉降级选择
  const handleVisionFallback = async (mode: 'tool' | 'path' | 'cancel') => {
    if (mode === 'cancel') {
      setPendingImageFiles([]);
      return;
    }

    for (const file of pendingImageFiles) {
      if (mode === 'path') {
        // 仅保存路径
        await saveFileToWorkspace(file);
      } else {
        // 使用工具：仍然保存文件，但不在 images[] 中
        await saveFileToWorkspace(file);
      }
    }
    setPendingImageFiles([]);
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const handleSend = async () => {
    if (!input.trim() && images.length === 0 && attachments.length === 0 && pendingFiles.length === 0) return;
    if (isStreaming) return;
    if (!apiKey) {
      alert('请先配置 API Key');
      return;
    }

    const userInput = input.trim();
    const userImages = images.length > 0 ? images : undefined;
    const userAttachments = attachments.length > 0 ? attachments : undefined;

    // 构建文件上下文（如果有拖拽文件）
    let fileContext = '';
    const readyFiles = pendingFiles.filter(f => f.status === 'ready');
    // 保存文件信息用于消息展示
    const messagePendingFiles: PendingFileInfo[] = readyFiles.map(f => ({
      fileName: f.fileName,
      fileSize: f.fileSize,
      fileType: f.fileType,
      savedPath: f.savedPath,
    }));
    if (readyFiles.length > 0) {
      const header = '📎 用户提供了以下文件：\n';
      const tableHeader = '| # | 文件名 | 类型 | 大小 | 推荐读取方式 |\n|---|--------|------|------|-------------|\n';
      const TOOL_RECOMMENDATIONS: Record<string, string> = {
        image: '已内嵌，可直接查看',
        document: '使用 office_view 查看大纲，office_get 读取内容',
        code: '使用 read_file 读取源码',
        data: '使用 read_file 读取数据',
        other: '使用 read_file 尝试读取',
      };
      const TYPE_LABELS: Record<string, string> = {
        image: '图片',
        document: '文档',
        code: '代码',
        data: '数据',
        other: '文件',
      };
      const rows = readyFiles.map((f, i) =>
        `| ${i + 1} | ${f.fileName} | ${TYPE_LABELS[f.fileType] || '文件'} | ${formatFileSize(f.fileSize)} | ${TOOL_RECOMMENDATIONS[f.fileType] || TOOL_RECOMMENDATIONS.other} |`
      ).join('\n');
      const dirPath = readyFiles[0].savedPath ? readyFiles[0].savedPath.replace(/[/\\][^/\\]+$/, '') : '';
      fileContext = '\n\n' + header + tableHeader + rows + (dirPath ? `\n\n路径：${dirPath}` : '') + '\n请根据需要使用相应工具读取文件内容。';
    }

    const fullContent = userInput + fileContext;

    // 生成消息 ID
    const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const userMessage = {
      id: messageId,
      role: 'user' as const,
      content: fullContent || userInput,
      timestamp: Date.now(),
      images: userImages,
      attachments: userAttachments,
      pendingFiles: messagePendingFiles.length > 0 ? messagePendingFiles : undefined,
    };

    // 更新附件的 messageId
    if (userAttachments) {
      for (const attachment of userAttachments) {
        await window.electronAPI.attachment.updateMessageId(attachment.id, messageId);
      }
    }

    setInput('');
    setImages([]);
    setAttachments([]);
    setPendingFiles([]);

    // 添加用户消息
    addMessage(userMessage);
    setStreaming(true);

    // 立即创建 assistant 消息，确保工具调用能立即显示
    const initialAssistantMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    addMessage(initialAssistantMessage);
    let assistantMessageCreated = true;
    let accumulatedContent = '';

    const ensureAssistantMessage = () => {
      if (!assistantMessageCreated) {
        const assistantMessage = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
        };
        addMessage(assistantMessage);
        assistantMessageCreated = true;
        accumulatedContent = '';
      }
    };

    if (currentConversationId && messages.length === 1) {
      generateTitle(currentConversationId, userInput);
    }

    try {
      // 获取最新的 messages 状态（确保包含刚添加的用户消息）
      const latestMessages = useChatStore.getState().messages;
      console.log('[InputArea] Sending', latestMessages.length, 'messages to backend');

      // 累积思考内容
      let accumulatedThinking = '';
      const { updateLastMessageThinking } = useChatStore.getState();

      const handleChunk = (chunk: string) => {
        // 处理思考内容（\x01THINKING\x02... 格式的思考 token）
        if (chunk.startsWith('\x01THINKING\x02')) {
          ensureAssistantMessage();
          accumulatedThinking += chunk.substring('\x01THINKING\x02'.length);
          flushSync(() => {
            updateLastMessageThinking(accumulatedThinking);
          });
          return;
        }
        ensureAssistantMessage();
        accumulatedContent += chunk;
        // 使用 flushSync 强制立即渲染，确保文本在工具调用之前显示
        flushSync(() => {
          updateLastMessage(accumulatedContent);
        });
      };

      const handleToolCalls = (toolCalls: any[]) => {
        ensureAssistantMessage();
        // 使用 flushSync 强制立即渲染
        flushSync(() => {
          updateLastMessageToolCalls(toolCalls);
          setToolCalls(toolCalls);
        });
        // 标记新一轮开始，让后续的 handleChunk 创建新消息
        assistantMessageCreated = false;
      };

      const handleToolResults = (results: any[]) => {
        setToolResults(results);
      };

      const handleToolStart = (data: any) => {
        startToolExecution({
          toolCallId: data.toolCallId,
          name: data.name,
          arguments: data.arguments,
          description: data.description,
          startTime: data.timestamp,
        });
      };

      const handleToolComplete = (data: any) => {
        completeToolExecution(data.toolCallId, data.success, data.duration);
      };

      const handleTokenUsage = (usage: any) => {
        setTokenUsage(usage);
      };

      const removeChunkListener = window.electronAPI.onChatChunk(handleChunk);
      const removeToolCallsListener = window.electronAPI.onToolCalls(handleToolCalls);
      const removeToolResultsListener = window.electronAPI.onToolResults(handleToolResults);
      const removeToolStartListener = window.electronAPI.onToolStart(handleToolStart);
      const removeToolCompleteListener = window.electronAPI.onToolComplete(handleToolComplete);
      const removeTokenUsageListener = window.electronAPI.onTokenUsage(handleTokenUsage);

      const result = await window.electronAPI.chat.stream(latestMessages, currentConversationId || undefined);

      removeChunkListener();
      removeToolCallsListener();
      removeToolResultsListener();
      removeToolStartListener();
      removeToolCompleteListener();
      removeTokenUsageListener();

      if (result.success) {
        // 重要：必须使用后端返回的完整消息列表更新 chatStore
        // 因为后端会添加工具结果消息（role='tool'），这些消息需要被包含在下一次请求中
        if (result.messages) {
          const userCount = result.messages.filter((m: any) => m.role === 'user').length;
          const assistantCount = result.messages.filter((m: any) => m.role === 'assistant').length;
          const toolCount = result.messages.filter((m: any) => m.role === 'tool').length;
          console.log('[InputArea] Stream completed with', result.messages.length, `messages (user:${userCount}, assistant:${assistantCount}, tool:${toolCount})`);
          // 保留前端累积的思考内容（后端消息不含 thinkingContent）
          if (accumulatedThinking) {
            const currentMessages = useChatStore.getState().messages;
            let lastAssistantIdx = -1;
            for (let i = result.messages.length - 1; i >= 0; i--) {
              if (result.messages[i].role === 'assistant') { lastAssistantIdx = i; break; }
            }
            if (lastAssistantIdx >= 0) {
              let existingThinking: string | undefined;
              for (let i = currentMessages.length - 1; i >= 0; i--) {
                if (currentMessages[i].role === 'assistant') { existingThinking = currentMessages[i].thinkingContent; break; }
              }
              if (existingThinking) {
                result.messages[lastAssistantIdx] = {
                  ...result.messages[lastAssistantIdx],
                  thinkingContent: existingThinking,
                };
              }
            }
          }
          // 使用后端返回的完整消息列表更新 chatStore
          setMessages(result.messages);
        } else {
          console.log('[InputArea] No messages in response, updating last message');
          updateLastMessage(accumulatedContent);
        }
      } else {
        updateLastMessage(`❌ 错误: ${result.error}`);
      }
    } catch (error: any) {
      updateLastMessage(`❌ 错误: ${error.message}`);
    } finally {
      setStreaming(false);
    }
  };

  const handleStop = async () => {
    if (isStreaming) {
      await window.electronAPI.chat.stop();
      setStreaming(false);
    }
  };

  const handleImageUpload = async () => {
    try {
const result = await window.electronAPI.file.selectImage();
      if (!result.canceled && result.data) {
        setImages(prev => [...prev, result.data!]);
      }
    } catch (error) {
      console.error('图片上传失败:', error);
    }
  };

  /**
   * 统一附件上传
   * 使用系统文件选择对话框，然后走和拖拽一样的保存流程
   */
  const handleAttachmentUpload = async () => {
    if (!currentConversationId) return;
    try {
      const result = await window.electronAPI.file.selectAndRead();
      if (result.canceled || !result.files || result.files.length === 0) return;

      for (const file of result.files) {
        const fileType = categorizeFile(file.name);
        const fileId = `pf-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

        // 添加 saving 状态
        setPendingFiles(prev => [...prev, {
          id: fileId,
          fileName: file.name,
          fileSize: file.size,
          fileType,
          savedPath: '',
          status: 'saving',
        }]);

        // 保存到工作空间（和拖拽走同一条路径）
        const saveResult = await window.electronAPI.sessionWorkspace.saveDroppedFile(
          currentConversationId,
          file.name,
          file.buffer,
        );

        if (saveResult.success && saveResult.savedPath) {
          setPendingFiles(prev =>
            prev.map(f => f.id === fileId ? {
              ...f,
              savedPath: saveResult.savedPath!,
              status: 'ready' as const,
            } : f)
          );
        } else {
          setPendingFiles(prev =>
            prev.map(f => f.id === fileId ? { ...f, status: 'error' as const } : f)
          );
        }
      }
    } catch (error) {
      console.error('文件选择失败:', error);
    }
  };

  /**
   * 移除附件
   */
  const handleRemoveAttachment = async (id: string) => {
    // 从附件列表中移除
    setAttachments((prev) => prev.filter((a) => a.id !== id));

    // 从存储中删除（可选，如果需要彻底删除）
    try {
      await window.electronAPI.attachment.delete(id);
    } catch (error) {
      console.error('删除附件失败:', error);
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRemovePendingFile = (id: string) => {
    setPendingFiles(prev => prev.filter(f => f.id !== id));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const hasContent = input.trim() || images.length > 0 || attachments.length > 0 || pendingFiles.some(f => f.status === 'ready');

return (
    <div className="glass border-t border-gray-200/50 p-2 flex-shrink-0 relative">
      {/* 视觉降级对话框 */}
      {visionFallbackOpen && (
        <VisionFallbackDialog
          modelName={useConfigStore.getState().getActiveConfig()?.model || '当前模型'}
          onChoose={handleVisionFallback}
          onClose={() => setVisionFallbackOpen(false)}
        />
      )}

      {/* 拖拽文件预览条 */}
      <FilePreviewBar files={pendingFiles} onRemove={handleRemovePendingFile} />
      <AnimatePresence>
        {/* 图片预览（保留向后兼容） */}
        {images.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 flex flex-wrap gap-3"
          >
            {images.map((image, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="relative inline-block"
              >
                <img
                  src={image}
                  alt="上传的图片"
                  className="w-20 h-20 object-cover rounded-xl border border-gray-200/50 bg-white/50"
                />
                <button
                  onClick={() => handleRemoveImage(index)}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500/90 backdrop-blur text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                >
                  <X size={12} />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* 附件列表 */}
        {attachments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <AttachmentList
              attachments={attachments}
              onRemove={handleRemoveAttachment}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative">
        <div className="flex flex-col gap-2 px-3 py-2 rounded-xl bg-white/60 border border-gray-200/50 shadow-sm focus-within:ring-2 focus-within:ring-primary-blue/30 focus-within:border-primary-blue transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Shift+Enter 换行)"
            className="w-full px-2 py-1 resize-none focus:outline-none text-cream-900 placeholder-cream-500 max-h-[200px] min-h-[32px] bg-transparent border-none scrollbar-hide"
            rows={1}
          />

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <button
                onClick={handleAttachmentUpload}
                className="p-1.5 rounded-lg transition-all hover:bg-gray-200/50 text-cream-500 hover:text-cream-700"
                title="上传附件（图片、文档等）"
              >
                <Paperclip size={16} />
              </button>
              <TokenIndicator />
              {/* 思考模式三态切换：auto → enabled → disabled */}
              {(() => {
                const thinkingMode = appSettings.thinkingMode ?? 'auto';
                const cycleThinkingMode = () => {
                  const next = thinkingMode === 'auto' ? 'enabled' : thinkingMode === 'enabled' ? 'disabled' : 'auto';
                  setThinkingMode(next);
                };
                const modeConfig: Record<string, { className: string; title: string }> = {
                  auto: { className: 'text-gray-400 hover:bg-gray-200/50 hover:text-gray-600', title: '思考模式：自动（服务器默认）' },
                  enabled: { className: 'bg-purple-100 text-purple-600 hover:bg-purple-200', title: '思考模式：强制开启' },
                  disabled: { className: 'bg-red-50 text-red-400 hover:bg-red-100', title: '思考模式：强制关闭' },
                };
                const cfg = modeConfig[thinkingMode];
                return (
                  <button
                    onClick={cycleThinkingMode}
                    className={`p-1.5 rounded-lg transition-all ${cfg.className}`}
                    title={cfg.title}
                  >
                    <Brain size={16} />
                  </button>
                );
              })()}
              {/* 新建对话 */}
              {onNewChat && (
                <button
                  onClick={onNewChat}
                  className="p-1.5 rounded-lg transition-all text-gray-500 bg-white/70 border border-gray-200/60 hover:bg-white hover:text-gray-700 hover:border-gray-300/70 shadow-sm"
                  title="新建对话"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    <line x1="12" y1="9" x2="12" y2="15"/>
                    <line x1="9" y1="12" x2="15" y2="12"/>
                  </svg>
                </button>
              )}
            </div>

            {isStreaming ? (
              <button
                onClick={handleStop}
                className="p-1.5 text-white rounded-lg shadow-sm hover:shadow-md transition-all bg-primary-orange"
                title="停止生成"
              >
                <StopCircle size={16} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!hasContent}
                className="p-1.5 text-white rounded-lg shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none hover:shadow-md transition-all bg-primary-blue"
                title="发送"
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

InputArea.displayName = 'InputArea';

export default InputArea;
