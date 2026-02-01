import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, Search, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { useTemplateStore } from '../../store/templateStore';
import { Template, WordDocumentTemplate, TemplateType } from '../../types/template';

const TemplateDialog: React.FC = () => {
  const {
    templates,
    isTemplateDialogOpen,
    setTemplateDialogOpen,
    setSelectedTemplate,
    useTemplate,
  } = useTemplateStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [parameters, setParameters] = useState<Record<string, any>>({});
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  // 获取所有分类
  const categories = ['all', ...Array.from(new Set(templates.map((t) => t.category)))];

  // 过滤模板
  const filteredTemplates = templates.filter((template) => {
    const matchesSearch =
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
    const matchesType = selectedType === 'all' || template.type === selectedType;
    return matchesSearch && matchesCategory && matchesType;
  });

  // 选择模板并填充默认参数
  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    const defaultParams: Record<string, any> = {};

    if (template.type === TemplateType.WORD_DOCUMENT) {
      const wordTemplate = template as WordDocumentTemplate;
      for (const placeholder of wordTemplate.placeholders) {
        if (placeholder.defaultValue !== undefined) {
          defaultParams[placeholder.name] = placeholder.defaultValue;
        }
      }
    }

    setParameters(defaultParams);
    setExpandedTemplate(template.id);
  };

  // 使用模板
  const handleUseTemplate = async (template: Template) => {
    if (template.type === TemplateType.WORD_DOCUMENT) {
      // Word 模板：检查必填参数
      const wordTemplate = template as WordDocumentTemplate;
      const missingRequired = wordTemplate.placeholders
        .filter((p) => p.required && !parameters[p.name])
        .map((p) => p.displayName);

      if (missingRequired.length > 0) {
        alert(`请填写必填参数：${missingRequired.join('、')}`);
        return;
      }

      const fileName = `${template.name}-${Date.now()}.docx`;
      const result = await useTemplate({
        templateId: template.id,
        parameters,
        outputPath: fileName,
      });

      if (result.filePath) {
        alert(`文档已生成：${result.filePath}`);
        setTemplateDialogOpen(false);
      }
    } else if (template.type === TemplateType.PROMPT) {
      // 提示词模板：生成提示词并复制
      // TODO: 实现提示词应用
      alert('提示词模板功能开发中');
    } else if (template.type === TemplateType.ASSISTANT) {
      // 助手工具：打开助手面板
      setTemplateDialogOpen(false);
      // TODO: 打开助手面板
      alert('助手面板即将打开');
    }
  };

  return (
    <AnimatePresence>
      {isTemplateDialogOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => setTemplateDialogOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-[700px] max-h-[80vh] overflow-hidden rounded-2xl shadow-2xl glass"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200/50">
              <h2 className="text-lg font-semibold text-cream-900">模板库</h2>
              <button
                onClick={() => setTemplateDialogOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-200/60 transition-colors text-gray-500"
              >
                <X size={20} />
              </button>
            </div>

            {/* 搜索和筛选 */}
            <div className="p-4 border-b border-gray-200/50 space-y-3">
              {/* 搜索框 */}
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索模板..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200/50 bg-white/60 focus:outline-none focus:ring-2 focus:ring-primary-blue/30 text-sm"
                />
              </div>

              {/* 分类和类型筛选 */}
              <div className="flex gap-2">
                {/* 分类选择 */}
                <div className="flex-1 relative">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200/50 bg-white/60 focus:outline-none focus:ring-2 focus:ring-primary-blue/30 text-sm appearance-none cursor-pointer"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat === 'all' ? '全部分类' : cat}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>

                {/* 类型选择 */}
                <div className="flex-1 relative">
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200/50 bg-white/60 focus:outline-none focus:ring-2 focus:ring-primary-blue/30 text-sm appearance-none cursor-pointer"
                  >
                    <option value="all">全部类型</option>
                    <option value="word_document">Word 文档</option>
                    <option value="prompt">提示词</option>
                    <option value="assistant">助手工具</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* 模板列表 */}
            <div className="p-4 overflow-y-auto max-h-[400px] space-y-3">
              {filteredTemplates.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <FileText size={48} className="mx-auto mb-2 opacity-50" />
                  <p>没有找到匹配的模板</p>
                </div>
              ) : (
                filteredTemplates.map((template) => {
                  const isExpanded = expandedTemplate === template.id;
                  const isWordTemplate = template.type === TemplateType.WORD_DOCUMENT;
                  const wordTemplate = isWordTemplate ? (template as WordDocumentTemplate) : null;

                  return (
                    <motion.div
                      key={template.id}
                      layout
                      className="border border-gray-200/50 rounded-xl overflow-hidden hover:border-primary-blue/30 transition-all"
                    >
                      {/* 模板卡片 */}
                      <div
                        className="p-3 cursor-pointer hover:bg-white/40 transition-colors"
                        onClick={() => isExpanded ? setExpandedTemplate(null) : handleSelectTemplate(template)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              {template.type === TemplateType.ASSISTANT ? (
                                <Sparkles size={16} className="text-primary-orange" />
                              ) : (
                                <FileText size={16} className="text-primary-blue" />
                              )}
                              <h3 className="font-medium text-cream-900">{template.name}</h3>
                              {template.isBuiltIn && (
                                <span className="px-1.5 py-0.5 text-[10px] bg-primary-blue/10 text-primary-blue rounded">内置</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{template.description}</p>
                            <div className="flex gap-1 mt-2">
                              <span className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded">
                                {template.category}
                              </span>
                              {template.tags?.slice(0, 2).map((tag) => (
                                <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                          <button className="text-gray-400">
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </div>
                      </div>

                      {/* 参数输入区域（展开时） */}
                      <AnimatePresence>
                        {isExpanded && isWordTemplate && wordTemplate && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-gray-200/50 bg-gray-50/50"
                          >
                            <div className="p-3 space-y-3">
                              {wordTemplate.placeholders.map((placeholder) => (
                                <div key={placeholder.name}>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">
                                    {placeholder.displayName}
                                    {placeholder.required && <span className="text-red-500 ml-1">*</span>}
                                  </label>
                                  {placeholder.type === 'textarea' ? (
                                    <textarea
                                      value={parameters[placeholder.name] || ''}
                                      onChange={(e) =>
                                        setParameters({ ...parameters, [placeholder.name]: e.target.value })
                                      }
                                      placeholder={placeholder.description || placeholder.displayName}
                                      rows={3}
                                      className="w-full px-3 py-2 rounded-lg border border-gray-200/50 bg-white focus:outline-none focus:ring-2 focus:ring-primary-blue/30 text-sm resize-none"
                                    />
                                  ) : placeholder.type === 'select' ? (
                                    <select
                                      value={parameters[placeholder.name] || ''}
                                      onChange={(e) =>
                                        setParameters({ ...parameters, [placeholder.name]: e.target.value })
                                      }
                                      className="w-full px-3 py-2 rounded-lg border border-gray-200/50 bg-white focus:outline-none focus:ring-2 focus:ring-primary-blue/30 text-sm"
                                    >
                                      <option value="">请选择</option>
                                      {placeholder.options?.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type={placeholder.type === 'date' ? 'date' : 'text'}
                                      value={parameters[placeholder.name] || ''}
                                      onChange={(e) =>
                                        setParameters({ ...parameters, [placeholder.name]: e.target.value })
                                      }
                                      placeholder={placeholder.description || placeholder.displayName}
                                      className="w-full px-3 py-2 rounded-lg border border-gray-200/50 bg-white focus:outline-none focus:ring-2 focus:ring-primary-blue/30 text-sm"
                                    />
                                  )}
                                </div>
                              ))}

                              <button
                                onClick={() => handleUseTemplate(wordTemplate)}
                                className="w-full py-2 bg-primary-blue text-white rounded-lg hover:bg-primary-blue/90 transition-colors text-sm font-medium"
                              >
                                生成文档
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TemplateDialog;
