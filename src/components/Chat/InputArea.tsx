import React, { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, X, StopCircle } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useConfigStore } from '../../store/configStore';

const InputArea: React.FC = () => {
  const [input, setInput] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const { messages, isStreaming, addMessage, updateLastMessage, setStreaming } = useChatStore();
  const { apiKey } = useConfigStore();

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

    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: input.trim(),
      timestamp: Date.now(),
      images: images.length > 0 ? images : undefined,
    };

    addMessage(userMessage);
    setInput('');
    setImages([]);

    const assistantMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant' as const,
      content: '',
      timestamp: Date.now(),
    };

    addMessage(assistantMessage);
    setStreaming(true);

    try {
      const chatMessages = messages
        .filter(m => m.role !== 'assistant' || m.content.trim())
        .map(m => ({
          role: m.role,
          content: m.content,
        }));

      let accumulatedContent = '';

      const handleChunk = (chunk: string) => {
        accumulatedContent += chunk;
        updateLastMessage(accumulatedContent);
      };

      const removeListener = window.electronAPI.onChatChunk(handleChunk);

      const result = await window.electronAPI.chat.stream(chatMessages);

      removeListener();

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
      if (!result.canceled) {
        setImages(prev => [...prev, result.data]);
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
    <div className="border-t border-gray-200 bg-white p-4">
      {images.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {images.map((image, index) => (
            <div key={index} className="relative inline-block">
              <img
                src={image}
                alt="上传的图片"
                className="w-20 h-20 object-cover rounded-lg border border-gray-200"
              />
              <button
                onClick={() => handleRemoveImage(index)}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleImageUpload}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          title="上传图片"
        >
          <Paperclip size={20} />
        </button>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Shift+Enter 换行)"
            className="w-full px-4 py-2 pr-12 resize-none border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent max-h-[200px]"
            rows={1}
          />
        </div>

        {isStreaming ? (
          <button
            onClick={handleStop}
            className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            title="停止生成"
          >
            <StopCircle size={20} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim() && images.length === 0}
            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            title="发送"
          >
            <Send size={20} />
          </button>
        )}
      </div>
    </div>
  );
};

export default InputArea;
