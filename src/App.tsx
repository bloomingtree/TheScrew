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
    <div className="relative min-h-screen overflow-hidden">
      <div className="gradient-bg fixed inset-0 -z-10" />
      
      <div className="absolute top-20 left-20 w-72 h-72 bg-purple-500 rounded-full blur-3xl opacity-20 animate-float" />
      <div className="absolute bottom-20 right-20 w-96 h-96 bg-blue-500 rounded-full blur-3xl opacity-20 animate-float" style={{animationDelay: '2s'}} />
      
      <div className="glass mx-4 my-4 rounded-3xl min-h-[calc(100vh-2rem)] overflow-hidden">
        <ChatArea />
        <ConfigDialog />
      </div>
    </div>
  );
}

export default App;
