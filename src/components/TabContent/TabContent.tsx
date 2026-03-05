import React from 'react';
import { useTabStore } from '../../store/tabStore';
import ChatArea from '../Chat/ChatArea';
import PreviewTab from '../RightPanel/tabs/PreviewTab';
import FilesTab from '../RightPanel/tabs/FilesTab';
import HistoryTab from '../RightPanel/tabs/HistoryTab';
import ReportsTab from '../RightPanel/tabs/ReportsTab';
import WorkflowsTab from '../RightPanel/tabs/WorkflowsTab';
import AnalyticsTab from '../RightPanel/tabs/AnalyticsTab';

interface TabContentProps {
  panelId: 'left' | 'right';
}

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
      case 'reports':
        return <ReportsTab key={activeTab.id} />;
      case 'workflows':
        return <WorkflowsTab key={activeTab.id} />;
      case 'analytics':
        return <AnalyticsTab key={activeTab.id} />;
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
