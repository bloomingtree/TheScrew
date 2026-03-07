/**
 * Nearby Tab - 附近设备面板
 *
 * 查看局域网内其他用户及其分享的技能
 */

import React, { useEffect, useState } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  User,
  Download,
  X,
  Check,
  AlertCircle,
} from 'lucide-react';
import { useNearbyStore } from '@/store/nearbyStore';
import { useSkillsStore } from '@/store/skillsStore';

const NearbyTab: React.FC = () => {
  const {
    isDiscovering,
    discoveryError,
    peers,
    selectedPeer,
    selectedPeerSkills,
    loadingPeerSkills,
    downloadingSkill,
    startDiscovery,
    stopDiscovery,
    refreshPeers,
    selectPeer,
    downloadSkill,
  } = useNearbyStore();

  const { loadSkills } = useSkillsStore();
  const [viewMode, setViewMode] = useState<'peers' | 'skills'>('peers');
  const [downloadStatus, setDownloadStatus] = useState<Record<string, 'success' | 'error' | null>>({});

  useEffect(() => {
    // 自动启动发现
    startDiscovery();

    return () => {
      // 组件卸载时停止发现
      // stopDiscovery();
    };
  }, []);

  // 下载技能后的处理
  const handleDownloadSkill = async (peerIp: string, skillName: string) => {
    setDownloadStatus({ ...downloadStatus, [skillName]: null });
    const success = await downloadSkill(peerIp, skillName);
    if (success) {
      setDownloadStatus({ ...downloadStatus, [skillName]: 'success' });
      // 重新加载技能列表
      await loadSkills();
      // 3秒后清除状态
      setTimeout(() => {
        setDownloadStatus(prev => ({ ...prev, [skillName]: null }));
      }, 3000);
    } else {
      setDownloadStatus({ ...downloadStatus, [skillName]: 'error' });
    }
  };

  // 设备列表视图
  const PeersView = () => (
    <div className="p-4 space-y-2">
      {peers.length === 0 ? (
        <div className="text-center py-8">
          <WifiOff size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">
            {isDiscovering ? '正在搜索附近设备...' : '没有发现附近设备'}
          </p>
          <p className="text-xs text-gray-400 mt-2">
            确保其他设备也在运行本应用，并且在同一网络
          </p>
        </div>
      ) : (
        peers.map((peer) => (
          <div
            key={peer.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all cursor-pointer"
            onClick={() => {
              selectPeer(peer);
              setViewMode('skills');
            }}
          >
            {/* 头像 */}
            <div className="text-2xl">{peer.avatar || '👤'}</div>

            {/* 信息 */}
            <div className="flex-1">
              <h3 className="font-medium text-sm">{peer.name}</h3>
              <p className="text-xs text-gray-500">{peer.ip}</p>
            </div>

            {/* 技能数量 */}
            <div className="text-right">
              <span className="text-sm font-medium text-blue-600">{peer.skillsCount}</span>
              <span className="text-xs text-gray-500 ml-1">个技能</span>
            </div>
          </div>
        ))
      )}
    </div>
  );

  // 设备技能视图
  const SkillsView = () => {
    if (!selectedPeer) {
      return (
        <div className="p-4 text-center text-sm text-gray-500">
          请选择一个设备
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col">
        {/* 头部：设备信息和返回按钮 */}
        <div className="px-4 py-3 border-b border-gray-200">
          <button
            onClick={() => {
              selectPeer(null);
              setViewMode('peers');
            }}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-2"
          >
            ← 返回设备列表
          </button>
          <div className="flex items-center gap-3">
            <div className="text-3xl">{selectedPeer.avatar || '👤'}</div>
            <div>
              <h3 className="font-semibold">{selectedPeer.name}</h3>
              <p className="text-xs text-gray-500">{selectedPeer.ip}</p>
            </div>
          </div>
        </div>

        {/* 技能列表 */}
        <div className="flex-1 overflow-auto">
          {loadingPeerSkills ? (
            <div className="p-4 text-center text-sm text-gray-500">加载中...</div>
          ) : selectedPeerSkills.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">
              该设备没有可分享的技能
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {selectedPeerSkills.map((skill) => {
                const status = downloadStatus[skill.name];
                return (
                  <div
                    key={skill.name}
                    className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-all"
                  >
                    {/* 图标 */}
                    <div className="text-2xl">{skill.emoji || '⚡'}</div>

                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm truncate">{skill.name}</h4>
                        {skill.version && (
                          <span className="text-xs text-gray-400">v{skill.version}</span>
                        )}
                        {skill.visibility === 'public' && (
                          <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">公开</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-2 mb-1">{skill.description}</p>
                      {skill.tags && skill.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {skill.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 下载按钮 */}
                    <div className="shrink-0">
                      {status === 'success' ? (
                        <div className="flex items-center gap-1 text-green-600 text-sm">
                          <Check size={14} />
                          <span>已下载</span>
                        </div>
                      ) : status === 'error' ? (
                        <div className="flex items-center gap-1 text-red-600 text-sm">
                          <AlertCircle size={14} />
                          <span>失败</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleDownloadSkill(selectedPeer.ip, skill.name)}
                          disabled={downloadingSkill}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Download size={14} />
                          <span>下载</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 头部：标题和状态 */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isDiscovering ? (
              <Wifi size={18} className="text-green-500" />
            ) : (
              <WifiOff size={18} className="text-gray-400" />
            )}
            <h2 className="font-semibold">附近设备</h2>
            <span className="text-sm text-gray-500">({peers.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshPeers}
              disabled={!isDiscovering}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              title="刷新"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={isDiscovering ? stopDiscovery : startDiscovery}
              className={`px-3 py-1.5 text-sm rounded-lg ${
                isDiscovering
                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                  : 'bg-green-100 text-green-600 hover:bg-green-200'
              }`}
            >
              {isDiscovering ? '停止' : '开始'}
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {discoveryError && (
          <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
            {discoveryError}
          </div>
        )}
      </div>

      {/* 内容区域 */}
      {viewMode === 'peers' ? <PeersView /> : <SkillsView />}
    </div>
  );
};

export default NearbyTab;
