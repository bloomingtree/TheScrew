/**
 * 数据库操作工具 - Oracle (oracledb thin) + SQLite
 *
 * - 查询/执行/Schema/表列表/连接测试：通过内嵌 Python + db_query.py
 * - 命名连接管理：复用 CredentialStore（加密存储，service 名 db:<name>）
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { Tool, ToolGroup } from './ToolManager';
import { getPathManager } from '../config/PathManager';
import { getCredentialStore } from '../config/CredentialStore';

const execFileAsync = promisify(execFile);

function getPythonPath(): string {
  return getPathManager().getPythonPath();
}

function getScriptsDir(): string {
  return path.join(path.dirname(getPythonPath()), '..', 'scripts');
}

/** 数据库连接信息（存入 CredentialStore 的结构） */
interface DbConnection {
  type: 'oracle' | 'sqlite';
  /** Oracle: host:port/service；SQLite: 文件路径 */
  dsn: string;
  user?: string;
  password?: string;
}

const DB_SERVICE_PREFIX = 'db:';

/**
 * 解析连接：命名连接（从 CredentialStore）优先，否则用内联 conn
 * 返回 { conn, error }
 */
async function resolveConnection(args: any): Promise<{ conn?: DbConnection; error?: string }> {
  // 命名连接优先
  if (args.connection) {
    const store = getCredentialStore();
    const raw = await store.getApiKey(DB_SERVICE_PREFIX + args.connection);
    if (!raw) {
      return { error: `命名连接 "${args.connection}" 不存在，请先用 db_add_connection 添加` };
    }
    try {
      const conn = JSON.parse(raw) as DbConnection;
      return { conn };
    } catch {
      return { error: `命名连接 "${args.connection}" 的存储数据已损坏` };
    }
  }
  // 内联连接
  if (args.conn) {
    const c = args.conn;
    if (!c.type || !c.dsn) {
      return { error: '内联 conn 必须包含 type 和 dsn' };
    }
    return { conn: { type: c.type, dsn: c.dsn, user: c.user, password: c.password } };
  }
  return { error: '必须提供 connection（命名连接）或 conn（内联连接）' };
}

/**
 * 调用 db_query.py
 */
async function runDbScript(action: string, conn: DbConnection, extra: Record<string, any>): Promise<any> {
  const pythonPath = getPythonPath();
  const scriptPath = path.join(getScriptsDir(), 'db_query.py');

  if (!fs.existsSync(pythonPath)) {
    return { error: '内嵌 Python 环境未找到' };
  }
  if (!fs.existsSync(scriptPath)) {
    return { error: '数据库脚本未找到: ' + scriptPath };
  }

  const config = {
    action,
    db_type: conn.type,
    dsn: conn.dsn,
    user: conn.user,
    password: conn.password,
    ...extra,
  };

  // 审计日志（脱敏密码）
  const logCfg = { ...config, password: conn.password ? '***' : undefined };
  console.log(`[DB] ${action} on ${conn.type} [${conn.dsn}]`, JSON.stringify(logCfg));

  try {
    const { stdout } = await execFileAsync(pythonPath, [scriptPath, JSON.stringify(config)], {
      timeout: 60000,
      maxBuffer: 20 * 1024 * 1024,
    });
    const result = JSON.parse(stdout);
    if (result.success === false) {
      return { error: result.error || '数据库操作失败' };
    }
    return { content: JSON.stringify(result, null, 2) };
  } catch (err: any) {
    if (err.killed) {
      return { error: '数据库操作超时（60s）' };
    }
    const stderr = err.stderr || '';
    if (stderr) {
      return { error: `数据库操作异常: ${stderr.split('\n').slice(-3).join(' ')}` };
    }
    return { error: `数据库操作异常: ${err.message}` };
  }
}

// ==================== 查询类工具（调 Python） ====================

const dbQueryTool: Tool = {
  name: 'db_query',
  description: '执行 SELECT 查询，返回结果集（默认限 500 行）。支持 Oracle 和 SQLite',
  parameters: {
    type: 'object',
    properties: {
      connection: { type: 'string', description: '命名连接名（db_add_connection 配置的）' },
      conn: {
        type: 'object',
        description: '内联连接（与 connection 二选一）',
        properties: {
          type: { type: 'string', enum: ['oracle', 'sqlite'] },
          dsn: { type: 'string', description: 'Oracle: host:port/service；SQLite: 文件路径' },
          user: { type: 'string' },
          password: { type: 'string' },
        },
      },
      sql: { type: 'string', description: 'SELECT 语句。Oracle 参数用 :name，SQLite 用 ? 或 :name' },
      params: { description: '绑定参数，list（对应 ? 或 :1）或 dict（对应 :name）' },
      limit: { type: 'number', description: '返回行数上限，默认 500' },
    },
    required: ['sql'],
  },
  handler: async (args: any) => {
    const { conn, error } = await resolveConnection(args);
    if (error) return { error };
    return runDbScript('query', conn!, { sql: args.sql, params: args.params, limit: args.limit });
  },
};

const dbExecuteTool: Tool = {
  name: 'db_execute',
  description: '执行 INSERT/UPDATE/DELETE/DDL，返回影响行数。⚠️ 高风险操作，需用户确认',
  parameters: {
    type: 'object',
    properties: {
      connection: { type: 'string', description: '命名连接名' },
      conn: {
        type: 'object',
        description: '内联连接',
        properties: {
          type: { type: 'string', enum: ['oracle', 'sqlite'] },
          dsn: { type: 'string' },
          user: { type: 'string' },
          password: { type: 'string' },
        },
      },
      sql: { type: 'string', description: 'SQL 语句' },
      params: { description: '绑定参数' },
    },
    required: ['sql'],
  },
  handler: async (args: any) => {
    const { conn, error } = await resolveConnection(args);
    if (error) return { error };
    return runDbScript('execute', conn!, { sql: args.sql, params: args.params });
  },
};

const dbSchemaTool: Tool = {
  name: 'db_schema',
  description: '查看表结构（列名/类型/是否可空/主键/注释）',
  parameters: {
    type: 'object',
    properties: {
      connection: { type: 'string' },
      conn: {
        type: 'object',
        description: '内联连接',
        properties: {
          type: { type: 'string', enum: ['oracle', 'sqlite'] },
          dsn: { type: 'string' },
          user: { type: 'string' },
          password: { type: 'string' },
        },
      },
      table: { type: 'string', description: '表名' },
      schema: { type: 'string', description: 'Oracle schema/owner（省略则用当前用户）' },
    },
    required: ['table'],
  },
  handler: async (args: any) => {
    const { conn, error } = await resolveConnection(args);
    if (error) return { error };
    return runDbScript('schema', conn!, { table: args.table, schema: args.schema });
  },
};

const dbTablesTool: Tool = {
  name: 'db_tables',
  description: '列出数据库中的所有表',
  parameters: {
    type: 'object',
    properties: {
      connection: { type: 'string' },
      conn: {
        type: 'object',
        description: '内联连接',
        properties: {
          type: { type: 'string', enum: ['oracle', 'sqlite'] },
          dsn: { type: 'string' },
          user: { type: 'string' },
          password: { type: 'string' },
        },
      },
      schema: { type: 'string', description: 'Oracle schema/owner（省略则查当前用户的表）' },
    },
  },
  handler: async (args: any) => {
    const { conn, error } = await resolveConnection(args);
    if (error) return { error };
    return runDbScript('tables', conn!, { schema: args.schema });
  },
};

const dbTestConnectionTool: Tool = {
  name: 'db_test_connection',
  description: '测试数据库连接是否可用，返回版本信息',
  parameters: {
    type: 'object',
    properties: {
      connection: { type: 'string' },
      conn: {
        type: 'object',
        description: '内联连接',
        properties: {
          type: { type: 'string', enum: ['oracle', 'sqlite'] },
          dsn: { type: 'string' },
          user: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  },
  handler: async (args: any) => {
    const { conn, error } = await resolveConnection(args);
    if (error) return { error };
    return runDbScript('test', conn!, {});
  },
};

// ==================== 连接管理工具（CredentialStore） ====================

const dbAddConnectionTool: Tool = {
  name: 'db_add_connection',
  description: '添加命名数据库连接（加密存储到 CredentialStore）。后续 db_query 等工具可用 connection 名引用',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '连接名（如 prod_oracle、test_sqlite）' },
      type: { type: 'string', enum: ['oracle', 'sqlite'] },
      dsn: { type: 'string', description: 'Oracle: host:port/service；SQLite: 文件路径' },
      user: { type: 'string', description: '用户名（Oracle）' },
      password: { type: 'string', description: '密码（Oracle，将加密存储）' },
    },
    required: ['name', 'type', 'dsn'],
  },
  handler: async (args: any) => {
    if (!args.name || !args.type || !args.dsn) {
      return { error: 'name, type, dsn 必填' };
    }
    const conn: DbConnection = { type: args.type, dsn: args.dsn, user: args.user, password: args.password };
    const store = getCredentialStore();
    await store.setApiKey(DB_SERVICE_PREFIX + args.name, JSON.stringify(conn));
    return { content: `命名连接 "${args.name}" 已保存（${args.type}，加密存储）` };
  },
};

const dbListConnectionsTool: Tool = {
  name: 'db_list_connections',
  description: '列出已配置的命名数据库连接（不返回密码）',
  parameters: { type: 'object', properties: {} },
  handler: async (_args: any) => {
    const store = getCredentialStore();
    const services = store.listServices().filter((s) => s.startsWith(DB_SERVICE_PREFIX));
    if (services.length === 0) {
      return { content: '尚未配置任何数据库连接。用 db_add_connection 添加。' };
    }
    const items = [];
    for (const svc of services) {
      const raw = await store.getApiKey(svc);
      if (!raw) continue;
      try {
        const c = JSON.parse(raw) as DbConnection;
        items.push({
          name: svc.slice(DB_SERVICE_PREFIX.length),
          type: c.type,
          dsn: c.dsn,
          user: c.user || '',
          // 不返回 password
        });
      } catch {
        items.push({ name: svc.slice(DB_SERVICE_PREFIX.length), type: '解析失败', dsn: '' });
      }
    }
    return { content: JSON.stringify(items, null, 2) };
  },
};

const dbRemoveConnectionTool: Tool = {
  name: 'db_remove_connection',
  description: '删除命名数据库连接',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '要删除的连接名' },
    },
    required: ['name'],
  },
  handler: async (args: any) => {
    const store = getCredentialStore();
    const services = store.listServices();
    const key = DB_SERVICE_PREFIX + args.name;
    if (!services.includes(key)) {
      return { error: `连接 "${args.name}" 不存在` };
    }
    await store.deleteApiKey(key);
    return { content: `连接 "${args.name}" 已删除` };
  },
};

// ==================== 导出 ====================

export const dbTools: Tool[] = [
  dbQueryTool,
  dbExecuteTool,
  dbSchemaTool,
  dbTablesTool,
  dbTestConnectionTool,
  dbAddConnectionTool,
  dbListConnectionsTool,
  dbRemoveConnectionTool,
];

export const dbToolGroup: ToolGroup = {
  name: 'database',
  description: '数据库操作（Oracle/SQLite 查询、执行、Schema、连接管理）',
  tools: dbTools,
  keywords: ['数据库', 'SQL', 'Oracle', 'SQLite', '查询', 'DB'],
  triggers: {
    keywords: ['数据库查询', '执行SQL', 'Oracle查询', 'SQLite查询', '查表结构'],
    fileExtensions: ['.db', '.sqlite', '.sqlite3'],
    dependentTools: [],
  },
};
