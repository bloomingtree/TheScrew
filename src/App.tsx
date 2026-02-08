import { useEffect } from 'react';
import { useConfigStore } from './store/configStore';
import { useConversationStore } from './store/conversationStore';
import ChatArea from './components/Chat/ChatArea';
import ConfigDialog from './components/Settings/ConfigDialog';
import Sidebar from './components/Sidebar/index';
import Toast from './components/Toast';
import { RightPanel } from './components/RightPanel';

function App() {
  const { setConfigOpen, setConfig } = useConfigStore();
  const { loadFromDatabase } = useConversationStore();

  useEffect(() => {
    const initializeApp = async () => {
      // 加载配置
      const config = await window.electronAPI.config.get();
      setConfig(config);
      if (!config.apiKey) {
        setConfigOpen(true);
      }

      // 加载对话历史
      await loadFromDatabase();
    };

    initializeApp();
  }, [setConfigOpen, setConfig, loadFromDatabase]);

  return (
    <div className="relative h-screen overflow-hidden bg-workspace-50">
      <div className="glass h-full overflow-hidden flex relative">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <ChatArea />
        </div>
        <RightPanel />
        <ConfigDialog />
      </div>
      <Toast />
    </div>
  );
}

export default App;
