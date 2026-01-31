import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Settings } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useConversationStore } from '../../store/conversationStore';
import { useConfigStore } from '../../store/configStore';
import MessageList from './MessageList';
import InputArea from './InputArea';

const ChatArea: React.FC = () => {
  const { setConversationId } = useChatStore();
  const { currentConversationId, createConversation } = useConversationStore();
  const { setConfigOpen } = useConfigStore();

  useEffect(() => {
    if (!currentConversationId) {
      const newId = createConversation();
      setConversationId(newId);
    }
  }, [currentConversationId, createConversation, setConversationId]);

  const handleNewChat = () => {
    createConversation();
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="glass border-b border-white/10 px-6 py-4 flex gap-3">
        <motion.button
          onClick={handleNewChat}
          whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(167, 139, 250, 0.6)" }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white/90 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10"
        >
          <Plus size={16} />
          <span>新建对话</span>
        </motion.button>
        <motion.button
          onClick={() => setConfigOpen(true)}
          whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(167, 139, 250, 0.6)" }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white/90 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10"
        >
          <Settings size={16} />
          <span>设置</span>
        </motion.button>
      </div>
      <MessageList />
      <InputArea />
    </div>
  );
};

export default ChatArea;
