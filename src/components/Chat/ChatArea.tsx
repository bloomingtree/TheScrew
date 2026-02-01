import React, { useEffect, useState, useRef } from 'react';
import { Folder } from 'lucide-react';
import { useConversationStore } from '../../store/conversationStore';
import { useChatStore } from '../../store/chatStore';
import MessageList from './MessageList';
import InputArea from './InputArea';
import WorkspaceSelector from '../Workspace/WorkspaceSelector';

const ChatArea: React.FC = () => {
  const { currentConversationId, createConversation, conversations, updateConversationMessages } = useConversationStore();
  const { setMessages, clearMessages, messages } = useChatStore();
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [showWorkspaceSelector, setShowWorkspaceSelector] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const hasInitialized = useRef(false);

  useEffect(() => {
    console.log('workspacePath 状态变化:', workspacePath);
  }, [workspacePath]);

  // 初始化时创建对话（使用 ref 确保只执行一次）
  useEffect(() => {
    if (hasInitialized.current) {
      console.log('[ChatArea] Already initialized, skipping');
      return;
    }
    hasInitialized.current = true;

    console.log('[ChatArea] Initializing, currentConversationId:', currentConversationId);

    // 只有当确实没有对话时才创建新对话
    const state = useConversationStore.getState();
    if (!currentConversationId && state.conversations.length === 0) {
      console.log('[ChatArea] Creating first conversation');
      createConversation();
    } else {
      console.log('[ChatArea] Conversation exists, skipping creation');
    }
    loadWorkspacePath();
  }, []); // 只在组件挂载时执行一次

  // 切换对话时加载历史消息（只在 currentConversationId 变化时）
  useEffect(() => {
    if (!currentConversationId) return;

    setIsLoadingConversation(true);
    // 从 conversationStore 中获取当前对话
    const state = useConversationStore.getState();
    const conversation = state.conversations.find(c => c.id === currentConversationId);
    if (conversation && conversation.messages.length > 0) {
      setMessages(conversation.messages);
    } else {
      clearMessages();
    }
    setIsLoadingConversation(false);
  }, [currentConversationId, setMessages, clearMessages]); // 只依赖 currentConversationId

  // 同步消息到 conversationStore（当不是正在加载时）
  useEffect(() => {
    if (!isLoadingConversation && currentConversationId && messages.length > 0) {
      updateConversationMessages(currentConversationId, messages);
    }
  }, [messages, currentConversationId, isLoadingConversation, updateConversationMessages]);

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

  const handleNewChat = () => {
    createConversation();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F5F5F0]">
      <div className="bg-white/80 backdrop-blur border-b border-gray-200/50 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex gap-3">
          <button
            onClick={() => setShowWorkspaceSelector(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs rounded-lg transition-all border border-gray-200 shadow-sm hover:shadow-md bg-white text-[#374151]"
          >
            <Folder size={14} />
            <span className="truncate max-w-[300px]">
              {workspacePath ? workspacePath.split(/[\\/]/).pop() : '选择工作空间'}
            </span>
          </button>
          <button
            onClick={handleNewChat}
            className="flex items-center gap-2 px-4 py-2 text-xs rounded-lg transition-all border border-gray-200 shadow-sm hover:shadow-md bg-white text-[#374151]"
            title="新建对话"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              <line x1="12" y1="9" x2="12" y2="15"/>
              <line x1="9" y1="12" x2="15" y2="12"/>
            </svg>
            <span className="font-medium">新建对话</span>
          </button>
        </div>
        <div className="text-xs text-[#374151]">
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
