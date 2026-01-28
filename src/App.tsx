import { useEffect } from 'react';
import { useConfigStore } from './store/configStore';
import ChatArea from './components/Chat/ChatArea';
import ConfigDialog from './components/Settings/ConfigDialog';

function App() {
  const { setConfigOpen } = useConfigStore();

  useEffect(() => {
    const loadConfig = async () => {
      const config = await window.electronAPI.config.get();
      if (!config.apiKey) {
        setConfigOpen(true);
      }
    };
    
    loadConfig();
  }, [setConfigOpen]);

  return (
    <div className="flex h-screen bg-gray-50">
      <ChatArea />
      <ConfigDialog />
    </div>
  );
}

export default App;
