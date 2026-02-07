import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx';
import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { outputTruncator } from '../utils/OutputTruncator';
import { getWorkspacePath } from './FileTools';
import { htmlToWordConverter } from '../utils/HtmlToWordConverter';
import { getPythonBridge } from '../ooxml/PythonBridge';
import { tmpdir } from 'os';
import { Tool } from './ToolManager';

let currentDoc: Docxtemplater | null = null;
let currentDocPath: string | null = null;

interface WordToolArgs {
  filepath?: string;
  content?: string;
  title?: string;
  paragraphIndex?: number;
  newText?: string;
  text?: string;
  position?: number;
  heading?: string;
  searchText?: string;
  replaceWith?: string;
  caseSensitive?: boolean;
  rows?: number;
  columns?: number;
  data?: string[][];
  hasHeader?: boolean;
  tableIndex?: number;
  rowIndex?: number;
  columnIndex?: number;
  imagePath?: string;
  width?: number;
  height?: number;
  outputPath?: string;
  headerDistance?: number;
  footerDistance?: number;
  margin?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  headerType?: 'even' | 'default' | 'first';
  footerType?: 'even' | 'default' | 'first';
  headerText?: string;
  footerText?: string;
  align?: 'left' | 'center' | 'right';
  // 富文本相关参数
  richContent?: string;           // HTML富文本内容
  contentType?: 'plain' | 'html'; // 内容类型
  parseAsRich?: boolean;          // 是否解析为富文本
  // OOXML 操作相关参数
  location?: number;              // 段落/行号（用于批注、修订跟踪）
  author?: string;                // 作者名称（用于批注、修订跟踪）
  initials?: string;              // 作者缩写（用于修订跟踪）
  _toolCallId?: string;           // 内部参数，由 ToolManager 传递
}

interface ParagraphInfo {
  index: number;
  text: string;
  length: number;
}

interface TableInfo {
  index: number;
  rows: RowInfo[];
  rowCount: number;
  columnCount: number;
}

interface RowInfo {
  index: number;
  cells: CellInfo[];
  cellCount: number;
}

interface CellInfo {
  text: string;
}

interface ImageInfo {
  index: number;
  id: string;
}

interface DocumentStructure {
  paragraphs: {
    count: number;
    items: ParagraphInfo[];
  };
  tables: {
    count: number;
    items: TableInfo[];
  };
  images: {
    count: number;
    items: ImageInfo[];
  };
  totalElements: number;
}

interface HeaderFooterRef {
  id: number;
  type: 'even' | 'default' | 'first';
}

interface HeaderFooterInfo {
  headerDistance?: number;
  footerDistance?: number;
  margins?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  headers?: {
    default?: string;
    even?: string;
    first?: string;
  };
  footers?: {
    default?: string;
    even?: string;
    first?: string;
  };
}

function modifySectionProperties(xml: string, headerDistance?: number, footerDistance?: number, margin?: WordToolArgs['margin']): string {
  const sectPrRegex = /<w:sectPr[^>]*>[\s\S]*?<\/w:sectPr>/;
  
  if (!sectPrRegex.test(xml)) {
    return xml;
  }

  return xml.replace(sectPrRegex, (match) => {
    let result = match;

    if (headerDistance) {
      if (/<w:headerDistance[^>]*>/.test(result)) {
        result = result.replace(/<w:headerDistance[^>]*w:val="[^"]*"[^>]*\/>/, `<w:headerDistance w:val="${headerDistance}"/>`);
      } else {
        result = result.replace('</w:sectPr>', `<w:headerDistance w:val="${headerDistance}"/></w:sectPr>`);
      }
    }

    if (footerDistance) {
      if (/<w:footerDistance[^>]*>/.test(result)) {
        result = result.replace(/<w:footerDistance[^>]*w:val="[^"]*"[^>]*\/>/, `<w:footerDistance w:val="${footerDistance}"/>`);
      } else {
        result = result.replace('</w:sectPr>', `<w:footerDistance w:val="${footerDistance}"/></w:sectPr>`);
      }
    }

    if (margin) {
      const pageMarRegex = /<w:pgMar[^>]*>[\s\S]*?<\/w:pgMar>/;
      if (pageMarRegex.test(result)) {
        result = result.replace(pageMarRegex, (pgMar) => {
          let pgMarResult = pgMar;
          if (margin.top !== undefined) {
            pgMarResult = pgMarResult.replace(/ w:top="[^"]*"/, ` w:top="${margin.top}"`);
          }
          if (margin.bottom !== undefined) {
            pgMarResult = pgMarResult.replace(/ w:bottom="[^"]*"/, ` w:bottom="${margin.bottom}"`);
          }
          if (margin.left !== undefined) {
            pgMarResult = pgMarResult.replace(/ w:left="[^"]*"/, ` w:left="${margin.left}"`);
          }
          if (margin.right !== undefined) {
            pgMarResult = pgMarResult.replace(/ w:right="[^"]*"/, ` w:right="${margin.right}"`);
          }
          return pgMarResult;
        });
      } else {
        const marginAttrs = [
          margin.top ? ` w:top="${margin.top}"` : '',
          margin.bottom ? ` w:bottom="${margin.bottom}"` : '',
          margin.left ? ` w:left="${margin.left}"` : '',
          margin.right ? ` w:right="${margin.right}"` : '',
        ].join('');
        result = result.replace('</w:sectPr>', `<w:pgMar${marginAttrs}/></w:sectPr>`);
      }
    }

    return result;
  });
}

function findHeaderReference(xml: string, type: 'even' | 'default' | 'first'): HeaderFooterRef | null {
  const regexMap: Record<string, RegExp> = {
    even: /<w:headerReference[^>]*w:type="even"[^>]*r:id="r(\d+)"[^>]*\/>/,
    first: /<w:headerReference[^>]*w:type="first"[^>]*r:id="r(\d+)"[^>]*\/>/,
    default: /<w:headerReference[^>]*(?:w:type="default"|[^>])[^>]*r:id="r(\d+)"[^>]*\/>/,
  };

  const regex = regexMap[type];
  const match = xml.match(regex);

  if (match) {
    const relId = match[1];
    return { id: parseInt(relId, 10), type };
  }

  return null;
}

function findFooterReference(xml: string, type: 'even' | 'default' | 'first'): HeaderFooterRef | null {
  const regexMap: Record<string, RegExp> = {
    even: /<w:footerReference[^>]*w:type="even"[^>]*r:id="r(\d+)"[^>]*\/>/,
    first: /<w:footerReference[^>]*w:type="first"[^>]*r:id="r(\d+)"[^>]*\/>/,
    default: /<w:footerReference[^>]*(?:w:type="default"|[^>])[^>]*r:id="r(\d+)"[^>]*\/>/,
  };

  const regex = regexMap[type];
  const match = xml.match(regex);

  if (match) {
    const relId = match[1];
    return { id: parseInt(relId, 10), type };
  }

  return null;
}

function getNextHeaderFooterId(xml: string, type: 'header' | 'footer'): number {
  const regexMap: Record<string, RegExp> = {
    header: /<w:headerReference[^>]*r:id="r(\d+)"[^>]*\/>/g,
    footer: /<w:footerReference[^>]*r:id="r(\d+)"[^>]*\/>/g,
  };

  const regex = regexMap[type];
  let maxId = 0;
  let match;

  while ((match = regex.exec(xml)) !== null) {
    const id = parseInt(match[1], 10);
    if (id > maxId) {
      maxId = id;
    }
  }

  return maxId + 1;
}

function addHeaderReference(xml: string, ref: HeaderFooterRef): string {
  const typeAttr = ref.type === 'default' ? '' : `w:type="${ref.type}"`;
  const newRef = `<w:headerReference${typeAttr} r:id="r${ref.id}"/>`;

  const sectPrRegex = /<w:sectPr[^>]*>[\s\S]*?<\/w:sectPr>/;
  
  if (sectPrRegex.test(xml)) {
    return xml.replace(sectPrRegex, (match) => {
      return match.replace('</w:sectPr>', `${newRef}</w:sectPr>`);
    });
  }

  return xml.replace('</w:body>', `<w:sectPr>${newRef}</w:sectPr></w:body>`);
}

function addFooterReference(xml: string, ref: HeaderFooterRef): string {
  const typeAttr = ref.type === 'default' ? '' : `w:type="${ref.type}"`;
  const newRef = `<w:footerReference${typeAttr} r:id="r${ref.id}"/>`;

  const sectPrRegex = /<w:sectPr[^>]*>[\s\S]*?<\/w:sectPr>/;
  
  if (sectPrRegex.test(xml)) {
    return xml.replace(sectPrRegex, (match) => {
      return match.replace('</w:sectPr>', `${newRef}</w:sectPr>`);
    });
  }

  return xml.replace('</w:body>', `<w:sectPr>${newRef}</w:sectPr></w:body>`);
}

function removeHeaderReference(xml: string, type: 'even' | 'default' | 'first'): string {
  const regexMap: Record<string, RegExp> = {
    even: /<w:headerReference[^>]*w:type="even"[^>]*\/>/,
    first: /<w:headerReference[^>]*w:type="first"[^>]*\/>/,
    default: /<w:headerReference[^>]*(?:w:type="default"|(?<!w:type="[^"]*)")[^>]*\/>/,
  };

  const regex = regexMap[type];
  return xml.replace(regex, '');
}

function removeFooterReference(xml: string, type: 'even' | 'default' | 'first'): string {
  const regexMap: Record<string, RegExp> = {
    even: /<w:footerReference[^>]*w:type="even"[^>]*\/>/,
    first: /<w:footerReference[^>]*w:type="first"[^>]*\/>/,
    default: /<w:footerReference[^>]*(?:w:type="default"|(?<!w:type="[^"]*)")[^>]*\/>/,
  };

  const regex = regexMap[type];
  return xml.replace(regex, '');
}

function createHeaderXml(text: string, align: string = 'center'): string {
  const alignValue = align === 'left' ? 'start' : align === 'right' ? 'end' : 'both';
  const escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:p>
    <w:pPr>
      <w:jc w:val="${alignValue}"/>
    </w:pPr>
    <w:r>
      <w:t>${escapedText}</w:t>
    </w:r>
  </w:p>
</w:hdr>`;
}

function createFooterXml(text: string, align: string = 'center'): string {
  const alignValue = align === 'left' ? 'start' : align === 'right' ? 'end' : 'both';
  let escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  escapedText = escapedText
    .replace(/{PAGE}/g, '<w:fldSimple w:instr=" PAGE "><w:r><w:t/></w:r></w:fldSimple>')
    .replace(/{NUMPAGES}/g, '<w:fldSimple w:instr=" NUMPAGES "><w:r><w:t/></w:r></w:fldSimple>');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:p>
    <w:pPr>
      <w:jc w:val="${alignValue}"/>
    </w:pPr>
    <w:r>
      <w:t>${escapedText}</w:t>
    </w:r>
  </w:p>
</w:ftr>`;
}

function updateHeaderContent(xml: string, text: string, align: string = 'center'): string {
  const alignValue = align === 'left' ? 'start' : align === 'right' ? 'end' : 'both';
  const escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let result = xml;

  const jcRegex = /<w:jc[^>]*>[\s\S]*?<\/w:jc>/;
  if (jcRegex.test(result)) {
    result = result.replace(jcRegex, `<w:jc w:val="${alignValue}"/>`);
  }

  const tRegex = /<w:t[^>]*>[\s\S]*?<\/w:t>/;
  if (tRegex.test(result)) {
    result = result.replace(tRegex, `<w:t>${escapedText}</w:t>`);
  }

  return result;
}

function updateFooterContent(xml: string, text: string, align: string = 'center'): string {
  const alignValue = align === 'left' ? 'start' : align === 'right' ? 'end' : 'both';
  let escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  escapedText = escapedText
    .replace(/{PAGE}/g, '<w:fldSimple w:instr=" PAGE "><w:r><w:t/></w:r></w:fldSimple>')
    .replace(/{NUMPAGES}/g, '<w:fldSimple w:instr=" NUMPAGES "><w:r><w:t/></w:r></w:fldSimple>');

  let result = xml;

  const jcRegex = /<w:jc[^>]*>[\s\S]*?<\/w:jc>/;
  if (jcRegex.test(result)) {
    result = result.replace(jcRegex, `<w:jc w:val="${alignValue}"/>`);
  }

  const tRegex = /<w:t[^>]*>[\s\S]*?<\/w:t>/;
  if (tRegex.test(result)) {
    result = result.replace(tRegex, `<w:t>${escapedText}</w:t>`);
  }

  return result;
}

function extractHeaderFooterInfo(zip: PizZip, docXml: string): HeaderFooterInfo {
  const info: HeaderFooterInfo = {};

  const sectPrMatch = docXml.match(/<w:sectPr[^>]*>[\s\S]*?<\/w:sectPr>/);
  if (sectPrMatch) {
    const sectPr = sectPrMatch[0];

    const headerDistMatch = sectPr.match(/<w:headerDistance[^>]*w:val="(\d+)"[^>]*\/>/);
    if (headerDistMatch) {
      info.headerDistance = parseInt(headerDistMatch[1], 10);
    }

    const footerDistMatch = sectPr.match(/<w:footerDistance[^>]*w:val="(\d+)"[^>]*\/>/);
    if (footerDistMatch) {
      info.footerDistance = parseInt(footerDistMatch[1], 10);
    }

    const pgMarMatch = sectPr.match(/<w:pgMar[^>]*>[\s\S]*?<\/w:pgMar>/);
    if (pgMarMatch) {
      const pgMar = pgMarMatch[0];
      const topMatch = pgMar.match(/w:top="(\d+)"/);
      const bottomMatch = pgMar.match(/w:bottom="(\d+)"/);
      const leftMatch = pgMar.match(/w:left="(\d+)"/);
      const rightMatch = pgMar.match(/w:right="(\d+)"/);

      info.margins = {
        top: topMatch ? parseInt(topMatch[1], 10) : undefined,
        bottom: bottomMatch ? parseInt(bottomMatch[1], 10) : undefined,
        left: leftMatch ? parseInt(leftMatch[1], 10) : undefined,
        right: rightMatch ? parseInt(rightMatch[1], 10) : undefined,
      };
    }

    info.headers = {};
    info.footers = {};

    const headerRefs = docXml.matchAll(/<w:headerReference[^>]*>/g);
    for (const ref of headerRefs) {
      const refStr = ref[0];
      const typeMatch = refStr.match(/w:type="(\w+)"/);
      const idMatch = refStr.match(/r:id="r(\d+)"/);
      
      if (typeMatch && idMatch) {
        const type = typeMatch[1] === 'default' ? 'default' : typeMatch[1] as 'even' | 'first' | 'default';
        const headerXmlFile = `word/header${idMatch[1]}.xml`;
        const headerXml = zip.file(headerXmlFile)?.asText();
        
        if (headerXml) {
          const textMatch = headerXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/);
          if (textMatch) {
            const text = textMatch[1].replace(/<[^>]*>/g, '');
            info.headers![type as keyof NonNullable<typeof info.headers>] = text;
          }
        }
      }
    }

    const footerRefs = docXml.matchAll(/<w:footerReference[^>]*>/g);
    for (const ref of footerRefs) {
      const refStr = ref[0];
      const typeMatch = refStr.match(/w:type="(\w+)"/);
      const idMatch = refStr.match(/r:id="r(\d+)"/);
      
      if (typeMatch && idMatch) {
        const type = typeMatch[1] === 'default' ? 'default' : typeMatch[1] as 'even' | 'first' | 'default';
        const footerXmlFile = `word/footer${idMatch[1]}.xml`;
        const footerXml = zip.file(footerXmlFile)?.asText();
        
        if (footerXml) {
          const textMatch = footerXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/);
          if (textMatch) {
            const text = textMatch[1].replace(/<[^>]*>/g, '').replace(/PAGE/g, '页码').replace(/NUMPAGES/g, '总页数');
            info.footers![type as keyof NonNullable<typeof info.footers>] = text;
          }
        }
      }
    }
  }

  return info;
}

// OOXML-based Word 工具 - 通过 PythonBridge 调用 claude-office-skills
export const wordTools: Tool[] = [
  // ==================== 读取文档 ====================
  {
    name: 'word_read',
    description: '读取 Word 文档内容（使用 OOXML 方式）',
    parameters: {
      type: 'object' as const,
      properties: {
        filepath: {
          type: 'string',
          description: 'Word 文档路径',
        },
      },
      required: ['filepath'],
    },
    handler: async ({ filepath }: { filepath: string }) => {
      if (!filepath) {
        return { success: false, error: 'filepath 参数缺失' };
      }
      try {
        const bridge = getPythonBridge();
        const tempDir = path.join(tmpdir(), `word_read_${Date.now()}`);

        // Unpack the document
        await bridge.unpackDocx(filepath, tempDir);

        // Read content using the CLI script
        const scriptPath = path.join(__dirname, '..', 'runtime', 'office', 'docx', 'scripts', 'word_cli.py');
        const result = await bridge['executeOfficeSkill']('docx', 'word_cli.py', {
          command: 'read',
          unpacked_dir: tempDir,
        });

        // Clean up
        await unlink(tempDir).catch(() => {});

        return {
          success: true,
          filepath,
          content: result,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  // ==================== 创建文档 ====================
  {
    name: 'word_create',
    description: '创建新的 Word 文档（从 HTML 或纯文本）',
    parameters: {
      type: 'object' as const,
      properties: {
        filepath: {
          type: 'string',
          description: '保存路径',
        },
        content: {
          type: 'string',
          description: '文档内容（HTML 或纯文本）',
        },
        title: {
          type: 'string',
          description: '文档标题（可选）',
        },
      },
      required: ['filepath', 'content'],
    },
    handler: async ({ filepath, content, title }: { filepath: string; content: string; title?: string }) => {
      if (!filepath || !content) {
        return { success: false, error: 'filepath 和 content 参数必需' };
      }
      try {
        // 使用 docx 库创建文档（作为临时解决方案）
        const children: any[] = [];

        if (title) {
          children.push(
            new Paragraph({
              text: title,
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
            })
          );
        }

        // 检测是否为 HTML
        if (content.includes('<') && content.includes('>')) {
          const result = htmlToWordConverter.convert(content);
          children.push(...result.elements);
        } else {
          // 纯文本
          const lines = content.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              children.push(new Paragraph({ text: line.trim() }));
            }
          }
        }

        const doc = new Document({
          sections: [{ children }],
        });

        const buffer = await Packer.toBuffer(doc);
        await writeFile(filepath, buffer);

        return { success: true, filepath };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  // ==================== 验证文档 ====================
  {
    name: 'word_validate',
    description: '验证 Word 文档结构完整性（使用 OOXML 验证）',
    parameters: {
      type: 'object' as const,
      properties: {
        filepath: {
          type: 'string',
          description: 'Word 文档路径',
        },
      },
      required: ['filepath'],
    },
    handler: async ({ filepath }: { filepath: string }) => {
      if (!filepath) {
        return { success: false, error: 'filepath 参数缺失' };
      }
      try {
        const bridge = getPythonBridge();
        const tempDir = path.join(tmpdir(), `word_validate_${Date.now()}`);

        // Unpack the document
        await bridge.unpackDocx(filepath, tempDir);

        // Validate using the CLI script
        const result = await bridge['executeOfficeSkill']('docx', 'word_cli.py', {
          command: 'validate',
          unpacked_dir: tempDir,
        });

        // Clean up
        await unlink(tempDir).catch(() => {});

        return {
          success: true,
          filepath,
          valid: result.valid || false,
          errors: result.errors || [],
          warnings: result.warnings || [],
        };
      } catch (error: any) {
        return { success: false, error: error.message, valid: false };
      }
    },
  },

  // ==================== 编辑段落 ====================
  {
    name: 'word_edit_paragraph',
    description: '编辑指定段落的文本内容',
    parameters: {
      type: 'object' as const,
      properties: {
        filepath: {
          type: 'string',
          description: 'Word 文档路径',
        },
        paragraphIndex: {
          type: 'number',
          description: '段落索引（从 0 开始）',
        },
        newText: {
          type: 'string',
          description: '新文本内容',
        },
      },
      required: ['filepath', 'paragraphIndex', 'newText'],
    },
    handler: async ({ filepath, paragraphIndex, newText }: { filepath: string; paragraphIndex: number; newText: string }) => {
      if (!filepath || newText === undefined) {
        return { success: false, error: 'filepath 和 newText 参数必需' };
      }
      try {
        const content = await readFile(filepath);
        const zip = new PizZip(content);

        // 读取 document.xml
        const xmlContent = zip.file('word/document.xml')?.asText();
        if (!xmlContent) {
          return { success: false, error: '无法读取 document.xml' };
        }

        // 使用辅助函数替换段落
        const newXml = replaceParagraphInXml(xmlContent, paragraphIndex, newText);

        // 更新 ZIP
        zip.file('word/document.xml', newXml);

        // 保存
        const buffer = zip.generate({ type: 'nodebuffer' });
        await writeFile(filepath, buffer);

        return { success: true, filepath };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  // ==================== 添加段落 ====================
  {
    name: 'word_add_paragraph',
    description: '在文档中添加新段落',
    parameters: {
      type: 'object' as const,
      properties: {
        filepath: {
          type: 'string',
          description: 'Word 文档路径',
        },
        text: {
          type: 'string',
          description: '段落文本',
        },
        position: {
          type: 'number',
          description: '插入位置（可选，默认添加到末尾）',
        },
      },
      required: ['filepath', 'text'],
    },
    handler: async ({ filepath, text, position }: { filepath: string; text: string; position?: number }) => {
      if (!filepath || !text) {
        return { success: false, error: 'filepath 和 text 参数必需' };
      }
      try {
        const content = await readFile(filepath);
        const zip = new PizZip(content);

        // 读取 document.xml
        const xmlContent = zip.file('word/document.xml')?.asText();
        if (!xmlContent) {
          return { success: false, error: '无法读取 document.xml' };
        }

        // 使用辅助函数添加段落
        const newXml = addParagraphToXml(xmlContent, text, position ?? -1);

        // 更新 ZIP
        zip.file('word/document.xml', newXml);

        // 保存
        const buffer = zip.generate({ type: 'nodebuffer' });
        await writeFile(filepath, buffer);

        return { success: true, filepath };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  // ==================== 替换文本 ====================
  {
    name: 'word_replace_text',
    description: '全局替换文档中的文本',
    parameters: {
      type: 'object' as const,
      properties: {
        filepath: {
          type: 'string',
          description: 'Word 文档路径',
        },
        searchText: {
          type: 'string',
          description: '要搜索的文本',
        },
        replaceWith: {
          type: 'string',
          description: '替换文本',
        },
        caseSensitive: {
          type: 'boolean',
          description: '是否区分大小写（默认 false）',
        },
      },
      required: ['filepath', 'searchText', 'replaceWith'],
    },
    handler: async ({ filepath, searchText, replaceWith, caseSensitive }: { filepath: string; searchText: string; replaceWith: string; caseSensitive?: boolean }) => {
      if (!filepath || !searchText || replaceWith === undefined) {
        return { success: false, error: 'filepath, searchText 和 replaceWith 参数必需' };
      }
      try {
        const content = await readFile(filepath);
        const zip = new PizZip(content);

        // 读取 document.xml
        const xmlContent = zip.file('word/document.xml')?.asText();
        if (!xmlContent) {
          return { success: false, error: '无法读取 document.xml' };
        }

        // 执行替换
        const flags = caseSensitive ? 'g' : 'gi';
        const escapedSearch = escapeRegex(searchText);
        const regex = new RegExp(`<w:t[^>]*>([^<]*${escapedSearch}[^<]*)</w:t>`, flags);
        let replaceCount = 0;

        const newXml = xmlContent.replace(regex, (match, content) => {
          replaceCount++;
          const newContent = content.replace(new RegExp(escapedSearch, flags), replaceWith);
          return match.replace(content, newContent);
        });

        // 更新 ZIP
        zip.file('word/document.xml', newXml);

        // 保存
        const buffer = zip.generate({ type: 'nodebuffer' });
        await writeFile(filepath, buffer);

        return { success: true, filepath, replaceCount };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  // ==================== OOXML 操作 ====================
  {
    name: 'word_unpack',
    description: '解包 Word 文档以访问 OOXML 内容',
    parameters: {
      type: 'object' as const,
      properties: {
        filepath: {
          type: 'string',
          description: 'Word 文档路径',
        },
        outputDir: {
          type: 'string',
          description: '输出目录（可选）',
        },
      },
      required: ['filepath'],
    },
    handler: async ({ filepath, outputDir }: { filepath: string; outputDir?: string }) => {
      if (!filepath) {
        return { success: false, error: 'filepath 参数缺失' };
      }
      try {
        const bridge = getPythonBridge();
        const dir = outputDir || path.join(tmpdir(), `word_unpack_${Date.now()}`);

        await bridge.unpackDocx(filepath, dir);

        return {
          success: true,
          filepath,
          unpackedDir: dir,
          message: `文档已解包到: ${dir}`,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'word_pack',
    description: '将解包的目录重新打包为 Word 文档',
    parameters: {
      type: 'object' as const,
      properties: {
        inputDir: {
          type: 'string',
          description: '解包后的目录路径',
        },
        outputFile: {
          type: 'string',
          description: '输出文件路径',
        },
      },
      required: ['inputDir', 'outputFile'],
    },
    handler: async ({ inputDir, outputFile }: { inputDir: string; outputFile: string }) => {
      if (!inputDir || !outputFile) {
        return { success: false, error: 'inputDir 和 outputFile 参数必需' };
      }
      try {
        const bridge = getPythonBridge();
        await bridge.packDocx(inputDir, outputFile);

        return {
          success: true,
          outputFile,
          message: `文档已打包到: ${outputFile}`,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },
];

// ===== 以下为辅助函数，用于 Word 文档预览功能 =====
// (旧的基于 JS 库的工具定义已移除)

function analyzeDocumentStructure(zip: PizZip): DocumentStructure {
  const xmlContent = zip.file('word/document.xml')?.asText() || '';
  const paragraphs = extractParagraphsFromXml(xmlContent);
  const tables = extractTablesFromXml(xmlContent);
  const images = extractImagesFromXml(zip);

  return {
    paragraphs: {
      count: paragraphs.length,
      items: paragraphs,
    },
    tables: {
      count: tables.length,
      items: tables,
    },
    images: {
      count: images.length,
      items: images,
    },
    totalElements: paragraphs.length + tables.length + images.length,
  };
}

function extractParagraphsFromXml(xml: string): ParagraphInfo[] {
  const paragraphRegex = /<w:p[^>]*>[\s\S]*?<\/w:p>/g;
  const textRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  const paragraphs: ParagraphInfo[] = [];
  let match;
  let index = 0;

  while ((match = paragraphRegex.exec(xml)) !== null) {
    const paragraphXml = match[0];
    const textMatches = paragraphXml.match(textRegex);
    const text = textMatches 
      ? textMatches.map(m => m.replace(/<[^>]*>/g, '')).join('')
      : '';

    paragraphs.push({
      index: index++,
      text: text,
      length: text.length,
    });
  }

  return paragraphs;
}

function extractTablesFromXml(xml: string): TableInfo[] {
  const tableRegex = /<w:tbl[^>]*>[\s\S]*?<\/w:tbl>/g;
  const tables: TableInfo[] = [];
  let match;
  let index = 0;

  while ((match = tableRegex.exec(xml)) !== null) {
    const tableXml = match[0];
    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    const rows: RowInfo[] = [];
    let rowMatch;
    let rowIndex = 0;

    while ((rowMatch = rowRegex.exec(tableXml)) !== null) {
      const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
      const cells: CellInfo[] = [];
      let cellMatch;

      while ((cellMatch = cellRegex.exec(rowMatch[0])) !== null) {
        const text = cellMatch[0].replace(/<[^>]*>/g, '').trim();
        cells.push({
          text: text,
        });
      }

      rows.push({
        index: rowIndex++,
        cells,
        cellCount: cells.length,
      });
    }

    tables.push({
      index: index++,
      rows,
      rowCount: rows.length,
      columnCount: rows[0]?.cellCount || 0,
    });
  }

  return tables;
}

function extractImagesFromXml(zip: PizZip): ImageInfo[] {
  const xmlContent = zip.file('word/document.xml')?.asText() || '';
  const imageRegex = /<w:drawing[^>]*>[\s\S]*?<\/w:drawing>/g;
  const images: ImageInfo[] = [];
  let match;
  let index = 0;

  while ((match = imageRegex.exec(xmlContent)) !== null) {
    const blipRegex = /<a:blip[^>]*r:embed="([^"]*)"[^>]*>/;
    const blipMatch = match[0].match(blipRegex);
    
    images.push({
      index: index++,
      id: blipMatch ? blipMatch[1] : '',
    });
  }

  return images;
}

function extractParagraphs(doc: Docxtemplater): string[] {
  const text = doc.getFullText();
  return text.split('\n').filter(p => p.trim());
}

function parseContentToParagraphs(content: string): Paragraph[] {
  // 检测是否包含HTML标签
  const hasHtml = /<[a-z][\s\S]*>/i.test(content);

  if (hasHtml) {
    // 使用富文本转换器
    const result = htmlToWordConverter.convert(content);
    // 过滤出 Paragraph 元素
    return result.elements.filter((e): e is Paragraph => e instanceof Paragraph);
  }

  // 纯文本处理（原有逻辑）
  const lines = content.split('\n').filter(line => line.trim());
  return lines.map(line =>
    new Paragraph({
      children: [
        new TextRun({
          text: line,
          size: 24,
        }),
      ],
      spacing: {
        after: 200,
      },
    })
  );
}

function replaceParagraphInXml(xml: string, index: number, newText: string): string {
  const paragraphRegex = /<w:p[^>]*>[\s\S]*?<\/w:p>/g;
  let count = 0;
  
  return xml.replace(paragraphRegex, (match) => {
    if (count === index) {
      count++;
      const textXml = newText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<w:p><w:r><w:t>${textXml}</w:t></w:r></w:p>`;
    }
    count++;
    return match;
  });
}

function addParagraphToXml(xml: string, text: string, position: number): string {
  const paragraphRegex = /<w:p[^>]*>[\s\S]*?<\/w:p>/g;
  const matchedParagraphs = xml.match(paragraphRegex) || [];
  const paragraphs = [...matchedParagraphs];
  const textXml = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const newParagraph = `<w:p><w:r><w:t>${textXml}</w:t></w:r></w:p>`;

  if (position >= paragraphs.length) {
    paragraphs.push(newParagraph);
  } else {
    paragraphs.splice(position, 0, newParagraph);
  }

  const parts = xml.split(paragraphRegex);
  const beforeParagraphs = parts[0] || '';
  const afterParagraphs = parts[paragraphs.length] || '';

  return beforeParagraphs + paragraphs.join('') + afterParagraphs;
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateEmptyTableData(rows: number, columns: number): string[][] {
  const data: string[][] = [];
  for (let i = 0; i < rows; i++) {
    data.push(Array(columns).fill(''));
  }
  return data;
}

function generateTableXml(data: string[][], _hasHeader: boolean): string {
  const rows = data.map((row) => {
    const cells = row.map(cell => 
      `<w:tc><w:p><w:r><w:t>${cell}</w:t></w:r></w:p></w:tc>`
    ).join('');
    
    return `<w:tr>${cells}</w:tr>`;
  }).join('');

  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr>${rows}</w:tbl>`;
}

function editTableCell(xml: string, tableIndex: number, rowIndex: number, columnIndex: number, newText: string): string {
  const tableRegex = /<w:tbl[^>]*>[\s\S]*?<\/w:tbl>/g;
  let tableCount = 0;

  return xml.replace(tableRegex, (tableMatch) => {
    if (tableCount !== tableIndex) {
      tableCount++;
      return tableMatch;
    }

    const rowRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    let rowCount = 0;
    
    const updatedTable = tableMatch.replace(rowRegex, (rowMatch) => {
      if (rowCount !== rowIndex) {
        rowCount++;
        return rowMatch;
      }

      const cellRegex = /<w:tc[^>]*>[\s\S]*?<\/w:tc>/g;
      let cellCount = 0;

      const updatedRow = rowMatch.replace(cellRegex, (cellMatch) => {
        if (cellCount === columnIndex) {
          cellCount++;
          const textXml = newText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          return cellMatch.replace(/<w:t[^>]*>[\s\S]*?<\/w:t>/, `<w:t>${textXml}</w:t>`);
        }
        cellCount++;
        return cellMatch;
      });

      rowCount++;
      return updatedRow;
    });

    tableCount++;
    return updatedTable;
  });
}

function generateImageXml(_base64Image: string, _width?: number, _height?: number): string {
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="2000000" cy="1500000"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Picture 1"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="Picture 0"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2000000" cy="1500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function insertElementToXml(xml: string, elementXml: string, position?: number): string {
  if (position === undefined || position < 0) {
    return xml + elementXml;
  }

  const paragraphRegex = /<w:p[^>]*>[\s\S]*?<\/w:p>/g;
  const paragraphs = xml.match(paragraphRegex) || [];

  if (position >= paragraphs.length) {
    return xml + elementXml;
  }

  paragraphs.splice(position, 0, elementXml);

  const parts = xml.split(paragraphRegex);
  const beforeParagraphs = parts[0] || '';
  const afterParagraphs = parts[paragraphs.length] || '';

  return beforeParagraphs + paragraphs.join('') + afterParagraphs;
}

function addImageRelationship(relationshipsXml: string, imageFileName: string): string {
  if (!relationshipsXml) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imageFileName}"/></Relationships>`;
  }

  const maxRIdRegex = /rId(\d+)/g;
  let maxRId = 0;
  let match;
  
  while ((match = maxRIdRegex.exec(relationshipsXml)) !== null) {
    const rId = parseInt(match[1], 10);
    if (rId > maxRId) {
      maxRId = rId;
    }
  }

  const newRId = `rId${maxRId + 1}`;
  const newRelationship = `<Relationship Id="${newRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imageFileName}"/>`;

  return relationshipsXml.replace('</Relationships>', `${newRelationship}</Relationships>`);
}

function convertToHtml(_content: string, structure: DocumentStructure): string {
  let html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Word Document</title><style>body{font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;} table{border-collapse: collapse; width: 100%; margin: 20px 0;} th, td{border: 1px solid #ddd; padding: 8px; text-align: left;} th{background-color: #f2f2f2;} p{margin: 10px 0;}</style></head><body>';

  html += `<h1>文档预览</h1>`;

  if (structure.paragraphs?.count > 0) {
    html += '<h2>段落内容</h2>';
    structure.paragraphs.items.forEach((p: ParagraphInfo) => {
      html += `<p>${p.text || '(空段落)'}</p>`;
    });
  }

  if (structure.tables?.count > 0) {
    html += '<h2>表格</h2>';
    structure.tables.items.forEach((table: TableInfo, tableIndex: number) => {
      html += `<h3>表格 ${tableIndex + 1}</h3>`;
      html += '<table>';
      table.rows.forEach((row: RowInfo) => {
        html += '<tr>';
        row.cells.forEach((cell: CellInfo) => {
          html += `<td>${cell.text}</td>`;
        });
        html += '</tr>';
      });
      html += '</table>';
    });
  }

  html += '</body></html>';
  return html;
}

