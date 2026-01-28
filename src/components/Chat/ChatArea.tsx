import React, { useEffect } from 'react';
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
    <div className="flex-1 flex flex-col bg-gray-50">
      <div className="border-b border-gray-200 bg-white px-4 py-3 flex gap-2">
        <button
          onClick={handleNewChat}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <Plus size={16} />
          <span>新建对话</span>
        </button>
        <button
          onClick={() => setConfigOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <Settings size={16} />
          <span>设置</span>
        </button>
      </div>
      <MessageList />
      <InputArea />
    </div>
  );
};

export default ChatArea;
