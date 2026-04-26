/**
 * 命令执行器主入口
 * 整合所有模块，提供统一的命令执行接口
 */

import { CommandValidator } from '../utils/CommandValidator';
import { ErrorAnalyzer } from '../utils/ErrorAnalyzer';
import { getCallTracker } from '../tracker/CallTracker';
import { CommandRouter } from './CommandRouter';
import { ExecuteResult, ExecuteOptions } from '../types';

export class CommandExecutor {
  private validator = new CommandValidator();
  private errorAnalyzer = new ErrorAnalyzer();
  private callTracker = getCallTracker();
  private router = new CommandRouter();

  /**
   * 执行命令
   * 自动处理引号、跨平台、超长命令等问题
   */
  async execute(
    command: string,
    options: ExecuteOptions = {}
  ): Promise<ExecuteResult> {
    const { cwd, timeout = 30000, skipConfirmation = false } = options;

    // 1. 命令验证（安全检查）
    const validation = this.validator.validate(command);
    if (validation.dangerLevel === 'danger' && !skipConfirmation) {
      return {
        success: false,
        stdout: '',
        stderr: validation.warnings.join('\n'),
        exitCode: -1,
        executionMethod: 'direct',
        suggestions: validation.warnings,
        requiresConfirmation: true,
        warningLevel: 'danger',
      };
    }

    // 2. 记录调用（用于重复检测）
    this.callTracker.record(command);
    const repeatCount = this.callTracker.getRecentCount(command);

    // 3. 执行命令
    const rawResult = await this.router.execute(command, { cwd, timeout });

    // 4. 错误分析
    const suggestions = this.errorAnalyzer.analyze(
      rawResult.stderr,
      command,
      rawResult.exitCode,
      { cwd, wasTimeout: rawResult.wasTimeout }
    );

    // 5. 构建结果
    return {
      success: rawResult.exitCode === 0,
      stdout: rawResult.stdout,
      stderr: rawResult.stderr,
      exitCode: rawResult.exitCode,
      executionMethod: rawResult.method,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      warningLevel: validation.dangerLevel === 'danger' ? 'danger' :
                    validation.dangerLevel === 'caution' ? 'caution' : 'none',
      repeatCount: repeatCount > 1 ? repeatCount : undefined,
    };
  }
}

// 单例
let executorInstance: CommandExecutor | null = null;

export function getCommandExecutor(): CommandExecutor {
  if (!executorInstance) {
    executorInstance = new CommandExecutor();
  }
  return executorInstance;
}

/**
 * 便捷函数
 */
export async function executeCommand(
  command: string,
  options: ExecuteOptions = {}
): Promise<ExecuteResult> {
  return getCommandExecutor().execute(command, options);
}
