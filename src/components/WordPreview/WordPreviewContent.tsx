import React, { useState, useCallback } from 'react';
import { FileText, Save, Check, Loader2 } from 'lucide-react';
import { toast } from '../../store/toastStore';
import { WordPreviewData } from './WordPreviewDialog';

interface WordPreviewContentProps {
  data: WordPreviewData;
  filepath: string;
}

const WordPreviewContent: React.FC<WordPreviewContentProps> = ({ data, filepath }) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [editedParagraphs, setEditedParagraphs] = useState<Map<number, string>>(new Map());

  // 文件名
  const fileName = filepath.split(/[/\\]/).pop() || 'Document';

  // 只获取标题段落用于目录
  const headings = data?.structure.paragraphs.filter(p => p.level !== undefined && p.level > 0 && p.text.trim()) || [];

  // 点击目录跳转
  const handleHeadingClick = (index: number) => {
    const element = document.getElementById(`para-${index}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // 切换编辑模式
  const toggleEditMode = () => {
    if (isEditMode && hasChanges) {
      // 有未保存的修改，提示用户
      if (!confirm('有未保存的修改，确定要退出编辑模式吗？')) {
        return;
      }
      // 清除修改
      setEditedParagraphs(new Map());
      setHasChanges(false);
    }
    setIsEditMode(!isEditMode);
  };

  // 处理段落内容变化
  const handleParagraphChange = useCallback((index: number, newContent: string) => {
    setEditedParagraphs(prev => {
      const updated = new Map(prev);
      const originalText = data.structure.paragraphs[index]?.text || '';

      if (newContent !== originalText) {
        updated.set(index, newContent);
      } else {
        updated.delete(index);
      }

      setHasChanges(updated.size > 0);
      return updated;
    });
  }, [data]);

  // 保存修改
  const handleSave = async () => {
    if (editedParagraphs.size === 0) return;

    setSaving(true);
    try {
      // 保存所有修改的段落
      for (const [index, content] of editedParagraphs) {
        await window.electronAPI.word.edit(filepath, { type: 'paragraph', index }, content);
      }

      // 清除修改状态
      setEditedParagraphs(new Map());
      setHasChanges(false);

      toast.success('文档已保存');
    } catch (error: any) {
      toast.error(error.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 获取段落的显示内容（编辑模式下显示编辑后的内容）
  const getParagraphText = (index: number) => {
    return editedParagraphs.get(index) ?? data.structure.paragraphs[index]?.text ?? '';
  };

  // 如果没有内容，显示提示
  if (!data || data.structure.paragraphs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <FileText size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">文档内容为空</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-100">
      {/* 左侧：目录 */}
      {headings.length > 0 && (
        <div className="w-48 border-r border-gray-300 bg-white flex flex-col shadow-sm">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">目录</h3>
          </div>
          <div className="flex-1 overflow-y-auto py-3">
            <div className="space-y-0.5">
              {headings.map((p) => (
                <div
                  key={`toc-${p.index}`}
                  onClick={() => handleHeadingClick(p.index)}
                  className="px-3 py-1.5 cursor-pointer hover:bg-blue-50 text-gray-600 hover:text-blue-700 transition-all text-sm"
                  style={{ paddingLeft: `${((p.level ?? 1) - 1) * 12 + 12}px` }}
                >
                  <span className={p.level === 1 ? 'font-semibold' : ''}>{p.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 右侧：文档内容 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 工具栏 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">{fileName}</span>
            <span className="text-xs text-gray-400">
              {data.structure.paragraphs.length} 段 · {data.structure.tables.length} 表格
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <span className="text-xs text-orange-500">有未保存的修改</span>
            )}
            <button
              onClick={toggleEditMode}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1 ${
                isEditMode
                  ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
              disabled={saving}
              title={isEditMode ? '退出编辑' : '编辑文档'}
            >
              {isEditMode ? '退出' : '编辑'}
            </button>
            {isEditMode && hasChanges && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 text-xs rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors flex items-center gap-1 disabled:opacity-50"
                title="保存修改"
              >
                {saving ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save size={12} />
                    保存
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* 文档内容区域 */}
        <div className="flex-1 overflow-y-auto">
          {/* Word 风格的页面 */}
          <div
            className="mx-auto my-6 bg-white shadow-lg"
            style={{
              width: '210mm',
              minHeight: '297mm',
              padding: '25mm 20mm',
              fontFamily: '"Calibri", "Segoe UI", "Microsoft YaHei", sans-serif',
              fontSize: '11pt',
              lineHeight: '1.5',
              color: '#000',
            }}
          >
            {/* 渲染段落 */}
            {data?.structure.paragraphs.map((p) => {
              const getTag = () => {
                if (p.level === 1) return 'h1';
                if (p.level === 2) return 'h2';
                if (p.level === 3) return 'h3';
                if (p.level === 4) return 'h4';
                if (p.level === 5) return 'h5';
                if (p.level === 6) return 'h6';
                return 'p';
              };

              const Tag = getTag();

              // 标题样式
              const headingStyles: Record<number, string> = {
                1: 'text-2xl font-bold text-gray-900 mb-4',
                2: 'text-xl font-semibold text-gray-800 mb-3',
                3: 'text-lg font-medium text-gray-800 mb-2',
                4: 'text-base font-medium text-gray-700 mb-2',
                5: 'text-sm font-medium text-gray-700 mb-1',
                6: 'text-sm text-gray-600 mb-1',
              };

              // 普通段落样式
              const paragraphStyle = 'mb-2 text-justify';

              const className = p.level ? headingStyles[p.level] : paragraphStyle;
              const hasChange = editedParagraphs.has(p.index);

              return (
                <Tag
                  key={`para-${p.index}`}
                  id={`para-${p.index}`}
                  className={className}
                >
                  {isEditMode ? (
                    <input
                      type="text"
                      value={getParagraphText(p.index)}
                      onChange={(e) => handleParagraphChange(p.index, e.target.value)}
                      className={`w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none transition-colors ${
                        hasChange ? 'border-orange-300 bg-orange-50' : ''
                      }`}
                    />
                  ) : (
                    <span>{getParagraphText(p.index) || '\u00A0'}</span>
                  )}
                </Tag>
              );
            })}

            {/* 渲染表格 */}
            {data?.structure.tables.map((table) => (
              <div key={`table-${table.index}`} className="my-4">
                <table className="min-w-full border-collapse border border-gray-400">
                  <tbody>
                    {table.rows.map((row) => (
                      <tr key={`row-${table.index}-${row.index}`}>
                        {row.cells.map((cell, ci) => (
                          <td
                            key={`cell-${table.index}-${row.index}-${ci}`}
                            className="border border-gray-300 px-3 py-2 text-sm"
                          >
                            {cell.text || '\u00A0'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* 底部信息 */}
          <div className="text-center py-4 text-xs text-gray-500 border-t border-gray-200">
            <p>{fileName}</p>
            {isEditMode ? (
              <p>编辑模式 - 点击文本进行修改，完成后点击"保存"按钮</p>
            ) : (
              <p>预览模式 - 点击"编辑"按钮进行修改</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WordPreviewContent;
