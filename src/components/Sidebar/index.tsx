import React from 'react';
import { Plus, Settings, MessageSquare } from 'lucide-react';
import { useConversationStore } from '../../store/conversationStore';
import { useConfigStore } from '../../store/configStore';

const Sidebar: React.FC = () => {
  const { 
    conversations, 
    currentConversationId,
    createConversation, 
    deleteConversation, 
    selectConversation, 
    renameConversation 
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

  const handleRenameConversation = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newTitle = window.prompt('请输入新的对话名称：');
    if (newTitle) {
      renameConversation(id, newTitle);
    }
  };

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          <span>新建对话</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <h2 className="text-sm font-semibold text-gray-500 mb-2">历史对话</h2>
          <div className="space-y-2">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => handleSelectConversation(conversation.id)}
                className={`group relative p-3 rounded-lg cursor-pointer transition-colors ${
                  currentConversationId === conversation.id
                    ? 'bg-blue-50 border-blue-200 border'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-700 truncate flex-1">
                    {conversation.title}
                  </span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {new Date(conversation.updatedAt).toLocaleDateString()}
                </div>

                <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex gap-1">
                  <button
                    onClick={(e) => handleRenameConversation(e, conversation.id)}
                    className="p-1 hover:bg-gray-200 rounded"
                    title="重命名"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => handleDeleteConversation(e, conversation.id)}
                    className="p-1 hover:bg-red-100 rounded text-red-500"
                    title="删除"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-gray-200">
        <button
          onClick={() => setConfigOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <Settings size={18} />
          <span>设置</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
