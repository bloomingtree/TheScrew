/**
 * 远程操作工具 - SSH / WinRM / 服务器列表管理
 *
 * 通过内嵌 Python + paramiko/pywinrm 实现远程命令执行
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { Tool, ToolGroup } from './ToolManager';
import { getPathManager } from '../config/PathManager';

const execFileAsync = promisify(execFile);

function getPythonPath(): string {
  const pathManager = getPathManager();
  return pathManager.getPythonPath();
}

function getScriptsDir(): string {
  return path.join(path.dirname(getPythonPath()), '..', 'scripts');
}

function getConfigDataPath(): string {
  const pathManager = getPathManager();
  return pathManager.getDataPath();
}

/**
 * 危险命令模式 - 需要在审计日志中标记
 */
const DANGEROUS_PATTERNS = [
  /systemctl\s+(stop|restart|disable)/i,
  /rm\s+(-rf?|-fr?)/i,
  /shutdown/i,
  /reboot/i,
  /iptables/i,
  /service\s+\w+\s+stop/i,
  /Stop-Service/i,
  /Remove-Item/i,
  /Restart-Computer/i,
  /del\s+\/[sq]/i,
  /format\s+[a-z]:/i,
];

function isDangerousCommand(command: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => pattern.test(command));
}

/**
 * 对配置进行脱敏（隐藏密码），用于日志输出
 */
function sanitizeConfig(config: Record<string, any>): Record<string, any> {
  const sanitized = { ...config };
  if (sanitized.password) {
    sanitized.password = '***';
  }
  return sanitized;
}

// ==================== SSH 工具 ====================

const sshTool: Tool = {
  name: 'ssh',
  description: '通过 SSH 连接远程服务器执行命令（Linux / Windows 2019+）',
  parameters: {
    type: 'object',
    properties: {
      host: { type: 'string', description: '服务器地址' },
      port: { type: 'number', description: 'SSH 端口，默认 22' },
      user: { type: 'string', description: '用户名' },
      command: { type: 'string', description: '要执行的命令' },
      timeout: { type: 'number', description: '超时时间(秒)，默认 30' },
      password: { type: 'string', description: '密码（建议使用密钥）' },
    },
    required: ['host', 'user', 'command'],
  },
  handler: async (args: any) => {
    const pythonPath = getPythonPath();
    const scriptPath = path.join(getScriptsDir(), 'ssh_exec.py');

    if (!fs.existsSync(pythonPath)) {
      return { error: '内嵌 Python 环境未找到，无法执行 SSH 操作' };
    }
    if (!fs.existsSync(scriptPath)) {
      return { error: 'SSH 脚本未找到: ' + scriptPath };
    }

    const config = {
      host: args.host,
      port: args.port || 22,
      user: args.user,
      command: args.command,
      password: args.password,
      timeout: args.timeout || 30,
    };

    // 审计日志（脱敏）
    console.log(`[SSH] Executing on ${config.host}:${config.port} as ${config.user}: ${config.command}`,
      isDangerousCommand(config.command) ? '[DANGEROUS COMMAND]' : '');

    try {
      const { stdout, stderr } = await execFileAsync(pythonPath, [scriptPath, JSON.stringify(config)], {
        timeout: (config.timeout + 10) * 1000,
      });

      const result = JSON.parse(stdout);

      if (!result.success) {
        return { error: `SSH 执行失败 (${result.host}): ${result.error || result.stderr}` };
      }

      let output = `[SSH] ${result.host}$ ${result.command}\n`;
      if (result.stdout) output += result.stdout;
      if (result.stderr) output += `\n[stderr] ${result.stderr}`;
      output += `\n[退出码: ${result.exitCode}]`;

      return { content: output };
    } catch (err: any) {
      // Python 执行失败或 JSON 解析失败
      if (err.killed) {
        return { error: `SSH 执行超时 (${config.timeout}s): ${config.host}` };
      }
      return { error: `SSH 执行异常: ${err.message}` };
    }
  },
};

// ==================== WinRM 工具 ====================

const winrmTool: Tool = {
  name: 'winrm',
  description: '通过 WinRM 连接 Windows 服务器执行 PowerShell 命令（适用于 Windows Server 2012）',
  parameters: {
    type: 'object',
    properties: {
      host: { type: 'string', description: '服务器地址' },
      user: { type: 'string', description: '用户名（含域，如 admin@domain）' },
      command: { type: 'string', description: '要执行的 PowerShell 命令' },
      timeout: { type: 'number', description: '超时时间(秒)，默认 30' },
      password: { type: 'string', description: '密码' },
      auth: { type: 'string', enum: ['ntlm', 'basic', 'kerberos'], description: '认证方式，默认 ntlm' },
    },
    required: ['host', 'user', 'command'],
  },
  handler: async (args: any) => {
    const pythonPath = getPythonPath();
    const scriptPath = path.join(getScriptsDir(), 'winrm_exec.py');

    if (!fs.existsSync(pythonPath)) {
      return { error: '内嵌 Python 环境未找到，无法执行 WinRM 操作' };
    }
    if (!fs.existsSync(scriptPath)) {
      return { error: 'WinRM 脚本未找到: ' + scriptPath };
    }

    const config = {
      host: args.host,
      user: args.user,
      command: args.command,
      password: args.password,
      auth: args.auth || 'ntlm',
      timeout: args.timeout || 30,
    };

    // 审计日志（脱敏）
    console.log(`[WinRM] Executing on ${config.host} as ${config.user} (${config.auth}): ${config.command}`,
      isDangerousCommand(config.command) ? '[DANGEROUS COMMAND]' : '');

    try {
      const { stdout, stderr } = await execFileAsync(pythonPath, [scriptPath, JSON.stringify(config)], {
        timeout: (config.timeout + 10) * 1000,
      });

      const result = JSON.parse(stdout);

      if (!result.success) {
        return { error: `WinRM 执行失败 (${result.host}): ${result.error || result.stderr}` };
      }

      let output = `[WinRM] ${result.host}> ${result.command}\n`;
      if (result.stdout) output += result.stdout;
      if (result.stderr) output += `\n[stderr] ${result.stderr}`;
      output += `\n[退出码: ${result.exitCode}]`;

      return { content: output };
    } catch (err: any) {
      if (err.killed) {
        return { error: `WinRM 执行超时 (${config.timeout}s): ${config.host}` };
      }
      return { error: `WinRM 执行异常: ${err.message}` };
    }
  },
};

// ==================== 服务器列表工具 ====================

const serverListTool: Tool = {
  name: 'server_list',
  description: '列出已配置的服务器列表',
  parameters: {
    type: 'object',
    properties: {
      tag: { type: 'string', description: '按标签过滤' },
    },
  },
  handler: async (args: any) => {
    const dataPath = getConfigDataPath();
    const serversFile = path.join(dataPath, 'servers.json');

    if (!fs.existsSync(serversFile)) {
      return { content: '尚未配置服务器。请在 .config/data/servers.json 中添加服务器配置。' };
    }

    const servers = JSON.parse(await fs.promises.readFile(serversFile, 'utf-8'));
    let serverList = servers.servers || [];

    if (args.tag) {
      serverList = serverList.filter((s: any) => s.tags?.includes(args.tag));
    }

    if (serverList.length === 0) {
      return { content: args.tag ? `没有标签为 "${args.tag}" 的服务器` : '服务器列表为空' };
    }

    const output = serverList.map((s: any) =>
      `${s.id}\t${s.name}\t${s.host}\t${s.os || 'unknown'}\t${s.description || ''}`
    ).join('\n');

    return { content: `服务器列表:\nID\t名称\t地址\t系统\t描述\n${output}` };
  },
};

// ==================== 导出 ====================

export const remoteTools: Tool[] = [sshTool, winrmTool, serverListTool];

export const remoteToolGroup: ToolGroup = {
  name: 'remote',
  description: 'SSH/WinRM 远程服务器管理',
  tools: remoteTools,
  keywords: ['ssh', 'winrm', '远程', '服务器', '运维'],
  triggers: {
    keywords: ['远程执行', 'SSH连接', '服务器操作', '远程命令', '运维'],
    fileExtensions: [],
    dependentTools: [],
  },
};
