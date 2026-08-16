/**
 * UserQuestionInline - 聊天流内的用户提问卡片
 * 替代原弹窗（UserQuestionDialog）：出现在消息列表末尾，
 * 回答提交后即消失，不再遮挡聊天内容。
 */
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Edit3, HelpCircle, X, CornerDownLeft } from 'lucide-react';

interface QuestionOption {
  label: string;
  description?: string;
}

interface QuestionItem {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
  allowOther: boolean;
}

interface UserQuestionInlineProps {
  question: {
    questionId: string;
    questions: QuestionItem[];
  } | null;
  onAnswer: (questionId: string, answers: Record<string, string | string[]>) => void;
  onDismiss: () => void;
}

const UserQuestionInline: React.FC<UserQuestionInlineProps> = ({ question, onAnswer, onDismiss }) => {
  // 每个 question 索引 → 当前选择（string 或 string[]）
  const [answersMap, setAnswersMap] = useState<Record<number, string | string[]>>({});
  const [customMode, setCustomMode] = useState<Record<number, boolean>>({});
  const [customValue, setCustomValue] = useState<Record<number, string>>({});

  useEffect(() => {
    if (question) {
      setAnswersMap({});
      setCustomMode({});
      setCustomValue({});
    }
  }, [question?.questionId]);

  if (!question) return null;

  const items = question.questions || [];

  const isAnswered = (i: number): boolean => {
    const ans = answersMap[i];
    const item = items[i];
    if (!item) return false;
    return item.multiSelect
      ? Array.isArray(ans) && ans.length > 0
      : typeof ans === 'string' && ans.trim().length > 0;
  };
  const allAnswered = items.length > 0 && items.every((_, i) => isAnswered(i));

  const setAnswer = (i: number, val: string | string[]) => {
    setAnswersMap((prev) => ({ ...prev, [i]: val }));
  };

  const toggleMulti = (i: number, label: string) => {
    const arr = Array.isArray(answersMap[i]) ? [...(answersMap[i] as string[])] : [];
    const idx = arr.indexOf(label);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(label);
    setAnswer(i, arr);
  };

  const submitCustom = (i: number) => {
    const val = (customValue[i] || '').trim();
    if (!val) return;
    setAnswer(i, val);
    setCustomMode((p) => ({ ...p, [i]: false }));
  };

  const submit = () => {
    if (!allAnswered) return;
    const finalAnswers: Record<string, string | string[]> = {};
    items.forEach((q, i) => {
      const ans = answersMap[i];
      if (ans !== undefined) finalAnswers[q.question] = ans;
    });
    onAnswer(question.questionId, finalAnswers);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mb-3 flex justify-start"
    >
      <div className="max-w-[85%] w-fit rounded-xl border bg-white border-gray-200 shadow-lg overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-gray-100">
          <div className="flex items-center gap-2 text-sm font-medium text-primary-blue">
            <HelpCircle size={15} />
            <span>需要你的确认</span>
            {items.length > 1 && (
              <span className="text-xs font-mono text-gray-400">{items.length} 个问题</span>
            )}
          </div>
          <button
            onClick={onDismiss}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="取消"
          >
            <X size={14} />
          </button>
        </div>

        {/* 问题列表（全部平铺） */}
        <div className="px-4 py-3 space-y-4">
          {items.map((item, i) => {
            const currentAnswer = answersMap[i];
            const isCustom = customMode[i] === true;
            const customSelected = typeof currentAnswer === 'string'
              && !item.options.some(o => o.label === currentAnswer);
            return (
              <div key={i} className={i > 0 ? 'pt-3 border-t border-gray-100' : ''}>
                {item.header && (
                  <div className="text-xs font-medium text-gray-400 mb-1">{item.header}</div>
                )}
                <p className="text-sm text-gray-800 leading-relaxed mb-2.5 whitespace-pre-wrap">
                  {item.question}
                </p>

                {/* 选项 */}
                {!isCustom && (
                  <div className="space-y-1.5">
                    {item.options.map((opt, idx) => {
                      const selected = item.multiSelect
                        ? Array.isArray(currentAnswer) && currentAnswer.includes(opt.label)
                        : currentAnswer === opt.label;
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            if (item.multiSelect) {
                              toggleMulti(i, opt.label);
                            } else {
                              setAnswer(i, opt.label);
                            }
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg border transition-all
                            ${selected
                              ? 'border-primary-blue bg-primary-blue/5 text-primary-blue'
                              : 'border-gray-200 hover:border-primary-blue/40 hover:bg-primary-blue/5 text-gray-700'
                            }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div className={`shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center
                              ${item.multiSelect ? 'rounded' : 'rounded-full'}
                              border transition-colors
                              ${selected ? 'bg-primary-blue border-primary-blue' : 'border-gray-300 bg-white'}`}>
                              {selected && <Check size={10} className="text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm leading-snug">{opt.label}</div>
                              {opt.description && (
                                <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                                  {opt.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}

                    {/* "其他" 自定义入口 */}
                    <button
                      onClick={() => {
                        setCustomMode((p) => ({ ...p, [i]: true }));
                        if (customSelected && !customValue[i]) {
                          setCustomValue((p) => ({ ...p, [i]: currentAnswer as string }));
                        }
                      }}
                      className={`w-full text-left px-3 py-1.5 rounded-lg border transition-all flex items-center gap-2 text-sm
                        ${customSelected
                          ? 'border-primary-blue bg-primary-blue/5 text-primary-blue'
                          : 'border-dashed border-gray-300 hover:border-primary-blue/50 hover:bg-primary-blue/5 text-gray-500 hover:text-primary-blue'}`}
                    >
                      <div className={`shrink-0 w-4 h-4 flex items-center justify-center rounded-full border transition-colors
                        ${customSelected ? 'bg-primary-blue border-primary-blue' : 'border-gray-300 bg-white'}`}>
                        {customSelected && <Check size={10} className="text-white" />}
                      </div>
                      <Edit3 size={13} />
                      <span>{customSelected ? `其他：${currentAnswer as string}` : '其他（自定义输入）'}</span>
                    </button>
                  </div>
                )}

                {/* 自定义输入模式 */}
                {isCustom && (
                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={customValue[i] || ''}
                        onChange={(e) => setCustomValue((p) => ({ ...p, [i]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            submitCustom(i);
                          }
                        }}
                        placeholder="输入你的回答..."
                        className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white
                          focus:border-primary-blue focus:ring-2 focus:ring-primary-blue/20
                          placeholder-gray-400 outline-none transition-all"
                      />
                      <button
                        onClick={() => submitCustom(i)}
                        disabled={!(customValue[i] || '').trim()}
                        className="shrink-0 px-2.5 py-1.5 rounded-lg text-white transition-all
                          bg-primary-blue hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                        title="确认输入"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                    <button
                      onClick={() => setCustomMode((p) => ({ ...p, [i]: false }))}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      ← 返回选项
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 底部操作条 */}
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {items.some(q => q.multiSelect) ? '含多选题' : ''}
          </span>
          <button
            onClick={submit}
            disabled={!allAnswered}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all
              ${allAnswered
                ? 'bg-primary-blue text-white shadow-sm hover:shadow-md'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
          >
            <CornerDownLeft size={14} />
            提交回答
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default UserQuestionInline;
