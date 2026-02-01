import { useEffect, useState } from 'react';
import { useConfigStore } from './store/configStore';
import ChatArea from './components/Chat/ChatArea';
import ConfigDialog from './components/Settings/ConfigDialog';
import Sidebar from './components/Sidebar/index';
import ToolPanel from './components/ToolPanel';

function App() {
  const { setConfigOpen, setConfig } = useConfigStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const loadConfig = async () => {
      const config = await window.electronAPI.config.get();
      setConfig(config);
      if (!config.apiKey) {
        setConfigOpen(true);
      }
    };

    loadConfig();
  }, [setConfigOpen, setConfig]);

  return (
    <div className="relative h-screen overflow-hidden bg-workspace-50">
      

      

      <div className="glass h-full overflow-hidden flex relative">
        <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <ChatArea />
        </div>
        <ToolPanel />
        <ConfigDialog />
      </div>
    </div>
  );
}

export default App;
