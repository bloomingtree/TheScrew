import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircleQuestion, Send, X } from 'lucide-react';

interface QuestionOption {
  label: string;
  value: string;
  description?: string;
}

interface QuestionData {
  questionId: string;
  question: string;
  options: QuestionOption[];
  allow_custom: boolean;
  custom_placeholder: string;
}

interface UserQuestionDialogProps {
  question: QuestionData | null;
  onAnswer: (questionId: string, answer: string) => void;
  onDismiss: () => void;
}

const UserQuestionDialog: React.FC<UserQuestionDialogProps> = ({ question, onAnswer, onDismiss }) => {
  const [customInput, setCustomInput] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  // 每次新问题重置状态
  useEffect(() => {
    if (question) {
      setCustomInput('');
      setSelectedOption(null);
    }
  }, [question?.questionId]);

  if (!question) return null;

  const handleSubmit = (answer: string) => {
    if (!answer.trim()) return;
    onAnswer(question.questionId, answer.trim());
    onDismiss();
  };

  const handleOptionClick = (value: string) => {
    setSelectedOption(value);
    handleSubmit(value);
  };

  const handleCustomSubmit = () => {
    if (customInput.trim()) {
      handleSubmit(customInput.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCustomSubmit();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onDismiss();
          }
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-100">
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center">
              <MessageCircleQuestion className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 leading-relaxed">
                {question.question}
              </p>
            </div>
            <button
              onClick={onDismiss}
              className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Options */}
          {question.options.length > 0 && (
            <div className="px-5 py-3 space-y-2">
              {question.options.map((option, index) => (
                <motion.button
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => handleOptionClick(option.value)}
                  disabled={selectedOption !== null}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-150
                    ${selectedOption === option.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 text-gray-700'
                    }
                    ${selectedOption !== null ? 'cursor-default' : 'cursor-pointer active:scale-[0.98]'}
                    disabled:opacity-50`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{option.label}</span>
                    {selectedOption === option.value && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-blue-500 text-xs"
                      >
                        ✓
                      </motion.span>
                    )}
                  </div>
                  {option.description && (
                    <p className="text-xs text-gray-400 mt-1">{option.description}</p>
                  )}
                </motion.button>
              ))}
            </div>
          )}

          {/* Custom Input */}
          {question.allow_custom && (
            <div className="px-5 pb-4">
              {question.options.length > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400">或输入自定义回答</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={question.custom_placeholder || '输入你的回答...'}
                  disabled={selectedOption !== null}
                  className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-gray-200
                    focus:border-blue-400 focus:ring-2 focus:ring-blue-100
                    placeholder-gray-300 outline-none transition-all
                    disabled:opacity-50 disabled:bg-gray-50"
                  autoFocus={question.options.length === 0}
                />
                <button
                  onClick={handleCustomSubmit}
                  disabled={!customInput.trim() || selectedOption !== null}
                  className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-blue-500 text-white
                    hover:bg-blue-600 active:bg-blue-700
                    disabled:opacity-40 disabled:cursor-not-allowed
                    transition-colors duration-150"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default UserQuestionDialog;
