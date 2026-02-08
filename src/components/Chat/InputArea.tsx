import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Send, Paperclip, X, StopCircle } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useConfigStore } from '../../store/configStore';
import { useConversationStore } from '../../store/conversationStore';

const InputArea: React.FC = () => {
  const [input, setInput] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

const { messages, isStreaming, addMessage, updateLastMessage, updateLastMessageToolCalls, setStreaming, setToolCalls, setToolResults, startToolExecution, completeToolExecution } = useChatStore();
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
      id: Date.now().toString(),
      role: 'user' as const,
      content: userInput,
      timestamp: Date.now(),
      images: userImages,
    };

    setInput('');
    setImages([]);

    const assistantMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant' as const,
      content: '',
      timestamp: Date.now(),
    };

addMessage(userMessage);
    addMessage(assistantMessage);
    setStreaming(true);

    if (currentConversationId && messages.length === 0) {
      // await generateTitle(currentConversationId, userInput);
      // 不阻塞发送，异步生成标题
      generateTitle(currentConversationId, userInput);
    }

    try {
      const chatMessages = messages
        .filter(m => m.role !== 'assistant' || m.content.trim())
        .map(m => ({
          role: m.role,
          content: m.content,
        }));

      chatMessages.push({
        role: 'user',
        content: userInput,
      });

      let accumulatedContent = '';

      const handleChunk = (chunk: string) => {
        accumulatedContent += chunk;
        updateLastMessage(accumulatedContent);
      };

      const handleToolCalls = (toolCalls: any[]) => {
        updateLastMessageToolCalls(toolCalls);
        setToolCalls(toolCalls);
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

      const removeChunkListener = window.electronAPI.onChatChunk(handleChunk);
      const removeToolCallsListener = window.electronAPI.onToolCalls(handleToolCalls);
      const removeToolResultsListener = window.electronAPI.onToolResults(handleToolResults);
      const removeToolStartListener = window.electronAPI.onToolStart(handleToolStart);
      const removeToolCompleteListener = window.electronAPI.onToolComplete(handleToolComplete);

      const result = await window.electronAPI.chat.stream(chatMessages, currentConversationId || undefined);

      removeChunkListener();
      removeToolCallsListener();
      removeToolResultsListener();
      removeToolStartListener();
      removeToolCompleteListener();

      if (result.success) {
        updateLastMessage(accumulatedContent);
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
            <button
              onClick={handleImageUpload}
              className="p-1.5 rounded-lg transition-all hover:bg-gray-200/50 text-cream-500 hover:text-cream-700"
              title="上传图片"
            >
              <Paperclip size={16} />
            </button>

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
