import { ipcMain } from 'electron';
import * as db from '../db';

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  images?: string[];
  toolCalls?: any[];
  toolCallId?: string;
}

/**
 * 注册对话和消息相关的 IPC 处理器
 */
export function registerConversationHandlers() {
  // ==================== Conversations ====================

  /**
   * 获取所有对话
   */
  ipcMain.handle('conversation:getAll', async () => {
    try {
      const conversations = db.getAllConversations();
      return {
        success: true,
        data: conversations.map((conv) => ({
          id: conv.id,
          title: conv.title,
          createdAt: conv.created_at,
          updatedAt: conv.updated_at,
        })),
      };
    } catch (error: any) {
      console.error('Failed to get conversations:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 根据 ID 获取对话
   */
  ipcMain.handle('conversation:getById', async (_event, id: string) => {
    try {
      const conversation = db.getConversationWithMessages(id);
      if (!conversation) {
        return { success: false, error: 'Conversation not found' };
      }

      return {
        success: true,
        data: {
          id: conversation.id,
          title: conversation.title,
          createdAt: conversation.created_at,
          updatedAt: conversation.updated_at,
          messages: conversation.messages.map((msg) => ({
            id: msg.id,
            conversationId: msg.conversation_id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            images: msg.images ? JSON.parse(msg.images) : undefined,
            toolCalls: msg.tool_calls ? JSON.parse(msg.tool_calls) : undefined,
            toolCallId: msg.tool_call_id || undefined,
          })),
        },
      };
    } catch (error: any) {
      console.error('Failed to get conversation:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 创建对话
   */
  ipcMain.handle('conversation:create', async (_event, conversation: Omit<Conversation, 'createdAt' | 'updatedAt'>) => {
    try {
      const result = await db.createConversation({
        id: conversation.id,
        title: conversation.title,
      });

      // 批量创建消息
      if (conversation.messages && conversation.messages.length > 0) {
        const messagesToInsert = conversation.messages.map((msg) => ({
          id: msg.id,
          conversation_id: conversation.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          images: msg.images,
          toolCalls: msg.toolCalls,
          tool_call_id: msg.toolCallId ?? null,
        }));
        await db.createMessages(messagesToInsert);
      }

      return {
        success: true,
        data: {
          id: result.id,
          title: result.title,
          createdAt: result.created_at,
          updatedAt: result.updated_at,
        },
      };
    } catch (error: any) {
      console.error('Failed to create conversation:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 更新对话标题
   */
  ipcMain.handle('conversation:updateTitle', async (_event, id: string, title: string) => {
    try {
      await db.updateConversation(id, { title, updated_at: Date.now() });
      return { success: true };
    } catch (error: any) {
      console.error('Failed to update conversation title:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 更新对话的更新时间
   */
  ipcMain.handle('conversation:touch', async (_event, id: string) => {
    try {
      await db.touchConversation(id);
      return { success: true };
    } catch (error: any) {
      console.error('Failed to touch conversation:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 删除对话
   */
  ipcMain.handle('conversation:delete', async (_event, id: string) => {
    try {
      await db.deleteConversation(id);
      return { success: true };
    } catch (error: any) {
      console.error('Failed to delete conversation:', error);
      return { success: false, error: error.message };
    }
  });

  // ==================== Messages ====================

  /**
   * 获取对话的所有消息
   */
  ipcMain.handle('message:getByConversationId', async (_event, conversationId: string) => {
    try {
      const messages = db.getMessagesByConversationId(conversationId);
      return {
        success: true,
        data: messages.map((msg) => ({
          id: msg.id,
          conversationId: msg.conversation_id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          images: msg.images ? JSON.parse(msg.images) : undefined,
          toolCalls: msg.tool_calls ? JSON.parse(msg.tool_calls) : undefined,
          toolCallId: msg.tool_call_id || undefined,
        })),
      };
    } catch (error: any) {
      console.error('Failed to get messages:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 添加消息到对话
   */
  ipcMain.handle('message:add', async (_event, message: Message & { conversationId: string }) => {
    try {
      const result = await db.createMessage({
        id: message.id,
        conversation_id: message.conversationId,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        images: message.images,
        toolCalls: message.toolCalls,
        tool_call_id: message.toolCallId ?? null,
      });

      return {
        success: true,
        data: {
          id: result.id,
          conversationId: result.conversation_id,
          role: result.role,
          content: result.content,
          timestamp: result.timestamp,
          images: result.images ? JSON.parse(result.images) : undefined,
          toolCalls: result.tool_calls ? JSON.parse(result.tool_calls) : undefined,
          toolCallId: result.tool_call_id ?? undefined,
        },
      };
    } catch (error: any) {
      console.error('Failed to add message:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 批量添加消息
   */
  ipcMain.handle('message:addBatch', async (_event, messages: (Message & { conversationId: string })[]) => {
    try {
      const messagesToInsert = messages.map((msg) => ({
        id: msg.id,
        conversation_id: msg.conversationId,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        images: msg.images,
        toolCalls: msg.toolCalls,
        tool_call_id: msg.toolCallId ?? null,
      }));

      await db.createMessages(messagesToInsert);

      return { success: true };
    } catch (error: any) {
      console.error('Failed to add messages in batch:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 删除消息
   */
  ipcMain.handle('message:delete', async (_event, id: string) => {
    try {
      await db.deleteMessage(id);
      return { success: true };
    } catch (error: any) {
      console.error('Failed to delete message:', error);
      return { success: false, error: error.message };
    }
  });

  // ==================== 搜索和统计 ====================

  /**
   * 搜索对话
   */
  ipcMain.handle('conversation:search', async (_event, query: string) => {
    try {
      const conversations = db.searchConversations(query);
      return {
        success: true,
        data: conversations.map((conv) => ({
          id: conv.id,
          title: conv.title,
          createdAt: conv.created_at,
          updatedAt: conv.updated_at,
          messages: conv.messages.map((msg) => ({
            id: msg.id,
            conversationId: msg.conversation_id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            images: msg.images ? JSON.parse(msg.images) : undefined,
            toolCalls: msg.tool_calls ? JSON.parse(msg.tool_calls) : undefined,
            toolCallId: msg.tool_call_id || undefined,
          })),
        })),
      };
    } catch (error: any) {
      console.error('Failed to search conversations:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 获取数据库统计信息
   */
  ipcMain.handle('conversation:getStats', async () => {
    try {
      const stats = await db.getDatabaseStats();
      return { success: true, data: stats };
    } catch (error: any) {
      console.error('Failed to get database stats:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 导出数据库
   */
  ipcMain.handle('conversation:export', async () => {
    try {
      const json = db.exportDatabaseToJson();
      return { success: true, data: json };
    } catch (error: any) {
      console.error('Failed to export database:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 清空数据库
   */
  ipcMain.handle('conversation:clear', async () => {
    try {
      await db.clearDatabase();
      return { success: true };
    } catch (error: any) {
      console.error('Failed to clear database:', error);
      return { success: false, error: error.message };
    }
  });
}
