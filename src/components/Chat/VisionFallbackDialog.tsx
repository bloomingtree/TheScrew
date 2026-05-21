import React, { useState } from 'react';
import { AlertTriangle, ImageOff, Link2, X } from 'lucide-react';

interface VisionFallbackDialogProps {
  modelName: string;
  onChoose: (mode: 'tool' | 'path' | 'cancel') => void;
  onClose: () => void;
}

const VisionFallbackDialog: React.FC<VisionFallbackDialogProps> = ({
  modelName,
  onChoose,
  onClose,
}) => {
  const [rememberChoice, setRememberChoice] = useState(false);

  const handleChoose = (mode: 'tool' | 'path' | 'cancel') => {
    onChoose(mode);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-[400px] max-w-[90vw] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 bg-amber-50 border-b border-amber-100">
          <AlertTriangle size={20} className="text-amber-500 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-gray-800">当前模型不支持图片理解</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              模型「{modelName}」不支持视觉输入
            </p>
          </div>
          <button onClick={onClose} className="ml-auto p-1 rounded-lg hover:bg-gray-200/50 text-gray-400">
            <X size={16} />
          </button>
        </div>

        {/* Options */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-500">请选择图片处理方式：</p>

          <button
            onClick={() => handleChoose('tool')}
            className="w-full flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
              <ImageOff size={16} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">使用图片描述工具</p>
              <p className="text-xs text-gray-500 mt-0.5">AI 将调用视觉工具描述图片内容</p>
            </div>
          </button>

          <button
            onClick={() => handleChoose('path')}
            className="w-full flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center shrink-0 mt-0.5">
              <Link2 size={16} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">仅保存图片路径</p>
              <p className="text-xs text-gray-500 mt-0.5">AI 无法看到图片，仅记录文件位置</p>
            </div>
          </button>

          <button
            onClick={() => handleChoose('cancel')}
            className="w-full p-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-all"
          >
            取消上传
          </button>
        </div>

        {/* Remember */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
          <input
            type="checkbox"
            id="remember"
            checked={rememberChoice}
            onChange={(e) => setRememberChoice(e.target.checked)}
            className="rounded border-gray-300"
          />
          <label htmlFor="remember" className="text-xs text-gray-500">记住我的选择，下次不再询问</label>
        </div>
      </div>
    </div>
  );
};

export default VisionFallbackDialog;
