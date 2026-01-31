import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
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
    <div className="glass border-t border-white/10 p-6">
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
                className="w-20 h-20 object-cover rounded-xl border border-white/20 glass"
              />
              <motion.button
                onClick={() => handleRemoveImage(index)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500/90 backdrop-blur text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
              >
                <X size={12} />
              </motion.button>
            </motion.div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <motion.button
          onClick={handleImageUpload}
          whileHover={{ scale: 1.1, boxShadow: "0 0 15px rgba(167, 139, 250, 0.6)" }}
          whileTap={{ scale: 0.9 }}
          className="p-3 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10"
          title="上传图片"
        >
          <Paperclip size={20} />
        </motion.button>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Shift+Enter 换行)"
            className="w-full px-5 py-3 pr-12 resize-none glass-input rounded-xl focus:outline-none transition-all text-white/90 placeholder-white/40 max-h-[200px]"
            rows={1}
          />
        </div>

        {isStreaming ? (
          <motion.button
            onClick={handleStop}
            whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(239, 68, 68, 0.6)" }}
            whileTap={{ scale: 0.95 }}
            className="p-3 bg-gradient-to-br from-red-500 to-red-600 text-white rounded-xl shadow-lg neon-glow"
            title="停止生成"
          >
            <StopCircle size={20} />
          </motion.button>
        ) : (
          <motion.button
            onClick={handleSend}
            disabled={!input.trim() && images.length === 0}
            whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(167, 139, 250, 0.6)" }}
            whileTap={{ scale: 0.95 }}
            className="p-3 bg-gradient-to-br from-purple-500 to-blue-500 text-white rounded-xl shadow-lg neon-glow disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            title="发送"
          >
            <Send size={20} />
          </motion.button>
        )}
      </div>
    </div>
  );
};

export default InputArea;
