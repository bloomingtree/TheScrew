import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { useToastStore, ToastType } from '../../store/toastStore';

const toastConfig: Record<ToastType, { icon: React.ReactNode; bgColor: string; borderColor: string; textColor: string }> = {
  success: {
    icon: <CheckCircle size={20} />,
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    textColor: 'text-green-800',
  },
  error: {
    icon: <XCircle size={20} />,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    textColor: 'text-red-800',
  },
  warning: {
    icon: <AlertCircle size={20} />,
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    textColor: 'text-yellow-800',
  },
  info: {
    icon: <Info size={20} />,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-800',
  },
};

const ToastItem: React.FC<{ toast: { id: string; message: string; type: ToastType } }> = ({ toast }) => {
  const config = toastConfig[toast.type];
  const removeToast = useToastStore((state) => state.removeToast);

  return (
    <motion.div
      initial={{ opacity: 0, x: 100, y: -50 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className={`${config.bgColor} ${config.borderColor} ${config.textColor} border rounded-lg shadow-lg p-4 flex items-start gap-3 min-w-[300px] max-w-md`}
    >
      <div className="flex-shrink-0 mt-0.5">{config.icon}</div>
      <p className="flex-1 text-sm font-medium break-words">{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X size={16} />
      </button>
    </motion.div>
  );
};

const Toast: React.FC = () => {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default Toast;
