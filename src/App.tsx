import { useEffect } from 'react';
import { useConfigStore } from './store/configStore';
import { useTemplateStore } from './store/templateStore';
import ChatArea from './components/Chat/ChatArea';
import ConfigDialog from './components/Settings/ConfigDialog';
import Sidebar from './components/Sidebar/index';
import Toast from './components/Toast';
import TemplateDialog from './components/Template/TemplateDialog';
import AssistantPanel from './components/Template/AssistantPanel';

function App() {
  const { setConfigOpen, setConfig } = useConfigStore();
  const { loadTemplates } = useTemplateStore();

  useEffect(() => {
    const loadConfig = async () => {
      const config = await window.electronAPI.config.get();
      setConfig(config);
      if (!config.apiKey) {
        setConfigOpen(true);
      }
    };

    loadConfig();

    // 加载模板
    loadTemplates();
  }, [setConfigOpen, setConfig, loadTemplates]);

  return (
    <div className="relative h-screen overflow-hidden bg-workspace-50">
      <div className="glass h-full overflow-hidden flex relative">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <ChatArea />
        </div>
        <ConfigDialog />
        <TemplateDialog />
        <AssistantPanel />
      </div>
      <Toast />
    </div>
  );
}

export default App;
