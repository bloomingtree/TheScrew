import React, { useState, useRef, useEffect } from 'react';
import { Check } from 'lucide-react';
import { toast } from '../../store/toastStore';
import { WordPreviewData, EditLocation } from './WordPreviewDialog';

interface WordPreviewContentProps {
  data: WordPreviewData;
  filepath: string;
}

const WordPreviewContent: React.FC<WordPreviewContentProps> = ({ data, filepath }) => {
  const [editingLocation, setEditingLocation] = useState<EditLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSaveButton, setShowSaveButton] = useState(false);
  const [saveButtonPosition, setSaveButtonPosition] = useState({ top: 0, left: 0 });

  // 使用 ref 存储原始内容
  const originalContentRef = useRef<Map<string, string>>(new Map());

  // 只获取标题段落
  const headings = data?.structure.paragraphs.filter(p => p.level !== undefined && p.level > 0 && p.text.trim()) || [];

  // 生成位置的唯一标识
  const getLocationKey = (location: EditLocation): string => {
    if (location.type === 'paragraph') {
      return `para-${location.index}`;
    } else {
      return `table-${location.tableIndex}-${location.rowIndex}-${location.columnIndex}`;
    }
  };

  // 开始编辑
  const handleFocus = (location: EditLocation, content: string, event: React.FocusEvent<HTMLElement>) => {
    const key = getLocationKey(location);
    originalContentRef.current.set(key, content);
    setEditingLocation(location);
    setShowSaveButton(true);
    // 计算保存按钮位置
    const rect = event.currentTarget.getBoundingClientRect();
    setSaveButtonPosition({
      top: rect.top - 45,
      left: rect.left,
    });
  };

  // 点击目录跳转
  const handleHeadingClick = (index: number) => {
    const element = document.querySelector(`[data-location="para-${index}"]`) as HTMLElement;
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 高亮一下
      element.classList.add('ring-2', 'ring-blue-300', 'bg-blue-50');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-blue-300', 'bg-blue-50');
      }, 1500);
    }
  };

  // 保存编辑
  const handleSave = async () => {
    if (!editingLocation) return;

    setSaving(true);
    try {
      const key = getLocationKey(editingLocation);
      const element = document.querySelector(`[data-location="${key}"]`) as HTMLElement;
      const newContent = element?.innerText || '';

      await window.electronAPI.word.edit(filepath, editingLocation, newContent);
      toast.success('修改已保存');

      originalContentRef.current.delete(key);
      setEditingLocation(null);
      setShowSaveButton(false);

      // TODO: 触发重新加载预览
    } catch (error: any) {
      toast.error(error.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 取消编辑（按 ESC 键）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editingLocation) {
        const key = getLocationKey(editingLocation);
        const original = originalContentRef.current.get(key);
        if (original) {
          const element = document.querySelector(`[data-location="${key}"]`) as HTMLElement;
          if (element) {
            element.innerText = original;
          }
        }
        originalContentRef.current.delete(key);
        setEditingLocation(null);
        setShowSaveButton(false);
      }
    };

    if (editingLocation) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [editingLocation]);

  // 失去焦点时隐藏保存按钮
  const handleBlur = (location: EditLocation) => {
    setTimeout(() => {
      const saveButton = document.querySelector('[data-save-button]');
      if (document.activeElement !== saveButton && editingLocation) {
        const key = getLocationKey(location);
        const currentKey = getLocationKey(editingLocation);
        if (key === currentKey) {
          setShowSaveButton(false);
        }
      }
    }, 100);
  };

  // 根据标题级别设置样式
  const getHeadingStyle = (level: number) => {
    const styles = {
      1: 'text-base font-bold text-gray-900',
      2: 'text-sm font-semibold text-gray-800',
      3: 'text-sm font-medium text-gray-700',
      4: 'text-xs font-medium text-gray-600',
      5: 'text-xs text-gray-600',
      6: 'text-xs text-gray-500',
    };
    return styles[level as keyof typeof styles] || styles[6];
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* 左侧：目录（只显示标题） */}
      <div className="w-40 border-r border-gray-200 flex flex-col bg-gray-50">
        <div className="px-3 py-2 border-b border-gray-200 bg-gray-100">
          <span className="text-xs font-semibold text-gray-600">目录</span>
        </div>

        {/* 标题列表 */}
        <div className="flex-1 overflow-y-auto py-2">
          {headings.length === 0 ? (
            <div className="text-center text-gray-400 py-4 text-xs">无标题</div>
          ) : (
            <div className="space-y-0.5">
              {headings.map((p) => {
                const key = `para-${p.index}`;
                const isEditing = editingLocation?.type === 'paragraph' && editingLocation.index === p.index;

                return (
                  <div
                    key={key}
                    onClick={() => handleHeadingClick(p.index)}
                    className={`
                      px-3 py-1.5 cursor-pointer transition-all text-xs
                      ${isEditing ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200 text-gray-700'}
                    `}
                    style={{ paddingLeft: `${((p.level ?? 1) - 1) * 8 + 12}px` }}
                  >
                    <span className={getHeadingStyle(p.level ?? 1)}>{p.text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 右侧：内容预览（可编辑） */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* 浮动保存按钮 */}
        {showSaveButton && (
          <div
            data-save-button
            style={{ top: saveButtonPosition.top, left: saveButtonPosition.left }}
            className="absolute z-10 flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg shadow-lg border border-blue-200"
          >
            <span className="text-xs text-gray-500">ESC 取消</span>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors disabled:opacity-50 text-xs"
            >
              {saving ? '保存中...' : (
                <>
                  <Check size={12} />
                  保存
                </>
              )}
            </button>
          </div>
        )}

        {/* 预览内容 */}
        <div className="flex-1 overflow-y-auto p-6" onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-location]') === null) {
            setShowSaveButton(false);
          }
        }}>
          <div className="prose prose-sm max-w-none">
            {/* 渲染段落 */}
            {data?.structure.paragraphs.map((p) => {
              const key = `para-${p.index}`;
              const location: EditLocation = { type: 'paragraph', index: p.index };
              const isEditing = editingLocation?.type === 'paragraph' && editingLocation.index === p.index;

              // 根据标题级别设置样式
              const getTag = () => {
                if (p.level === 1) return 'h1';
                if (p.level === 2) return 'h2';
                if (p.level === 3) return 'h3';
                return 'p';
              };

              const Tag = getTag();

              return (
                <Tag
                  key={key}
                  data-location={key}
                  contentEditable
                  suppressContentEditableWarning
                  onFocus={(e) => handleFocus(location, p.text, e)}
                  onBlur={() => handleBlur(location)}
                  className={`
                    py-1 px-2 -mx-2 rounded cursor-text
                    ${isEditing
                      ? 'bg-blue-50 ring-2 ring-blue-400 outline-none'
                      : 'hover:bg-gray-50 focus:bg-blue-50 focus:ring-2 focus:ring-blue-200 outline-none'}
                    transition-all
                    ${p.level ? 'font-bold' : ''}
                  `}
                  style={{ fontSize: p.level ? undefined : '14px' }}
                >
                  {p.text || <span className="text-gray-400 italic">(空段落)</span>}
                </Tag>
              );
            })}

            {/* 渲染表格 */}
            {data?.structure.tables.map((table) => (
              <div key={`table-${table.index}`} className="my-4">
                <table className="min-w-full border border-gray-300 rounded">
                  <tbody>
                    {table.rows.map((row) => (
                      <tr key={`row-${table.index}-${row.index}`} className="border-b border-gray-200">
                        {row.cells.map((cell, ci) => {
                          const key = `table-${table.index}-${row.index}-${ci}`;
                          const location: EditLocation = {
                            type: 'table',
                            tableIndex: table.index,
                            rowIndex: row.index,
                            columnIndex: ci
                          };
                          const isEditing = editingLocation?.type === 'table' &&
                                          editingLocation.tableIndex === table.index &&
                                          editingLocation.rowIndex === row.index &&
                                          editingLocation.columnIndex === ci;

                          return (
                            <td
                              key={key}
                              data-location={key}
                              contentEditable
                              suppressContentEditableWarning
                              onFocus={(e) => handleFocus(location, cell.text, e)}
                              onBlur={() => handleBlur(location)}
                              className={`
                                p-2 border-r border-gray-200 min-w-[80px] cursor-text
                                ${isEditing
                                  ? 'bg-blue-50 ring-2 ring-blue-400 outline-none'
                                  : 'hover:bg-gray-50 focus:bg-blue-50 focus:ring-2 focus:ring-blue-200 outline-none'}
                                transition-all text-sm
                              `}
                            >
                              {cell.text || <span className="text-gray-400 italic">(空)</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>

        {/* 底部提示 */}
        {!editingLocation && (
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
            点击文字进行编辑 | ESC 取消 | 点击目录跳转
          </div>
        )}
      </div>
    </div>
  );
};

export default WordPreviewContent;
