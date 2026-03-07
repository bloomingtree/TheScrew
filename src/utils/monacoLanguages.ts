/**
 * Monaco Editor 语言检测工具
 *
 * 根据文件扩展名自动检测 Monaco Editor 的语言类型
 */

export interface LanguageMapping {
  extension: string[];
  language: string;
  icon?: string;
}

const LANGUAGE_MAP: LanguageMapping[] = [
  // Markdown
  { extension: ['.md', '.markdown', '.mdown', '.mkd'], language: 'markdown', icon: '📝' },

  // Python
  { extension: ['.py', '.pyw', '.pyi'], language: 'python', icon: '🐍' },

  // JavaScript/TypeScript
  { extension: ['.js', '.jsx', '.mjs', '.cjs'], language: 'javascript', icon: '📜' },
  { extension: ['.ts', '.tsx'], language: 'typescript', icon: '📘' },

  // Web
  { extension: ['.html', '.htm', '.xhtml'], language: 'html', icon: '🌐' },
  { extension: ['.css', '.scss', '.sass', '.less'], language: 'css', icon: '🎨' },
  { extension: ['.json', '.jsonc'], language: 'json', icon: '📋' },
  { extension: ['.xml'], language: 'xml', icon: '📄' },

  // Shell
  { extension: ['.sh', '.bash', '.zsh'], language: 'shell', icon: '💻' },
  { extension: ['.ps1', '.psm1', '.psd1'], language: 'powershell', icon: '💠' },

  // Config
  { extension: ['.yaml', '.yml'], language: 'yaml', icon: '⚙️' },
  { extension: ['.toml'], language: 'toml', icon: '⚙️' },
  { extension: ['.ini', '.cfg', '.conf'], language: 'ini', icon: '⚙️' },

  // SQL
  { extension: ['.sql'], language: 'sql', icon: '🗃️' },

  // Go
  { extension: ['.go'], language: 'go', icon: '🔵' },

  // Rust
  { extension: ['.rs'], language: 'rust', icon: '🦀' },

  // C/C++
  { extension: ['.c', '.h'], language: 'c', icon: '🔧' },
  { extension: ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx'], language: 'cpp', icon: '🔧' },

  // C#
  { extension: ['.cs'], language: 'csharp', icon: '💜' },

  // Java
  { extension: ['.java'], language: 'java', icon: '☕' },

  // PHP
  { extension: ['.php', '.phtml'], language: 'php', icon: '🐘' },

  // Ruby
  { extension: ['.rb'], language: 'ruby', icon: '💎' },

  // Dart
  { extension: ['.dart'], language: 'dart', icon: '🎯' },

  // Kotlin
  { extension: ['.kt', '.kts'], language: 'kotlin', icon: '🤖' },

  // Swift
  { extension: ['.swift'], language: 'swift', icon: '🍎' },

  // Other text files
  { extension: ['.txt', '.text'], language: 'plaintext', icon: '📄' },
];

/**
 * 根据文件路径获取 Monaco Editor 语言类型
 */
export function getLanguageFromPath(filePath: string): string {
  const ext = getFileExtension(filePath);
  const mapping = LANGUAGE_MAP.find(m => m.extension.includes(ext));
  return mapping?.language || 'plaintext';
}

/**
 * 根据文件路径获取文件图标
 */
export function getIconFromPath(filePath: string): string {
  const ext = getFileExtension(filePath);
  const mapping = LANGUAGE_MAP.find(m => m.extension.includes(ext));
  return mapping?.icon || '📄';
}

/**
 * 获取文件扩展名（包含点号）
 */
export function getFileExtension(filePath: string): string {
  const parts = filePath.split('/');
  const fileName = parts[parts.length - 1];
  const lastDotIndex = fileName.lastIndexOf('.');

  if (lastDotIndex === -1) {
    return '';
  }

  return fileName.substring(lastDotIndex);
}

/**
 * 获取文件名（不含路径）
 */
export function getFileName(filePath: string): string {
  const parts = filePath.split('/');
  return parts[parts.length - 1];
}

/**
 * 获取文件名（不含扩展名）
 */
export function getFileNameWithoutExtension(filePath: string): string {
  const fileName = getFileName(filePath);
  const lastDotIndex = fileName.lastIndexOf('.');

  if (lastDotIndex === -1) {
    return fileName;
  }

  return fileName.substring(0, lastDotIndex);
}

/**
 * 判断是否为文本文件（可编辑）
 */
export function isTextFile(filePath: string): boolean {
  const ext = getFileExtension(filePath);
  const binaryExtensions = ['.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.db', '.sqlite'];

  // 检查是否为二进制扩展名
  if (binaryExtensions.includes(ext)) {
    return false;
  }

  // 检查是否有对应的 Monaco 语言
  return LANGUAGE_MAP.some(m => m.extension.includes(ext)) || ext === '' || ext === '.txt';
}
