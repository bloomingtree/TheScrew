import { useEffect } from 'react';
import { useConfigStore } from './store/configStore';
import { useConversationStore } from './store/conversationStore';
import ConfigDialog from './components/Settings/ConfigDialog';
import Sidebar from './components/Sidebar/index';
import Toast from './components/Toast';
import SplitPanel from './components/SplitPanel';

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
        <div className="flex-1 flex min-w-0 min-h-0 pl-[48px]">
          <SplitPanel />
        </div>
        <ConfigDialog />
      </div>
      <Toast />
    </div>
  );
}

export default App;
