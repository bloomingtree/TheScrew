/**
 * BusyBox applet 白名单
 *
 * 用于 CommandRouter 路由：当命令首词匹配此列表中的 applet 时，
 * 优先路由到 BusyBoxExecutor（避免被 CrossPlatformMapper 映射成 Windows 命令）。
 *
 * 完整 applet 列表可通过 `busybox.exe --list` 查看，这里只列出
 * AI Agent 最常用、且与 Windows 原生命令冲突的 Unix 命令。
 */

export const BUSYBOX_APPLETS = new Set<string>([
  // ===== 文件操作（与 Windows dir/copy/del 冲突）=====
  'ls', 'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'touch', 'pwd',
  'ln', 'chmod', 'chown', 'stat', 'du', 'df', 'file', 'mount',

  // ===== 文本处理（与 Windows type/findstr 冲突）=====
  'cat', 'head', 'tail', 'grep', 'egrep', 'fgrep', 'sed', 'awk',
  'cut', 'tr', 'sort', 'uniq', 'wc', 'tee', 'printf', 'echo',
  'fold', 'fmt', 'nl', 'paste', 'expand', 'unexpand', 'comm', 'cmp',
  'diff', 'patch', 'tac', 'rev', 'seq',

  // ===== 搜索 =====
  'find', 'which', 'whereis', 'locate', 'xargs',

  // ===== 归档/压缩 =====
  'tar', 'gzip', 'gunzip', 'bzip2', 'xz', 'zcat', 'unzip', 'zip',

  // ===== 编码/哈希 =====
  'base32', 'base64', 'md5sum', 'sha256sum', 'sha1sum', 'sha512sum',
  'xxd', 'od', 'hexdump', 'cksum', 'crc32', 'uuencode', 'uudecode',

  // ===== 系统/路径 =====
  'env', 'date', 'sleep', 'uname', 'whoami', 'hostname', 'id',
  'basename', 'dirname', 'realpath', 'readlink', 'test', 'true', 'false',

  // ===== Shell 内置 =====
  'ash', 'sh', 'test',

  // ===== 网络（轻量）=====
  'wget', 'nc',
]);

/**
 * 判断命令名是否是 BusyBox 支持的 applet
 */
export function isBusyBoxApplet(cmdName: string): boolean {
  if (!cmdName) return false;
  return BUSYBOX_APPLETS.has(cmdName.toLowerCase());
}

/**
 * Windows PowerShell cmdlet 前缀正则
 * 用于判断命令是否必须走 PowerShell（如 Get-Process、Set-Service）
 */
const POWERSHELL_CMDLET_PATTERN = /^(Get|Set|New|Remove|Invoke|Test|Add|Clear|Disable|Enable|Start|Stop|Restart|Suspend|Resume|Out|Where|Select|ForEach|Measure|Compare|Convert|Export|Import|Format|Read|Write|Push|Pop|Use|Enter|Exit|Wait|Debug|Trace|Send|Receive|Connect|Disconnect|Mount|UnMount|Block|Unblock|Grant|Revoke|Publish|Unpublish|Register|Unregister|Save|Update|Search|Sync|Hide|Show|Move|Rename|Resize|Redo|Undo|Checkpoint|Restore|Backup|Reset|Switch|Group|Sort|Tee|Watch|Limit|Edit|New|Action|Approve|Deny|Confirm|Configuration|Register|Unregister)-/i;

/**
 * 判断命令首词是否是 PowerShell cmdlet
 */
export function isPowerShellCmdlet(command: string): boolean {
  const match = command.match(/^\s*(\S+)/);
  if (!match) return false;
  return POWERSHELL_CMDLET_PATTERN.test(match[1]);
}

/**
 * 检测命令是否包含 shell 操作符（管道、重定向、链式等）
 * 这些操作符在 busybox sh 下能正常工作，无需 PowerShell
 */
export function hasShellOperators(command: string): boolean {
  // 简单检查操作符是否在引号外
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let i = 0;

  while (i < command.length) {
    const char = command[i];

    if (char === '\\' && i + 1 < command.length) {
      i += 2;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (!inSingleQuote && !inDoubleQuote) {
      // 检查操作符
      const remaining = command.slice(i);
      // 管道、重定向、命令分隔、链式、命令替换
      if (/^(\|\||&&|;|\||>|<|\$\(|`)/.test(remaining)) {
        return true;
      }
    }

    i++;
  }

  return false;
}
