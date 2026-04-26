/**
 * 跨平台命令映射器
 * 将 Unix 风格命令映射到 Windows 对应命令
 */

export class CrossPlatformMapper {
  /**
   * Unix 命令到 Windows 命令的映射
   */
  private readonly unixToWindows: Map<string, string> = new Map([
    // 文件操作
    ['cp', 'copy'],
    ['mv', 'move'],
    ['rm', 'del'],
    ['ls', 'dir'],
    ['cat', 'type'],
    ['mkdir', 'md'],
    ['rmdir', 'rd'],
    ['touch', 'type nul >'],  // touch 的近似替代

    // 系统
    ['clear', 'cls'],
    ['pwd', 'cd'],
    ['which', 'where'],

    // 文本处理
    ['grep', 'findstr'],
    ['sed', 'powershell -Command "($_ -replace'],  // 部分支持
  ]);

  /**
   * 映射命令到当前平台
   * 只在 Windows 上进行映射
   */
  map(command: string): string {
    // 非 Windows 平台不映射
    if (process.platform !== 'win32') {
      return command;
    }

    // 提取命令名（第一个词）
    const match = command.match(/^(\s*)(\S+)(.*)$/);
    if (!match) return command;

    const [, leading, cmdName, rest] = match;
    const lowerCmd = cmdName.toLowerCase();

    // 检查是否需要映射
    const mapped = this.unixToWindows.get(lowerCmd);
    if (mapped) {
      // 特殊处理 touch 命令
      if (lowerCmd === 'touch') {
        const filePath = rest.trim();
        return `${leading}${mapped}${filePath}`;
      }
      // 特殊处理 ls 命令的参数
      if (lowerCmd === 'ls') {
        return this.mapLsCommand(leading, rest);
      }
      return `${leading}${mapped}${rest}`;
    }

    return command;
  }

  /**
   * 映射 ls 命令及其参数
   */
  private mapLsCommand(leading: string, rest: string): string {
    const args = rest.trim();
    // ls -la -> dir
    // ls -l -> dir
    // ls -a -> dir /a
    // ls -> dir
    if (args.includes('-la') || args.includes('-al') || args.includes('-l')) {
      // 移除 -l, -la, -al 参数
      const cleanArgs = args.replace(/-l?a?\s*/g, '').trim();
      return cleanArgs ? `${leading}dir ${cleanArgs}` : `${leading}dir`;
    }
    if (args.includes('-a')) {
      const cleanArgs = args.replace(/-a\s*/g, '').trim();
      return cleanArgs ? `${leading}dir /a ${cleanArgs}` : `${leading}dir /a`;
    }
    return `${leading}dir${rest}`;
  }

  /**
   * 检查命令是否需要跨平台映射
   */
  needsMapping(command: string): boolean {
    if (process.platform !== 'win32') {
      return false;
    }

    const match = command.match(/^\s*(\S+)/);
    if (!match) return false;

    const cmdName = match[1].toLowerCase();
    return this.unixToWindows.has(cmdName);
  }

  /**
   * 获取映射后的命令名
   */
  getMappedCommand(command: string): string | null {
    if (process.platform !== 'win32') {
      return null;
    }

    const match = command.match(/^\s*(\S+)/);
    if (!match) return null;

    const cmdName = match[1].toLowerCase();
    return this.unixToWindows.get(cmdName) || null;
  }

  /**
   * 获取所有支持的 Unix 命令列表
   */
  getSupportedUnixCommands(): string[] {
    return Array.from(this.unixToWindows.keys());
  }
}

// 单例
let mapperInstance: CrossPlatformMapper | null = null;

export function getCrossPlatformMapper(): CrossPlatformMapper {
  if (!mapperInstance) {
    mapperInstance = new CrossPlatformMapper();
  }
  return mapperInstance;
}
