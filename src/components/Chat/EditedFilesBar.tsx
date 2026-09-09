import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, FileSpreadsheet, Presentation, FileCode, File, ExternalLink } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useTabStore } from '../../store/tabStore';

/** 编辑类工具及其文件路径在参数中的字段名 */
const EDIT_TOOL_PATH_KEY: Record<string, string> = {
  // 2026-09-09 工具收敛后的新工具名
  office: 'filename',
  docx_build: 'filename',
  xlsx_build: 'filename',
  docx_append: 'filename',
  // 旧工具名兼容（旧会话中已持久化的 tool_calls 回放）
  office_create: 'filename',
  office_set: 'filename',
  office_add: 'filename',
  office_remove: 'filename',
  office_batch: 'filename',
  office_merge: 'filename',
  office_apply_style: 'target',
  office_raw_set: 'filename',
  office_move: 'filename',
  office_swap: 'filename',
  office_replace: 'filename',
  edit: 'filepath',
  edit_file: 'filepath', // 兼容旧会话中已持久化的工具名
  write: 'filepath',
  write_file: 'filepath', // 兼容旧会话中已持久化的工具名
  create_file: 'filepath',
};

/** 根据扩展名选择图标 */
function getFileIcon(ext: string) {
  const e = ext.toLowerCase();
  if (['.docx', '.doc'].includes(e)) return <FileText size={13} className="text-blue-600" />;
  if (['.xlsx', '.xls', '.csv'].includes(e)) return <FileSpreadsheet size={13} className="text-green-600" />;
  if (['.pptx', '.ppt'].includes(e)) return <Presentation size={13} className="text-orange-600" />;
  if (['.md', '.txt', '.json', '.js', '.ts', '.tsx', '.py', '.xml', '.html', '.css', '.yaml', '.yml'].includes(e))
    return <FileCode size={13} className="text-purple-600" />;
  return <File size={13} className="text-gray-500" />;
}

function getExt(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.substring(idx) : '';
}

function getFilename(filepath: string): string {
  return filepath.split(/[\\/]/).pop() || filepath;
}

/** Office 文档扩展名（排序时置于最前） */
const OFFICE_EXTS = new Set(['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt']);

/** 预览模式打开的扩展名（与 FileExplorer 保持一致，其余走编辑器标签） */
const PREVIEW_EXTS = new Set([
  'docx', 'xlsx', 'xls', 'pptx', 'ppt',
  'pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico',
]);

/** 判断是否为绝对路径（Windows 盘符或 Unix 根路径） */
function isAbsolutePath(p: string): boolean {
  if (!p) return false;
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\');
}

interface EditedFile {
  filepath: string;
  filename: string;
  ext: string;
  tool: string;
}

/** 从当前对话消息中提取被编辑过的文件列表 */
function useEditedFiles(): EditedFile[] {
  const messages = useChatStore((s) => s.messages);

  // 流式期间 messages 引用每 50ms 变一次，但 tool_calls 结构很少变；
  // 以签名作为 useMemo 依赖，避免重复 JSON.parse 全部工具参数
  const toolCallsSignature = messages
    .map(m => (m.role === 'assistant' && m.tool_calls)
      ? m.tool_calls.map((tc: any) => `${tc.id}:${tc?.function?.name}:${tc?.function?.arguments?.length ?? 0}`).join(';')
      : '')
    .join('|');

  return useMemo(() => {
    const fileMap = new Map<string, EditedFile>(); // key: normalized path

    for (const msg of messages) {
      if (msg.role !== 'assistant' || !msg.tool_calls) continue;

      for (const tc of msg.tool_calls) {
        const toolName = tc?.function?.name || '';
        const pathKey = EDIT_TOOL_PATH_KEY[toolName];
        if (!pathKey) continue;

        let rawPath: string | undefined;
        try {
          const args = JSON.parse(tc.function.arguments || '{}');
          // office 单工具：clone/apply_style 的目标文档在 params.target，其余在 filename
          rawPath = toolName === 'office' && !args.filename
            ? args?.params?.target
            : args[pathKey];
        } catch {
          continue;
        }
        if (!rawPath || typeof rawPath !== 'string') continue;

        const norm = rawPath.replace(/\\/g, '/').toLowerCase();
        if (fileMap.has(norm)) continue;

        const filename = getFilename(rawPath);
        // 过滤掉无扩展名的（可能是目录或非文件目标）
        if (!getExt(filename)) continue;

        fileMap.set(norm, {
          filepath: rawPath,
          filename,
          ext: getExt(filename),
          tool: toolName,
        });
      }
    }

    return Array.from(fileMap.values()).sort((a, b) => {
      const aOffice = OFFICE_EXTS.has(a.ext) ? 0 : 1;
      const bOffice = OFFICE_EXTS.has(b.ext) ? 0 : 1;
      return aOffice - bOffice;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolCallsSignature]);
}

/** 本次对话已编辑文档的快捷访问条 */
const EditedFilesBar: React.FC = () => {
  const editedFiles = useEditedFiles();
  const { openTab } = useTabStore();

  const handleClick = async (rawPath: string) => {
    // 如果是相对路径，尝试拼接到工作空间根目录
    let fullPath = rawPath;
    if (!isAbsolutePath(rawPath)) {
      try {
        const result = await window.electronAPI.workspace.getPath();
        if (result?.path) {
          const sep = result.path.includes('\\') ? '\\' : '/';
          fullPath = result.path + sep + rawPath.replace(/[\\/]/g, sep);
        }
      } catch {
        // 忽略，使用原始路径
      }
    }
    // 与 FileExplorer 一致：Office/图片/PDF 走预览标签，其余走编辑器标签
    const ext = getFilename(fullPath).split('.').pop()?.toLowerCase() || '';
    openTab({
      type: PREVIEW_EXTS.has(ext) ? 'preview' : 'editor',
      title: getFilename(fullPath),
      content: { filepath: fullPath },
    });
  };

  if (editedFiles.length === 0) return null;

  return (
    <div className="flex-shrink-0 border-t border-gray-200 bg-white/70 backdrop-blur-sm">
      <div className="max-w-[1600px] mx-auto px-4 py-1.5">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-xs text-gray-500 flex-shrink-0 pr-1">
            本次编辑：
          </span>
          <AnimatePresence>
            {editedFiles.map((file, idx) => (
              <motion.button
                key={file.filepath}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.18, delay: idx * 0.03 }}
                onClick={() => handleClick(file.filepath)}
                className="flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full bg-blue-50 hover:bg-blue-100 border border-blue-200 text-xs text-blue-700 transition-colors flex-shrink-0 group"
                title={`点击预览：${file.filepath}`}
              >
                {getFileIcon(file.ext)}
                <span className="max-w-[180px] truncate">{file.filename}</span>
                <ExternalLink
                  size={11}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400"
                />
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default EditedFilesBar;
