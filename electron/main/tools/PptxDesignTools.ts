/**
 * PPT 设计增强工具 - 配色方案 + 数据图表
 *
 * 通过内嵌 Python + python-pptx 增强 PPT 设计能力。
 * 基础创建/文字替换走 officecli（pptx_create_presentation 等），
 * 本工具补充设计层：配色方案一键应用、数据图表插入。
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { Tool, ToolGroup } from './ToolManager';
import { getPathManager } from '../config/PathManager';

const execFileAsync = promisify(execFile);

function getPythonPath(): string {
  return getPathManager().getPythonPath();
}

function getScriptsDir(): string {
  return path.join(path.dirname(getPythonPath()), '..', 'scripts');
}

async function runPptxScript(config: Record<string, any>): Promise<any> {
  const pythonPath = getPythonPath();
  const scriptPath = path.join(getScriptsDir(), 'pptx_design.py');

  if (!fs.existsSync(pythonPath)) {
    return { error: '内嵌 Python 环境未找到' };
  }
  if (!fs.existsSync(scriptPath)) {
    return { error: 'PPT 设计脚本未找到: ' + scriptPath };
  }

  try {
    const { stdout } = await execFileAsync(pythonPath, [scriptPath, JSON.stringify(config)], {
      timeout: 60000,
      maxBuffer: 20 * 1024 * 1024,
    });
    const result = JSON.parse(stdout);
    if (result.error) {
      return { error: result.error };
    }
    if (result.success === false) {
      return { error: result.error || 'PPT 操作失败' };
    }
    return { content: JSON.stringify(result, null, 2) };
  } catch (err: any) {
    if (err.killed) {
      return { error: 'PPT 操作超时（60s）' };
    }
    const stderr = err.stderr || '';
    if (stderr) {
      return { error: `PPT 操作异常: ${stderr.split('\n').slice(-3).join(' ')}` };
    }
    return { error: `PPT 操作异常: ${err.message}` };
  }
}

// ==================== pptx_apply_theme ====================

const pptxApplyThemeTool: Tool = {
  name: 'pptx_apply_theme',
  description: '一键应用预设配色方案（商务蓝/科技紫/稳重灰/活力橙/森林绿/中国红），自动调整背景色与标题/正文/强调文字颜色',
  parameters: {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'PPTX 文件路径' },
      output: { type: 'string', description: '输出路径（默认覆盖源文件）' },
      theme: {
        type: 'string',
        enum: ['business_blue', 'tech_purple', 'steady_gray', 'vibrant_orange', 'forest_green', 'classic_red'],
        description: '配色方案',
      },
    },
    required: ['file', 'theme'],
  },
  handler: async (args: any) => runPptxScript({
    action: 'apply_theme',
    file: args.file,
    output: args.output,
    theme: args.theme,
  }),
};

// ==================== pptx_add_chart ====================

const pptxAddChartTool: Tool = {
  name: 'pptx_add_chart',
  description: '在指定幻灯片插入数据图表（柱状/条形/饼图/折线），支持多系列',
  parameters: {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'PPTX 文件路径' },
      output: { type: 'string', description: '输出路径（默认覆盖源文件）' },
      slide_index: { type: 'number', description: '插入到第几页（0-based）；省略则新建末尾页' },
      chart_type: {
        type: 'string',
        enum: ['column', 'bar', 'pie', 'line'],
        description: '图表类型：column=柱状、bar=条形、pie=饼图、line=折线',
      },
      title: { type: 'string', description: '图表标题' },
      categories: {
        type: 'array',
        items: { type: 'string' },
        description: '分类（X 轴标签或饼图分片）',
      },
      series: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            values: { type: 'array', items: { type: 'number' } },
          },
        },
        description: '数据系列',
      },
    },
    required: ['file', 'chart_type', 'categories', 'series'],
  },
  handler: async (args: any) => runPptxScript({
    action: 'add_chart',
    file: args.file,
    output: args.output,
    slide_index: args.slide_index,
    chart_type: args.chart_type,
    title: args.title,
    categories: args.categories,
    series: args.series,
  }),
};

// ==================== pptx_list_themes ====================

const pptxListThemesTool: Tool = {
  name: 'pptx_list_themes',
  description: '列出可用的预设配色方案及其色值',
  parameters: { type: 'object', properties: {} },
  handler: async (_args: any) => runPptxScript({ action: 'list_themes' }),
};

// ==================== 导出 ====================

export const pptxDesignTools: Tool[] = [
  pptxApplyThemeTool,
  pptxAddChartTool,
  pptxListThemesTool,
];

export const pptxDesignToolGroup: ToolGroup = {
  name: 'pptx_design',
  description: 'PPT 设计增强（配色方案、数据图表）',
  tools: pptxDesignTools,
  keywords: ['PPT', 'pptx', '演示', '配色', '图表', '幻灯片'],
  triggers: {
    keywords: ['PPT配色', 'PPT图表', '幻灯片配色', 'PPT设计', '美化PPT'],
    fileExtensions: ['.pptx'],
    dependentTools: [],
  },
};
