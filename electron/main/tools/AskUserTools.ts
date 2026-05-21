import { ipcMain } from 'electron';
import type { Tool } from './ToolManager';

// ==================== 待处理问题 Map ====================

interface PendingQuestion {
  resolve: (answer: string) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

const pendingQuestions = new Map<string, PendingQuestion>();

// 超时时间：5 分钟
const QUESTION_TIMEOUT = 5 * 60 * 1000;

/**
 * 注册用户回答的 IPC handler
 * 在 chat:stream 执行前调用一次即可
 */
export function registerAskUserIpc(): void {
  ipcMain.handle('chat:answer_question', async (_event, data: { questionId: string; answer: string }) => {
    const pending = pendingQuestions.get(data.questionId);
    if (!pending) {
      console.warn(`[AskUser] No pending question found for id: ${data.questionId}`);
      return { success: false, error: '问题已过期或不存在' };
    }

    pendingQuestions.delete(data.questionId);
    pending.resolve(data.answer);
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
    description: '向用户提问并等待回答。可以提供预定义选项供用户选择，也可以允许用户自由输入。适用于需要用户确认、选择方案、补充信息等场景。',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: '要向用户提出的问题',
        },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: {
                type: 'string',
                description: '选项的显示文本',
              },
              value: {
                type: 'string',
                description: '选项的实际值（返回给 AI）',
              },
              description: {
                type: 'string',
                description: '选项的补充说明（可选）',
              },
            },
            required: ['label', 'value'],
          },
          description: '预定义选项列表。每个选项包含 label（显示文本）和 value（实际值），可选 description（补充说明）',
        },
        allow_custom: {
          type: 'boolean',
          default: true,
          description: '是否允许用户自由输入自定义回答（默认允许）',
        },
        custom_placeholder: {
          type: 'string',
          description: '自定义输入框的占位提示文字',
        },
      },
      required: ['question'],
    },
    handler: async (args: any) => {
      const { question, options = [], allow_custom = true, custom_placeholder = '输入你的回答...' } = args;

      // 清理过期问题
      cleanupExpiredQuestions();

      // 生成唯一问题 ID
      const questionId = `q-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // 通过 globalThis + Symbol.for() 获取 WebContents
      const senderKey = Symbol.for('zero-employee:chatWebContents');
      const webContents = (globalThis as any)[senderKey] as any;

      if (!webContents || typeof webContents.send !== 'function') {
        return {
          success: false,
          error: '无法连接到用户界面，请直接回复用户的消息',
        };
      }

      // 发送问题到渲染进程
      const questionData = {
        questionId,
        question,
        options,
        allow_custom,
        custom_placeholder,
      };

      webContents.send('chat:user_question', questionData);

      // 创建 Promise 等待用户回答
      const answerPromise = new Promise<string>((resolve, reject) => {
        pendingQuestions.set(questionId, { resolve, reject, timestamp: Date.now() });

        // 设置超时自动清理
        setTimeout(() => {
          const pending = pendingQuestions.get(questionId);
          if (pending) {
            pendingQuestions.delete(questionId);
            reject(new Error('用户未在规定时间内回答'));
          }
        }, QUESTION_TIMEOUT);
      });

      try {
        const answer = await answerPromise;
        return {
          success: true,
          answer,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || '用户取消了回答',
        };
      }
    },
  },
];
