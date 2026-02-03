import Store from 'electron-store';
import { app } from 'electron';

// 使用 electron-store 存储对话数据
const store = new Store({
  name: 'conversations',
  encryptionKey: 'chat-history-encryption-key', // 可选的加密
});

// 数据结构
export interface ConversationRow {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export type ConversationInsert = Omit<ConversationRow, 'created_at' | 'updated_at'> & {
  created_at?: number;
  updated_at?: number;
};

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  images?: string[];
  toolCalls?: any[];
  tool_call_id?: string;
}

export type MessageInsert = Omit<MessageRow, 'conversation_id'> & {
  conversation_id: string;
};

// 内部数据结构
interface StoredConversation extends ConversationRow {
  messages: MessageRow[];
}

/**
 * 初始化数据库
 */
export async function initDatabase() {
  // electron-store 不需要显式初始化
  // 确保存储的版本正确
  if (!store.has('conversations')) {
    store.set('conversations', []);
  }
  console.log('Database initialized using electron-store');
}

/**
 * 获取所有对话
 */
export function getAllConversations(): ConversationRow[] {
  const conversations = store.get<StoredConversation[]>('conversations', []);
  return conversations.map(conv => ({
    id: conv.id,
    title: conv.title,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
  }));
}

/**
 * 根据 ID 获取对话
 */
export function getConversationById(id: string): ConversationRow | null {
  const conversations = store.get<StoredConversation[]>('conversations', []);
  return conversations.find(conv => conv.id === id) || null;
}

/**
 * 创建对话
 */
export async function createConversation(conversation: ConversationInsert): Promise<ConversationRow> {
  const now = Date.now();
  const newConv: StoredConversation = {
    id: conversation.id,
    title: conversation.title,
    created_at: conversation.created_at ?? now,
    updated_at: conversation.updated_at ?? now,
    messages: [],
  };

  const conversations = store.get<StoredConversation[]>('conversations', []);
  conversations.unshift(newConv);
  store.set('conversations', conversations);

  return {
    id: newConv.id,
    title: newConv.title,
    created_at: newConv.created_at,
    updated_at: newConv.updated_at,
  };
}

/**
 * 更新对话
 */
export async function updateConversation(id: string, updates: Partial<Omit<ConversationInsert, 'id'>>): Promise<void> {
  const conversations = store.get<StoredConversation[]>('conversations', []);
  const index = conversations.findIndex(conv => conv.id === id);

  if (index === -1) return;

  if (updates.title !== undefined) {
    conversations[index].title = updates.title;
  }
  if (updates.updated_at !== undefined) {
    conversations[index].updated_at = updates.updated_at;
  }

  store.set('conversations', conversations);
}

/**
 * 删除对话
 */
export async function deleteConversation(id: string): Promise<void> {
  const conversations = store.get<StoredConversation[]>('conversations', []);
  const filtered = conversations.filter(conv => conv.id !== id);
  store.set('conversations', filtered);
}

/**
 * 更新对话的更新时间
 */
export async function touchConversation(id: string): Promise<void> {
  const conversations = store.get<StoredConversation[]>('conversations', []);
  const index = conversations.findIndex(conv => conv.id === id);

  if (index !== -1) {
    conversations[index].updated_at = Date.now();
    // 将对话移到前面
    const conv = conversations.splice(index, 1)[0];
    conversations.unshift(conv);
    store.set('conversations', conversations);
  }
}

// ==================== Messages 操作 ====================

/**
 * 获取对话的所有消息
 */
export function getMessagesByConversationId(conversationId: string): MessageRow[] {
  const conversations = store.get<StoredConversation[]>('conversations', []);
  const conv = conversations.find(c => c.id === conversationId);
  return conv?.messages || [];
}

/**
 * 根据 ID 获取消息
 */
export function getMessageById(id: string): MessageRow | null {
  const conversations = store.get<StoredConversation[]>('conversations', []);
  for (const conv of conversations) {
    const msg = conv.messages.find(m => m.id === id);
    if (msg) return msg;
  }
  return null;
}

/**
 * 创建消息
 */
export async function createMessage(message: MessageInsert): Promise<MessageRow> {
  const conversations = store.get<StoredConversation[]>('conversations', []);
  const index = conversations.findIndex(conv => conv.id === message.conversation_id);

  if (index === -1) {
    throw new Error('Conversation not found');
  }

  conversations[index].messages.push(message);
  conversations[index].updated_at = Date.now();

  // 将对话移到前面
  const conv = conversations.splice(index, 1)[0];
  conversations.unshift(conv);
  store.set('conversations', conversations);

  return message;
}

/**
 * 批量创建消息
 */
export async function createMessages(messages: MessageInsert[]): Promise<void> {
  if (messages.length === 0) return;

  const conversations = store.get<StoredConversation[]>('conversations', []);

  for (const msg of messages) {
    const index = conversations.findIndex(conv => conv.id === msg.conversation_id);
    if (index !== -1) {
      conversations[index].messages.push(msg as MessageRow);
      conversations[index].updated_at = Date.now();
    }
  }

  store.set('conversations', conversations);
}

/**
 * 删除消息
 */
export async function deleteMessage(id: string): Promise<void> {
  const conversations = store.get<StoredConversation[]>('conversations', []);

  for (const conv of conversations) {
    const index = conv.messages.findIndex(m => m.id === id);
    if (index !== -1) {
      conv.messages.splice(index, 1);
      conv.updated_at = Date.now();
      break;
    }
  }

  store.set('conversations', conversations);
}

/**
 * 删除对话的所有消息
 */
export async function deleteMessagesByConversationId(conversationId: string): Promise<void> {
  const conversations = store.get<StoredConversation[]>('conversations', []);
  const index = conversations.findIndex(conv => conv.id === conversationId);

  if (index !== -1) {
    conversations[index].messages = [];
    conversations[index].updated_at = Date.now();
    store.set('conversations', conversations);
  }
}

// ==================== 组合操作 ====================

/**
 * 获取完整的对话（包含消息）
 */
export interface ConversationWithMessages extends ConversationRow {
  messages: MessageRow[];
}

export function getConversationWithMessages(id: string): ConversationWithMessages | null {
  const conversations = store.get<StoredConversation[]>('conversations', []);
  const conv = conversations.find(c => c.id === id);

  if (!conv) return null;

  return {
    id: conv.id,
    title: conv.title,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
    messages: conv.messages,
  };
}

/**
 * 获取所有对话（包含消息）
 */
export function getAllConversationsWithMessages(): ConversationWithMessages[] {
  const conversations = store.get<StoredConversation[]>('conversations', []);
  return conversations.map(conv => ({
    id: conv.id,
    title: conv.title,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
    messages: conv.messages,
  }));
}

/**
 * 搜索对话
 */
export function searchConversations(query: string): ConversationWithMessages[] {
  const conversations = store.get<StoredConversation[]>('conversations', []);
  const searchTerm = query.toLowerCase();

  return conversations.filter(conv => {
    // 搜索标题
    if (conv.title.toLowerCase().includes(searchTerm)) {
      return true;
    }
    // 搜索消息内容
    return conv.messages.some(msg =>
      msg.content.toLowerCase().includes(searchTerm)
    );
  }).map(conv => ({
    id: conv.id,
    title: conv.title,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
    messages: conv.messages,
  }));
}

// ==================== 数据库管理 ====================

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  // electron-store 不需要关闭
}

/**
 * 获取数据库统计信息
 */
export interface DatabaseStats {
  totalConversations: number;
  totalMessages: number;
  databaseSize: number;
}

export async function getDatabaseStats(): Promise<DatabaseStats> {
  const conversations = store.get<StoredConversation[]>('conversations', []);
  const totalMessages = conversations.reduce((sum, conv) => sum + conv.messages.length, 0);

  // 获取存储文件大小
  const fs = await import('fs/promises');
  const path = await import('path');
  const userDataPath = app.getPath('userData');
  const storePath = path.join(userDataPath, 'conversations.json');

  let databaseSize = 0;
  try {
    const stats = await fs.stat(storePath);
    databaseSize = stats.size;
  } catch (err) {
    // 文件可能不存在
  }

  return {
    totalConversations: conversations.length,
    totalMessages,
    databaseSize,
  };
}

/**
 * 导出数据库为 JSON
 */
export function exportDatabaseToJson(): string {
  const conversations = getAllConversationsWithMessages();
  return JSON.stringify(conversations, null, 2);
}

/**
 * 清空数据库
 */
export async function clearDatabase(): Promise<void> {
  store.set('conversations', []);
}

/**
 * 更新对话消息列表
 */
export async function updateConversationMessages(id: string, messages: MessageRow[]): Promise<void> {
  const conversations = store.get<StoredConversation[]>('conversations', []);
  const index = conversations.findIndex(conv => conv.id === id);

  if (index !== -1) {
    conversations[index].messages = messages;
    conversations[index].updated_at = Date.now();
    store.set('conversations', conversations);
  }
}
