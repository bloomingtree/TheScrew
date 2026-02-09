import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Terminal, Settings } from 'lucide-react';
import { useConfigStore } from '../../store/configStore';
import { toast } from '../../store/toastStore';

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
  const { isConfigOpen, setConfigOpen, apiKey, baseUrl, model, temperature, maxTokens, setConfig } = useConfigStore();

  const [localConfig, setLocalConfig] = useState({
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 32768,
  });

  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    if (isConfigOpen) {
      setLocalConfig({
        apiKey,
        baseUrl,
        model,
        temperature,
        maxTokens,
      });
    }
  }, [isConfigOpen, apiKey, baseUrl, model, temperature, maxTokens]);

  const handleSave = async () => {
    await window.electronAPI.config.set(localConfig);
    setConfig(localConfig);
    toast.success('配置已保存');
    setConfigOpen(false);
  };

  const handleValidate = async () => {
    setIsValidating(true);

    try {
      const result = await window.electronAPI.config.validate(localConfig);

      if (result.valid) {
        await window.electronAPI.config.set(localConfig);
        setConfig(localConfig);
        toast.success('配置验证成功！');
      } else {
        toast.error(result.error || '配置验证失败');
      }
    } catch (error: any) {
      toast.error(error.message || '配置验证失败');
    } finally {
      setIsValidating(false);
    }
  };

  const handleClose = () => {
    setConfigOpen(false);
  };

  return (
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
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-lg font-mono"
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
              className="flex items-center justify-between px-4 py-2.5 border-b"
              style={{
                background: `${TERMINAL.bgSecondary}30`,
                borderColor: `${TERMINAL.bgTertiary}50`,
              }}
            >
              <div className="flex items-center gap-2">
                {/* macOS 风格窗口控制点 */}
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(239, 68, 68, 0.6)' }}></div>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(234, 179, 8, 0.6)' }}></div>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(34, 197, 94, 0.6)' }}></div>
                </div>
                <span className="font-mono text-xs" style={{ color: TERMINAL.textSecondary }}>
                  配置编辑
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs" style={{ color: TERMINAL.green }}>
                  <Terminal size={12} className="inline" />
                </span>
                <button
                  onClick={handleClose}
                  className="p-1 rounded transition-all hover:bg-black/5"
                  style={{ color: TERMINAL.textSecondary }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* 配置标题区域 */}
            <div className="p-5 text-center">
              <h2 className="text-xl sm:text-2xl font-bold mb-2" style={{ color: TERMINAL.textDark }}>
                <span style={{ color: TERMINAL.cyan }}>&gt;</span> API 配置设置
              </h2>
              <div className="text-sm inline-flex items-center gap-2 flex-wrap justify-center" style={{ color: TERMINAL.textSecondary }}>
                <span style={{ color: TERMINAL.green }}>$</span>
                <span>配置您的</span>
                <span className="font-bold" style={{ color: TERMINAL.blue }}>OpenAI</span>
                <span>API 连接参数</span>
              </div>
            </div>

            {/* 配置表单 */}
            <div className="px-5 pb-5 space-y-4 max-h-[50vh] overflow-y-auto">
              {/* API Key */}
              <div>
                <label className="text-xs font-medium mb-2 font-mono flex items-center gap-1.5" style={{ color: TERMINAL.textSecondary }}>
                  <Terminal size={10} />
                  API密钥 <span style={{ color: TERMINAL.pink }}>*</span>
                </label>
                <div className="relative">
                  <span
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono"
                    style={{ color: TERMINAL.green }}
                  >
                    $
                  </span>
                  <input
                    type="password"
                    value={localConfig.apiKey}
                    onChange={(e) => setLocalConfig({ ...localConfig, apiKey: e.target.value })}
                    placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full pl-7 pr-3 py-2.5 rounded-lg text-sm font-mono transition-all border focus:outline-none"
                    style={{
                      background: '#fff',
                      borderColor: `${TERMINAL.bgTertiary}50`,
                      color: TERMINAL.textDark,
                    }}
                  />
                </div>
              </div>

              {/* Base URL */}
              <div>
                <label className="text-xs font-medium mb-2 font-mono flex items-center gap-1.5" style={{ color: TERMINAL.textSecondary }}>
                  <Terminal size={10} />
                  API地址 <span style={{ color: TERMINAL.pink }}>*</span>
                </label>
                <div className="relative">
                  <span
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono"
                    style={{ color: TERMINAL.green }}
                  >
                    $
                  </span>
                  <input
                    type="text"
                    value={localConfig.baseUrl}
                    onChange={(e) => setLocalConfig({ ...localConfig, baseUrl: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                    className="w-full pl-7 pr-3 py-2.5 rounded-lg text-sm font-mono transition-all border focus:outline-none"
                    style={{
                      background: '#fff',
                      borderColor: `${TERMINAL.bgTertiary}50`,
                      color: TERMINAL.textDark,
                    }}
                  />
                </div>
                <p className="text-xs mt-1.5 font-mono" style={{ color: TERMINAL.textSecondary }}>
                  支持 OpenAI、Azure、本地模型等兼容接口
                </p>
              </div>

              {/* Model */}
              <div>
                <label className="text-xs font-medium mb-2 font-mono flex items-center gap-1.5" style={{ color: TERMINAL.textSecondary }}>
                  <Terminal size={10} />
                  模型名称 <span style={{ color: TERMINAL.pink }}>*</span>
                </label>
                <div className="relative">
                  <span
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono"
                    style={{ color: TERMINAL.green }}
                  >
                    $
                  </span>
                  <input
                    type="text"
                    value={localConfig.model}
                    onChange={(e) => setLocalConfig({ ...localConfig, model: e.target.value })}
                    placeholder="gpt-3.5-turbo"
                    className="w-full pl-7 pr-3 py-2.5 rounded-lg text-sm font-mono transition-all border focus:outline-none"
                    style={{
                      background: '#fff',
                      borderColor: `${TERMINAL.bgTertiary}50`,
                      color: TERMINAL.textDark,
                    }}
                  />
                </div>
                <p className="text-xs mt-1.5 font-mono" style={{ color: TERMINAL.textSecondary }}>
                  例如: gpt-3.5-turbo, gpt-4, gpt-4-turbo
                </p>
              </div>

              {/* Temperature & Max Tokens */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium mb-2 font-mono inline-block" style={{ color: TERMINAL.textSecondary }}>
                    温度
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={localConfig.temperature}
                      onChange={(e) => setLocalConfig({ ...localConfig, temperature: parseFloat(e.target.value) })}
                      className="flex-1 accent-purple-500"
                    />
                    <span className="text-xs font-mono w-8 text-right" style={{ color: TERMINAL.cyan }}>
                      {localConfig.temperature}
                    </span>
                  </div>
                  <p className="text-xs mt-1.5 font-mono" style={{ color: TERMINAL.textSecondary }}>
                    值越低越确定性
                  </p>
                </div>

                <div>
                  <label className="text-xs font-medium mb-2 font-mono inline-block" style={{ color: TERMINAL.textSecondary }}>
                    最大令牌数
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="128000"
                    value={localConfig.maxTokens}
                    onChange={(e) => setLocalConfig({ ...localConfig, maxTokens: parseInt(e.target.value) || 32768 })}
                    className="w-full px-3 py-2.5 rounded-lg text-sm font-mono border transition-all focus:outline-none"
                    style={{
                      background: '#fff',
                      borderColor: `${TERMINAL.bgTertiary}50`,
                      color: TERMINAL.textDark,
                    }}
                  />
                  <p className="text-xs mt-1.5 font-mono" style={{ color: TERMINAL.textSecondary }}>
                    默认 32768
                  </p>
                </div>
              </div>
            </div>

            {/* 底部按钮区域 */}
            <div
              className="flex gap-3 px-5 py-4 border-t"
              style={{ borderColor: `${TERMINAL.bgTertiary}30` }}
            >
              <button
                onClick={handleValidate}
                disabled={isValidating || !localConfig.apiKey || !localConfig.baseUrl}
                className="flex-1 px-4 py-2.5 text-sm font-mono rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{
                  background: '#fff',
                  borderColor: `${TERMINAL.bgTertiary}50`,
                  color: TERMINAL.textSecondary,
                }}
              >
                <Terminal size={14} />
                {isValidating ? '验证中...' : '--验证'}
              </button>
              <button
                onClick={handleSave}
                disabled={!localConfig.apiKey || !localConfig.baseUrl}
                className="flex-1 px-4 py-2.5 text-sm font-mono rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
                style={{
                  background: `${TERMINAL.cyan}20`,
                  borderColor: TERMINAL.cyan,
                  color: TERMINAL.cyan,
                }}
              >
                <Settings size={14} />
                --保存
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ConfigDialog;
