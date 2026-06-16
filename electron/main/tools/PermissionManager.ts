/**
 * 工具权限管理模块
 *
 * 为工具调用提供风险分级和权限控制：
 * - SAFE/LOW: 自动执行
 * - MEDIUM/HIGH: Phase 1 自动执行并记录日志（Phase 2 将弹出确认对话框）
 * - CRITICAL: 默认拒绝，需要特殊授权
 */

/**
 * 工具风险等级
 */
export enum ToolRiskLevel {
  SAFE = 'safe',           // 无风险，自动执行
  LOW = 'low',             // 低风险，可自动执行但记录日志
  MEDIUM = 'medium',       // 中风险，需要用户确认（可设置免确认）
  HIGH = 'high',           // 高风险，每次必须确认
  CRITICAL = 'critical',   // 极高风险，需二次确认 + 操作理由
}

/**
 * 工具风险等级映射
 */
const TOOL_RISK_LEVELS: Record<string, ToolRiskLevel> = {
  // 文件工具 - 安全
  'get_workspace': ToolRiskLevel.SAFE,
  'list_directory': ToolRiskLevel.SAFE,
  'read_file': ToolRiskLevel.SAFE,
  'get_file_info': ToolRiskLevel.SAFE,

  // 文件工具 - 中风险
  'edit_file': ToolRiskLevel.MEDIUM,
  'write_file': ToolRiskLevel.MEDIUM,

  // 搜索工具 - 安全
  'grep': ToolRiskLevel.SAFE,
  'glob': ToolRiskLevel.SAFE,
  'search_content': ToolRiskLevel.SAFE,

  // Bash 工具 - 中风险（实际由 CommandValidator 动态判断）
  'bash': ToolRiskLevel.MEDIUM,

  // Office 工具 - 低风险
  'word_create': ToolRiskLevel.LOW,
  'word_edit': ToolRiskLevel.LOW,
  'office_create': ToolRiskLevel.LOW,
  'office_view': ToolRiskLevel.LOW,
  'office_query': ToolRiskLevel.LOW,

  // 远程工具
  'ssh': ToolRiskLevel.MEDIUM,
  'winrm': ToolRiskLevel.MEDIUM,
  'server_list': ToolRiskLevel.SAFE,
  'ssh_upload': ToolRiskLevel.HIGH,
  'deploy': ToolRiskLevel.HIGH,

  // 数据库工具
  'db_query': ToolRiskLevel.LOW,
  'db_execute': ToolRiskLevel.HIGH,
  'db_schema': ToolRiskLevel.LOW,
  'db_tables': ToolRiskLevel.LOW,
  'db_test_connection': ToolRiskLevel.LOW,
  'db_add_connection': ToolRiskLevel.MEDIUM,
  'db_list_connections': ToolRiskLevel.LOW,
  'db_remove_connection': ToolRiskLevel.MEDIUM,

  // PDF 工具 - 低风险
  'pdf_info': ToolRiskLevel.SAFE,
  'pdf_merge': ToolRiskLevel.LOW,
  'pdf_split': ToolRiskLevel.LOW,
  'pdf_watermark': ToolRiskLevel.LOW,
  'pdf_rotate': ToolRiskLevel.LOW,
  'pdf_extract_pages': ToolRiskLevel.LOW,

  // 报表工具 - 低风险
  'report_from_data': ToolRiskLevel.LOW,
  'report_list_templates': ToolRiskLevel.SAFE,

  // PPT 设计工具 - 低风险
  'pptx_apply_theme': ToolRiskLevel.LOW,
  'pptx_add_chart': ToolRiskLevel.LOW,
  'pptx_list_themes': ToolRiskLevel.SAFE,

  // 知识库 - 安全
  'kb_search': ToolRiskLevel.SAFE,
  'kb_train': ToolRiskLevel.LOW,

  // 任务工具 - 安全
  'task_create': ToolRiskLevel.SAFE,
  'task_list': ToolRiskLevel.SAFE,
  'task_update': ToolRiskLevel.SAFE,
  'task_complete': ToolRiskLevel.SAFE,

  // 附件工具 - 安全
  'list_attachments': ToolRiskLevel.SAFE,
  'get_attachment': ToolRiskLevel.SAFE,
  'save_attachment': ToolRiskLevel.LOW,

  // 定时任务工具 - 低风险
  'cron_create': ToolRiskLevel.LOW,
  'cron_list': ToolRiskLevel.SAFE,
  'cron_delete': ToolRiskLevel.MEDIUM,
  'heartbeat_status': ToolRiskLevel.SAFE,

  // 交互工具 - 安全
  'ask_user': ToolRiskLevel.SAFE,

  // 工具集激活 - 安全
  'activate_toolset': ToolRiskLevel.SAFE,
};

/**
 * 确认请求
 */
export interface ConfirmationRequest {
  id: string;
  tool: string;
  description: string;
  riskLevel: ToolRiskLevel;
  params: Record<string, any>;
  timeout: number;
}

/**
 * 确认响应
 */
export interface ConfirmationResponse {
  approved: boolean;
  skipForSession?: boolean;
  note?: string;
}

/**
 * 审计日志条目
 */
export interface AuditLogEntry {
  timestamp: string;
  tool: string;
  action: 'execute' | 'approved' | 'denied' | 'auto-approved';
  params: Record<string, any>;
  riskLevel: ToolRiskLevel;
  result?: 'success' | 'failure' | 'timeout';
  sessionId?: string;
}

/**
 * 权限管理器
 */
export class PermissionManager {
  private sessionOverrides: Map<string, Set<string>> = new Map(); // tool -> set of approved patterns
  private auditLog: AuditLogEntry[] = [];
  private pendingConfirmations: Map<string, {
    resolve: (response: ConfirmationResponse) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  /**
   * 获取工具的风险等级
   */
  getRiskLevel(toolName: string): ToolRiskLevel {
    return TOOL_RISK_LEVELS[toolName] || ToolRiskLevel.MEDIUM; // 默认中风险
  }

  /**
   * 检查工具是否需要确认
   * Returns: 'auto-approved' | 'requires_confirmation' | 'denied'
   */
  checkPermission(
    toolName: string,
    args: Record<string, any>,
    _agentType?: string,
  ): 'auto-approved' | 'requires_confirmation' | 'denied' {
    const riskLevel = this.getRiskLevel(toolName);

    // SAFE and LOW are auto-approved
    if (riskLevel === ToolRiskLevel.SAFE || riskLevel === ToolRiskLevel.LOW) {
      this.logAction(toolName, 'auto-approved', args, riskLevel);
      return 'auto-approved';
    }

    // Check session overrides
    const overrides = this.sessionOverrides.get(toolName);
    if (overrides) {
      // Simple check: if session override exists for this tool, auto-approve
      this.logAction(toolName, 'auto-approved', args, riskLevel);
      return 'auto-approved';
    }

    // CRITICAL is denied by default (needs special override)
    if (riskLevel === ToolRiskLevel.CRITICAL) {
      this.logAction(toolName, 'denied', args, riskLevel);
      return 'denied';
    }

    // MEDIUM and HIGH require confirmation
    this.logAction(toolName, 'approved', args, riskLevel);
    return 'requires_confirmation';
  }

  /**
   * 添加会话级免确认
   */
  addSessionOverride(toolName: string): void {
    if (!this.sessionOverrides.has(toolName)) {
      this.sessionOverrides.set(toolName, new Set());
    }
    console.log(`[PermissionManager] Session override added for tool: ${toolName}`);
  }

  /**
   * 移除会话级免确认
   */
  removeSessionOverride(toolName: string): void {
    this.sessionOverrides.delete(toolName);
    console.log(`[PermissionManager] Session override removed for tool: ${toolName}`);
  }

  /**
   * 获取当前所有会话级免确认的工具列表
   */
  getSessionOverrides(): string[] {
    return Array.from(this.sessionOverrides.keys());
  }

  /**
   * 请求用户确认（返回 Promise）
   */
  requestConfirmation(request: ConfirmationRequest): Promise<ConfirmationResponse> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingConfirmations.delete(request.id);
        resolve({ approved: false, note: '确认超时，自动拒绝' });
      }, request.timeout * 1000);

      this.pendingConfirmations.set(request.id, { resolve, timeout });
    });
  }

  /**
   * 响应确认请求
   */
  respondConfirmation(requestId: string, response: ConfirmationResponse): void {
    const pending = this.pendingConfirmations.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingConfirmations.delete(requestId);
      pending.resolve(response);

      // Handle session override
      if (response.approved && response.skipForSession) {
        // The caller should extract the tool name from the original request
        // and call addSessionOverride separately
      }
    }
  }

  /**
   * 检查是否有待处理的确认请求
   */
  hasPendingConfirmations(): boolean {
    return this.pendingConfirmations.size > 0;
  }

  /**
   * 记录审计日志
   */
  private logAction(
    tool: string,
    action: 'execute' | 'approved' | 'denied' | 'auto-approved',
    params: Record<string, any>,
    riskLevel: ToolRiskLevel,
  ): void {
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      tool,
      action,
      params,
      riskLevel,
    });

    // Keep last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-500);
    }
  }

  /**
   * 记录工具执行结果
   */
  logExecutionResult(toolName: string, result: 'success' | 'failure' | 'timeout'): void {
    // Find last entry for this tool (reverse search, compatible with pre-ES2023 targets)
    for (let i = this.auditLog.length - 1; i >= 0; i--) {
      if (this.auditLog[i].tool === toolName) {
        this.auditLog[i].result = result;
        break;
      }
    }
  }

  /**
   * 获取审计日志
   */
  getAuditLog(limit?: number): AuditLogEntry[] {
    return limit ? this.auditLog.slice(-limit) : [...this.auditLog];
  }

  /**
   * 清空审计日志
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }

  /**
   * 获取工具的风险描述（用于前端展示）
   */
  getRiskDescription(toolName: string, _args: Record<string, any>): string {
    const riskLevel = this.getRiskLevel(toolName);
    const descriptions: Record<ToolRiskLevel, string> = {
      [ToolRiskLevel.SAFE]: '安全操作',
      [ToolRiskLevel.LOW]: '低风险操作',
      [ToolRiskLevel.MEDIUM]: '需要确认的操作',
      [ToolRiskLevel.HIGH]: '高风险操作，请仔细审核',
      [ToolRiskLevel.CRITICAL]: '极高风险操作，需要特殊授权',
    };
    return descriptions[riskLevel];
  }

  /**
   * 重置会话级免确认（新对话开始时调用）
   */
  resetSession(): void {
    this.sessionOverrides.clear();
    // 清理所有待处理的确认请求
    for (const [id, pending] of this.pendingConfirmations) {
      clearTimeout(pending.timeout);
      pending.resolve({ approved: false, note: '会话已重置' });
    }
    this.pendingConfirmations.clear();
  }
}

// Singleton
let permissionManager: PermissionManager | null = null;

export function getPermissionManager(): PermissionManager {
  if (!permissionManager) {
    permissionManager = new PermissionManager();
  }
  return permissionManager;
}
