import React, { useEffect, useState, useRef } from 'react';
import { useConversationStore } from '../../store/conversationStore';
import { useChatStore } from '../../store/chatStore';
import MessageList from './MessageList';
import InputArea from './InputArea';
import WorkspaceSelector from '../Workspace/WorkspaceSelector';
import DropZone from './DropZone';
import UserQuestionDialog from './UserQuestionDialog';

const ChatArea: React.FC = () => {
  const { currentConversationId, createConversation, updateConversationMessages } = useConversationStore();
  const { messages, setMessages, clearMessages, isStreaming } = useChatStore();
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [showWorkspaceSelector, setShowWorkspaceSelector] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<{
    questionId: string;
    question: string;
    options: Array<{ label: string; value: string; description?: string }>;
    allow_custom: boolean;
    custom_placeholder: string;
  } | null>(null);
  const hasInitialized = useRef(false);
  const lastSyncedMessagesRef = useRef<any[]>([]);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);
  const inputAreaRef = useRef<{ handleDroppedFiles: (files: File[]) => void } | null>(null);

  // 初始化时创建对话（使用 ref 确保只执行一次）
  useEffect(() => {
    if (hasInitialized.current) {
      return;
    }
    hasInitialized.current = true;

    // 只有当确实没有对话时才创建新对话
    const state = useConversationStore.getState();
    if (!currentConversationId && state.conversations.length === 0) {
      createConversation();
    }
    loadWorkspacePath();
  }, []); // 只在组件挂载时执行一次

  // 切换对话时加载历史消息（只在 currentConversationId 变化时）
  useEffect(() => {
    if (!currentConversationId) return;

    // 如果正在流式传输（比如用户切换了标签页又切回来），不要用 conversationStore 覆盖 chatStore
    // 因为流式传输期间不同步到 conversationStore，conversationStore 数据是过时的
    const chatState = useChatStore.getState();
    if (chatState.isStreaming && chatState.messages.length > 0) {
      console.log('[ChatArea] 流式传输中，跳过从 conversationStore 加载');
      return;
    }

    setIsLoadingConversation(true);
    // 重置同步 ref，防止新对话被错误跳过同步
    lastSyncedMessagesRef.current = [];

    // 从 conversationStore 中获取当前对话
    const state = useConversationStore.getState();
    const conversation = state.conversations.find(c => c.id === currentConversationId);
    if (conversation && conversation.messages.length > 0) {
      setMessages(conversation.messages);
      // 加载后立即更新 ref，避免立即触发同步
      lastSyncedMessagesRef.current = conversation.messages;
    } else {
      clearMessages();
    }
    setIsLoadingConversation(false);
  }, [currentConversationId, setMessages, clearMessages]); // 只依赖 currentConversationId

  // 同步消息到 conversationStore（只在流式处理完成后、且消息真正变化时）
  useEffect(() => {
    // 只在非加载、非流式处理、有对话ID、有消息时同步
    if (isLoadingConversation || isStreaming || !currentConversationId) {
      return;
    }

    // 如果消息没有真正变化（只是重新渲染），跳过同步
    // 使用消息 ID 和长度对比代替 JSON.stringify，避免循环引用崩溃
    const prev = lastSyncedMessagesRef.current;
    if (messages.length === prev.length && messages.length > 0) {
      const sameContent = messages.every((msg, i) =>
        msg.id === prev[i]?.id && msg.role === prev[i]?.role
      );
      if (sameContent) return;
    }

    // 只有当 messages 有内容时才同步
    if (messages.length > 0) {
      updateConversationMessages(currentConversationId, messages);
      lastSyncedMessagesRef.current = messages;
    }
  }, [messages, currentConversationId, isLoadingConversation, isStreaming, updateConversationMessages]);

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

  // 监听工作空间路径变更（来自 Sidebar 或其他组件的选择）
  useEffect(() => {
    const unsub = window.electronAPI.workspace.onWorkspaceChanged((newPath: string) => {
      setWorkspacePath(newPath);
    });
    return unsub;
  }, []);

  // 监听定时任务/后台注入的消息事件
  useEffect(() => {
    const unsubMessageInjected = window.electronAPI.onMessageInjected(async (data) => {
      const convId = data?.conversationId;
      if (!convId) return;

      // refresh 信号：agent turn 完成，后端已把新消息持久化，前端重新拉取
      if ((data as any).refresh) {
        // 刷新对话列表（新对话顺序、updatedAt 等）
        await useConversationStore.getState().loadFromDatabase();
        // 若注入的目标就是当前激活对话，重新加载消息
        if (convId === useConversationStore.getState().currentConversationId) {
          try {
            const result = await window.electronAPI.message.getByConversationId(convId);
            if (result?.success && Array.isArray(result.data)) {
              setMessages(result.data);
              lastSyncedMessagesRef.current = result.data;
              useConversationStore.getState().updateConversationMessages(convId, result.data);
            }
          } catch (e) {
            console.error('[ChatArea] Failed to reload messages after refresh:', e);
          }
        }
        return;
      }

      // 单条注入消息（提醒型 assistant / agent 触发 user 消息）
      const injected = data.message;
      if (!injected) return;

      // 先刷新对话列表（可能是新建的对话）
      await useConversationStore.getState().loadFromDatabase();

      // 若目标就是当前激活对话，追加到 chatStore 并同步到 conversationStore
      if (convId === useConversationStore.getState().currentConversationId) {
        const newMsg = {
          id: `injected-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: injected.role,
          content: injected.content,
          timestamp: Date.now(),
        };
        setMessages([...useChatStore.getState().messages, newMsg]);
        lastSyncedMessagesRef.current = [...useChatStore.getState().messages];
      }
    });

    // 用户点击系统通知后，切到指定对话
    const unsubNavigate = window.electronAPI.onConversationNavigateTo((conversationId) => {
      if (!conversationId) return;
      const state = useConversationStore.getState();
      if (state.conversations.find(c => c.id === conversationId)) {
        state.selectConversation(conversationId);
      } else {
        // 对话可能还没加载到内存，先加载再切换
        state.loadFromDatabase().then(() => {
          useConversationStore.getState().selectConversation(conversationId);
        });
      }
    });

    // 对话列表发生变化（定时任务新建对话等）
    const unsubListChanged = window.electronAPI.onConversationListChanged(() => {
      useConversationStore.getState().loadFromDatabase();
    });

    return () => {
      unsubMessageInjected();
      unsubNavigate();
      unsubListChanged();
    };
  }, [setMessages]);

  // 监听 AI 提问事件
  useEffect(() => {
    const cleanup = window.electronAPI.onUserQuestion((data) => {
      setPendingQuestion(data);
    });
    return cleanup;
  }, []);

  const handleAnswerQuestion = async (questionId: string, answer: string) => {
    try {
      await window.electronAPI.answerQuestion(questionId, answer);
    } catch (error) {
      console.error('[ChatArea] Failed to send answer:', error);
    }
    setPendingQuestion(null);
  };

  const handleDismissQuestion = () => {
    if (pendingQuestion) {
      // 发送空回答表示用户跳过
      window.electronAPI.answerQuestion(pendingQuestion.questionId, '').catch(() => {});
    }
    setPendingQuestion(null);
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

  const handleNewChat = async () => {
    await createConversation();
  };

  // 整个聊天区域的拖拽事件
  useEffect(() => {
    const el = chatAreaRef.current;
    if (!el) return;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current++;
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragOver(true);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setIsDragOver(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length === 0) return;

      // 转发给 InputArea 处理
      inputAreaRef.current?.handleDroppedFiles(files);
    };

    el.addEventListener('dragenter', handleDragEnter);
    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('dragleave', handleDragLeave);
    el.addEventListener('drop', handleDrop);

    return () => {
      el.removeEventListener('dragenter', handleDragEnter);
      el.removeEventListener('dragover', handleDragOver);
      el.removeEventListener('dragleave', handleDragLeave);
      el.removeEventListener('drop', handleDrop);
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F5F5F0] relative" ref={chatAreaRef}>
      {/* 全局拖拽覆盖层 */}
      <DropZone isActive={isDragOver} />

      <div className="flex-1 overflow-hidden min-h-0">
        <MessageList />
      </div>
      <div className="flex-shrink-0">
        <InputArea ref={inputAreaRef} onNewChat={handleNewChat} />
      </div>
      <WorkspaceSelector
        isOpen={showWorkspaceSelector}
        onClose={() => setShowWorkspaceSelector(false)}
        onWorkspaceSelect={handleWorkspaceSelect}
      />
      <UserQuestionDialog
        question={pendingQuestion}
        onAnswer={handleAnswerQuestion}
        onDismiss={handleDismissQuestion}
      />
    </div>
  );
};

export default ChatArea;
