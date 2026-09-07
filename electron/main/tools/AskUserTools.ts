import { ipcMain } from 'electron';
import type { Tool } from './ToolManager';

// ==================== 待处理问题 Map ====================

interface PendingQuestion {
  resolve: (answer: any) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

const pendingQuestions = new Map<string, PendingQuestion>();

// 超时时间：10 分钟（多问题向导需要更长时间）
const QUESTION_TIMEOUT = 10 * 60 * 1000;

/**
 * 注册用户回答的 IPC handler
 * 在 chat:stream 执行前调用一次即可
 */
export function registerAskUserIpc(): void {
  ipcMain.handle('chat:answer_question', async (_event, data: { questionId: string; answers: any }) => {
    const pending = pendingQuestions.get(data.questionId);
    if (!pending) {
      console.warn(`[AskUser] No pending question found for id: ${data.questionId}`);
      return { success: false, error: '问题已过期或不存在' };
    }

    pendingQuestions.delete(data.questionId);
    pending.resolve(data.answers);
    return { success: true };
  });
}

/**
 * 清理超时的待处理问题
 */
function cleanupExpiredQuestions(): void {
  const now = Date.now();
  for (const [id, pending] of pendingQuestions) {
    if (now - pending.timestamp > QUESTION_TIMEOUT) {
      pendingQuestions.delete(id);
      pending.reject(new Error('用户未在规定时间内回答'));
    }
  }
}

// ==================== 工具定义 ====================

export const askUserTools: Tool[] = [
  {
    name: 'ask_user',
    description: `向用户提问并等待回答。支持单问题或多问题向导（每个问题独立显示为一个 tab/步骤）。

**何时使用**：
- 需要用户在多个方案中做选择
- 需要澄清需求（推荐一次性提出所有相关问题，而不是多次询问）
- 需要用户确认关键操作

**强烈建议**：
- **每次提问都应主动设计选项**（2-4 个），而不是只抛问题让用户自己想。基于上下文给出最可能的候选。
- **批量提问**：如果有多个相关问题，一次性放在 questions 数组里，UI 会以分步向导形式呈现，体验远好于多次单独询问。
- **选项要具体**：避免"是/否"这种空泛选项，给出带描述的具体方案。

**参数**：
- questions: 问题数组。每个问题包含：
  - question: 完整的问题描述
  - header: 简短标签（≤12 字符，用于 tab 显示，如"配色"、"页数"）
  - options: 选项数组（2-4 个）。每个选项含 label（显示文本）和 description（说明）
  - multiSelect: 是否多选（默认 false）
  - allowOther: 是否允许用户选"其他"并自定义输入（默认 true）

**兼容模式**：如果只传 question 字符串（不带 questions 数组），将作为单问题处理。

**返回**：
- 单问题：返回 { success, answer }（answer 为选中选项的 label 或自定义文本）
- 多问题：返回 { success, answers }（answers 为 { [问题文本]: 答案 } 对象）

**⚠️ 关键规则**：本工具会一直阻塞直到用户回答。如果返回 success:false（用户跳过或超时），**必须停止当前任务**，用文字告知用户你在等待他的回答，**严禁自行假设用户的回答继续执行**。`,
    parameters: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          description: '问题数组。批量提问时使用，UI 会以分步向导形式呈现。',
          items: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: '完整的问题文本',
              },
              header: {
                type: 'string',
                description: '简短标签（≤12 字符），用于 tab/步骤指示器显示',
              },
              options: {
                type: 'array',
                description: '预定义选项。AI 应主动设计最可能的候选，而不是让用户自己想',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string', description: '选项的显示文本' },
                    description: { type: 'string', description: '选项的说明（可选）' },
                  },
                  required: ['label'],
                },
              },
              multiSelect: {
                type: 'boolean',
                default: false,
                description: '是否允许多选',
              },
              allowOther: {
                type: 'boolean',
                default: true,
                description: '是否允许用户选"其他"并自定义输入',
              },
            },
            required: ['question', 'header', 'options'],
          },
        },
        // ===== 兼容字段（旧版单问题模式）=====
        question: {
          type: 'string',
          description: '【兼容】单个问题文本。如果已用 questions 数组则无需传此字段。',
        },
        options: {
          type: 'array',
          description: '【兼容】单问题的选项列表。每个选项含 label 和 value。',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              value: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['label', 'value'],
          },
        },
        allow_custom: {
          type: 'boolean',
          default: true,
          description: '【兼容】单问题时是否允许自定义输入',
        },
        custom_placeholder: { type: 'string' },
      },
    },
    handler: async (args: any) => {
      cleanupExpiredQuestions();

      // 规范化为统一的 questions 数组
      let normalizedQuestions: any[];
      if (Array.isArray(args.questions) && args.questions.length > 0) {
        // 新模式：多问题向导
        normalizedQuestions = args.questions.map((q: any, idx: number) => ({
          question: q.question || `问题 ${idx + 1}`,
          header: (q.header || `Q${idx + 1}`).slice(0, 12),
          options: normalizeOptions(q.options),
          multiSelect: !!q.multiSelect,
          allowOther: q.allowOther !== false,
        }));
      } else {
        // 兼容模式：单问题
        normalizedQuestions = [{
          question: args.question || '请回答',
          header: '提问',
          options: normalizeOptions(args.options),
          multiSelect: false,
          allowOther: args.allow_custom !== false,
        }];
      }

      const questionId = `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const senderKey = Symbol.for('zero-employee:chatWebContents');
      const webContents = (globalThis as any)[senderKey] as any;

      if (!webContents || typeof webContents.send !== 'function') {
        return { success: false, error: '无法连接到用户界面，请直接回复用户的消息' };
      }

      const payload = { questionId, questions: normalizedQuestions };
      webContents.send('chat:user_question', payload);

      const answerPromise = new Promise<any>((resolve, reject) => {
        pendingQuestions.set(questionId, { resolve, reject, timestamp: Date.now() });
        setTimeout(() => {
          const pending = pendingQuestions.get(questionId);
          if (pending) {
            pendingQuestions.delete(questionId);
            reject(new Error('用户未在规定时间内回答'));
          }
        }, QUESTION_TIMEOUT);
      });

      try {
        const answers = await answerPromise;

        // 用户跳过（前端 Esc/X 发送 null）或异常空回答：返回明确的失败信号，阻止 AI 自行假设继续执行
        const hasAnswers = answers && typeof answers === 'object'
          && Object.values(answers).some((v) =>
            (Array.isArray(v) && v.length > 0) || (typeof v === 'string' && v.trim().length > 0));
        if (!hasAnswers) {
          return {
            success: false,
            error: '用户跳过了回答。请停止当前任务，用文字告知用户需要他的回答才能继续，严禁自行假设用户的回答继续执行。',
          };
        }

        // 单问题 → 旧格式返回（answer 字段）
        if (normalizedQuestions.length === 1) {
          const q = normalizedQuestions[0];
          const ans = answers?.[q.question];
          return { success: true, answer: Array.isArray(ans) ? ans.join(', ') : (ans || '') };
        }

        // 多问题 → 返回 answers 对象
        return { success: true, answers, questionCount: normalizedQuestions.length };
      } catch (error: any) {
        return {
          success: false,
          error: `${error.message || '用户取消了回答'}。请停止当前任务，用文字告知用户你在等待他的回答，严禁自行假设继续执行。`,
        };
      }
    },
  },
];

/**
 * 规范化 options：兼容 value/label 两种结构、单个对象、字符串等
 */
function normalizeOptions(raw: any): { label: string; description?: string }[] {
  if (!raw) return [];
  let arr: any[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'object') arr = [raw];
  else if (typeof raw === 'string') return [{ label: raw }];

  return arr
    .map((o): { label: string; description?: string } | null => {
      if (typeof o === 'string') return { label: o };
      if (!o || typeof o !== 'object') return null;
      const label = o.label || o.value || o.name || String(o);
      const description = o.description;
      return { label: String(label), description };
    })
    .filter((x): x is { label: string; description?: string } => x !== null);
}
