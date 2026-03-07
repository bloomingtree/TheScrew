/**
 * P2P IPC Handlers
 *
 * IPC handlers for peer-to-peer device discovery and skill sharing
 */

import { ipcMain } from 'electron';
import { getDiscoveryService, type PeerInfo } from '../p2p/DiscoveryService';

/**
 * Register P2P-related IPC handlers
 */
export function registerP2PHandlers(): void {
  const discoveryService = getDiscoveryService();

  // 启动设备发现
  ipcMain.handle('p2p:startDiscovery', async () => {
    try {
      await discoveryService.start();
      return {
        success: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 停止设备发现
  ipcMain.handle('p2p:stopDiscovery', async () => {
    try {
      await discoveryService.stop();
      return {
        success: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 获取附近设备列表
  ipcMain.handle('p2p:getPeers', async () => {
    try {
      const peers = discoveryService.getPeers();
      return {
        success: true,
        peers,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 获取指定设备的技能列表
  ipcMain.handle('p2p:getPeerSkills', async (_event, peerIp: string) => {
    try {
      // 通过 HTTP 请求获取设备技能列表
      const response = await fetch(`http://${peerIp}:34568/api/skills`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const skills = await response.json();
      return {
        success: true,
        skills,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 从附近设备下载技能
  ipcMain.handle('p2p:downloadSkill', async (_event, peerIp: string, skillName: string) => {
    try {
      // 通过 HTTP 请求下载技能包
      const response = await fetch(`http://${peerIp}:34568/api/skills/${skillName}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const packageData = await response.json();

      // 导入技能
      const { getSimpleSkillManager } = await import('../core/SimpleSkillManager');
      const skillManager = getSimpleSkillManager();
      const skill = await skillManager.importSkillFromContent(JSON.stringify(packageData));

      return {
        success: true,
        skill,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 设置设备名称
  ipcMain.handle('p2p:setDeviceName', async (_event, name: string) => {
    try {
      discoveryService.setDeviceName(name);
      return {
        success: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 设置设备头像
  ipcMain.handle('p2p:setDeviceAvatar', async (_event, avatar: string) => {
    try {
      discoveryService.setDeviceAvatar(avatar);
      return {
        success: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  console.log('[IPC] P2P handlers registered');
}
