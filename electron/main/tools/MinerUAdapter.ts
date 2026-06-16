/**
 * MinerU OCR 服务适配器
 * 用于扫描件 PDF 的 OCR 文字识别
 *
 * MinerU 提供 HTTP API，POST /file_parse 上传文件进行解析
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import FormData from 'form-data';

export interface MinerUConfig {
  enabled: boolean;
  endpoint: string;      // e.g. http://192.168.1.100:8900
  timeout: number;       // default 60000ms
  parseMethod: 'auto' | 'ocr' | 'txt';
  returnImages: boolean;
  formulaEnable: boolean;
  tableEnable: boolean;
}

export interface MinerUResult {
  content: string;
  images?: Array<{
    ref: string;
    path: string;
    description?: string;
  }>;
  metadata?: {
    pages?: number;
  };
}

export class MinerUAdapter {
  private config: MinerUConfig;

  constructor(config: MinerUConfig) {
    this.config = config;
  }

  get enabled(): boolean {
    return this.config.enabled && !!this.config.endpoint;
  }

  /**
   * Parse a file (PDF/image) using MinerU
   */
  async parseFile(filePath: string, options?: {
    parseMethod?: 'auto' | 'ocr' | 'txt';
    startPage?: number;
    endPage?: number;
  }): Promise<MinerUResult> {
    if (!this.enabled) {
      throw new Error('MinerU service is not configured');
    }

    const formData = new FormData();
    formData.append('files', fs.createReadStream(filePath));
    formData.append('return_md', 'true');
    formData.append('return_images', String(this.config.returnImages));
    formData.append('parse_method', options?.parseMethod || this.config.parseMethod);
    formData.append('formula_enable', String(this.config.formulaEnable));
    formData.append('table_enable', String(this.config.tableEnable));

    if (options?.startPage !== undefined) {
      formData.append('start_page_id', String(options.startPage));
    }
    if (options?.endPage !== undefined) {
      formData.append('end_page_id', String(options.endPage));
    }

    const response = await axios.post(
      `${this.config.endpoint}/file_parse`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Accept': 'application/json',
        },
        timeout: this.config.timeout,
        maxContentLength: 100 * 1024 * 1024, // 100MB
        maxBodyLength: 100 * 1024 * 1024,
      }
    );

    const data = response.data;

    // Extract markdown content
    let content = '';
    if (typeof data === 'string') {
      content = data;
    } else if (data.md_content) {
      content = data.md_content;
    } else if (data.content) {
      content = data.content;
    } else if (Array.isArray(data)) {
      // Some MinerU versions return array of page results
      content = data.map((page: any) => page.md_content || page.content || '').join('\n\n');
    }

    // Extract images
    const images: MinerUResult['images'] = [];
    if (data.images && Array.isArray(data.images)) {
      for (const img of data.images) {
        images.push({
          ref: img.ref || img.name || `img_${images.length}`,
          path: img.local_path || img.path || '',
          description: img.description || '',
        });
      }
    }

    return {
      content,
      images: images.length > 0 ? images : undefined,
      metadata: {
        pages: data.page_count || data.total_pages,
      },
    };
  }
}

// Singleton
let minerUAdapter: MinerUAdapter | null = null;

export function getMinerUAdapter(config?: MinerUConfig): MinerUAdapter {
  if (!minerUAdapter && config) {
    minerUAdapter = new MinerUAdapter(config);
  }
  if (!minerUAdapter) {
    // Return a disabled adapter
    minerUAdapter = new MinerUAdapter({
      enabled: false,
      endpoint: '',
      timeout: 60000,
      parseMethod: 'auto',
      returnImages: true,
      formulaEnable: true,
      tableEnable: true,
    });
  }
  return minerUAdapter;
}

export function initMinerUAdapter(config: MinerUConfig): MinerUAdapter {
  minerUAdapter = new MinerUAdapter(config);
  return minerUAdapter;
}
