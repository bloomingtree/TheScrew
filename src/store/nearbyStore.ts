/**
 * Nearby Store - 附近设备状态管理
 *
 * 使用 Zustand 管理局域网设备发现和技能下载
 */

import { create } from 'zustand';

export interface PeerInfo {
  id: string;
  name: string;
  avatar?: string;
  ip: string;
  port: number;
  lastSeen: number;
  skillsCount: number;
}

interface NearbyState {
  // 发现状态
  isDiscovering: boolean;
  discoveryError: string | null;

  // 设备列表
  peers: PeerInfo[];

  // 选中的设备及其技能
  selectedPeer: PeerInfo | null;
  selectedPeerSkills: any[];
  loadingPeerSkills: boolean;

  // 下载状态
  downloadingSkill: boolean;

  // Actions
  startDiscovery: () => Promise<void>;
  stopDiscovery: () => Promise<void>;
  refreshPeers: () => Promise<void>;

  selectPeer: (peer: PeerInfo | null) => void;
  loadPeerSkills: (peerIp: string) => Promise<void>;

  downloadSkill: (peerIp: string, skillName: string) => Promise<boolean>;

  reset: () => void;
}

export const useNearbyStore = create<NearbyState>((set, get) => ({
  // Initial state
  isDiscovering: false,
  discoveryError: null,
  peers: [],
  selectedPeer: null,
  selectedPeerSkills: [],
  loadingPeerSkills: false,
  downloadingSkill: false,

  // 启动设备发现
  startDiscovery: async () => {
    set({ discoveryError: null });
    try {
      const result = await (window as any).electronAPI.p2p.startDiscovery();
      if (result.success) {
        set({ isDiscovering: true });
        // 立即获取一次设备列表
        await get().refreshPeers();
        // 定期刷新
        setInterval(() => {
          if (get().isDiscovering) {
            get().refreshPeers();
          }
        }, 5000);
      } else {
        set({ discoveryError: result.error || 'Failed to start discovery' });
      }
    } catch (error: any) {
      set({ discoveryError: error.message });
    }
  },

  // 停止设备发现
  stopDiscovery: async () => {
    try {
      await (window as any).electronAPI.p2p.stopDiscovery();
      set({ isDiscovering: false, peers: [] });
    } catch (error: any) {
      console.error('Failed to stop discovery:', error);
    }
  },

  // 刷新设备列表
  refreshPeers: async () => {
    try {
      const result = await (window as any).electronAPI.p2p.getPeers();
      if (result.success && result.peers) {
        set({ peers: result.peers });
      }
    } catch (error) {
      console.error('Failed to refresh peers:', error);
    }
  },

  // 选择设备
  selectPeer: (peer) => {
    set({ selectedPeer: peer, selectedPeerSkills: [] });
    if (peer) {
      get().loadPeerSkills(peer.ip);
    }
  },

  // 加载设备技能列表
  loadPeerSkills: async (peerIp) => {
    set({ loadingPeerSkills: true });
    try {
      const result = await (window as any).electronAPI.p2p.getPeerSkills(peerIp);
      if (result.success && result.skills) {
        set({ selectedPeerSkills: result.skills, loadingPeerSkills: false });
      } else {
        set({ selectedPeerSkills: [], loadingPeerSkills: false });
      }
    } catch (error) {
      console.error('Failed to load peer skills:', error);
      set({ selectedPeerSkills: [], loadingPeerSkills: false });
    }
  },

  // 下载技能
  downloadSkill: async (peerIp, skillName) => {
    set({ downloadingSkill: true });
    try {
      const result = await (window as any).electronAPI.p2p.downloadSkill(peerIp, skillName);
      if (result.success) {
        set({ downloadingSkill: false });
        return true;
      } else {
        console.error('Failed to download skill:', result.error);
        set({ downloadingSkill: false });
        return false;
      }
    } catch (error) {
      console.error('Failed to download skill:', error);
      set({ downloadingSkill: false });
      return false;
    }
  },

  // 重置所有状态
  reset: () => {
    set({
      isDiscovering: false,
      discoveryError: null,
      peers: [],
      selectedPeer: null,
      selectedPeerSkills: [],
      loadingPeerSkills: false,
      downloadingSkill: false,
    });
  },
}));
