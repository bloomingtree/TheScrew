/**
 * 关键词检测器 - 用于检测用户消息中是否包含特定工具组的关键词
 * 支持动态加载工具集
 */

export interface DetectionResult {
  groups: string[];
  detectedKeywords: Map<string, string[]>; // groupName -> keywords
  fileExtensions: string[];
}

export class KeywordDetector {
  // Word 相关关键词
  private static readonly WORD_KEYWORDS = [
    'word',
    '文档',
    '.docx',
    'docx',
    'ms word',
    'microsoft word',
    '编辑',
    '页眉',
    '页脚',
    '段落',
    '表格',
    '替换',
    '新建文档',
    '创建文档',
    '打开文档',
    '保存文档',
    '插入图片',
    '插入表格',
    '导出',
    'html',
  ];

  // 文件扩展名到工具组的映射
  private static readonly EXTENSION_GROUPS: Record<string, string> = {
    '.docx': 'word',
    '.doc': 'word',
  };

  /**
   * 检测用户消息中需要激活的工具组
   */
  static detect(userMessage: string): DetectionResult {
    const result: DetectionResult = {
      groups: [],
      detectedKeywords: new Map(),
      fileExtensions: [],
    };

    if (!userMessage) {
      return result;
    }

    const lowerMessage = userMessage.toLowerCase();

    // 检测 Word 关键词
    const foundWordKeywords = this.WORD_KEYWORDS.filter(kw =>
      lowerMessage.includes(kw.toLowerCase())
    );

    if (foundWordKeywords.length > 0) {
      result.groups.push('word');
      result.detectedKeywords.set('word', foundWordKeywords);
    }

    // 检测文件扩展名
    const extPattern = /\.\w{3,4}/gi;
    const matches = lowerMessage.match(extPattern) || [];
    const uniqueExts = [...new Set(matches)];

    for (const ext of uniqueExts) {
      const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
      const groupName = this.EXTENSION_GROUPS[normalizedExt];

      if (groupName && !result.groups.includes(groupName)) {
        result.groups.push(groupName);
        result.fileExtensions.push(normalizedExt);
      }
    }

    return result;
  }

  /**
   * 检查是否包含特定文件扩展名
   */
  static hasFileExtension(message: string, extensions: string[]): boolean {
    const lowerMessage = message.toLowerCase();
    return extensions.some(ext =>
      lowerMessage.includes(ext.toLowerCase())
    );
  }

  /**
   * 根据文件路径判断需要加载的工具组
   */
  static detectFromFile(filepath: string): string | null {
    const lowerPath = filepath.toLowerCase();

    for (const [ext, groupName] of Object.entries(this.EXTENSION_GROUPS)) {
      if (lowerPath.endsWith(ext)) {
        return groupName;
      }
    }

    return null;
  }

  /**
   * 获取工具组的关键词列表（用于调试）
   */
  static getGroupKeywords(groupName: string): string[] {
    switch (groupName) {
      case 'word':
        return [...this.WORD_KEYWORDS];
      default:
        return [];
    }
  }
}
