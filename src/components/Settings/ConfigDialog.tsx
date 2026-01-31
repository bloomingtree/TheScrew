import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { useConfigStore } from '../../store/configStore';

const ConfigDialog: React.FC = () => {
  const { isConfigOpen, setConfigOpen, apiKey, baseUrl, model, temperature, maxTokens, setConfig } = useConfigStore();
  
  const [localConfig, setLocalConfig] = useState({
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 2000,
  });
  
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (isConfigOpen) {
      setLocalConfig({
        apiKey,
        baseUrl,
        model,
        temperature,
        maxTokens,
      });
      setValidationResult(null);
    }
  }, [isConfigOpen, apiKey, baseUrl, model, temperature, maxTokens]);

  const handleSave = async () => {
    await window.electronAPI.config.set(localConfig);
    setConfig(localConfig);
    setConfigOpen(false);
  };

  const handleValidate = async () => {
    setIsValidating(true);
    setValidationResult(null);

    try {
      const result = await window.electronAPI.config.validate(localConfig);
      setValidationResult(result);
    } catch (error: any) {
      setValidationResult({ valid: false, error: error.message });
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
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="glass-dark rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-white/10"
          >
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h2 className="text-lg font-semibold text-white">配置设置</h2>
              <motion.button
                onClick={handleClose}
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X size={20} />
              </motion.button>
            </div>

            <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  API Key <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={localConfig.apiKey}
                  onChange={(e) => setLocalConfig({ ...localConfig, apiKey: e.target.value })}
                  placeholder="输入你的 API Key"
                  className="w-full px-4 py-3 glass-input rounded-xl focus:outline-none transition-all text-white/90 placeholder-white/40"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  API 地址 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={localConfig.baseUrl}
                  onChange={(e) => setLocalConfig({ ...localConfig, baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-4 py-3 glass-input rounded-xl focus:outline-none transition-all text-white/90 placeholder-white/40"
                />
                <p className="text-xs text-white/40 mt-1.5">
                  支持 OpenAI、Azure、本地模型等兼容接口
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  模型名称 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={localConfig.model}
                  onChange={(e) => setLocalConfig({ ...localConfig, model: e.target.value })}
                  placeholder="gpt-3.5-turbo"
                  className="w-full px-4 py-3 glass-input rounded-xl focus:outline-none transition-all text-white/90 placeholder-white/40"
                />
                <p className="text-xs text-white/40 mt-1.5">
                  例如: gpt-3.5-turbo, gpt-4, gpt-4-turbo
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    温度 ({localConfig.temperature})
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={localConfig.temperature}
                    onChange={(e) => setLocalConfig({ ...localConfig, temperature: parseFloat(e.target.value) })}
                    className="w-full accent-purple-500"
                  />
                  <p className="text-xs text-white/40 mt-1.5">
                    值越低越确定性
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    最大 Token 数
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="4000"
                    value={localConfig.maxTokens}
                    onChange={(e) => setLocalConfig({ ...localConfig, maxTokens: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 glass-input rounded-xl focus:outline-none transition-all text-white/90 placeholder-white/40"
                  />
                </div>
              </div>

              {validationResult && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-4 rounded-xl border ${
                    validationResult.valid
                      ? 'bg-green-500/20 border-green-500/30 text-green-300'
                      : 'bg-red-500/20 border-red-500/30 text-red-300'
                  } backdrop-blur-sm`}
                >
                  <div className="flex items-center gap-2">
                    {validationResult.valid ? (
                      <Check size={18} className="neon-glow" />
                    ) : (
                      <X size={18} />
                    )}
                    <span className="text-sm font-medium">
                      {validationResult.valid ? '配置验证成功！' : validationResult.error}
                    </span>
                  </div>
                </motion.div>
              )}
            </div>

            <div className="flex gap-3 p-5 border-t border-white/10">
              <motion.button
                onClick={handleValidate}
                disabled={isValidating || !localConfig.apiKey || !localConfig.baseUrl}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white/90 rounded-xl border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isValidating ? '验证中...' : '验证配置'}
              </motion.button>
              <motion.button
                onClick={handleSave}
                disabled={!localConfig.apiKey || !localConfig.baseUrl}
                whileHover={{ scale: 1.02, boxShadow: "0 0 20px rgba(167, 139, 250, 0.6)" }}
                whileTap={{ scale: 0.98 }}
                className="flex-1 px-4 py-3 bg-gradient-to-br from-purple-500 to-blue-500 text-white rounded-xl shadow-lg neon-glow disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all"
              >
                保存
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ConfigDialog;
