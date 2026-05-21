/**
 * Model Capability Detector
 * 根据模型名称自动检测模型能力（视觉、工具调用等）
 */

import { ModelCapabilities } from '../config/AppConfigStore';

// 支持视觉能力的模型关键词
const VISION_KEYWORDS = [
  'gpt-4o', 'gpt-4-turbo', 'gpt-4-vision', 'gpt-4o-mini',
  'claude-3', 'claude-sonnet', 'claude-opus', 'claude-3.5',
  'gemini', 'qwen-vl', 'qwen2-vl', 'internvl',
  'glm-4v', 'yi-vision', 'llava', 'pixtral',
];

// 明确不支持视觉的模型关键词（优先级更高）
const NO_VISION_KEYWORDS = [
  'gpt-3.5', 'text-davinci', 'code-davinci', 'codellama',
  'deepseek-coder', 'deepseek-chat',
  'llama-2', 'llama2', 'llama-3', 'llama3',
  'mistral-small', 'mistral-medium',
];

/**
 * 根据模型名称检测能力
 * 自动探测 + 手动覆盖
 */
export function detectCapabilities(modelName: string): ModelCapabilities {
  const name = modelName.toLowerCase();

  // 负面匹配优先（明确不支持的）
  if (NO_VISION_KEYWORDS.some(k => name.includes(k))) {
    return { vision: false, toolUse: true, streaming: true };
  }

  // 正面匹配
  if (VISION_KEYWORDS.some(k => name.includes(k))) {
    return { vision: true, toolUse: true, streaming: true };
  }

  // 未知模型：默认不支持视觉，用户可手动开启
  return { vision: false, toolUse: true, streaming: true };
}

/**
 * 获取模型能力的显示描述
 */
export function getCapabilitiesDescription(capabilities: ModelCapabilities): string[] {
  const descriptions: string[] = [];
  if (capabilities.vision) descriptions.push('图片理解');
  if (capabilities.toolUse) descriptions.push('工具调用');
  if (capabilities.streaming) descriptions.push('流式输出');
  return descriptions;
}
