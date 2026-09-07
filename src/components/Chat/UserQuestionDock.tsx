/**
 * UserQuestionDock - Claude Code 风格的底部停靠提问面板
 *
 * ask_user 触发时替换输入框位置固定在聊天区最底部，阻塞直到用户回答：
 * - 多个问题以 Tab 形式排列在面板顶部，点击或 Tab 键切换
 * - 数字键 1-9 快速选择当前问题的选项
 * - Enter 提交全部回答，Esc 跳过（取消）
 */
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, CornerDownLeft, Edit3, HelpCircle, X } from 'lucide-react';

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

interface UserQuestionDockProps {
  question: {
    questionId: string;
    questions: QuestionItem[];
  };
  onAnswer: (questionId: string, answers: Record<string, string | string[]>) => void;
  onDismiss: () => void;
}

const UserQuestionDock: React.FC<UserQuestionDockProps> = ({ question, onAnswer, onDismiss }) => {
  const items = question.questions || [];

  // 当前激活的 Tab（问题索引）
  const [activeTab, setActiveTab] = useState(0);
  // 每个 question 索引 → 当前选择（string 或 string[]）
  const [answersMap, setAnswersMap] = useState<Record<number, string | string[]>>({});
  const [customMode, setCustomMode] = useState<Record<number, boolean>>({});
  const [customValue, setCustomValue] = useState<Record<number, string>>({});

  // 新提问到达：重置状态，定位到第一个问题
  useEffect(() => {
    setAnswersMap({});
    setCustomMode({});
    setCustomValue({});
    setActiveTab(0);
  }, [question.questionId]);

  const isAnswered = (i: number): boolean => {
    const ans = answersMap[i];
    const item = items[i];
    if (!item) return false;
    return item.multiSelect
      ? Array.isArray(ans) && ans.length > 0
      : typeof ans === 'string' && ans.trim().length > 0;
  };
  const allAnswered = items.length > 0 && items.every((_, i) => isAnswered(i));
  const answeredCount = items.filter((_, i) => isAnswered(i)).length;

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

  /** 单选后自动跳到下一个未回答的问题；全答完则停留 */
  const findNextUnanswered = (from: number): number => {
    for (let step = 1; step <= items.length; step++) {
      const idx = (from + step) % items.length;
      if (!isAnswered(idx)) return idx;
    }
    return -1;
  };

  const selectOption = (i: number, label: string) => {
    const item = items[i];
    if (!item) return;
    if (item.multiSelect) {
      toggleMulti(i, label);
    } else {
      setAnswer(i, label);
      setCustomMode((p) => ({ ...p, [i]: false }));
      const next = findNextUnanswered(i);
      if (next !== -1) setActiveTab(next);
    }
  };

  const submitCustom = (i: number) => {
    const val = (customValue[i] || '').trim();
    if (!val) return;
    setAnswer(i, val);
    setCustomMode((p) => ({ ...p, [i]: false }));
    const next = findNextUnanswered(i);
    if (next !== -1) setActiveTab(next);
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

  // 全局键盘快捷键：数字选择 / Tab 切换问题 / Enter 提交 / Esc 跳过
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 中文输入法组合期间不拦截按键（按 Esc 取消候选词是最常见误触来源）
      if (e.isComposing || e.keyCode === 229) return;
      const t = e.target as HTMLElement | null;
      // 自定义输入框中不拦截按键
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        setActiveTab((prev) => (prev + (e.shiftKey ? items.length - 1 : 1)) % items.length);
        return;
      }
      if (e.key === 'Enter' && allAnswered) {
        e.preventDefault();
        submit();
        return;
      }
      const n = parseInt(e.key, 10);
      if (!isNaN(n) && n >= 1 && n <= 9) {
        const opt = items[activeTab]?.options[n - 1];
        if (opt) selectOption(activeTab, opt.label);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.questionId, activeTab, answersMap, items]);

  if (items.length === 0) return null;

  const item = items[activeTab];
  const currentAnswer = answersMap[activeTab];
  const isCustom = customMode[activeTab] === true;
  const customSelected = typeof currentAnswer === 'string'
    && !item.options.some((o) => o.label === currentAnswer);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="glass border-t border-gray-200/50 p-2 flex-shrink-0"
    >
      <div className="rounded-xl bg-white/80 border border-gray-200/60 shadow-sm overflow-hidden">
        {/* 标题栏 + Tab 切换 */}
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-2 border-b border-gray-100 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-1.5 text-xs font-medium text-cream-900 shrink-0 pr-1">
            <HelpCircle size={13} className="text-primary-blue" />
            <span>需要你的输入</span>
          </div>
          <div className="w-px h-4 bg-gray-200 shrink-0" />
          {items.map((q, i) => {
            const answered = isAnswered(i);
            const active = i === activeTab;
            return (
              <button
                key={i}
                onClick={() => setActiveTab(i)}
                className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-lg text-xs font-medium border transition-all whitespace-nowrap shrink-0
                  ${active
                    ? 'border-primary-blue bg-primary-blue text-white shadow-sm'
                    : answered
                      ? 'border-green-200 bg-green-50/60 text-green-700 hover:bg-green-50'
                      : 'border-gray-200 bg-white/70 text-gray-500 hover:bg-white hover:border-gray-300/70 hover:text-gray-700 shadow-sm'
                  }`}
                title={q.question}
              >
                <span className={`w-4 h-4 flex items-center justify-center rounded text-[10px] font-mono font-semibold
                  ${active
                    ? 'bg-white/25 text-white'
                    : answered
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {answered ? <Check size={10} /> : i + 1}
                </span>
                <span>{q.header || q.question.slice(0, 12)}</span>
              </button>
            );
          })}
          <div className="flex-1" />
          <button
            onClick={onDismiss}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
            aria-label="跳过提问"
            title="跳过（Esc）"
          >
            <X size={14} />
          </button>
        </div>

        {/* 当前问题内容 */}
        <div className="px-4 py-3">
          <p className="text-sm text-gray-800 leading-relaxed mb-2.5 whitespace-pre-wrap">
            {item.question}
          </p>

          {/* 选项列表 */}
          {!isCustom && (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
              {item.options.map((opt, idx) => {
                const selected = item.multiSelect
                  ? Array.isArray(currentAnswer) && currentAnswer.includes(opt.label)
                  : currentAnswer === opt.label;
                return (
                  <button
                    key={idx}
                    onClick={() => selectOption(activeTab, opt.label)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-all
                      ${selected
                        ? 'border-primary-blue bg-primary-blue/5 text-gray-800'
                        : 'border-gray-200/80 hover:border-gray-300 hover:bg-gray-50 text-gray-700'
                      }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center
                        ${item.multiSelect ? 'rounded' : 'rounded-full'}
                        border transition-colors text-[10px] font-mono font-semibold
                        ${selected ? 'bg-primary-blue border-primary-blue text-white' : 'border-gray-300 bg-white text-gray-400'}`}
                      >
                        {selected ? <Check size={10} /> : (idx < 9 ? idx + 1 : '')}
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
              {item.allowOther !== false && (
                <button
                  onClick={() => {
                    setCustomMode((p) => ({ ...p, [activeTab]: true }));
                    if (customSelected && !customValue[activeTab]) {
                      setCustomValue((p) => ({ ...p, [activeTab]: currentAnswer as string }));
                    }
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg border transition-all flex items-center gap-2.5 text-sm
                    ${customSelected
                      ? 'border-primary-blue bg-primary-blue/5 text-gray-800'
                      : 'border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-500 hover:text-gray-700'}`}
                >
                  <div className={`shrink-0 w-4 h-4 flex items-center justify-center rounded-full border transition-colors
                    ${customSelected ? 'bg-primary-blue border-primary-blue' : 'border-gray-300 bg-white'}`}
                  >
                    {customSelected && <Check size={10} className="text-white" />}
                  </div>
                  <Edit3 size={13} />
                  <span>{customSelected ? `其他：${currentAnswer as string}` : '其他（自定义输入）'}</span>
                </button>
              )}
            </div>
          )}

          {/* 自定义输入模式 */}
          {isCustom && (
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  value={customValue[activeTab] || ''}
                  onChange={(e) => setCustomValue((p) => ({ ...p, [activeTab]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submitCustom(activeTab);
                    }
                  }}
                  placeholder="输入你的回答..."
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white
                    focus:border-primary-blue focus:ring-2 focus:ring-primary-blue/20
                    placeholder-gray-400 outline-none transition-all"
                />
                <button
                  onClick={() => submitCustom(activeTab)}
                  disabled={!(customValue[activeTab] || '').trim()}
                  className="shrink-0 p-1.5 rounded-lg text-white shadow-sm hover:shadow-md transition-all
                    bg-primary-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                  title="确认输入"
                >
                  <Check size={14} />
                </button>
              </div>
              <button
                onClick={() => setCustomMode((p) => ({ ...p, [activeTab]: false }))}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                ← 返回选项
              </button>
            </div>
          )}
        </div>

        {/* 底部操作条 */}
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400 truncate">
            {items.length > 1 ? `数字键选择 · Tab 切换问题（${answeredCount}/${items.length} 已回答）` : '数字键快速选择'}
            <span className="mx-1">·</span>Esc 跳过
          </span>
          {/* 提交按钮：与发送按钮同款样式 */}
          <button
            onClick={submit}
            disabled={!allAnswered}
            className="p-1.5 text-white rounded-lg shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none hover:shadow-md transition-all bg-primary-blue"
            title="提交回答（Enter）"
          >
            <CornerDownLeft size={16} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default UserQuestionDock;
