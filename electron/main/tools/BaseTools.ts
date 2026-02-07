import { Tool } from './ToolManager';
import { TOOL_SETS_META } from './ToolManager';

/**
 * 基础工具组 - 始终可用的工具
 * 包括文件操作、工具集激活等核心功能
 */
export const baseTools: Tool[] = [
  {
    name: 'activate_toolset',
    description: `
激活指定的工具集以获取详细的工具定义。

可用工具集：
${TOOL_SETS_META.map(ts => `  - ${ts.name}: ${ts.description}`).join('\n')}

使用场景：
- 需要处理 Word 文档时，激活 "word" 工具集
- 需要编辑 PPT 时，激活 "pptx" 工具集
- 需要批量操作时，激活 "batch" 工具集
- 需要处理 Excel 表格时，激活 "xlsx" 工具集
- 需要操作 PDF 时，激活 "pdf" 工具集

注意：激活工具集会增加上下文大小，请仅激活需要的工具集。
`.trim(),
    parameters: {
      type: 'object',
      properties: {
        toolset: {
          type: 'string',
          enum: TOOL_SETS_META.map(ts => ts.name),
          description: '要激活的工具集名称',
        },
      },
      required: ['toolset'],
    },
    handler: async ({ toolset }) => {
      // 这个工具的 handler 实际上在 ToolManager 中特殊处理
      // 因为它需要动态更新工具定义列表
      // 这里只是一个占位符
      return {
        success: true,
        message: `工具集 "${toolset}" 激活请求已处理`,
      };
    },
  },

  {
    name: 'get_active_toolsets',
    description: '获取当前已激活的工具集列表',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      // 这个工具的 handler 在 ToolManager 中处理
      return {
        success: true,
        activeGroups: [],
      };
    },
  },
];
