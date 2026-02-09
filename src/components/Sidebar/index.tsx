import React, { useState } from 'react';
import { MessageSquare, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConversationStore } from '../../store/conversationStore';
import { useConfigStore } from '../../store/configStore';

// 终端风格色彩常量
const TERMINAL = {
  bg: '#1a1b26',
  bgSecondary: '#24283b',
  bgTertiary: '#414868',
  lightBg: '#fff8f0',
  green: '#9ece6a',
  orange: '#ff9e64',
  blue: '#7aa2f7',
  cyan: '#2ac3de',
  purple: '#bb9af7',
  pink: '#f7768e',
  yellow: '#e0af68',
  textPrimary: '#c0caf5',
  textSecondary: '#565f89',
  textDark: '#1a1b26',
};

interface SidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

const Sidebar: React.FC<SidebarProps> = () => {
  const [isOpen, setIsOpen] = useState(false);
  const {
    conversations,
    currentConversationId,
    deleteConversation,
    selectConversation
  } = useConversationStore();

  const { setConfigOpen } = useConfigStore();

  const handleSelectConversation = (id: string) => {
    selectConversation(id);
  };

  const handleDeleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteConversation(id);
  };

  return (
    <motion.div
      initial={{ width: 48 }}
      animate={{ width: isOpen ? 280 : 48 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="backdrop-blur-sm border-r font-mono flex flex-col overflow-hidden flex-shrink-0 relative"
      style={{
        backgroundColor: 'rgba(255, 248, 240, 0.8)',
        borderColor: 'rgba(65, 72, 104, 0.2)',
      }}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {/* 设置按钮 - 终端风格 */}
      <div
        className="py-3 px-2 border-b"
        style={{ borderColor: 'rgba(65, 72, 104, 0.15)', minWidth: '48px' }}
      >
        <button
          onClick={() => setConfigOpen(true)}
          className={`flex items-center gap-2 overflow-hidden rounded-lg transition-all font-mono text-sm ${
            isOpen
              ? 'w-full h-8 py-2 px-2 justify-start'
              : '!size-8 !px-2 justify-start'
          }`}
          style={{
            background: 'rgba(255, 255, 255, 0.6)',
            border: '1px solid rgba(65, 72, 104, 0.2)',
            color: TERMINAL.textSecondary,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(42, 195, 222, 0.1)';
            e.currentTarget.style.borderColor = 'rgba(42, 195, 222, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.6)';
            e.currentTarget.style.borderColor = 'rgba(65, 72, 104, 0.2)';
          }}
        >
          <div className="flex items-center gap-2">
            <Settings size={16} className="shrink-0" />
            {isOpen && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm truncate"
                style={{ color: TERMINAL.textDark }}
              >
                设置
              </motion.span>
            )}
          </div>
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex-1 overflow-y-auto"
          >
            <div className="p-3">
              <h2
                className="text-xs font-semibold mb-3 uppercase tracking-wider flex items-center gap-2"
                style={{ color: TERMINAL.textSecondary }}
              >
                <span style={{ color: TERMINAL.green }}>$</span>
                历史对话
              </h2>
              <div className="space-y-2">
                {conversations.map((conversation, index) => (
                  <div
                    key={conversation.id}
                    onClick={() => handleSelectConversation(conversation.id)}
                    className={`group relative cursor-pointer transition-all font-mono ${
                      currentConversationId === conversation.id
                        ? ''
                        : ''
                    }`}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '10px',
                      border: '1px solid',
                      background:
                        currentConversationId === conversation.id
                          ? 'rgba(122, 162, 247, 0.1)'
                          : 'rgba(255, 255, 255, 0.5)',
                      borderColor:
                        currentConversationId === conversation.id
                          ? 'rgba(122, 162, 247, 0.3)'
                          : 'rgba(65, 72, 104, 0.15)',
                    }}
                    onMouseEnter={(e) => {
                      if (currentConversationId !== conversation.id) {
                        e.currentTarget.style.background = 'rgba(42, 195, 222, 0.08)';
                        e.currentTarget.style.borderColor = 'rgba(42, 195, 222, 0.25)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentConversationId !== conversation.id) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.5)';
                        e.currentTarget.style.borderColor = 'rgba(65, 72, 104, 0.15)';
                      }
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {/* 序号 */}
                      <span
                        className="text-xs shrink-0 w-4"
                        style={{ color: 'rgba(86, 95, 137, 0.6)' }}
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>

                      {/* 标题区域 */}
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <MessageSquare size={14} style={{ color: TERMINAL.cyan, marginTop: '2px' }} />
                        <div className="flex-1 min-w-0">
                          <span
                            className="text-sm truncate block"
                            style={{
                              color:
                                currentConversationId === conversation.id
                                  ? TERMINAL.blue
                                  : TERMINAL.textDark,
                              fontWeight:
                                currentConversationId === conversation.id ? 500 : 400,
                            }}
                          >
                            {conversation.title}
                          </span>
                          <div className="text-[10px] mt-1" style={{ color: TERMINAL.textSecondary }}>
                            {new Date(conversation.updatedAt).toLocaleDateString('zh-CN')}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 删除按钮 */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleDeleteConversation(e, conversation.id)}
                        className="p-1.5 hover:bg-red-100 rounded text-red-500 transition-colors font-mono text-xs"
                        title="删除"
                        style={{ fontSize: '10px' }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default Sidebar;
