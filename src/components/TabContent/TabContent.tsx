import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
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
  const [isBinary, setIsBinary] = useState(false);

  // 打开文件并读取内容
  useEffect(() => {
    if (!filePath) return;

    const loadFile = async () => {
      try {
        const result = await (window as any).electronAPI.fileEditor.readFile(filePath);
        if (result.success) {
          setContent(result.content);
          setIsBinary(false);
          openFile(filePath, result.content, false);
        } else if (result.isBinary) {
          setIsBinary(true);
          setContent('');
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

  // 二进制文件提示
  if (isBinary) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <FileText size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm text-gray-600 mb-2">此文件不支持文本编辑</p>
          <p className="text-xs text-gray-400">{filePath.split(/[/\\]/).pop()}</p>
          <p className="text-xs text-gray-400 mt-1">请使用预览功能查看此文件</p>
        </div>
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

// 渲染单个标签的内容
const renderTabContent = (tab: Tab, panelId: 'left' | 'right') => {
  switch (tab.type) {
    case 'chat':
      return <ChatArea />;
    case 'file':
    case 'preview':
      return <PreviewTab panelId={panelId} />;
    case 'files':
      return <FilesTab />;
    case 'history':
      return <HistoryTab />;
    case 'editor':
      return <EditorWrapper tab={tab} />;
    default:
      return (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          未知标签类型: {tab.type}
        </div>
      );
  }
};

const TabContent: React.FC<TabContentProps> = ({ panelId }) => {
  const { leftPanel, rightPanel } = useTabStore();
  const panel = panelId === 'left' ? leftPanel : rightPanel;

  if (!panel.isVisible) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        {panelId === 'left' ? '没有打开的标签' : '面板未激活'}
      </div>
    );
  }

  if (panel.tabs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        没有活动的标签
      </div>
    );
  }

  // 渲染所有标签，用 hidden 隐藏非活动标签
  // 这样切换标签时组件不会被卸载，保留本地状态（输入内容、附件等）
  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {panel.tabs.map(tab => (
        <div
          key={tab.id}
          className={tab.isActive ? 'flex-1 flex flex-col min-h-0' : 'hidden'}
        >
          {renderTabContent(tab, panelId)}
        </div>
      ))}
    </div>
  );
};

export default TabContent;
