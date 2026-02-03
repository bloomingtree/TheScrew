import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, Search, Edit3, Check } from 'lucide-react';
import { toast } from '../../store/toastStore';

export interface WordPreviewData {
  filepath: string;
  structure: {
    paragraphs: Array<{ index: number; text: string; length: number; level?: number }>;
    tables: Array<{
      index: number;
      rows: Array<{
        index: number;
        cells: Array<{ text: string }>;
      }>;
    }>;
  };
  html: string;
  metadata: {
    path: string;
    size?: number;
    modified?: string;
  };
}

// 编辑位置类型
export type EditLocation =
  | { type: 'paragraph'; index: number }
  | { type: 'table'; tableIndex: number; rowIndex: number; columnIndex: number };

interface WordPreviewDialogProps {
  isOpen: boolean;
  filepath: string;
  onClose: () => void;
}

const WordPreviewDialog: React.FC<WordPreviewDialogProps> = ({ isOpen, filepath, onClose }) => {
  const [previewData, setPreviewData] = useState<WordPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<EditLocation | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // 加载预览数据
  useEffect(() => {
    if (isOpen && filepath) {
      loadPreview();
    }
  }, [isOpen, filepath]);

  const loadPreview = async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.word.preview(filepath);
      setPreviewData(data);
    } catch (error: any) {
      toast.error(error.message || '加载预览失败');
    } finally {
      setLoading(false);
    }
  };

  // 点击段落选中
  const handleParagraphClick = (index: number) => {
    setSelectedLocation({ type: 'paragraph', index });
    const paragraph = previewData?.structure.paragraphs[index];
    if (paragraph) {
      setEditingContent(paragraph.text);
      setIsEditing(true);
    }
  };

  // 点击表格单元格选中
  const handleCellClick = (tableIndex: number, rowIndex: number, columnIndex: number, text: string) => {
    setSelectedLocation({ type: 'table', tableIndex, rowIndex, columnIndex });
    setEditingContent(text);
    setIsEditing(true);
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!selectedLocation || !previewData) return;

    setSaving(true);
    try {
      await window.electronAPI.word.edit(previewData.filepath, selectedLocation, editingContent);
      toast.success('修改已保存');
      setIsEditing(false);
      setSelectedLocation(null);
      // 重新加载预览
      await loadPreview();
    } catch (error: any) {
      toast.error(error.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setIsEditing(false);
    setSelectedLocation(null);
    setEditingContent('');
  };

  // 过滤段落
  const filteredParagraphs = previewData?.structure.paragraphs.filter(p =>
    p.text.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="glass rounded-2xl shadow-2xl w-full max-w-5xl h-[80vh] mx-4 border border-gray-200/50 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200/50 shrink-0">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-blue-500" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Word文档预览</h2>
                  <p className="text-xs text-gray-500">{previewData?.metadata.path || filepath}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-900 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* 内容区 */}
            <div className="flex-1 flex overflow-hidden">
              {/* 左侧：结构树 */}
              <div className="w-72 border-r border-gray-200/50 flex flex-col bg-gray-50/50">
                {/* 搜索框 */}
                <div className="p-3 border-b border-gray-200/50">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="搜索内容..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>

                {/* 结构列表 */}
                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                  {loading ? (
                    <div className="text-center text-gray-500 py-8">加载中...</div>
                  ) : (
                    <>
                      {/* 段落列表 */}
                      {filteredParagraphs.length === 0 ? (
                        <div className="text-center text-gray-500 py-4">无匹配内容</div>
                      ) : (
                        filteredParagraphs.map((p) => (
                          <div
                            key={p.index}
                            onClick={() => handleParagraphClick(p.index)}
                            className={`
                              p-2 rounded-lg cursor-pointer transition-all
                              ${selectedLocation?.type === 'paragraph' && selectedLocation.index === p.index
                                ? 'bg-blue-100 border-blue-300'
                                : 'hover:bg-gray-100 border-transparent'}
                              border text-sm
                            `}
                          >
                            <div className="flex items-start gap-2">
                              <span className="text-gray-400 shrink-0">{p.index}.</span>
                              <span className="line-clamp-2 text-gray-700">{p.text || '(空段落)'}</span>
                            </div>
                          </div>
                        ))
                      )}

                      {/* 表格列表 */}
                      {previewData?.structure.tables.map((table) => (
                        <div key={`table-${table.index}`} className="mt-4">
                          <div className="text-xs font-semibold text-gray-500 mb-2 px-2">
                            表格 {table.index}
                          </div>
                          {table.rows.map((row) => (
                            <div key={`row-${row.index}`} className="ml-2 mb-1">
                              {row.cells.map((cell, ci) => (
                                <div
                                  key={`cell-${ci}`}
                                  onClick={() => handleCellClick(table.index, row.index, ci, cell.text)}
                                  className="text-xs p-1.5 rounded hover:bg-gray-100 cursor-pointer truncate text-gray-600"
                                >
                                  [{row.index},{ci}] {cell.text || '(空)'}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* 右侧：内容预览 */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {isEditing ? (
                  // 编辑模式
                  <div className="flex-1 flex flex-col p-4">
                    <div className="text-sm text-gray-600 mb-3">
                      {selectedLocation?.type === 'paragraph' && (
                        <>编辑段落 {selectedLocation.index}</>
                      )}
                      {selectedLocation?.type === 'table' && (
                        <>编辑表格[{selectedLocation.tableIndex}] 单元格[{selectedLocation.rowIndex},{selectedLocation.columnIndex}]</>
                      )}
                    </div>
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      className="flex-1 p-4 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      placeholder="输入新内容..."
                    />
                    <div className="flex gap-3 mt-4">
                      <button
                        onClick={handleCancelEdit}
                        disabled={saving}
                        className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        disabled={saving || !editingContent.trim()}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
                      >
                        {saving ? (
                          <>保存中...</>
                        ) : (
                          <>
                            <Check size={16} />
                            保存修改
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  // 预览模式
                  <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                      <div className="flex items-center justify-center h-full text-gray-500">加载中...</div>
                    ) : previewData?.html ? (
                      <div
                        className="prose max-w-none"
                        dangerouslySetInnerHTML={{ __html: previewData.html }}
                      />
                    ) : (
                      <div className="text-gray-500">暂无预览</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 底部提示 */}
            {!isEditing && (
              <div className="p-3 border-t border-gray-200/50 bg-gray-50/50 text-xs text-gray-500 flex items-center gap-2">
                <Edit3 size={14} />
                点击左侧条目进行编辑
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WordPreviewDialog;
