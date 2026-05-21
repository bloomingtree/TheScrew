import { ipcMain } from 'electron';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import PizZip from 'pizzip';

// ============================================================================
// PPTX 文档预览 IPC 处理器
// ============================================================================

export interface PPTXSlide {
  index: number;
  title: string;
  content: string[];   // 文本内容行
  notes: string;       // 备注内容
  hasImages: boolean;
  layout: string;      // 布局名称
}

export interface PPTXPreviewData {
  filepath: string;
  slides: PPTXSlide[];
  metadata: {
    path: string;
    size?: number;
    modified?: string;
    slideCount: number;
    title?: string;
    author?: string;
  };
}

/**
 * 解析 PPTX 文件（PPTX 本质是 ZIP 包含 XML）
 */
async function parsePptxFile(filepath: string): Promise<PPTXPreviewData> {
  try {
    const buffer = await readFile(filepath);
    const stats = await stat(filepath);

    const zip = new PizZip(buffer);

    // 读取演示文稿属性
    let title = '';
    let author = '';
    try {
      const coreXml = zip.file('docProps/core.xml')?.asText() || '';
      const titleMatch = coreXml.match(/<dc:title[^>]*>([^<]*)<\/dc:title>/);
      const creatorMatch = coreXml.match(/<dc:creator[^>]*>([^<]*)<\/dc:creator>/);
      if (titleMatch) title = titleMatch[1].trim();
      if (creatorMatch) author = creatorMatch[1].trim();
    } catch { /* ignore */ }

    // 获取幻灯片文件列表（PizZip 没有 forEach，需用 Object.keys）
    const slideFiles: string[] = [];
    Object.keys(zip.files).forEach((filePath: string) => {
      const match = filePath.match(/^ppt\/slides\/slide(\d+)\.xml$/);
      if (match) {
        slideFiles.push(filePath);
      }
    });

    // 按编号排序
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
      return numA - numB;
    });

    const slides: PPTXSlide[] = [];

    for (let i = 0; i < slideFiles.length; i++) {
      const slideXml = zip.file(slideFiles[i])?.asText() || '';

      // 提取文本内容
      const textContent = extractTextsFromSlideXml(slideXml);

      // 提取标题（通常是第一个非空文本）
      let slideTitle = '';
      for (const text of textContent) {
        if (text.trim()) {
          slideTitle = text.trim();
          break;
        }
      }
      if (!slideTitle) {
        slideTitle = `幻灯片 ${i + 1}`;
      }

      // 检查是否包含图片
      const hasImages = slideXml.includes('<a:blip') || slideXml.includes('<p:pic>');

      // 读取备注
      let notes = '';
      try {
        const notesPath = `ppt/notesSlides/notesSlide${i + 1}.xml`;
        const notesXml = zip.file(notesPath)?.asText() || '';
        if (notesXml) {
          const notesTexts = extractTextsFromSlideXml(notesXml);
          notes = notesTexts.join('\n');
        }
      } catch { /* ignore */ }

      slides.push({
        index: i,
        title: slideTitle,
        content: textContent,
        notes,
        hasImages,
        layout: '',
      });
    }

    return {
      filepath,
      slides,
      metadata: {
        path: filepath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        slideCount: slides.length,
        title,
        author,
      },
    };
  } catch (error: any) {
    throw new Error(`解析 PPTX 文件失败: ${error.message}`);
  }
}

/**
 * 从幻灯片 XML 中提取所有文本
 */
function extractTextsFromSlideXml(xml: string): string[] {
  const texts: string[] = [];

  // 匹配 <a:t> 标签内容（OOXML 中文本的统一标签）
  const textRegex = /<a:t[^>]*>([^<]*)<\/a:t>/g;
  let match;
  while ((match = textRegex.exec(xml)) !== null) {
    const text = match[1].trim();
    if (text) {
      texts.push(text);
    }
  }

  return texts;
}

export function registerPptxHandlers() {
  // 预览 PPTX 文档
  ipcMain.handle('pptx:preview', async (_event, filepath: string) => {
    try {
      const ext = path.extname(filepath).toLowerCase();
      if (ext !== '.pptx') {
        throw new Error('仅支持 .pptx 文件');
      }
      const data = await parsePptxFile(filepath);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  console.log('[IPC] PPTX preview handlers registered');
}
