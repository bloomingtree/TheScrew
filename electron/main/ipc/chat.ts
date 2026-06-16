import { ipcMain } from 'electron';
import { OpenAIClient } from '../api/openai';
import Store from 'electron-store';
import { toolManager, ToolGroup } from '../tools/ToolManager';
import { fileTools } from '../tools/FileTools';
import { bashTools } from '../tools/BashTools';
import { officeCLITools, isAvailable as isOfficeCLIAvailable, officeCLIToolGroup } from '../tools/OfficeCLITools';
import { askUserTools, registerAskUserIpc } from '../tools/AskUserTools';
import { searchTools } from '../tools/SearchTools';
import { knowledgeTools } from '../tools/KnowledgeTools';
import { taskTools } from '../tools/TaskTools';
import { remoteTools } from '../tools/RemoteTools';
import { dbTools } from '../tools/DbTools';
import { pdfTools } from '../tools/PdfTools';
import { reportTools } from '../tools/ReportTools';
import { pptxDesignTools } from '../tools/PptxDesignTools';
import { getContextBuilder } from '../core/ContextBuilder';
import { runAgentTurn, abortCurrentTurn } from '../core/AgentRunner';
import { getAppConfigStore } from '../config/AppConfigStore';

/**
 * 注册聊天相关的 IPC handler
 *
 * 注意：chat:stream 的核心执行逻辑已抽取到 AgentRunner.runAgentTurn，
 * 供用户对话、定时任务（cron）、后台巡检（heartbeat）三条路径复用。
 */
export function registerChatHandlers(store: Store) {
  // 注册 ask_user 的 IPC handler（用户回答问题时触发）
  registerAskUserIpc();

  // 注册基础工具组（包含文件操作工具、Bash 工具、ask_user 工具）
  const baseTools: any[] = [...fileTools, ...bashTools, ...searchTools, ...askUserTools, ...knowledgeTools, ...taskTools, ...remoteTools, ...dbTools, ...pdfTools, ...reportTools, ...pptxDesignTools];

  // 如果 OfficeCLI 已安装，注册 Office 工具
  if (isOfficeCLIAvailable()) {
    baseTools.push(...officeCLITools);
    console.log('[ChatHandler] OfficeCLI tools registered');
  } else {
    console.log('[ChatHandler] OfficeCLI not available, office tools skipped');
  }

  const baseToolGroup: ToolGroup = {
    name: 'base',
    tools: baseTools,
    keywords: [],
    triggers: {
      keywords: [],
      fileExtensions: [],
      dependentTools: [],
    },
  };
  toolManager.registerToolGroup(baseToolGroup);

  // 始终注册 OfficeCLI 工具组元数据（供按需加载）
  if (isOfficeCLIAvailable()) {
    toolManager.registerToolGroup(officeCLIToolGroup as any);
  }

  // 初始化 Office Skills (现在只从 workspace 加载)
  toolManager.initialize().catch(console.error);

  ipcMain.handle('chat:generateTitle', async (_event, message: string) => {
    try {
      const appConfigStore = getAppConfigStore();
      const config = appConfigStore.getActiveConfig();

      if (!config || !config.apiKey) {
        throw new Error('请先配置 API Key');
      }

      const client = new OpenAIClient(
        config.baseUrl,
        config.apiKey,
        config.model,
        config.temperature,
        100
      );

      const titlePrompt = `请根据以下对话内容生成一个简短的中文标题（不超过10个字符）：\n\n${message}\n\n只返回标题，不要其他内容。`;

      const messages = [
        { role: 'user', content: titlePrompt }
      ];

      const chunks: string[] = [];
      for await (const chunk of client.streamChat(messages, undefined, [])) {
        try {
          const parsed = JSON.parse(chunk);
          if (parsed.type !== 'tool_calls') {
            chunks.push(chunk);
          }
        } catch (e) {
          if (!chunk.startsWith('\x01THINKING\x02')) {
            chunks.push(chunk);
          }
        }
      }

      let title = chunks.join('').trim();

      if (title.length > 10) {
        title = title.substring(0, 10);
      }

      if (!title) {
        title = '新对话';
      }

      return { success: true, title };
    } catch (error: any) {
      console.error('Failed to generate conversation title:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * chat:stream - 用户对话入口
   *
   * 核心执行逻辑委托给 AgentRunner.runAgentTurn。
   * 这里只做：同步激活对话 ID + 转发调用。
   */
  ipcMain.handle('chat:stream', async (event, messages: any[], conversationId?: string) => {
    // 同步当前激活对话 ID（双保险：前端切换时已通过 conversation:setActive 更新）
    if (conversationId) {
      (globalThis as any)[Symbol.for('zero-employee:activeConversationId')] = conversationId;
    }

    return await runAgentTurn({
      conversationId,
      messages,
      sender: event.sender,
      source: 'user',
    });
  });

  ipcMain.handle('chat:stop', () => {
    abortCurrentTurn();
    return { success: true };
  });
}

/**
 * Register context-related IPC handlers
 */
export function registerContextHandlers(): void {
  const contextBuilder = getContextBuilder();

  // Build system prompt with ContextBuilder
  ipcMain.handle('context:buildSystemPrompt', async (_event, options?: {
    workspacePath?: string;
    includeMemory?: boolean;
    maxMemoryTokens?: number;
  }) => {
    try {
      const prompt = await contextBuilder.buildSystemPrompt(options || {});
      return {
        success: true,
        prompt,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Estimate system prompt tokens
  ipcMain.handle('context:estimateTokens', async (_event, options?: {
    workspacePath?: string;
    includeMemory?: boolean;
  }) => {
    try {
      const tokens = await contextBuilder.estimateSystemPromptTokens(options || {});
      return {
        success: true,
        tokens,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  console.log('[IPC] Context handlers registered');
}
