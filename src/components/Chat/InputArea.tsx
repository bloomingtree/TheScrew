import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { motion } from 'framer-motion';
import { Send, Paperclip, X, StopCircle } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useConfigStore } from '../../store/configStore';
import { useConversationStore } from '../../store/conversationStore';
import TokenIndicator from './TokenIndicator';

const InputArea: React.FC = () => {
  const [input, setInput] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

const { messages, isStreaming, addMessage, updateLastMessage, updateLastMessageToolCalls, setMessages, setStreaming, setToolCalls, setToolResults, startToolExecution, completeToolExecution, setTokenUsage } = useChatStore();
  const { apiKey } = useConfigStore();
  const { currentConversationId, generateTitle } = useConversationStore();

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const handleSend = async () => {
    if (!input.trim() && images.length === 0) return;
    if (isStreaming) return;
    if (!apiKey) {
      alert('请先配置 API Key');
      return;
    }

    const userInput = input.trim();
    const userImages = images.length > 0 ? images : undefined;

    const userMessage = {
      role: 'user',
      content: userInput,
      timestamp: Date.now(),
    };

    setInput('');
    setImages([]);

    // 添加用户消息
    addMessage(userMessage);
    setStreaming(true);

    // 标记是否已创建 assistant 消息
    let assistantMessageCreated = false;
    // 声明累积内容变量（在函数定义之前）
    let accumulatedContent = '';

    const ensureAssistantMessage = () => {
      if (!assistantMessageCreated) {
        const assistantMessage = {
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
        };
        addMessage(assistantMessage);
        assistantMessageCreated = true;
        accumulatedContent = '';  // 新消息创建时重置累积内容
      }
    };

    if (currentConversationId && messages.length === 1) {
      generateTitle(currentConversationId, userInput);
    }

    try {
      // 获取最新的 messages 状态（确保包含刚添加的用户消息）
      const latestMessages = useChatStore.getState().messages;
      console.log('[InputArea] Sending', latestMessages.length, 'messages to backend');

      const handleChunk = (chunk: string) => {
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
        // 用后端返回的完整消息序列替换当前 messages
        if (result.messages) {
          const userCount = result.messages.filter((m: any) => m.role === 'user').length;
          const assistantCount = result.messages.filter((m: any) => m.role === 'assistant').length;
          const toolCount = result.messages.filter((m: any) => m.role === 'tool').length;
          console.log('[InputArea] Received', result.messages.length, `messages (user:${userCount}, assistant:${assistantCount}, tool:${toolCount})`);
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

  const handleRemoveImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

return (
    <div className="glass border-t border-gray-200/50 p-2 flex-shrink-0">
      {images.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-3">
          {images.map((image, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
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
        </div>
      )}

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
                onClick={handleImageUpload}
                className="p-1.5 rounded-lg transition-all hover:bg-gray-200/50 text-cream-500 hover:text-cream-700"
                title="上传图片"
              >
                <Paperclip size={16} />
              </button>
              <TokenIndicator />
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
                disabled={!input.trim() && images.length === 0}
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
};

export default InputArea;
