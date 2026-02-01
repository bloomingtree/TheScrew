import {
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  BorderStyle,
  WidthType,
} from 'docx';

/**
 * 样式配置接口
 */
interface StyleConfig {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  color?: string;
  size?: number;
  font?: string;
}

/**
 * 转换结果接口
 */
interface ConversionResult {
  elements: (Paragraph | Table)[];
  warnings?: string[];
}

/**
 * HTML到Word转换器
 * 支持将HTML内容转换为Word文档元素
 */
class HTMLToWordConverter {
  /**
   * 主转换入口
   * @param html HTML内容
   * @returns 转换结果
   */
  convert(html: string): ConversionResult {
    const elements: (Paragraph | Table)[] = [];
    const warnings: string[] = [];

    // 规范化HTML
    let normalizedHtml = html.trim();

    // 检测是否包含表格
    const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/gi;
    const tables: { html: string; index: number }[] = [];
    let match;

    while ((match = tableRegex.exec(normalizedHtml)) !== null) {
      tables.push({ html: match[0], index: match.index });
    }

    // 如果有表格，分段处理
    if (tables.length > 0) {
      let lastIndex = 0;
      for (const table of tables) {
        // 处理表格前的内容
        if (table.index > lastIndex) {
          const beforeContent = normalizedHtml.substring(lastIndex, table.index);
          const beforeElements = this.parseBlockContent(beforeContent);
          elements.push(...beforeElements.elements);
        }

        // 解析表格
        try {
          const tableElement = this.parseTable(table.html);
          elements.push(tableElement);
        } catch (e: any) {
          warnings.push(`Failed to parse table: ${e.message}`);
        }

        lastIndex = table.index + table.html.length;
      }

      // 处理剩余内容
      if (lastIndex < normalizedHtml.length) {
        const remainingContent = normalizedHtml.substring(lastIndex);
        const remainingElements = this.parseBlockContent(remainingContent);
        elements.push(...remainingElements.elements);
      }
    } else {
      // 没有表格，直接处理全部内容
      const result = this.parseBlockContent(normalizedHtml);
      elements.push(...result.elements);
      if (result.warnings) {
        warnings.push(...result.warnings);
      }
    }

    return { elements, warnings };
  }

  /**
   * 解析块级内容
   * @param html HTML内容
   * @returns 块级元素数组
   */
  private parseBlockContent(html: string): ConversionResult {
    const elements: (Paragraph | Table)[] = [];
    const warnings: string[] = [];

    // 移除空白字符
    const content = html.trim();
    if (!content) {
      return { elements, warnings };
    }

    // 检测是否包含块级标签
    const hasBlockTags = /<\/?(h[1-6]|p|div|ul|ol|li|table)[\s>]/i.test(content);

    if (!hasBlockTags) {
      // 没有块级标签，作为单个段落处理
      const runs = this.parseInlineContent(content);
      elements.push(
        new Paragraph({
          children: runs.length > 0 ? runs : [new TextRun(content)],
          spacing: { after: 200 },
        })
      );
      return { elements, warnings };
    }

    // 解析块级元素
    const blockRegex = /<(h[1-6]|p|div|ul|ol)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/gi;
    let blockMatch;
    let lastIndex = 0;

    while ((blockMatch = blockRegex.exec(content)) !== null) {
      // 处理标签前的文本
      if (blockMatch.index > lastIndex) {
        const beforeText = content.substring(lastIndex, blockMatch.index).trim();
        if (beforeText) {
          const runs = this.parseInlineContent(beforeText);
          elements.push(
            new Paragraph({
              children: runs.length > 0 ? runs : [new TextRun(beforeText)],
              spacing: { after: 200 },
            })
          );
        }
      }

      const tagName = blockMatch[1];
      const tagContent = blockMatch[2];

      if (tagName.startsWith('h')) {
        // 标题
        const level = parseInt(tagName[1]);
        const headingLevel = this.getHeadingLevel(level);
        const runs = this.parseInlineContent(tagContent);
        elements.push(
          new Paragraph({
            children: runs.length > 0 ? runs : [new TextRun(tagContent)],
            heading: HeadingLevel[headingLevel as keyof typeof HeadingLevel],
            spacing: { before: 200, after: 100 },
          })
        );
      } else if (tagName === 'p' || tagName === 'div') {
        // 段落
        const runs = this.parseInlineContent(tagContent);
        elements.push(
          new Paragraph({
            children: runs.length > 0 ? runs : [new TextRun(tagContent)],
            spacing: { after: 200 },
          })
        );
      } else if (tagName === 'ul' || tagName === 'ol') {
        // 列表
        const listItems = this.parseList(tagContent, tagName === 'ol');
        elements.push(...listItems);
      }

      lastIndex = blockMatch.index + blockMatch[0].length;
    }

    // 处理剩余文本
    if (lastIndex < content.length) {
      const remainingText = content.substring(lastIndex).trim();
      if (remainingText) {
        const runs = this.parseInlineContent(remainingText);
        elements.push(
          new Paragraph({
            children: runs.length > 0 ? runs : [new TextRun(remainingText)],
            spacing: { after: 200 },
          })
        );
      }
    }

    return { elements, warnings };
  }

  /**
   * 解析行内内容（带样式的文本）
   * @param html HTML内容
   * @returns TextRun数组
   */
  private parseInlineContent(html: string): TextRun[] {
    const runs: TextRun[] = [];

    // 移除HTML标签获取纯文本
    const textOnly = html.replace(/<[^>]*>/g, '').trim();
    if (!textOnly) {
      return runs;
    }

    // 简化版本：检测是否包含格式标签
    const hasFormatTags = /<\/?(b|strong|i|em|u|span|br)\b[\s>]/i.test(html);

    if (!hasFormatTags) {
      // 没有格式标签，直接返回纯文本
      return [new TextRun({ text: textOnly, size: 24 })];
    }

    // 解析格式标签
    let remaining = html;
    let currentStyle: StyleConfig = {};
    const styleStack: StyleConfig[] = [];

    // 正则匹配格式标签
    const formatRegex = /<(b|strong|i|em|u|span|br)(?:\s+style="([^"]*)")?\s*\/?>|<\/(b|strong|i|em|u|span)>|([^<>]+)/gi;
    let formatMatch;

    while ((formatMatch = formatRegex.exec(remaining)) !== null) {
      const openTag = formatMatch[1];
      const openStyle = formatMatch[2];
      const closeTag = formatMatch[3];
      const textContent = formatMatch[4];

      if (openTag) {
        // 开始标签
        const newStyle = this.getStyleForTag(openTag, openStyle);
        styleStack.push(currentStyle);
        currentStyle = { ...currentStyle, ...newStyle };
      } else if (closeTag) {
        // 结束标签
        if (styleStack.length > 0) {
          currentStyle = styleStack.pop()!;
        }
      } else if (textContent) {
        // 纯文本内容
        const trimmedText = textContent.trim();
        if (trimmedText) {
          const runProps: any = { text: trimmedText };

          // 应用当前样式
          if (currentStyle.bold) runProps.bold = true;
          if (currentStyle.italics) runProps.italics = true;
          if (currentStyle.underline) runProps.underline = {};
          if (currentStyle.color) runProps.color = currentStyle.color;
          if (currentStyle.size) runProps.size = currentStyle.size;
          if (currentStyle.font) runProps.font = currentStyle.font;

          // 默认字号
          if (!runProps.size) runProps.size = 24;

          runs.push(new TextRun(runProps));
        }
      }
    }

    return runs.length > 0 ? runs : [new TextRun({ text: textOnly, size: 24 })];
  }

  /**
   * 解析表格
   * @param tableHtml 表格HTML
   * @returns Word表格对象
   */
  private parseTable(tableHtml: string): Table {
    const rows: TableRow[] = [];

    // 提取表格行
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
    let rowMatch;
    let rowIndex = 0;

    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const rowHtml = rowMatch[0];
      const cells: TableCell[] = [];

      // 检测是否为表头行
      const isHeader = rowIndex === 0 && /<th[^>]*>/i.test(rowHtml);

      // 提取单元格
      const cellRegex = isHeader ? /<th[^>]*>[\s\S]*?<\/th>/gi : /<td[^>]*>[\s\S]*?<\/td>/gi;
      let cellMatch;

      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        const cellHtml = cellMatch[0];
        // 移除标签获取内容
        const cellContent = cellHtml.replace(/<[^>]*>/g, '').trim();

        // 解析单元格内容（可能包含样式）
        const contentRuns = this.parseInlineContent(cellContent);

        // 创建单元格
        const cellProps: any = {
          children: [
            new Paragraph({
              children: contentRuns.length > 0 ? contentRuns : [new TextRun(cellContent)],
              spacing: { before: 100, after: 100 },
            }),
          ],
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1 },
            bottom: { style: BorderStyle.SINGLE, size: 1 },
            left: { style: BorderStyle.SINGLE, size: 1 },
            right: { style: BorderStyle.SINGLE, size: 1 },
          },
        };

        // 表头单元格样式
        if (isHeader) {
          cellProps.shading = { fill: 'E7E6E6' };
          // 如果内容没有加粗，默认加粗
          if (contentRuns.length === 0 || !contentRuns.some((r: any) => r.bold)) {
            cellProps.children = [
              new Paragraph({
                children: [new TextRun({ text: cellContent, bold: true, size: 24 })],
                spacing: { before: 100, after: 100 },
              }),
            ];
          }
        }

        cells.push(new TableCell(cellProps));
      }

      rows.push(
        new TableRow({
          children: cells,
          tableHeader: isHeader,
        })
      );
      rowIndex++;
    }

    // 创建表格
    return new Table({
      rows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1 },
        bottom: { style: BorderStyle.SINGLE, size: 1 },
        left: { style: BorderStyle.SINGLE, size: 1 },
        right: { style: BorderStyle.SINGLE, size: 1 },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
        insideVertical: { style: BorderStyle.SINGLE, size: 1 },
      },
    });
  }

  /**
   * 解析列表
   * @param listHtml 列表HTML
   * @param ordered 是否为有序列表
   * @returns 段落数组
   */
  private parseList(listHtml: string, ordered: boolean): Paragraph[] {
    const paragraphs: Paragraph[] = [];

    // 提取列表项
    const itemRegex = /<li[^>]*>[\s\S]*?<\/li>/gi;
    let itemMatch;
    let index = 1;

    while ((itemMatch = itemRegex.exec(listHtml)) !== null) {
      const itemHtml = itemMatch[0];
      const itemContent = itemHtml.replace(/<\/?li[^>]*>/gi, '').trim();

      const runs = this.parseInlineContent(itemContent);

      // 添加列表项前缀
      const prefix = ordered ? `${index}. ` : '• ';
      const textRuns = [new TextRun({ text: prefix, bold: ordered }), ...runs];

      paragraphs.push(
        new Paragraph({
          children: textRuns.length > 1 ? textRuns : [new TextRun(itemContent)],
          spacing: { after: 100 },
          indent: { left: 720 }, // 缩进
        })
      );

      index++;
    }

    return paragraphs;
  }

  /**
   * 解析行内样式属性
   * @param styleAttr style属性值
   * @returns 样式配置
   */
  private parseInlineStyle(styleAttr: string): StyleConfig {
    const config: StyleConfig = {};
    if (!styleAttr) return config;

    const declarations = styleAttr.split(';').filter((d) => d.trim());

    for (const declaration of declarations) {
      const colonIndex = declaration.indexOf(':');
      if (colonIndex === -1) continue;

      const property = declaration.substring(0, colonIndex).trim().toLowerCase();
      const value = declaration.substring(colonIndex + 1).trim();

      switch (property) {
        case 'font-weight':
          if (value === 'bold' || value === 'bolder' || value === '700' || value === '600' || value === '800' || value === '900') {
            config.bold = true;
          }
          break;
        case 'font-style':
          if (value === 'italic') {
            config.italics = true;
          }
          break;
        case 'text-decoration':
          if (value.includes('underline')) {
            config.underline = true;
          }
          break;
        case 'color':
          config.color = this.parseColor(value);
          break;
        case 'font-size':
          config.size = this.parseFontSize(value);
          break;
        case 'font-family':
          config.font = this.parseFontFamily(value);
          break;
      }
    }

    return config;
  }

  /**
   * 解析颜色值
   * @param color 颜色值
   * @returns 六位十六进制颜色
   */
  private parseColor(color: string): string {
    let c = color.trim().toUpperCase();

    // 移除#
    if (c.startsWith('#')) {
      c = c.substring(1);
    }

    // 3位十六进制转6位
    if (c.length === 3) {
      c = c.split('').map((ch) => ch + ch).join('');
    }

    // 常见颜色名称
    const namedColors: Record<string, string> = {
      RED: 'FF0000',
      GREEN: '00FF00',
      BLUE: '0000FF',
      BLACK: '000000',
      WHITE: 'FFFFFF',
      GRAY: '808080',
      GREY: '808080',
      YELLOW: 'FFFF00',
      ORANGE: 'FFA500',
      PURPLE: '800080',
      PINK: 'FFC0CB',
    };

    if (namedColors[c]) {
      return namedColors[c];
    }

    // RGB格式: rgb(255, 0, 0)
    const rgbMatch = c.match(/RGB\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
      const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
      const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
      return `${r}${g}${b}`;
    }

    // 假设已经是六位十六进制
    return c.padEnd(6, '0').substring(0, 6);
  }

  /**
   * 解析字号
   * @param size 字号值
   * @returns 半点单位（docx单位）
   */
  private parseFontSize(size: string): number {
    const match = size.match(/^([\d.]+)(px|pt|em|rem)?$/i);
    if (!match) return 24; // 默认12pt

    const value = parseFloat(match[1]);
    const unit = (match[2] || 'px').toLowerCase();

    switch (unit) {
      case 'px':
        return Math.round(value * 1.5); // px转半点
      case 'pt':
        return Math.round(value * 2); // pt转半点
      case 'em':
      case 'rem':
        return Math.round(value * 12 * 2); // 假设基准12pt
      default:
        return Math.round(value * 2);
    }
  }

  /**
   * 解析字体名称
   * @param fontFamily 字体名称
   * @returns 字体名称
   */
  private parseFontFamily(fontFamily: string): string {
    // 移除引号，取第一个字体
    return fontFamily.replace(/['"]/g, '').split(',')[0].trim();
  }

  /**
   * 获取标签对应的样式
   * @param tagName 标签名
   * @param styleAttr style属性
   * @returns 样式配置
   */
  private getStyleForTag(tagName: string, styleAttr?: string): StyleConfig {
    const baseStyle = this.parseInlineStyle(styleAttr || '');

    switch (tagName.toLowerCase()) {
      case 'b':
      case 'strong':
        return { ...baseStyle, bold: true };
      case 'i':
      case 'em':
        return { ...baseStyle, italics: true };
      case 'u':
        return { ...baseStyle, underline: true };
      case 'span':
        return baseStyle;
      default:
        return baseStyle;
    }
  }

  /**
   * 获取标题级别
   * @param level HTML标题级别（1-6）
   * @returns Word标题级别
   */
  private getHeadingLevel(level: number): string {
    const levelMap: Record<number, string> = {
      1: 'HEADING_1',
      2: 'HEADING_2',
      3: 'HEADING_3',
      4: 'HEADING_4',
      5: 'HEADING_5',
      6: 'HEADING_6',
    };
    return levelMap[level] || 'HEADING_1';
  }
}

// 导出单例
export const htmlToWordConverter = new HTMLToWordConverter();
