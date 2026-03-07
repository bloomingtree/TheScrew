/**
 * Discovery Service - 局域网设备发现服务
 *
 * 使用 UDP 广播发现同网段内的其他用户
 */

import * as dgram from 'dgram';
import { getSimpleSkillManager, type SkillMeta } from '../core/SimpleSkillManager';

export interface PeerInfo {
  id: string;                    // 设备唯一 ID
  name: string;                  // 用户设置的设备名
  avatar?: string;               // 头像（emoji）
  ip: string;                    // IP 地址
  port: number;                  // HTTP 监听端口
  lastSeen: number;              // 最后发现时间
  skillsCount: number;           // 可分享技能数量
}

export interface DiscoveryMessage {
  type: 'presence';
  id: string;
  name: string;
  avatar?: string;
  port: number;
  skillsCount: number;
}

const BROADCAST_PORT = 34567;
const BROADCAST_INTERVAL = 5000; // 5秒
const PEER_TIMEOUT = 30000;      // 30秒超时

export class DiscoveryService {
  private udpSocket: dgram.Socket | null = null;
  private peers: Map<string, PeerInfo> = new Map();
  private broadcastInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  // 设备信息
  private deviceId: string;
  private deviceName: string;
  private deviceAvatar: string;
  private httpPort: number;

  constructor() {
    // 生成或获取设备 ID
    this.deviceId = this.getDeviceId();
    this.deviceName = this.getDeviceName();
    this.deviceAvatar = this.getDeviceAvatar();
    this.httpPort = 34568;
  }

  /**
   * 启动发现服务
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[DiscoveryService] Already running');
      return;
    }

    try {
      // 创建 UDP socket
      this.udpSocket = dgram.createSocket('udp4');

      // 监听消息
      this.udpSocket.on('message', (msg, rinfo) => {
        this.handleMessage(msg, rinfo);
      });

      // 监听错误
      this.udpSocket.on('error', (err) => {
        console.error('[DiscoveryService] UDP error:', err);
      });

      // 绑定端口并启用广播
      await new Promise<void>((resolve, reject) => {
        this.udpSocket!.bind(BROADCAST_PORT, () => {
          this.udpSocket!.setBroadcast(true);
          resolve();
        });

        this.udpSocket!.once('error', reject);
      });

      this.isRunning = true;

      // 立即广播一次
      await this.broadcastPresence();

      // 定期广播
      this.broadcastInterval = setInterval(() => {
        this.broadcastPresence();
      }, BROADCAST_INTERVAL);

      // 定期清理超时设备
      setInterval(() => {
        this.cleanupTimeoutPeers();
      }, PEER_TIMEOUT / 2);

      console.log('[DiscoveryService] Started', {
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        port: BROADCAST_PORT,
      });
    } catch (error) {
      console.error('[DiscoveryService] Failed to start:', error);
      throw error;
    }
  }

  /**
   * 停止发现服务
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }

    if (this.udpSocket) {
      this.udpSocket.close();
      this.udpSocket = null;
    }

    this.peers.clear();
    this.isRunning = false;

    console.log('[DiscoveryService] Stopped');
  }

  /**
   * 广播自己的存在
   */
  private async broadcastPresence(): Promise<void> {
    if (!this.udpSocket || !this.isRunning) {
      return;
    }

    try {
      // 获取可分享技能数量
      const skillManager = getSimpleSkillManager();
      const shareableSkills = await skillManager.getShareableSkills();

      const message: DiscoveryMessage = {
        type: 'presence',
        id: this.deviceId,
        name: this.deviceName,
        avatar: this.deviceAvatar,
        port: this.httpPort,
        skillsCount: shareableSkills.length,
      };

      const buffer = Buffer.from(JSON.stringify(message));

      this.udpSocket.send(buffer, BROADCAST_PORT, '255.255.255.255', (err) => {
        if (err) {
          console.error('[DiscoveryService] Broadcast failed:', err);
        }
      });
    } catch (error) {
      console.error('[DiscoveryService] Broadcast error:', error);
    }
  }

  /**
   * 处理收到的消息
   */
  private async handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): Promise<void> {
    try {
      // 忽略自己发送的消息
      if (rinfo.address === this.getLocalIP()) {
        return;
      }

      const data: DiscoveryMessage = JSON.parse(msg.toString());

      if (data.type === 'presence') {
        // 忽略自己
        if (data.id === this.deviceId) {
          return;
        }

        // 更新/添加设备
        this.peers.set(data.id, {
          id: data.id,
          name: data.name,
          avatar: data.avatar,
          ip: rinfo.address,
          port: data.port,
          lastSeen: Date.now(),
          skillsCount: data.skillsCount,
        });

        console.log('[DiscoveryService] Discovered peer:', {
          id: data.id,
          name: data.name,
          ip: rinfo.address,
          skillsCount: data.skillsCount,
        });
      }
    } catch (error) {
      console.warn('[DiscoveryService] Invalid message:', error);
    }
  }

  /**
   * 清理超时的设备
   */
  private cleanupTimeoutPeers(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > PEER_TIMEOUT) {
        this.peers.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[DiscoveryService] Cleaned up ${cleaned} timeout peers`);
    }
  }

  /**
   * 获取附近设备列表
   */
  getPeers(): PeerInfo[] {
    this.cleanupTimeoutPeers();
    return Array.from(this.peers.values());
  }

  /**
   * 获取设备唯一 ID
   */
  private getDeviceId(): string {
    // 使用机器名 + 用户名的简单组合
    const os = require('os');
    const hostname = os.hostname();
    const userInfo = os.userInfo();
    return `${hostname}-${userInfo.username}-${os.platform()}`.replace(/[^a-zA-Z0-9-]/g, '');
  }

  /**
   * 获取设备名称
   */
  private getDeviceName(): string {
    const os = require('os');
    return os.hostname() || 'Unknown Device';
  }

  /**
   * 获取设备头像
   */
  private getDeviceAvatar(): string {
    // 可以从配置读取，默认使用电脑 emoji
    return '💻';
  }

  /**
   * 获取本机 IP 地址
   */
  private getLocalIP(): string {
    const os = require('os');
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // 跳过内部 IP 和非 IPv4
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }

    return '127.0.0.1';
  }

  /**
   * 设置设备名称
   */
  setDeviceName(name: string): void {
    this.deviceName = name;
  }

  /**
   * 设置设备头像
   */
  setDeviceAvatar(avatar: string): void {
    this.deviceAvatar = avatar;
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

let discoveryServiceInstance: DiscoveryService | null = null;

export function getDiscoveryService(): DiscoveryService {
  if (!discoveryServiceInstance) {
    discoveryServiceInstance = new DiscoveryService();
  }
  return discoveryServiceInstance;
}

export function resetDiscoveryService(): void {
  if (discoveryServiceInstance) {
    discoveryServiceInstance.stop();
    discoveryServiceInstance = null;
  }
}

export default DiscoveryService;
