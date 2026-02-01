import React, { useEffect, useState } from 'react';
import { Folder } from 'lucide-react';
import { useConversationStore } from '../../store/conversationStore';
import { useChatStore } from '../../store/chatStore';
import MessageList from './MessageList';
import InputArea from './InputArea';
import WorkspaceSelector from '../Workspace/WorkspaceSelector';

const ChatArea: React.FC = () => {
  const { currentConversationId, createConversation } = useConversationStore();
  const { clearMessages } = useChatStore();
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [showWorkspaceSelector, setShowWorkspaceSelector] = useState(false);

  useEffect(() => {
    console.log('workspacePath 状态变化:', workspacePath);
  }, [workspacePath]);

  useEffect(() => {
    if (!currentConversationId) {
      createConversation();
    } else {
      clearMessages();
    }
    loadWorkspacePath();
  }, [currentConversationId, createConversation, clearMessages]);

  const loadWorkspacePath = async () => {
    try {
      console.log('加载工作空间路径...');
      const result = await window.electronAPI.workspace.getPath();
      console.log('获取到的路径:', result);
      if (result.path) {
        console.log('设置工作空间路径到状态:', result.path);
        setWorkspacePath(result.path);
      } else {
        console.log('未找到保存的工作空间路径');
      }
    } catch (error) {
      console.error('Failed to load workspace path:', error);
    }
  };

  const handleWorkspaceSelect = async (path: string) => {
    try {
      console.log('ChatArea: 设置工作空间路径:', path);
      await window.electronAPI.workspace.setPath(path);
      console.log('ChatArea: electronAPI 设置完成');
      setWorkspacePath(path);
      console.log('ChatArea: 本地状态已更新:', path);
    } catch (error) {
      console.error('Failed to set workspace path:', error);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="glass border-b border-gray-200/50 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex gap-3">
          <button
            onClick={() => setShowWorkspaceSelector(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs rounded-xl transition-all border border-gray-200/50 shadow-sm hover:shadow-md bg-button-bg text-button-text"
          >
            <Folder size={14} />
            <span className="truncate max-w-[300px]">
              {workspacePath ? workspacePath.split(/[\\/]/).pop() : '选择工作空间'}
            </span>
          </button>
        </div>
        <div className="text-xs text-primary-blue">
          AI 螺丝钉
        </div>
      </div>
      <div className="flex-1 overflow-hidden min-h-0">
        <MessageList />
      </div>
      <div className="flex-shrink-0">
        <InputArea />
      </div>
      <WorkspaceSelector
        isOpen={showWorkspaceSelector}
        onClose={() => setShowWorkspaceSelector(false)}
        onWorkspaceSelect={handleWorkspaceSelect}
      />
    </div>
  );
};

export default ChatArea;
