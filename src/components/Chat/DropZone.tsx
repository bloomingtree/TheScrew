import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUp } from 'lucide-react';

interface DropZoneProps {
  isActive: boolean;
}

const DropZone: React.FC<DropZoneProps> = ({ isActive }) => {
  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
        >
          <div className="absolute inset-2 rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/80 backdrop-blur-sm" />
          <div className="relative flex flex-col items-center gap-3 text-blue-600">
            <FileUp size={40} strokeWidth={1.5} />
            <div className="text-center">
              <p className="text-base font-medium">释放文件以添加到对话</p>
              <p className="text-xs text-blue-400 mt-1">
                支持格式：文档 / 表格 / 演示 / 图片 / 代码 / 数据
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DropZone;
