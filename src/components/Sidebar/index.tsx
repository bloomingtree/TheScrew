import React, { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConversationStore } from '../../store/conversationStore';
import { useConfigStore } from '../../store/configStore';

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
      animate={{ width: isOpen ? 256 : 48 }}
      transition={{ duration: 0.1, ease: 'easeOut' }}
      className="backdrop-blur-sm border-r border-gray-200/50 flex flex-col overflow-hidden flex-shrink-0 relative"
      style={{backgroundColor: 'rgba(255, 255, 255, 0.6)'}}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {/* 设置按钮 */}
      <div className="p-2 border-b border-gray-200/50">
        <button
          onClick={() => setConfigOpen(true)}
          className={`w-full flex items-center gap-2 overflow-hidden rounded-md hover:bg-gray-200/60 active:bg-gray-300/60 transition-[width,height,padding] text-gray-600 hover:text-gray-900 text-sm ${isOpen ? 'h-8 py-2 px-1.5 justify-start' : '!size-8 !pl-1.5 !pr-2 justify-start'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.39a2 2 0 0 0-2.73-.73l-.15-.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <span className="text-sm truncate">设置</span>
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
            <div className="p-2">
              <h2 className="text-xs font-semibold text-cream-500 mb-3 uppercase tracking-wider">历史对话</h2>
              <div className="space-y-2">
                {conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    onClick={() => handleSelectConversation(conversation.id)}
                    className={`group relative py-2 px-3 rounded-xl cursor-pointer transition-all ${
                      currentConversationId === conversation.id
                        ? 'bg-primary-blue/10 border-primary-blue/30 border shadow-sm'
                        : 'hover:bg-white/60 border border-gray-200/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare size={14} className="text-cream-500" />
                      <span className="text-sm text-cream-900 truncate flex-1">
                        {conversation.title}
                      </span>
                    </div>
                    <div className="text-[10px] text-cream-400 mt-1">
                      {new Date(conversation.updatedAt).toLocaleDateString('zh-CN')}
                    </div>

                    <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={(e) => handleDeleteConversation(e, conversation.id)}
                        className="p-1 hover:bg-red-100 rounded text-red-500 transition-colors"
                        title="删除"
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
