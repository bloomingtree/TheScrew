/**
 * Transfer Service - HTTP 传输服务
 *
 * 提供 HTTP API 用于技能列表查询和下载
 */

import * as http from 'http';
import { getSimpleSkillManager, type SkillMeta } from '../core/SimpleSkillManager';

const HTTP_PORT = 34568;

export class TransferService {
  private server: http.Server | null = null;
  private isRunning: boolean = false;

  /**
   * 启动 HTTP 服务器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[TransferService] Already running');
      return;
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (err) => {
        console.error('[TransferService] Server error:', err);
        reject(err);
      });

      this.server.listen(HTTP_PORT, () => {
        this.isRunning = true;
        console.log(`[TransferService] HTTP server listening on port ${HTTP_PORT}`);
        resolve();
      });
    });
  }

  /**
   * 停止 HTTP 服务器
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.isRunning = false;
        console.log('[TransferService] HTTP server stopped');
        resolve();
      });
    });
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      // 设置 CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      const url = req.url || '/';

      // 获取可分享技能列表
      if (url === '/api/skills') {
        const skills = await this.getShareableSkills();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(skills));
        return;
      }

      // 获取技能包（用于下载）
      if (url.startsWith('/api/skills/')) {
        const skillName = url.split('/').pop();
        if (skillName) {
          const packageData = await this.getSkillPackage(skillName);
          if (packageData) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(packageData));
            return;
          }
        }
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Skill not found' }));
        return;
      }

      // 健康检查
      if (url === '/api/health') {
        const os = require('os');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          status: 'ok',
          device: {
            hostname: os.hostname(),
            platform: os.platform(),
          },
        }));
        return;
      }

      // 404
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      console.error('[TransferService] Request error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  /**
   * 获取可分享的技能列表
   */
  private async getShareableSkills(): Promise<Array<Omit<SkillMeta, 'path'>>> {
    const skillManager = getSimpleSkillManager();
    const skills = await skillManager.getShareableSkills();

    // 移除 path 字段，不暴露文件路径
    return skills.map(({ path, ...skill }) => skill);
  }

  /**
   * 获取技能包
   */
  private async getSkillPackage(skillName: string): Promise<any | null> {
    const skillManager = getSimpleSkillManager();
    try {
      return await skillManager.exportSkill(skillName);
    } catch (error) {
      console.error(`[TransferService] Failed to export skill: ${skillName}`, error);
      return null;
    }
  }

  /**
   * 是否正在运行
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let transferServiceInstance: TransferService | null = null;

export function getTransferService(): TransferService {
  if (!transferServiceInstance) {
    transferServiceInstance = new TransferService();
  }
  return transferServiceInstance;
}

export function resetTransferService(): void {
  if (transferServiceInstance) {
    transferServiceInstance.stop().then(() => {
      transferServiceInstance = null;
    });
  }
}

export default TransferService;
