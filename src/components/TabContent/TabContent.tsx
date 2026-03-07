import React, { useEffect, useState } from 'react';
import { useTabStore } from '../../store/tabStore';
import { useFileEditorStore } from '../../store/fileEditorStore';
import ChatArea from '../Chat/ChatArea';
import PreviewTab from '../RightPanel/tabs/PreviewTab';
import FilesTab from '../RightPanel/tabs/FilesTab';
import HistoryTab from '../RightPanel/tabs/HistoryTab';
import MonacoEditor from '../MonacoEditor/MonacoEditor';
import { Tab } from '../../store/tabStore';

interface TabContentProps {
  panelId: 'left' | 'right';
}

// 编辑器包装组件 - 处理文件编辑状态
const EditorWrapper: React.FC<{ tab: Tab }> = ({ tab }) => {
  const filePath = tab.content?.filepath as string;
  const { openFile, updateFileContent, saveFile } = useFileEditorStore();
  const [content, setContent] = useState('');

  // 打开文件并读取内容
  useEffect(() => {
    if (!filePath) return;

    const loadFile = async () => {
      try {
        const result = await (window as any).electronAPI.fileEditor.readFile(filePath);
        if (result.success) {
          setContent(result.content);
          openFile(filePath, result.content, false);
        } else {
          console.error('Failed to read file:', result.error);
          setContent(`// 无法读取文件: ${result.error || '未知错误'}`);
        }
      } catch (error) {
        console.error('Failed to read file:', error);
        setContent(`// 读取文件时出错: ${error}`);
      }
    };

    loadFile();
  }, [filePath, openFile]);

  const handleSave = async () => {
    if (filePath) {
      await saveFile(filePath);
    }
  };

  const handleChange = (value: string | undefined) => {
    if (value !== undefined && filePath) {
      setContent(value);
      updateFileContent(filePath, value);
    }
  };

  if (!filePath) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        无效的文件路径
      </div>
    );
  }

  return (
    <MonacoEditor
      filePath={filePath}
      value={content}
      onChange={handleChange}
      onSave={handleSave}
    />
  );
};

const TabContent: React.FC<TabContentProps> = ({ panelId }) => {
  const { leftPanel, rightPanel } = useTabStore();
  const panel = panelId === 'left' ? leftPanel : rightPanel;

  if (!panel.isVisible || !panel.activeTabId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        {panelId === 'left' ? '没有打开的标签' : '面板未激活'}
      </div>
    );
  }

  const activeTab = panel.tabs.find(t => t.id === panel.activeTabId);

  if (!activeTab) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        没有活动的标签
      </div>
    );
  }

  // 根据标签类型渲染内容
  const renderContent = () => {
    switch (activeTab.type) {
      case 'chat':
        return <ChatArea key={activeTab.id} />;
      case 'file':
      case 'preview':
        return <PreviewTab key={activeTab.id} panelId={panelId} />;
      case 'files':
        return <FilesTab key={activeTab.id} />;
      case 'history':
        return <HistoryTab key={activeTab.id} />;
      case 'editor':
        return <EditorWrapper key={activeTab.id} tab={activeTab} />;
      default:
        return (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            未知标签类型: {activeTab.type}
          </div>
        );
    }
  };

  return renderContent();
};

export default TabContent;
