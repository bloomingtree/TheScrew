import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

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

export const wordTools = [
  {
    name: 'read_word',
    description: '读取 Word 文档的文本内容和结构信息',
    parameters: {
      type: 'object' as const,
      properties: {
        filepath: {
          type: 'string',
          description: 'Word 文件路径（相对于工作空间）',
        },
      },
      required: ['filepath'],
    },
    handler: async ({ filepath }: WordToolArgs) => {
      if (!filepath) {
        return { success: false, error: 'filepath 参数缺失' };
      }
      try {
        const { content, structure } = await readWordDocument(filepath);
        return {
          success: true,
          content,
          structure,
          path: filepath,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'create_word',
    description: '创建新的 Word 文档',
    parameters: {
      type: 'object' as const,
      properties: {
        filepath: {
          type: 'string',
          description: '保存路径（相对于工作空间）',
        },
        content: {
          type: 'string',
          description: '文档内容（支持 HTML 格式，会自动转换为 Word 格式）',
        },
        title: {
          type: 'string',
          description: '文档标题（可选）',
        },
      },
      required: ['filepath', 'content'],
    },
    handler: async ({ filepath, content, title }: WordToolArgs) => {
      if (!filepath || !content) {
        return { success: false, error: 'filepath 和 content 参数缺失' };
      }
      try {
        const doc = new Document({
          sections: [{
            properties: {},
            children: [
              ...(title ? [new Paragraph({
                text: title,
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
                spacing: {
                  after: 400,
                },
              })] : []),
              ...parseContentToParagraphs(content),
            ],
          }],
        });

        const buffer = await Packer.toBuffer(doc);
        const workspacePath = process.cwd();
        const fullPath = path.join(workspacePath, filepath);
        
        await writeFile(fullPath, buffer);
        
        return {
          success: true,
          path: filepath,
          message: 'Word 文档创建成功',
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'open_word',
    description: '打开 Word 文档以供编辑',
    parameters: {
      type: 'object' as const,
      properties: {
        filepath: {
          type: 'string',
          description: 'Word 文件路径（相对于工作空间）',
        },
      },
      required: ['filepath'],
    },
    handler: async ({ filepath }: WordToolArgs) => {
      if (!filepath) {
        return { success: false, error: 'filepath 参数缺失' };
      }
      try {
        const workspacePath = process.cwd();
        const fullPath = path.join(workspacePath, filepath);
        const content = await readFile(fullPath);
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });

        currentDoc = doc;
        currentDocPath = filepath;

        const { content: textContent, structure } = await readWordDocument(filepath);

        return {
          success: true,
          message: '文档已打开，可以开始编辑',
          currentPath: filepath,
          content: textContent,
          structure,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'save_word',
    description: '保存当前编辑的 Word 文档',
    parameters: {
      type: 'object' as const,
      properties: {
        filepath: {
          type: 'string',
          description: '保存路径（可选，不提供则覆盖原文件）',
        },
      },
      required: [],
    },
    handler: async ({ filepath }: WordToolArgs) => {
      try {
        if (!currentDoc) {
          return { success: false, error: '没有打开的文档，请先使用 open_word' };
        }

        const savePath = filepath || currentDocPath;
        if (!savePath) {
          return { success: false, error: '无法确定保存路径' };
        }

        const buffer = currentDoc.getZip().generate({
          type: 'nodebuffer',
          compression: 'DEFLATE',
        });

        const workspacePath = process.cwd();
        const fullPath = path.join(workspacePath, savePath);
        await writeFile(fullPath, buffer);

        if (filepath && filepath !== currentDocPath) {
          currentDocPath = filepath;
        }

        return {
          success: true,
          path: savePath,
          message: '文档保存成功',
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'get_structure',
    description: '获取 Word 文档的详细结构信息（段落、表格、图片等）',
    parameters: {
      type: 'object' as const,
      properties: {
        filepath: {
          type: 'string',
          description: 'Word 文件路径（可选，不提供则使用当前打开的文档）',
        },
      },
      required: [],
    },
    handler: async ({ filepath }: WordToolArgs) => {
      try {
        const targetPath = filepath || currentDocPath;
        if (!targetPath) {
          return { success: false, error: '请提供文件路径或先打开文档' };
        }

        const { structure } = await readWordDocument(targetPath);
        return {
          success: true,
          structure,
          path: targetPath,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'edit_paragraph',
    description: '修改指定段落的文本内容',
    parameters: {
      type: 'object' as const,
      properties: {
        paragraphIndex: {
          type: 'number',
          description: '段落索引（从 0 开始）',
        },
        newText: {
          type: 'string',
          description: '新的文本内容',
        },
      },
      required: ['paragraphIndex', 'newText'],
    },
    handler: async ({ paragraphIndex, newText }: WordToolArgs) => {
      if (paragraphIndex === undefined || !newText) {
        return { success: false, error: 'paragraphIndex 和 newText 参数缺失' };
      }
      try {
        if (!currentDoc) {
          return { success: false, error: '没有打开的文档，请先使用 open_word' };
        }

        const paragraphs = extractParagraphs(currentDoc);
        if (paragraphIndex < 0 || paragraphIndex >= paragraphs.length) {
          return { success: false, error: `段落索引 ${paragraphIndex} 超出范围` };
        }

        const oldContent = paragraphs[paragraphIndex];
        paragraphs[paragraphIndex] = newText;

        const zip = currentDoc.getZip();
        const xmlContent = zip.file('word/document.xml')?.asText() || '';
        const updatedXml = replaceParagraphInXml(xmlContent, paragraphIndex, newText);
        zip.file('word/document.xml', updatedXml);

        currentDoc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });

        return {
          success: true,
          message: `段落 ${paragraphIndex} 已更新`,
          oldContent,
          newContent: newText,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'add_paragraph',
    description: '在指定位置添加新段落',
    parameters: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string',
          description: '段落文本内容',
        },
        position: {
          type: 'number',
          description: '插入位置（索引，默认添加到末尾）',
        },
        heading: {
          type: 'string',
          description: '标题级别（可选：1-6）',
        },
      },
      required: ['text'],
    },
    handler: async ({ text, position }: WordToolArgs) => {
      if (!text) {
        return { success: false, error: 'text 参数缺失' };
      }
      try {
        if (!currentDoc) {
          return { success: false, error: '没有打开的文档，请先使用 open_word' };
        }

        const paragraphs = extractParagraphs(currentDoc);
        const insertPosition = position !== undefined ? position : paragraphs.length;

        if (insertPosition < 0 || insertPosition > paragraphs.length) {
          return { success: false, error: `插入位置 ${insertPosition} 超出范围` };
        }

        paragraphs.splice(insertPosition, 0, text);

        const zip = currentDoc.getZip();
        const xmlContent = zip.file('word/document.xml')?.asText() || '';
        const updatedXml = addParagraphToXml(xmlContent, text, insertPosition);
        zip.file('word/document.xml', updatedXml);

        currentDoc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });

        return {
          success: true,
          message: `段落已添加到位置 ${insertPosition}`,
          content: text,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'replace_text',
    description: '替换文档中的所有匹配文本',
    parameters: {
      type: 'object' as const,
      properties: {
        searchText: {
          type: 'string',
          description: '要搜索的文本',
        },
        replaceWith: {
          type: 'string',
          description: '替换后的文本',
        },
        caseSensitive: {
          type: 'boolean',
          description: '是否区分大小写（默认 false）',
        },
      },
      required: ['searchText', 'replaceWith'],
    },
    handler: async ({ searchText, replaceWith, caseSensitive }: WordToolArgs) => {
      if (!searchText || !replaceWith) {
        return { success: false, error: 'searchText 和 replaceWith 参数缺失' };
      }
      try {
        if (!currentDoc) {
          return { success: false, error: '没有打开的文档，请先使用 open_word' };
        }

        const zip = currentDoc.getZip();
        const xmlContent = zip.file('word/document.xml')?.asText() || '';
        
        let replaceCount = 0;
        const searchRegex = caseSensitive 
          ? new RegExp(escapeRegex(searchText), 'g')
          : new RegExp(escapeRegex(searchText), 'gi');

        const updatedXml = xmlContent.replace(searchRegex, () => {
          replaceCount++;
          return replaceWith;
        });

        if (replaceCount === 0) {
          return { success: true, message: '未找到匹配的文本', replaceCount: 0 };
        }

        zip.file('word/document.xml', updatedXml);

        currentDoc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });

        return {
          success: true,
          message: `成功替换 ${replaceCount} 处文本`,
          replaceCount,
          searchText,
          replaceWith,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'add_table',
    description: '在文档中添加表格',
    parameters: {
      type: 'object' as const,
      properties: {
        rows: {
          type: 'number',
          description: '行数',
        },
        columns: {
          type: 'number',
          description: '列数',
        },
        data: {
          type: 'array',
          description: '表格数据（二维数组）',
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        position: {
          type: 'number',
          description: '插入位置（段落索引）',
        },
        hasHeader: {
          type: 'boolean',
          description: '是否包含表头（默认 true）',
        },
      },
      required: ['rows', 'columns'],
    },
    handler: async ({ rows, columns, data, position, hasHeader }: WordToolArgs) => {
      if (rows === undefined || columns === undefined) {
        return { success: false, error: 'rows 和 columns 参数缺失' };
      }
      try {
        if (!currentDoc) {
          return { success: false, error: '没有打开的文档，请先使用 open_word' };
        }

        const zip = currentDoc.getZip();
        const xmlContent = zip.file('word/document.xml')?.asText() || '';

        const tableData = data || generateEmptyTableData(rows, columns);
        const tableXml = generateTableXml(tableData, hasHeader ?? true);

        const updatedXml = insertElementToXml(xmlContent, tableXml, position);
        zip.file('word/document.xml', updatedXml);

        currentDoc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });

        return {
          success: true,
          message: `已添加 ${rows}x${columns} 表格`,
          rows,
          columns,
          data: tableData,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'edit_table',
    description: '编辑表格中的指定单元格内容',
    parameters: {
      type: 'object' as const,
      properties: {
        tableIndex: {
          type: 'number',
          description: '表格索引（从 0 开始）',
        },
        rowIndex: {
          type: 'number',
          description: '行索引（从 0 开始）',
        },
        columnIndex: {
          type: 'number',
          description: '列索引（从 0 开始）',
        },
        newText: {
          type: 'string',
          description: '新的单元格内容',
        },
      },
      required: ['tableIndex', 'rowIndex', 'columnIndex', 'newText'],
    },
    handler: async ({ tableIndex, rowIndex, columnIndex, newText }: WordToolArgs) => {
      if (tableIndex === undefined || rowIndex === undefined || columnIndex === undefined || !newText) {
        return { success: false, error: 'tableIndex, rowIndex, columnIndex 和 newText 参数缺失' };
      }
      try {
        if (!currentDoc) {
          return { success: false, error: '没有打开的文档，请先使用 open_word' };
        }

        const zip = currentDoc.getZip();
        const xmlContent = zip.file('word/document.xml')?.asText() || '';

        const updatedXml = editTableCell(xmlContent, tableIndex, rowIndex, columnIndex, newText);
        
        if (updatedXml === xmlContent) {
          return { success: false, error: '未找到指定的表格或单元格' };
        }

        zip.file('word/document.xml', updatedXml);

        currentDoc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });

        return {
          success: true,
          message: `表格 ${tableIndex} 的单元格 [${rowIndex},${columnIndex}] 已更新`,
          newText,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'add_image',
    description: '在文档中添加图片',
    parameters: {
      type: 'object' as const,
      properties: {
        imagePath: {
          type: 'string',
          description: '图片文件路径（相对于工作空间）',
        },
        position: {
          type: 'number',
          description: '插入位置（段落索引）',
        },
        width: {
          type: 'number',
          description: '图片宽度（像素，默认自动）',
        },
        height: {
          type: 'number',
          description: '图片高度（像素，默认自动）',
        },
      },
      required: ['imagePath'],
    },
    handler: async ({ imagePath, position, width, height }: WordToolArgs) => {
      if (!imagePath) {
        return { success: false, error: 'imagePath 参数缺失' };
      }
      try {
        if (!currentDoc) {
          return { success: false, error: '没有打开的文档，请先使用 open_word' };
        }

        const workspacePath = process.cwd();
        const fullImagePath = path.join(workspacePath, imagePath);
        const imageContent = await readFile(fullImagePath);
        const base64Image = imageContent.toString('base64');

        const zip = currentDoc.getZip();
        const xmlContent = zip.file('word/document.xml')?.asText() || '';

        const imageXml = generateImageXml(base64Image, width, height);
        const updatedXml = insertElementToXml(xmlContent, imageXml, position);
        
        zip.file('word/document.xml', updatedXml);

        const imageFileName = path.basename(imagePath);
        
        zip.file(`word/media/${imageFileName}`, imageContent);

        const relationshipsXml = zip.file('word/_rels/document.xml.rels')?.asText() || '';
        const updatedRels = addImageRelationship(relationshipsXml, imageFileName);
        zip.file('word/_rels/document.xml.rels', updatedRels);

        currentDoc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });

        return {
          success: true,
          message: '图片已添加到文档',
          imagePath,
          width,
          height,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'export_as_html',
    description: '将 Word 文档导出为 HTML 格式（用于预览）',
    parameters: {
      type: 'object' as const,
      properties: {
        filepath: {
          type: 'string',
          description: 'Word 文件路径（可选，不提供则使用当前打开的文档）',
        },
        outputPath: {
          type: 'string',
          description: 'HTML 输出路径（可选）',
        },
      },
      required: [],
    },
    handler: async ({ filepath, outputPath }: WordToolArgs) => {
      try {
        const targetPath = filepath || currentDocPath;
        if (!targetPath) {
          return { success: false, error: '请提供文件路径或先打开文档' };
        }

        const { content, structure } = await readWordDocument(targetPath);
        const htmlContent = convertToHtml(content, structure);

        if (outputPath) {
          const workspacePath = process.cwd();
          const fullOutputPath = path.join(workspacePath, outputPath);
          await writeFile(fullOutputPath, htmlContent);
        }

        return {
          success: true,
          html: htmlContent,
          outputPath,
          message: '文档已转换为 HTML',
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  },

  {
    name: 'modify_header_footer_distance',
    description: '修改页眉页脚距离和页面边距（单位：缇，1英寸=1440缇）',
    parameters: {
      type: 'object' as const,
      properties: {
        headerDistance: {
          type: 'number',
          description: '页眉距离页面的距离（缇）',
        },
        footerDistance: {
          type: 'number',
          description: '页脚距离页面的距离（缇）',
        },
        margin: {
          type: 'object',
          description: '页面边距设置',
          properties: {
            top: { type: 'number', description: '上边距（缇）' },
            bottom: { type: 'number', description: '下边距（缇）' },
            left: { type: 'number', description: '左边距（缇）' },
            right: { type: 'number', description: '右边距（缇）' },
          },
        },
      },
      required: [],
    },
    handler: async ({ headerDistance, footerDistance, margin }: WordToolArgs) => {
      try {
        if (!currentDoc) {
          return { success: false, error: '没有打开的文档，请先使用 open_word' };
        }

        const zip = currentDoc.getZip();
        const xmlContent = zip.file('word/document.xml')?.asText() || '';

        const updatedXml = modifySectionProperties(xmlContent, headerDistance, footerDistance, margin);
        
        zip.file('word/document.xml', updatedXml);

        currentDoc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });

        return {
          success: true,
          message: '页眉页脚距离和边距已更新',
          changes: {
            headerDistance,
            footerDistance,
            margin,
          },
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'edit_header',
    description: '编辑页眉内容',
    parameters: {
      type: 'object' as const,
      properties: {
        headerText: {
          type: 'string',
          description: '页眉文本内容',
        },
        headerType: {
          type: 'string',
          description: '页眉类型：even（偶数页）、default（默认/奇数页）、first（首页）',
          enum: ['even', 'default', 'first'],
        },
        align: {
          type: 'string',
          description: '对齐方式：left、center、right',
          enum: ['left', 'center', 'right'],
        },
      },
      required: ['headerText'],
    },
    handler: async ({ headerText, headerType = 'default', align = 'center' }: WordToolArgs) => {
      if (!headerText) {
        return { success: false, error: 'headerText 参数缺失' };
      }
      try {
        if (!currentDoc) {
          return { success: false, error: '没有打开的文档，请先使用 open_word' };
        }

        const zip = currentDoc.getZip();
        const docXml = zip.file('word/document.xml')?.asText() || '';

        const headerRef = findHeaderReference(docXml, headerType);
        
        if (!headerRef) {
          return { success: false, error: `未找到${headerType}页眉引用，请先创建页眉` };
        }

        const headerId = headerRef.id;
        const headerXmlFile = `word/header${headerId}.xml`;
        
        if (!zip.file(headerXmlFile)) {
          const newHeaderXml = createHeaderXml(headerText, align);
          zip.file(headerXmlFile, newHeaderXml);
        } else {
          const headerXml = zip.file(headerXmlFile)!.asText();
          const updatedHeaderXml = updateHeaderContent(headerXml, headerText, align);
          zip.file(headerXmlFile, updatedHeaderXml);
        }

        currentDoc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });

        return {
          success: true,
          message: '页眉已更新',
          headerType,
          headerText,
          align,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'edit_footer',
    description: '编辑页脚内容',
    parameters: {
      type: 'object' as const,
      properties: {
        footerText: {
          type: 'string',
          description: '页脚文本内容（支持 {PAGE} 表示页码，{NUMPAGES} 表示总页数）',
        },
        footerType: {
          type: 'string',
          description: '页脚类型：even（偶数页）、default（默认/奇数页）、first（首页）',
          enum: ['even', 'default', 'first'],
        },
        align: {
          type: 'string',
          description: '对齐方式：left、center、right',
          enum: ['left', 'center', 'right'],
        },
      },
      required: ['footerText'],
    },
    handler: async ({ footerText, footerType = 'default', align = 'center' }: WordToolArgs) => {
      if (!footerText) {
        return { success: false, error: 'footerText 参数缺失' };
      }
      try {
        if (!currentDoc) {
          return { success: false, error: '没有打开的文档，请先使用 open_word' };
        }

        const zip = currentDoc.getZip();
        const docXml = zip.file('word/document.xml')?.asText() || '';

        const footerRef = findFooterReference(docXml, footerType);
        
        if (!footerRef) {
          return { success: false, error: `未找到${footerType}页脚引用，请先创建页脚` };
        }

        const footerId = footerRef.id;
        const footerXmlFile = `word/footer${footerId}.xml`;
        
        if (!zip.file(footerXmlFile)) {
          const newFooterXml = createFooterXml(footerText, align);
          zip.file(footerXmlFile, newFooterXml);
        } else {
          const footerXml = zip.file(footerXmlFile)!.asText();
          const updatedFooterXml = updateFooterContent(footerXml, footerText, align);
          zip.file(footerXmlFile, updatedFooterXml);
        }

        currentDoc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });

        return {
          success: true,
          message: '页脚已更新',
          footerType,
          footerText,
          align,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'add_header_text',
    description: '添加或更新页眉文本（自动创建页眉）',
    parameters: {
      type: 'object' as const,
      properties: {
        headerText: {
          type: 'string',
          description: '页眉文本内容',
        },
        headerType: {
          type: 'string',
          description: '页眉类型：even（偶数页）、default（默认/奇数页）、first（首页）',
          enum: ['even', 'default', 'first'],
        },
        align: {
          type: 'string',
          description: '对齐方式：left、center、right',
          enum: ['left', 'center', 'right'],
        },
      },
      required: ['headerText'],
    },
    handler: async ({ headerText, headerType = 'default', align = 'center' }: WordToolArgs) => {
      if (!headerText) {
        return { success: false, error: 'headerText 参数缺失' };
      }
      try {
        if (!currentDoc) {
          return { success: false, error: '没有打开的文档，请先使用 open_word' };
        }

        const zip = currentDoc.getZip();
        const docXml = zip.file('word/document.xml')?.asText() || '';

        let headerRef = findHeaderReference(docXml, headerType);
        let headerId: number;
        
        if (!headerRef) {
          headerId = getNextHeaderFooterId(docXml, 'header');
          headerRef = { id: headerId, type: headerType };
          
          const updatedDocXml = addHeaderReference(docXml, headerRef);
          zip.file('word/document.xml', updatedDocXml);
        } else {
          headerId = headerRef.id;
        }

        const headerXmlFile = `word/header${headerId}.xml`;
        const headerXml = createHeaderXml(headerText, align);
        zip.file(headerXmlFile, headerXml);

        currentDoc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });

        return {
          success: true,
          message: '页眉已添加',
          headerType,
          headerText,
          align,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'add_footer_text',
    description: '添加或更新页脚文本（支持页码，自动创建页脚）',
    parameters: {
      type: 'object' as const,
      properties: {
        footerText: {
          type: 'string',
          description: '页脚文本内容（支持 {PAGE} 表示页码，{NUMPAGES} 表示总页数）',
        },
        footerType: {
          type: 'string',
          description: '页脚类型：even（偶数页）、default（默认/奇数页）、first（首页）',
          enum: ['even', 'default', 'first'],
        },
        align: {
          type: 'string',
          description: '对齐方式：left、center、right',
          enum: ['left', 'center', 'right'],
        },
      },
      required: ['footerText'],
    },
    handler: async ({ footerText, footerType = 'default', align = 'center' }: WordToolArgs) => {
      if (!footerText) {
        return { success: false, error: 'footerText 参数缺失' };
      }
      try {
        if (!currentDoc) {
          return { success: false, error: '没有打开的文档，请先使用 open_word' };
        }

        const zip = currentDoc.getZip();
        const docXml = zip.file('word/document.xml')?.asText() || '';

        let footerRef = findFooterReference(docXml, footerType);
        let footerId: number;
        
        if (!footerRef) {
          footerId = getNextHeaderFooterId(docXml, 'footer');
          footerRef = { id: footerId, type: footerType };
          
          const updatedDocXml = addFooterReference(docXml, footerRef);
          zip.file('word/document.xml', updatedDocXml);
        } else {
          footerId = footerRef.id;
        }

        const footerXmlFile = `word/footer${footerId}.xml`;
        const footerXml = createFooterXml(footerText, align);
        zip.file(footerXmlFile, footerXml);

        currentDoc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });

        return {
          success: true,
          message: '页脚已添加',
          footerType,
          footerText,
          align,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'delete_header',
    description: '删除指定类型的页眉',
    parameters: {
      type: 'object' as const,
      properties: {
        headerType: {
          type: 'string',
          description: '页眉类型：even（偶数页）、default（默认/奇数页）、first（首页）',
          enum: ['even', 'default', 'first'],
        },
      },
      required: ['headerType'],
    },
    handler: async ({ headerType = 'default' }: WordToolArgs) => {
      try {
        if (!currentDoc) {
          return { success: false, error: '没有打开的文档，请先使用 open_word' };
        }

        const zip = currentDoc.getZip();
        const docXml = zip.file('word/document.xml')?.asText() || '';

        const headerRef = findHeaderReference(docXml, headerType);
        
        if (!headerRef) {
          return { success: false, error: `未找到${headerType}页眉` };
        }

        const updatedDocXml = removeHeaderReference(docXml, headerType);
        zip.file('word/document.xml', updatedDocXml);

        const headerXmlFile = `word/header${headerRef.id}.xml`;
        zip.remove(headerXmlFile);

        currentDoc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });

        return {
          success: true,
          message: '页眉已删除',
          headerType,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'delete_footer',
    description: '删除指定类型的页脚',
    parameters: {
      type: 'object' as const,
      properties: {
        footerType: {
          type: 'string',
          description: '页脚类型：even（偶数页）、default（默认/奇数页）、first（首页）',
          enum: ['even', 'default', 'first'],
        },
      },
      required: ['footerType'],
    },
    handler: async ({ footerType = 'default' }: WordToolArgs) => {
      try {
        if (!currentDoc) {
          return { success: false, error: '没有打开的文档，请先使用 open_word' };
        }

        const zip = currentDoc.getZip();
        const docXml = zip.file('word/document.xml')?.asText() || '';

        const footerRef = findFooterReference(docXml, footerType);
        
        if (!footerRef) {
          return { success: false, error: `未找到${footerType}页脚` };
        }

        const updatedDocXml = removeFooterReference(docXml, footerType);
        zip.file('word/document.xml', updatedDocXml);

        const footerXmlFile = `word/footer${footerRef.id}.xml`;
        zip.remove(footerXmlFile);

        currentDoc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });

        return {
          success: true,
          message: '页脚已删除',
          footerType,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },

  {
    name: 'get_header_footer_info',
    description: '获取文档的页眉页脚信息',
    parameters: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
    handler: async () => {
      try {
        if (!currentDoc) {
          return { success: false, error: '没有打开的文档，请先使用 open_word' };
        }

        const zip = currentDoc.getZip();
        const docXml = zip.file('word/document.xml')?.asText() || '';

        const info = extractHeaderFooterInfo(zip, docXml);

        return {
          success: true,
          info,
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    },
  },
];

async function readWordDocument(filepath: string) {
  const workspacePath = process.cwd();
  const fullPath = path.join(workspacePath, filepath);
  const content = await readFile(fullPath);
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  const textContent = doc.getFullText();
  const structure = analyzeDocumentStructure(zip);

  return { content: textContent, structure };
}

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

