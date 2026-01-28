import React, { useEffect, useState } from 'react';
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

  const handleSave = () => {
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
    if (apiKey) {
      setConfigOpen(false);
    }
  };

  return (
    <>
      {isConfigOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">配置设置</h2>
              {!apiKey && (
                <button
                  onClick={handleClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  disabled
                >
                  <X size={20} />
                </button>
              )}
              {apiKey && (
                <button
                  onClick={handleClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={20} />
                </button>
              )}
            </div>

            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={localConfig.apiKey}
                  onChange={(e) => setLocalConfig({ ...localConfig, apiKey: e.target.value })}
                  placeholder="输入你的 API Key"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API 地址 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={localConfig.baseUrl}
                  onChange={(e) => setLocalConfig({ ...localConfig, baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  支持 OpenAI、Azure、本地模型等兼容接口
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  模型名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={localConfig.model}
                  onChange={(e) => setLocalConfig({ ...localConfig, model: e.target.value })}
                  placeholder="gpt-3.5-turbo"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  例如: gpt-3.5-turbo, gpt-4, gpt-4-turbo
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    温度 ({localConfig.temperature})
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={localConfig.temperature}
                    onChange={(e) => setLocalConfig({ ...localConfig, temperature: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    值越低越确定性
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    最大 Token 数
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="4000"
                    value={localConfig.maxTokens}
                    onChange={(e) => setLocalConfig({ ...localConfig, maxTokens: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {validationResult && (
                <div className={`p-3 rounded-lg ${
                  validationResult.valid
                    ? 'bg-green-50 border border-green-200 text-green-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}>
                  <div className="flex items-center gap-2">
                    {validationResult.valid ? (
                      <Check size={16} />
                    ) : (
                      <X size={16} />
                    )}
                    <span className="text-sm">
                      {validationResult.valid ? '配置验证成功！' : validationResult.error}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 p-4 border-t border-gray-200">
              <button
                onClick={handleValidate}
                disabled={isValidating || !localConfig.apiKey || !localConfig.baseUrl}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isValidating ? '验证中...' : '验证配置'}
              </button>
              <button
                onClick={handleSave}
                disabled={!localConfig.apiKey || !localConfig.baseUrl}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ConfigDialog;
