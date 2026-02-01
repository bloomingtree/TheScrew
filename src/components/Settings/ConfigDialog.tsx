import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useConfigStore } from '../../store/configStore';
import { toast } from '../../store/toastStore';

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
          className="fixed inset-0 bg-cream-900/10 backdrop-blur-sm flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="glass rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-gray-200/50"
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-200/50">
              <h2 className="text-lg font-semibold text-cream-900">配置设置</h2>
              <button
                onClick={handleClose}
                className="text-cream-600 hover:text-cream-900 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-cream-700 mb-2">
                  API Key <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={localConfig.apiKey}
                  onChange={(e) => setLocalConfig({ ...localConfig, apiKey: e.target.value })}
                  placeholder="输入你的 API Key"
                  className="w-full px-4 py-3 glass-input rounded-xl focus:outline-none transition-all text-cream-900 placeholder-cream-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-cream-700 mb-2">
                  API 地址 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={localConfig.baseUrl}
                  onChange={(e) => setLocalConfig({ ...localConfig, baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-4 py-3 glass-input rounded-xl focus:outline-none transition-all text-cream-900 placeholder-cream-500"
                />
                <p className="text-xs text-cream-500 mt-1.5">
                  支持 OpenAI、Azure、本地模型等兼容接口
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-cream-700 mb-2">
                  模型名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={localConfig.model}
                  onChange={(e) => setLocalConfig({ ...localConfig, model: e.target.value })}
                  placeholder="gpt-3.5-turbo"
                  className="w-full px-4 py-3 glass-input rounded-xl focus:outline-none transition-all text-cream-900 placeholder-cream-500"
                />
                <p className="text-xs text-cream-500 mt-1.5">
                  例如: gpt-3.5-turbo, gpt-4, gpt-4-turbo
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-cream-700 mb-2">
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
                  <p className="text-xs text-cream-500 mt-1.5">
                    值越低越确定性
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-cream-700 mb-2">
                    最大 Token 数
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="128000"
                    value={localConfig.maxTokens}
                    onChange={(e) => setLocalConfig({ ...localConfig, maxTokens: parseInt(e.target.value) || 32768 })}
                    className="w-full px-4 py-3 glass-input rounded-xl focus:outline-none transition-all text-cream-900 placeholder-cream-500"
                  />
                  <p className="text-xs text-cream-500 mt-1.5">
                    默认 32768，可根据模型调整
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-gray-200/50">
              <button
                onClick={handleValidate}
                disabled={isValidating || !localConfig.apiKey || !localConfig.baseUrl}
                className="flex-1 px-4 py-3 text-sm text-cream-900 bg-white/60 hover:bg-white/90 rounded-xl border border-gray-200/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isValidating ? '验证中...' : '验证配置'}
              </button>
              <button
                onClick={handleSave}
                disabled={!localConfig.apiKey || !localConfig.baseUrl}
                className="flex-1 px-4 py-3 bg-gradient-to-br from-primary-blue to-primary-cyan hover:opacity-90 text-white rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all"
              >
                保存
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ConfigDialog;
