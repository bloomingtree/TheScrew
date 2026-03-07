/**
 * Monaco Editor - VS Code 风格代码编辑器
 *
 * 提供专业的代码编辑体验：
 * - 自动语言检测
 * - VS Code dark 主题
 * - 语法高亮、智能提示
 * - Ctrl+S 保存
 * - 搜索替换 (Ctrl+H)
 * - 多光标 (Ctrl+Alt+Up/Down)
 */

import { useRef } from 'react';
import Editor, { OnMount, OnChange, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

import { getLanguageFromPath } from '@/utils/monacoLanguages';

// 配置 Monaco 使用本地资源（离线环境支持）
loader.config({ monaco });

// 预加载 Monaco
loader.init().catch((err) => {
  console.error('[MonacoEditor] Failed to initialize Monaco:', err);
});

interface MonacoEditorProps {
  /** 文件路径（用于语言检测） */
  filePath: string;
  /** 编辑器内容 */
  value: string;
  /** 内容变化回调 */
  onChange?: (value: string | undefined) => void;
  /** 保存回调 */
  onSave?: () => void;
  /** 只读模式 */
  readOnly?: boolean;
  /** 编辑器挂载回调 */
  onMount?: (editor: monaco.editor.IStandaloneCodeEditor) => void;
}

const MonacoEditor: React.FC<MonacoEditorProps> = ({
  filePath,
  value,
  onChange,
  onSave,
  readOnly = false,
  onMount,
}) => {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const language = getLanguageFromPath(filePath);

  // 编辑器挂载
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // 设置主题
    monaco.editor.defineTheme('custom-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1a1b26',
        'editor.foreground': '#c0caf5',
        'editorLineNumber.foreground': '#565f89',
        'editorCursor.foreground': '#c0caf5',
        'editor.selectionBackground': '#2ac3de40',
        'editor.inactiveSelectionBackground': '#2ac3de20',
        'editor.lineHighlightBackground': '#1a1b2600',
      },
    });
    monaco.editor.setTheme('custom-dark');

    // 配置选项
    editor.updateOptions({
      fontSize: 14,
      lineHeight: 22,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
      fontLigatures: true,
      minimap: { enabled: true },
      wordWrap: 'on',
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      renderLineHighlight: 'all',
      bracketPairColorization: { enabled: true },
      automaticLayout: true,
    });

    // 注册快捷键
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (onSave) {
        onSave();
      }
    });

    // 向外传递编辑器实例
    if (onMount) {
      onMount(editor);
    }
  };

  // 内容变化
  const handleChange: OnChange = (newValue) => {
    if (onChange) {
      onChange(newValue);
    }
  };

  return (
    <div className="h-full w-full bg-[#1a1b26]">
      <Editor
        height="100%"
        language={language}
        value={value}
        onChange={handleChange}
        onMount={handleEditorMount}
        options={{
          readOnly,
          theme: 'custom-dark',
          padding: { top: 16, bottom: 16 },
        }}
        loading={
          <div className="flex items-center justify-center h-full text-gray-400">
            加载编辑器...
          </div>
        }
      />
    </div>
  );
};

export default MonacoEditor;
