import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Sparkles, FileText } from 'lucide-react';
import { useTemplateStore } from '../../store/templateStore';
import { useChatStore } from '../../store/chatStore';

const AssistantPanel: React.FC = () => {
  const {
    isAssistantPanelOpen,
    selectedAssistant,
    setAssistantPanelOpen,
    useAssistant,
  } = useTemplateStore();

  const { addMessage, setStreaming, isStreaming } = useChatStore();

  const [input, setInput] = useState('');
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [turnCount, setTurnCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 重置状态当助手面板打开时
  useEffect(() => {
    if (isAssistantPanelOpen && selectedAssistant) {
      setInput('');
      setConversationHistory([]);
      setTurnCount(0);
    }
  }, [isAssistantPanelOpen, selectedAssistant]);

  // 自动调整文本框高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [input]);

  const handleClose = () => {
    setAssistantPanelOpen(false);
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedAssistant) return;
    if (isStreaming) return;

    const userMessage = input.trim();
    setInput('');

    // 添加到历史记录
    setConversationHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    setTurnCount(prev => prev + 1);

    // 添加用户消息到聊天区域
    addMessage({
      id: Date.now().toString(),
      role: 'user',
      content: `[${selectedAssistant.name}] ${userMessage}`,
      timestamp: Date.now(),
    });

    setStreaming(true);

    try {
      // 调用助手工具 - 直接返回 AssistantResult
      const assistantResult = await useAssistant({
        assistantId: selectedAssistant.id,
        input: userMessage,
      });

      // 添加助手回复到历史
      setConversationHistory(prev => [...prev, { role: 'assistant', content: assistantResult.content }]);

      // 使用系统提示词调用 LLM
      const chatMessages = [
        { role: 'system' as const, content: selectedAssistant.systemPrompt },
        { role: 'user' as const, content: assistantResult.content },
      ];

      let accumulatedContent = '';

      const handleChunk = (chunk: string) => {
        accumulatedContent += chunk;
      };

      const removeChunkListener = window.electronAPI.onChatChunk(handleChunk);

      const streamResult = await window.electronAPI.chat.stream(chatMessages);

      removeChunkListener();

      if (streamResult.success) {
        // 添加助手回复到聊天区域
        addMessage({
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: accumulatedContent,
          timestamp: Date.now(),
        });

        // 如果需要导出 Word 文档
        if (selectedAssistant.outputFormat === 'word' && selectedAssistant.outputTemplateId) {
          // TODO: 实现导出 Word 功能
        }
      } else {
        addMessage({
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `❌ 错误: ${streamResult.error}`,
          timestamp: Date.now(),
        });
      }
    } catch (error: any) {
      addMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ 错误: ${error.message}`,
        timestamp: Date.now(),
      });
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const maxTurns = selectedAssistant?.maxTurns || 5;
  const canContinue = selectedAssistant?.enableMultiTurn && turnCount < maxTurns;

  return (
    <AnimatePresence>
      {isAssistantPanelOpen && selectedAssistant && (
        <motion.div
          initial={{ opacity: 0, x: 300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 300 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed right-0 top-0 h-full w-[400px] glass border-l border-gray-200/50 shadow-xl z-50 flex flex-col"
        >
          {/* 头部 */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-orange to-primary-yellow flex items-center justify-center">
                <Sparkles size={18} className="text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-cream-900">{selectedAssistant.name}</h3>
                <p className="text-xs text-gray-500">{selectedAssistant.description}</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1 rounded-lg hover:bg-gray-200/60 transition-colors text-gray-500"
            >
              <X size={20} />
            </button>
          </div>

          {/* 对话历史 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {conversationHistory.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Sparkles size={48} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm">输入内容开始对话</p>
                <p className="text-xs mt-1">{selectedAssistant.description}</p>
              </div>
            ) : (
              conversationHistory.map((msg, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-3 py-2 rounded-xl ${
                      msg.role === 'user'
                        ? 'bg-primary-blue text-white'
                        : 'bg-white/60 text-cream-900 border border-gray-200/50'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                </motion.div>
              ))
            )}

            {isStreaming && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div className="bg-white/60 px-3 py-2 rounded-xl border border-gray-200/50">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-primary-blue rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-primary-blue rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-primary-blue rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* 输入区域 */}
          <div className="p-4 border-t border-gray-200/50">
            {selectedAssistant.enableMultiTurn && (
              <div className="mb-2 text-xs text-gray-500 flex items-center justify-between">
                <span>对话轮次: {turnCount} / {maxTurns}</span>
                {turnCount >= maxTurns && (
                  <span className="text-amber-600">已达到最大轮次</span>
                )}
              </div>
            )}

            <div className="relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入内容..."
                disabled={isStreaming || (!canContinue && turnCount > 0)}
                className="w-full px-3 py-2 pr-10 rounded-xl bg-white/60 border border-gray-200/50 focus:outline-none focus:ring-2 focus:ring-primary-blue/30 text-sm resize-none max-h-[150px] disabled:opacity-50"
                rows={1}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming || (!canContinue && turnCount > 0)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white rounded-lg bg-primary-blue disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-blue/90 transition-colors"
              >
                <Send size={14} />
              </button>
            </div>

            {selectedAssistant.outputFormat === 'word' && (
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                <FileText size={14} />
                <span>将生成 Word 文档</span>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AssistantPanel;
