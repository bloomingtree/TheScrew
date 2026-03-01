/**
 * Workflows Tab - 工作流标签页
 *
 * 工作流管理和执行界面
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Zap,
  Play,
  Plus,
  Trash2,
  Settings,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';

const WorkflowsTab: React.FC = () => {
  const {
    workflows,
    workflowsLoading,
    executions,
    executionsLoading,
    templates,
    loadWorkflows,
    deleteWorkflow,
    setWorkflowEnabled,
    executeWorkflow,
    loadExecutions,
    loadTemplates,
    installTemplate,
  } = useWorkflowStore();

  const [viewMode, setViewMode] = useState<'list' | 'templates' | 'history'>('list');

  useEffect(() => {
    loadWorkflows();
    loadTemplates();
    loadExecutions();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={14} className="text-green-500" />;
      case 'failed':
        return <XCircle size={14} className="text-red-500" />;
      case 'running':
        return <Clock size={14} className="text-blue-500 animate-spin" />;
      default:
        return <AlertCircle size={14} className="text-gray-400" />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 视图切换 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
        <button
          onClick={() => setViewMode('list')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            viewMode === 'list'
              ? 'bg-blue-500 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Zap size={14} />
          <span>工作流</span>
          {workflows.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-xs">
              {workflows.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setViewMode('templates')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            viewMode === 'templates'
              ? 'bg-blue-500 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Settings size={14} />
          <span>模板</span>
        </button>
        <button
          onClick={() => setViewMode('history')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            viewMode === 'history'
              ? 'bg-blue-500 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Clock size={14} />
          <span>执行记录</span>
          {executions.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-xs">
              {executions.length}
            </span>
          )}
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'list' && (
          <WorkflowListView
            workflows={workflows}
            loading={workflowsLoading}
            onDelete={deleteWorkflow}
            onToggle={setWorkflowEnabled}
            onExecute={executeWorkflow}
          />
        )}
        {viewMode === 'templates' && (
          <TemplatesView
            templates={templates}
            onInstall={installTemplate}
          />
        )}
        {viewMode === 'history' && (
          <HistoryView
            executions={executions}
            loading={executionsLoading}
            getStatusIcon={getStatusIcon}
          />
        )}
      </div>
    </div>
  );
};

// 工作流列表视图
const WorkflowListView: React.FC<{
  workflows: any[];
  loading: boolean;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onExecute: (id: string) => Promise<void>;
}> = ({ workflows, loading, onDelete, onToggle, onExecute }) => {
  if (loading) {
    return <div className="p-4 text-center text-sm text-gray-500">加载中...</div>;
  }

  if (workflows.length === 0) {
    return (
      <div className="p-4 text-center">
        <Zap size={32} className="mx-auto mb-2 text-gray-300" />
        <p className="text-sm text-gray-400">暂无工作流</p>
        <p className="text-xs text-gray-400 mt-1">从模板安装或创建新工作流</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      {workflows.map((workflow) => (
        <div
          key={workflow.id}
          className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-all"
        >
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{workflow.name}</div>
            <div className="text-xs text-gray-500 truncate">{workflow.description}</div>
          </div>
          <button
            onClick={() => onToggle(workflow.id, !workflow.enabled)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              workflow.enabled
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {workflow.enabled ? '已启用' : '已禁用'}
          </button>
          <button
            onClick={() => onExecute(workflow.id)}
            className="p-1.5 rounded hover:bg-blue-100 transition-colors text-blue-500"
            title="执行"
          >
            <Play size={14} />
          </button>
          <button
            onClick={() => {
              if (confirm(`确定要删除工作流 "${workflow.name}" 吗？`)) {
                onDelete(workflow.id);
              }
            }}
            className="p-1.5 rounded hover:bg-red-100 transition-colors text-gray-400 hover:text-red-500"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};

// 模板视图
const TemplatesView: React.FC<{
  templates: any[];
  onInstall: (templateId: string) => Promise<boolean>;
}> = ({ templates, onInstall }) => {
  const [installing, setInstalling] = useState<string | null>(null);

  const handleInstall = async (templateId: string) => {
    setInstalling(templateId);
    try {
      await onInstall(templateId);
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="p-4 space-y-2">
      {templates.map((template) => (
        <div
          key={template.id}
          className="flex items-center gap-3 p-3 rounded-lg border border-gray-200"
        >
          <div className="flex-1">
            <div className="font-medium text-sm">{template.name}</div>
            <div className="text-xs text-gray-500">{template.description}</div>
            <div className="text-xs text-gray-400 mt-1 capitalize">
              {template.category}
            </div>
          </div>
          <button
            onClick={() => handleInstall(template.id)}
            disabled={installing === template.id}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              installing === template.id
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {installing === template.id ? '安装中...' : '安装'}
          </button>
        </div>
      ))}
    </div>
  );
};

// 执行历史视图
const HistoryView: React.FC<{
  executions: any[];
  loading: boolean;
  getStatusIcon: (status: string) => React.ReactNode;
}> = ({ executions, loading, getStatusIcon }) => {
  if (loading) {
    return <div className="p-4 text-center text-sm text-gray-500">加载中...</div>;
  }

  if (executions.length === 0) {
    return (
      <div className="p-4 text-center">
        <Clock size={32} className="mx-auto mb-2 text-gray-300" />
        <p className="text-sm text-gray-400">暂无执行记录</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      {executions.map((execution) => (
        <div
          key={execution.id}
          className="flex items-center gap-3 p-3 rounded-lg border border-gray-200"
        >
          {getStatusIcon(execution.status)}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{execution.workflowName}</div>
            <div className="text-xs text-gray-500">
              {new Date(execution.startedAt).toLocaleString('zh-CN')}
            </div>
          </div>
          <div className="text-xs text-gray-400 capitalize">
            {execution.status === 'completed' && '已完成'}
            {execution.status === 'failed' && '失败'}
            {execution.status === 'running' && '运行中'}
            {execution.status === 'cancelled' && '已取消'}
          </div>
        </div>
      ))}
    </div>
  );
};

export default WorkflowsTab;
