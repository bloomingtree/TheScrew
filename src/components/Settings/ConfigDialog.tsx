import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Terminal,
  Settings,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Copy,
  Download,
  Upload,
  Check,
  Star,
  Edit2,
} from 'lucide-react';
import { useConfigStore } from '../../store/configStore';
import { toast } from '../../store/toastStore';
import { ModelConfig } from '../../types';

// 终端风格色彩常量
const TERMINAL = {
  bg: '#1a1b26',
  bgSecondary: '#24283b',
  bgTertiary: '#414868',
  lightBg: '#fff8f0',
  green: '#9ece6a',
  orange: '#ff9e64',
  blue: '#7aa2f7',
  cyan: '#2ac3de',
  purple: '#bb9af7',
  pink: '#f7768e',
  yellow: '#e0af68',
  textPrimary: '#c0caf5',
  textSecondary: '#565f89',
  textDark: '#1a1b26',
};

const ConfigDialog: React.FC = () => {
  const {
    isConfigOpen,
    setConfigOpen,
    modelConfigs,
    addModelConfig,
    updateModelConfig,
    deleteModelConfig,
    setActiveConfig,
    duplicateModelConfig,
    importConfigs,
    exportConfigs,
  } = useConfigStore();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set([modelConfigs.activeConfigId]));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleAddConfig = () => {
    const id = addModelConfig({
      name: `新配置 ${modelConfigs.configs.length + 1}`,
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 32768,
    });

    setExpandedIds(prev => new Set([...prev, id]));
    setEditingId(id);
    const newConfig = modelConfigs.configs.find(c => c.id === id);
    setEditingName(newConfig?.name || `新配置 ${modelConfigs.configs.length + 1}`);
  };

  const handleDeleteConfig = (id: string) => {
    if (modelConfigs.configs.length <= 1) {
      toast.error('至少需要保留一个配置');
      return;
    }
    deleteModelConfig(id);
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
    toast.success('配置已删除');
  };

  const handleDuplicateConfig = (id: string) => {
    const newId = duplicateModelConfig(id);
    if (newId) {
      setExpandedIds(prev => new Set([...prev, newId]));
      toast.success('配置已复制');
    }
  };

  const handleSetActive = (id: string) => {
    setActiveConfig(id);
    toast.success('已切换到该配置');
  };

  const handleStartEditName = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const handleSaveName = (id: string) => {
    if (editingName.trim()) {
      updateModelConfig(id, { name: editingName.trim() });
    }
    setEditingId(null);
  };

  const handleExport = () => {
    const configs = exportConfigs();
    const data = JSON.stringify(configs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `model-configs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('配置已导出');
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const configs = JSON.parse(content) as ModelConfig[];

        if (!Array.isArray(configs)) {
          throw new Error('无效的配置格式');
        }

        importConfigs(configs);
        toast.success(`已导入 ${configs.length} 个配置`);
      } catch (err: any) {
        toast.error(`导入失败: ${err.message}`);
      }
    };
    reader.readAsText(file);

    // 重置 input
    e.target.value = '';
  };

  const renderConfigItem = (config: ModelConfig) => {
    const isExpanded = expandedIds.has(config.id);
    const isActive = modelConfigs.activeConfigId === config.id;
    const isEditing = editingId === config.id;

    return (
      <motion.div
        key={config.id}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="rounded-lg border overflow-hidden mb-3"
        style={{
          background: isActive ? `${TERMINAL.cyan}08` : '#fff',
          borderColor: isActive ? TERMINAL.cyan : `${TERMINAL.bgTertiary}40`,
        }}
      >
        {/* 配置头部 */}
        <div
          className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-gray-50"
          onClick={() => toggleExpand(config.id)}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* 展开/收起图标 */}
            <span className="shrink-0" style={{ color: TERMINAL.textSecondary }}>
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>

            {/* 激活标记 */}
            {isActive && (
              <Star size={12} fill={TERMINAL.yellow} style={{ color: TERMINAL.yellow }} />
            )}

            {/* 配置名称 */}
            {isEditing ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => handleSaveName(config.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName(config.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 px-2 py-1 text-sm font-mono border rounded"
                style={{
                  borderColor: TERMINAL.cyan,
                  color: TERMINAL.textDark,
                }}
                autoFocus
              />
            ) : (
              <span
                className="text-sm font-mono truncate flex-1"
                style={{ color: TERMINAL.textDark }}
              >
                {config.name}
              </span>
            )}

            {/* 模型名称 */}
            <span
              className="text-xs font-mono px-2 py-0.5 rounded shrink-0"
              style={{
                background: `${TERMINAL.purple}15`,
                color: TERMINAL.purple,
              }}
            >
              {config.model}
            </span>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            {!isActive && (
              <button
                onClick={() => handleSetActive(config.id)}
                className="p-1.5 rounded hover:bg-gray-100"
                title="设为当前配置"
                style={{ color: TERMINAL.green }}
              >
                <Check size={14} />
              </button>
            )}
            <button
              onClick={() => handleStartEditName(config.id, config.name)}
              className="p-1.5 rounded hover:bg-gray-100"
              title="重命名"
              style={{ color: TERMINAL.textSecondary }}
            >
              <Edit2 size={14} />
            </button>
            <button
              onClick={() => handleDuplicateConfig(config.id)}
              className="p-1.5 rounded hover:bg-gray-100"
              title="复制配置"
              style={{ color: TERMINAL.blue }}
            >
              <Copy size={14} />
            </button>
            <button
              onClick={() => handleDeleteConfig(config.id)}
              className="p-1.5 rounded hover:bg-red-50"
              title="删除配置"
              style={{ color: TERMINAL.pink }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* 展开的配置详情 */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div
                className="px-4 py-3 space-y-3 border-t"
                style={{ borderColor: `${TERMINAL.bgTertiary}20` }}
              >
                {/* API Key */}
                <div>
                  <label
                    className="text-xs font-medium mb-1.5 font-mono flex items-center gap-1.5"
                    style={{ color: TERMINAL.textSecondary }}
                  >
                    <Terminal size={10} />
                    API 密钥
                  </label>
                  <input
                    type="password"
                    value={config.apiKey}
                    onChange={(e) =>
                      updateModelConfig(config.id, { apiKey: e.target.value })
                    }
                    placeholder="sk-xxxxxxxx"
                    className="w-full px-3 py-2 rounded-lg text-sm font-mono border focus:outline-none"
                    style={{
                      background: '#fff',
                      borderColor: `${TERMINAL.bgTertiary}50`,
                      color: TERMINAL.textDark,
                    }}
                  />
                </div>

                {/* Base URL */}
                <div>
                  <label
                    className="text-xs font-medium mb-1.5 font-mono flex items-center gap-1.5"
                    style={{ color: TERMINAL.textSecondary }}
                  >
                    <Terminal size={10} />
                    API 地址
                  </label>
                  <input
                    type="text"
                    value={config.baseUrl}
                    onChange={(e) =>
                      updateModelConfig(config.id, { baseUrl: e.target.value })
                    }
                    placeholder="https://api.openai.com/v1"
                    className="w-full px-3 py-2 rounded-lg text-sm font-mono border focus:outline-none"
                    style={{
                      background: '#fff',
                      borderColor: `${TERMINAL.bgTertiary}50`,
                      color: TERMINAL.textDark,
                    }}
                  />
                </div>

                {/* Model */}
                <div>
                  <label
                    className="text-xs font-medium mb-1.5 font-mono flex items-center gap-1.5"
                    style={{ color: TERMINAL.textSecondary }}
                  >
                    <Terminal size={10} />
                    模型名称
                  </label>
                  <input
                    type="text"
                    value={config.model}
                    onChange={(e) =>
                      updateModelConfig(config.id, { model: e.target.value })
                    }
                    placeholder="gpt-4"
                    className="w-full px-3 py-2 rounded-lg text-sm font-mono border focus:outline-none"
                    style={{
                      background: '#fff',
                      borderColor: `${TERMINAL.bgTertiary}50`,
                      color: TERMINAL.textDark,
                    }}
                  />
                </div>

                {/* Temperature & MaxTokens */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      className="text-xs font-medium mb-1.5 font-mono block"
                      style={{ color: TERMINAL.textSecondary }}
                    >
                      温度
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={config.temperature}
                        onChange={(e) =>
                          updateModelConfig(config.id, {
                            temperature: parseFloat(e.target.value),
                          })
                        }
                        className="flex-1 accent-purple-500"
                      />
                      <span
                        className="text-xs font-mono w-8 text-right"
                        style={{ color: TERMINAL.cyan }}
                      >
                        {config.temperature}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label
                      className="text-xs font-medium mb-1.5 font-mono block"
                      style={{ color: TERMINAL.textSecondary }}
                    >
                      最大令牌
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="128000"
                      value={config.maxTokens}
                      onChange={(e) =>
                        updateModelConfig(config.id, {
                          maxTokens: parseInt(e.target.value) || 32768,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg text-sm font-mono border focus:outline-none"
                      style={{
                        background: '#fff',
                        borderColor: `${TERMINAL.bgTertiary}50`,
                        color: TERMINAL.textDark,
                      }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />

      <AnimatePresence>
        {isConfigOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-2xl font-mono max-h-[85vh] flex flex-col"
              style={{
                background: TERMINAL.lightBg,
                border: `1px solid ${TERMINAL.bgTertiary}`,
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
              }}
            >
              {/* 终端风格标题栏 */}
              <div
                className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
                style={{
                  background: `${TERMINAL.bgSecondary}30`,
                  borderColor: `${TERMINAL.bgTertiary}50`,
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: 'rgba(239, 68, 68, 0.6)' }}
                    />
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: 'rgba(234, 179, 8, 0.6)' }}
                    />
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: 'rgba(34, 197, 94, 0.6)' }}
                    />
                  </div>
                  <span
                    className="font-mono text-xs"
                    style={{ color: TERMINAL.textSecondary }}
                  >
                    模型配置管理
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs" style={{ color: TERMINAL.green }}>
                    <Terminal size={12} className="inline" />
                  </span>
                  <button
                    onClick={() => setConfigOpen(false)}
                    className="p-1 rounded transition-all hover:bg-black/5"
                    style={{ color: TERMINAL.textSecondary }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* 配置标题区域 */}
              <div className="p-4 text-center border-b shrink-0" style={{ borderColor: `${TERMINAL.bgTertiary}20` }}>
                <h2
                  className="text-xl font-bold mb-1"
                  style={{ color: TERMINAL.textDark }}
                >
                  <span style={{ color: TERMINAL.cyan }}>&gt;</span> API 配置管理
                </h2>
                <div
                  className="text-xs flex items-center gap-2 justify-center flex-wrap"
                  style={{ color: TERMINAL.textSecondary }}
                >
                  <span style={{ color: TERMINAL.green }}>$</span>
                  <span>管理多个大模型配置，支持导入导出</span>
                  <span className="px-1.5 py-0.5 rounded" style={{ background: `${TERMINAL.cyan}15`, color: TERMINAL.cyan }}>
                    {modelConfigs.configs.length} 个配置
                  </span>
                </div>
              </div>

              {/* 工具栏 */}
              <div
                className="flex items-center justify-between px-4 py-2 border-b shrink-0"
                style={{ borderColor: `${TERMINAL.bgTertiary}20` }}
              >
                <button
                  onClick={handleAddConfig}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all hover:shadow-sm"
                  style={{
                    background: `${TERMINAL.green}15`,
                    borderColor: TERMINAL.green,
                    color: TERMINAL.green,
                  }}
                >
                  <Plus size={12} />
                  新建配置
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleImport}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all hover:bg-gray-50"
                    style={{
                      borderColor: `${TERMINAL.bgTertiary}50`,
                      color: TERMINAL.textSecondary,
                    }}
                  >
                    <Upload size={12} />
                    导入
                  </button>
                  <button
                    onClick={handleExport}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all hover:bg-gray-50"
                    style={{
                      borderColor: `${TERMINAL.bgTertiary}50`,
                      color: TERMINAL.textSecondary,
                    }}
                  >
                    <Download size={12} />
                    导出
                  </button>
                </div>
              </div>

              {/* 配置列表 */}
              <div className="flex-1 overflow-y-auto p-4">
                <AnimatePresence>
                  {modelConfigs.configs.map(config => renderConfigItem(config))}
                </AnimatePresence>
              </div>

              {/* 底部提示 */}
              <div
                className="px-4 py-2 border-t text-xs text-center shrink-0"
                style={{
                  borderColor: `${TERMINAL.bgTertiary}20`,
                  color: TERMINAL.textSecondary,
                }}
              >
                <span style={{ color: TERMINAL.yellow }}>★</span> 星标表示当前激活的配置
                {' · '}
                点击 <Check size={10} className="inline" style={{ color: TERMINAL.green }} /> 切换配置
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ConfigDialog;
