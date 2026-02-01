import { writeFile, mkdir } from 'fs/promises';
import { app } from 'electron';
import path from 'path';

interface TruncationConfig {
  maxPreviewSize: number;      // 预览大小（字符数），默认 2048
  saveThreshold: number;       // 保存阈值（字符数），默认 8192
}

interface TruncationResult {
  displayContent: string;       // 显示内容（已截断）
  metadata: {
    originalSize: number;       // 原始大小（字符）
    displaySize: number;        // 显示大小（字符）
    truncated: boolean;         // 是否被截断
    savedPath?: string;         // 保存的文件路径
    sizeFormatted?: string;     // 格式化的大小（如 "185.6KB"）
  };
}

/**
 * OutputTruncator - 工具输出智能截断器
 *
 * 当工具输出过大时，自动保存完整内容到文件，并返回截断后的预览内容
 */
class OutputTruncator {
  private config: TruncationConfig;
  private outputDir: string;

  constructor(config?: Partial<TruncationConfig>) {
    this.config = {
      maxPreviewSize: config?.maxPreviewSize ?? 2048,
      saveThreshold: config?.saveThreshold ?? 8192,
    };
    this.outputDir = this.getOutputDir();
  }

  /**
   * 获取输出文件目录
   * 使用 Electron 的 userData 路径，跨平台兼容
   */
  private getOutputDir(): string {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, '.claude', 'projects', 'zero-employee', 'tool-results');
  }

  /**
   * 格式化文件大小显示
   */
  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)}${units[unitIndex]}`;
  }

  /**
   * 确保输出目录存在
   */
  private async ensureOutputDir(): Promise<void> {
    try {
      await mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      // 如果目录创建失败，回退到临时目录
      console.error('Failed to create output dir, falling back to temp:', error);
      const tmpDir = path.join(app.getPath('temp'), 'claude-tool-results');
      await mkdir(tmpDir, { recursive: true });
      this.outputDir = tmpDir;
    }
  }

  /**
   * 保存内容到文件
   */
  private async saveToFile(content: string, filename: string): Promise<string> {
    await this.ensureOutputDir();
    const filePath = path.join(this.outputDir, filename);
    await writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * 截断内容
   *
   * @param content 原始内容
   * @param toolCallId 工具调用ID（用于生成文件名）
   * @param toolName 工具名称（用于日志）
   * @returns 截断结果
   */
  async truncate(
    content: string,
    toolCallId: string,
    toolName: string
  ): Promise<TruncationResult> {
    const originalSize = content.length;
    const truncated = originalSize > this.config.maxPreviewSize;

    let displayContent = content;
    let savedPath: string | undefined;

    // 如果内容超过保存阈值，保存完整内容到文件
    if (originalSize > this.config.saveThreshold) {
      try {
        const filename = `call_${toolCallId}.txt`;
        savedPath = await this.saveToFile(content, filename);
        console.log(`[OutputTruncator] Saved ${toolName} output (${this.formatSize(originalSize)}) to ${savedPath}`);
      } catch (error: any) {
        console.error(`[OutputTruncator] Failed to save ${toolName} output:`, error);
        // 保存失败不影响返回，继续返回截断内容
      }
    }

    // 截断显示内容
    if (truncated) {
      displayContent = content.substring(0, this.config.maxPreviewSize);
    }

    return {
      displayContent,
      metadata: {
        originalSize,
        displaySize: displayContent.length,
        truncated,
        savedPath,
        sizeFormatted: this.formatSize(originalSize),
      },
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<TruncationConfig>): void {
    if (config.maxPreviewSize !== undefined) {
      this.config.maxPreviewSize = config.maxPreviewSize;
    }
    if (config.saveThreshold !== undefined) {
      this.config.saveThreshold = config.saveThreshold;
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): TruncationConfig {
    return { ...this.config };
  }
}

// 单例导出
export const outputTruncator = new OutputTruncator();

// 类型导出
export { OutputTruncator, type TruncationConfig, type TruncationResult };
