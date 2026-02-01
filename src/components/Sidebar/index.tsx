import React from 'react';
import { Settings, MessageSquare, ChevronLeft, ChevronRight, Pencil, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConversationStore } from '../../store/conversationStore';
import { useConfigStore } from '../../store/configStore';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onToggle }) => {
  const {
    conversations,
    currentConversationId,
    createConversation,
    deleteConversation,
    selectConversation
  } = useConversationStore();

  const { setConfigOpen } = useConfigStore();

  const handleNewChat = () => {
    createConversation();
  };

  const handleSelectConversation = (id: string) => {
    selectConversation(id);
  };

  const handleDeleteConversation = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('确定要删除这个对话吗？')) {
      deleteConversation(id);
    }
  };

  return (
    <motion.div
      initial={{ width: 64 }}
      animate={{ width: isOpen ? 256 : 64 }}
      transition={{ duration: 0.2 }}
      className="backdrop-blur-sm border-r border-gray-200/50 flex flex-col overflow-hidden flex-shrink-0 relative"
      style={{backgroundColor: 'rgba(255, 255, 255, 0.6)'}}
    >
      <div className="p-2 border-b border-gray-200/50">
        <button
          onClick={() => setConfigOpen(true)}
          className="w-full flex items-center justify-center gap-2 p-1 rounded-xl hover:shadow-md transition-all border border-gray-200/50 bg-button-bg text-button-text"
        >
          <Settings size={16} />
          {isOpen && <span className="text-sm">设置</span>}
        </button>
      </div>

      <div className="p-2 border-b border-gray-200/50">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center justify-center gap-2 p-1 rounded-xl hover:shadow-md hover:opacity-90 transition-all text-white bg-primary-orange"
        >
          <Pencil size={18} />
          {isOpen && <span className="text-sm font-medium">新建对话</span>}
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
                        {conversation.title === '新对话' ? (
                          <span className="flex items-center gap-2">
                            <Loader2 size={12} className="animate-spin" />
                            正在生成标题...
                          </span>
                        ) : (
                          conversation.title
                        )}
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

      <button
        onClick={onToggle}
        className="absolute right-4 bottom-4 z-20 backdrop-blur-sm p-2 rounded-full shadow-md border border-gray-200/50 hover:bg-white hover:shadow-md transition-all bg-white/80 text-button-text"
      >
        {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>


    </motion.div>
  );
};

export default Sidebar;
