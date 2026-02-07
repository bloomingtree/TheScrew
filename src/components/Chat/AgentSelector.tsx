import React, { useEffect, useState } from 'react';
import { Bot, ChevronDown } from 'lucide-react';
import { useAgentStore } from '../../store/agentStore';

interface AgentSelectorProps {
  conversationId: string | null;
  onAgentChange?: (agentName: string) => void;
}

const AgentSelector: React.FC<AgentSelectorProps> = ({ conversationId, onAgentChange }) => {
  const { agents, currentAgent, loadAgents, setAgent, setCurrentAgent } = useAgentStore();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const handleSelectAgent = async (agentName: string) => {
    if (conversationId) {
      await setAgent(conversationId, agentName);
      onAgentChange?.(agentName);
    } else {
      // 如果没有对话 ID，仅更新本地状态
      setCurrentAgent(agentName);
      onAgentChange?.(agentName);
    }
    setIsOpen(false);
  };

  const getCurrentAgentInfo = () => {
    return agents.find(a => a.name === currentAgent) || { name: 'default', description: '默认助手' };
  };

  const currentAgentInfo = getCurrentAgentInfo();

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 text-xs rounded-lg transition-all border border-gray-200 shadow-sm hover:shadow-md bg-white text-[#374151]"
        title="选择 AI 助手"
      >
        <Bot size={14} className="shrink-0" />
        <span className="truncate max-w-[150px]">{currentAgentInfo.description}</span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-2 z-20 bg-white rounded-lg shadow-lg border border-gray-200 min-w-[250px] max-w-[350px]">
            <div className="p-2">
              <div className="text-xs text-gray-500 px-3 py-2 font-medium">选择 AI 助手</div>
              {agents.map((agent) => (
                <button
                  key={agent.name}
                  onClick={() => handleSelectAgent(agent.name)}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors text-xs ${
                    currentAgent === agent.name
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium">{agent.description}</div>
                  {agent.model && (
                    <div className="text-[10px] text-gray-400 mt-0.5">模型: {agent.model}</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AgentSelector;
