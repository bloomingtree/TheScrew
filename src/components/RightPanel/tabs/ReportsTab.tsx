/**
 * Reports Tab - 报告标签页
 *
 * 工作总结报告的生成和管理界面
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  Sparkles,
  Calendar,
  Clock,
  Trash2,
  Download,
} from 'lucide-react';
import { useReportStore } from '@/store/reportStore';
import ReactMarkdown from 'react-markdown';

const ReportsTab: React.FC = () => {
  const {
    templates,
    templatesLoading,
    currentReport,
    isGenerating,
    generateError,
    history,
    historyLoading,
    loadTemplates,
    generateReport,
    clearCurrentReport,
    loadHistory,
    deleteFromHistory,
  } = useReportStore();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('weekly-default');
  const [viewMode, setViewMode] = useState<'generate' | 'history'>('generate');

  useEffect(() => {
    loadTemplates();
    loadHistory();
  }, []);

  const handleGenerate = async () => {
    await generateReport({
      templateId: selectedTemplateId,
    });
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 视图切换 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
        <button
          onClick={() => setViewMode('generate')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            viewMode === 'generate'
              ? 'bg-blue-500 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Sparkles size={14} />
          <span>生成报告</span>
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
          <span>历史记录</span>
          {history.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-xs">
              {history.length}
            </span>
          )}
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'generate' ? (
          <GenerateView
            templates={templates}
            templatesLoading={templatesLoading}
            selectedTemplateId={selectedTemplateId}
            onTemplateChange={setSelectedTemplateId}
            currentReport={currentReport}
            isGenerating={isGenerating}
            generateError={generateError}
            onGenerate={handleGenerate}
            onClearReport={clearCurrentReport}
          />
        ) : (
          <HistoryView
            history={history}
            historyLoading={historyLoading}
            onDelete={deleteFromHistory}
            onSelect={(report) => {
              setViewMode('generate');
              // TODO: 显示历史报告详情
            }}
          />
        )}
      </div>
    </div>
  );
};

// 生成报告视图
const GenerateView: React.FC<{
  templates: any[];
  templatesLoading: boolean;
  selectedTemplateId: string;
  onTemplateChange: (id: string) => void;
  currentReport: any;
  isGenerating: boolean;
  generateError: string | null;
  onGenerate: () => void;
  onClearReport: () => void;
}> = ({
  templates,
  templatesLoading,
  selectedTemplateId,
  onTemplateChange,
  currentReport,
  isGenerating,
  generateError,
  onGenerate,
  onClearReport,
}) => {
  return (
    <div className="p-4 space-y-4">
      {/* 模板选择 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          选择模板
        </label>
        {templatesLoading ? (
          <div className="text-sm text-gray-500">加载模板中...</div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => onTemplateChange(template.id)}
                className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                  selectedTemplateId === template.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <FileText
                  className={`${
                    selectedTemplateId === template.id ? 'text-blue-500' : 'text-gray-400'
                  }`}
                  size={18}
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">{template.name}</div>
                  <div className="text-xs text-gray-500">{template.description}</div>
                </div>
                <div className="text-xs text-gray-400 capitalize">
                  {template.category}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 生成按钮 */}
      <button
        onClick={onGenerate}
        disabled={isGenerating}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
          isGenerating
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
            : 'bg-blue-500 text-white hover:bg-blue-600'
        }`}
      >
        {isGenerating ? (
          <>
            <Sparkles size={16} className="animate-spin" />
            <span>生成中...</span>
          </>
        ) : (
          <>
            <Sparkles size={16} />
            <span>生成报告</span>
          </>
        )}
      </button>

      {/* 错误提示 */}
      {generateError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {generateError}
        </div>
      )}

      {/* 报告预览 */}
      {currentReport && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border border-gray-200 rounded-lg overflow-hidden"
        >
          {/* 报告头部 */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-blue-500" />
              <span className="font-medium text-sm">{currentReport.title}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-500"
                title="导出"
              >
                <Download size={14} />
              </button>
              <button
                onClick={onClearReport}
                className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-500"
                title="清除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* 报告内容 */}
          <div className="p-4 max-h-96 overflow-auto">
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h1 className="text-xl font-bold mb-4">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-lg font-semibold mb-3 mt-4">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-base font-medium mb-2 mt-3">{children}</h3>
                ),
                p: ({ children }) => (
                  <p className="mb-2 text-sm text-gray-700">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc list-inside mb-3 text-sm text-gray-700">
                    {children}
                  </ul>
                ),
                li: ({ children }) => (
                  <li className="mb-1">{children}</li>
                ),
                hr: () => <hr className="my-4 border-gray-200" />,
              }}
            >
              {currentReport.content}
            </ReactMarkdown>
          </div>
        </motion.div>
      )}
    </div>
  );
};

// 历史记录视图
const HistoryView: React.FC<{
  history: any[];
  historyLoading: boolean;
  onDelete: (id: string) => void;
  onSelect: (report: any) => void;
}> = ({ history, historyLoading, onDelete, onSelect }) => {
  if (historyLoading) {
    return (
      <div className="p-4 text-center text-sm text-gray-500">
        加载历史记录中...
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-400">
        <FileText size={32} className="mx-auto mb-2 opacity-50" />
        <p>暂无历史记录</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      {history.map((report) => (
        <div
          key={report.id}
          className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all cursor-pointer"
          onClick={() => onSelect(report)}
        >
          <FileText size={16} className="text-gray-400" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{report.title}</div>
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <Calendar size={12} />
              {new Date(report.createdAt).toLocaleString('zh-CN')}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('确定要删除这条记录吗？')) {
                onDelete(report.id);
              }
            }}
            className="p-1.5 rounded hover:bg-red-100 transition-colors text-gray-400 hover:text-red-500"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default ReportsTab;
