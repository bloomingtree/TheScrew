/**
 * 报表生成工具 - 内置模板 + 自定义模板渲染
 *
 * 通过内嵌 Python + python-docx/openpyxl/python-pptx 生成报表。
 * 内置模板：周报 / 月报 / 数据汇总；也支持自定义模板的占位符替换。
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

async function runReportScript(config: Record<string, any>): Promise<any> {
  const pythonPath = getPythonPath();
  const scriptPath = path.join(getScriptsDir(), 'report_render.py');

  if (!fs.existsSync(pythonPath)) {
    return { error: '内嵌 Python 环境未找到' };
  }
  if (!fs.existsSync(scriptPath)) {
    return { error: '报表脚本未找到: ' + scriptPath };
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
      return { error: result.error || '报表生成失败' };
    }
    return { content: JSON.stringify(result, null, 2) };
  } catch (err: any) {
    if (err.killed) {
      return { error: '报表生成超时（60s）' };
    }
    const stderr = err.stderr || '';
    if (stderr) {
      return { error: `报表生成异常: ${stderr.split('\n').slice(-3).join(' ')}` };
    }
    return { error: `报表生成异常: ${err.message}` };
  }
}

// ==================== report_from_data ====================

const reportFromDataTool: Tool = {
  name: 'report_from_data',
  description: '根据数据生成报表。内置模板：weekly_report（周报）、monthly_report（月报）、data_summary（数据汇总）；也支持自定义 docx/xlsx/pptx 模板做 {{变量}} 占位符替换',
  parameters: {
    type: 'object',
    properties: {
      template: {
        type: 'string',
        description: '内置模板名（weekly_report / monthly_report / data_summary）或自定义模板文件路径',
      },
      data: {
        type: 'object',
        description: '报表数据。内置模板字段见 SKILL.md；自定义模板按 {{变量}} 填充',
      },
      output: { type: 'string', description: '输出文件路径（.docx/.xlsx）' },
    },
    required: ['template', 'data', 'output'],
  },
  handler: async (args: any) => runReportScript({
    action: 'render',
    template: args.template,
    data: args.data,
    output: args.output,
  }),
};

// ==================== report_list_templates ====================

const reportListTemplatesTool: Tool = {
  name: 'report_list_templates',
  description: '列出可用的内置报表模板及其数据字段',
  parameters: { type: 'object', properties: {} },
  handler: async (_args: any) => runReportScript({ action: 'list_templates' }),
};

// ==================== 导出 ====================

export const reportTools: Tool[] = [reportFromDataTool, reportListTemplatesTool];

export const reportToolGroup: ToolGroup = {
  name: 'report',
  description: '报表生成（周报/月报/数据汇总 + 自定义模板）',
  tools: reportTools,
  keywords: ['报表', '周报', '月报', '报告', '汇总', 'report'],
  triggers: {
    keywords: ['生成报表', '写周报', '写月报', '做报表', '数据汇总', '生成报告'],
    fileExtensions: [],
    dependentTools: [],
  },
};
