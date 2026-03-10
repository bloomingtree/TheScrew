/**
 * Skills Tab - 技能管理面板
 *
 * 管理我的技能，查看附近设备，支持导出、导入、删除等操作
 */

import React, { useEffect, useState } from 'react';
import {
  Zap,
  Search,
  Download,
  Upload,
  Trash2,
  Eye,
  EyeOff,
  Globe,
  Users,
  Lock,
  MoreVertical,
  RefreshCw,
  Wifi,
  WifiOff,
  Check,
  AlertCircle,
  X,
} from 'lucide-react';
import { useSkillsStore, SkillVisibility } from '@/store/skillsStore';
import { useNearbyStore } from '@/store/nearbyStore';

const SkillsTab: React.FC = () => {
  // Skills store
  const {
    skills,
    skillsLoading,
    exporting,
    importing,
    deleting,
    loadSkills,
    exportSkill,
    deleteSkill,
    setSkillVisibility,
    reloadSkills,
  } = useSkillsStore();

  // Nearby store
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

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedVisibility, setSelectedVisibility] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'mine' | 'nearby' | 'peerSkills'>('mine');
  const [downloadStatus, setDownloadStatus] = useState<Record<string, 'success' | 'error' | null>>({});

  useEffect(() => {
    loadSkills();
    // 自动启动设备发现
    startDiscovery();
    // 定期刷新设备列表
    const interval = setInterval(() => {
      if (isDiscovering) {
        refreshPeers();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // 获取分类列表
  const categories = ['all', ...Array.from(new Set(skills.map((s) => s.category || 'uncategorized')))];

  // 过滤技能
  const filteredSkills = skills.filter((skill) => {
    const matchesSearch =
      searchQuery === '' ||
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (skill.tags && skill.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase())));

    const matchesCategory = selectedCategory === 'all' || skill.category === selectedCategory;
    const matchesVisibility = selectedVisibility === 'all' || skill.visibility === selectedVisibility;

    return matchesSearch && matchesCategory && matchesVisibility;
  });

  // 获取可见性图标
  const getVisibilityIcon = (visibility?: SkillVisibility) => {
    switch (visibility) {
      case 'public':
        return <Globe size={14} className="text-green-500" />;
      case 'organization':
        return <Users size={14} className="text-blue-500" />;
      case 'private':
        return <Lock size={14} className="text-gray-500" />;
      default:
        return <Users size={14} className="text-blue-500" />;
    }
  };

  // 获取可见性文本
  const getVisibilityText = (visibility?: SkillVisibility) => {
    switch (visibility) {
      case 'public':
        return '公开';
      case 'organization':
        return '组织内';
      case 'private':
        return '私密';
      default:
        return '组织内';
    }
  };

  // 导出技能（zip 格式）
  const handleExport = async (skillName: string) => {
    const result = await exportSkill(skillName);
    if (result && result.zipData) {
      // zipData 是 Uint8Array，直接用于创建 Blob
      const blob = new Blob([result.zipData as BlobPart], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // 导入技能（支持 zip 和旧格式）
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,.zes,.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        // 读取文件为 ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);

        // 调用 IPC 导入
        const result = await (window as any).electronAPI.skills.importFromBuffer(buffer);
        if (result.success) {
          await loadSkills();
          alert(`技能 "${result.skill.name}" 导入成功！`);
        } else {
          alert(`导入失败: ${result.error}`);
        }
      } catch (error: any) {
        console.error('Import error:', error);
        alert(`导入失败: ${error.message}`);
      }
    };
    input.click();
  };

  // 删除技能
  const handleDelete = async (skillName: string) => {
    if (confirm(`确定要删除技能 "${skillName}" 吗？此操作无法撤销。`)) {
      await deleteSkill(skillName);
    }
  };

  // 切换可见性
  const cycleVisibility = async (skill: { name: string; visibility?: SkillVisibility }) => {
    const visibilityOrder: SkillVisibility[] = ['organization', 'public', 'private'];
    const currentIndex = visibilityOrder.indexOf(skill.visibility || 'organization');
    const nextVisibility = visibilityOrder[(currentIndex + 1) % visibilityOrder.length];
    await setSkillVisibility(skill.name, nextVisibility);
  };

  // 下载技能
  const handleDownloadSkill = async (peerIp: string, skillName: string) => {
    setDownloadStatus({ ...downloadStatus, [skillName]: null });
    const success = await downloadSkill(peerIp, skillName);
    if (success) {
      setDownloadStatus({ ...downloadStatus, [skillName]: 'success' });
      await loadSkills();
      setTimeout(() => {
        setDownloadStatus(prev => ({ ...prev, [skillName]: null }));
      }, 3000);
    } else {
      setDownloadStatus({ ...downloadStatus, [skillName]: 'error' });
    }
  };

  // 我的技能视图
  const MySkillsView = () => (
    <>
      {/* 搜索和筛选 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索技能..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
        >
          <option value="all">全部分类</option>
          {categories.filter(c => c !== 'all').map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select
          value={selectedVisibility}
          onChange={(e) => setSelectedVisibility(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
        >
          <option value="all">全部可见性</option>
          <option value="public">公开</option>
          <option value="organization">组织内</option>
          <option value="private">私密</option>
        </select>
      </div>

      {/* 技能列表 */}
      <div className="flex-1 overflow-auto">
        {skillsLoading ? (
          <div className="p-4 text-center text-sm text-gray-500">加载中...</div>
        ) : filteredSkills.length === 0 ? (
          <div className="p-8 text-center">
            <Zap size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-500">
              {searchQuery || selectedCategory !== 'all' || selectedVisibility !== 'all'
                ? '没有找到匹配的技能'
                : '还没有技能，在 .config/skills/ 目录下创建 SKILL.md 文件来添加技能'}
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {filteredSkills.map((skill) => (
              <div
                key={skill.name}
                className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all group"
              >
                <div className="text-2xl shrink-0">{skill.emoji || '⚡'}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-sm truncate">{skill.name}</h3>
                    <button
                      onClick={() => cycleVisibility(skill)}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs hover:bg-gray-200"
                      title={`点击切换: ${getVisibilityText(skill.visibility)}`}
                    >
                      {getVisibilityIcon(skill.visibility)}
                    </button>
                    {skill.version && <span className="text-xs text-gray-400">v{skill.version}</span>}
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2 mb-1">{skill.description}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {skill.category && <span className="capitalize">{skill.category}</span>}
                    {skill.author && <span>• {skill.author}</span>}
                    {skill.tags && skill.tags.length > 0 && (
                      <>
                        <span>•</span>
                        {skill.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 bg-gray-100 rounded">{tag}</span>
                        ))}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleExport(skill.name)}
                    disabled={exporting}
                    className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-blue-500"
                    title="导出"
                  >
                    <Download size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(skill.name)}
                    disabled={deleting}
                    className="p-1.5 rounded hover:bg-red-100 text-gray-500 hover:text-red-500"
                    title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  // 附近设备视图
  const NearbyView = () => (
    <div className="p-4 space-y-2">
      {peers.length === 0 ? (
        <div className="text-center py-8">
          <WifiOff size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">
            {isDiscovering ? '正在搜索附近设备...' : '没有发现附近设备'}
          </p>
        </div>
      ) : (
        peers.map((peer) => (
          <div
            key={peer.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all cursor-pointer"
            onClick={() => {
              selectPeer(peer);
              setViewMode('peerSkills');
            }}
          >
            <div className="text-2xl">{peer.avatar || '👤'}</div>
            <div className="flex-1">
              <h3 className="font-medium text-sm">{peer.name}</h3>
              <p className="text-xs text-gray-500">{peer.ip}</p>
            </div>
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
  const PeerSkillsView = () => {
    if (!selectedPeer) {
      return <div className="p-4 text-center text-sm text-gray-500">请选择一个设备</div>;
    }

    return (
      <div className="h-full flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200">
          <button
            onClick={() => {
              selectPeer(null);
              setViewMode('nearby');
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
        <div className="flex-1 overflow-auto">
          {loadingPeerSkills ? (
            <div className="p-4 text-center text-sm text-gray-500">加载中...</div>
          ) : selectedPeerSkills.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">该设备没有可分享的技能</div>
          ) : (
            <div className="p-4 space-y-2">
              {selectedPeerSkills.map((skill) => {
                const status = downloadStatus[skill.name];
                return (
                  <div
                    key={skill.name}
                    className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-all"
                  >
                    <div className="text-2xl">{skill.emoji || '⚡'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm truncate">{skill.name}</h4>
                        {skill.version && <span className="text-xs text-gray-400">v{skill.version}</span>}
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-2">{skill.description}</p>
                    </div>
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
                          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 disabled:opacity-50"
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
      {/* 头部：标题和操作 */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          {/* 视图切换 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('mine')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'mine' || viewMode === 'peerSkills'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Zap size={14} />
              <span>我的技能</span>
              <span className="text-xs opacity-75">({skills.length})</span>
            </button>
            <button
              onClick={() => setViewMode('nearby')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'nearby'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {isDiscovering ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>附近设备</span>
              <span className="text-xs opacity-75">({peers.length})</span>
            </button>
          </div>

          {/* 操作按钮 */}
          {viewMode === 'mine' && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                title="导入技能"
              >
                <Upload size={14} />
                <span>导入</span>
              </button>
              <button
                onClick={() => reloadSkills()}
                className="p-1.5 rounded-lg hover:bg-gray-100"
                title="重新加载"
              >
                <RefreshCw size={14} className={skillsLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          )}

          {viewMode === 'nearby' && (
            <div className="flex items-center gap-2">
              <button
                onClick={refreshPeers}
                disabled={!isDiscovering}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50"
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
          )}
        </div>

        {/* 错误提示 */}
        {discoveryError && viewMode === 'nearby' && (
          <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
            {discoveryError}
          </div>
        )}
      </div>

      {/* 内容区域 */}
      {viewMode === 'mine' && <MySkillsView />}
      {viewMode === 'nearby' && <NearbyView />}
      {viewMode === 'peerSkills' && <PeerSkillsView />}

      {/* 底部说明 */}
      {viewMode === 'mine' && (
        <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-500">
            💡 技能文件位于 <code>.config/skills/</code> 目录下
          </p>
        </div>
      )}
    </div>
  );
};

export default SkillsTab;
