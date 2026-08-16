/**
 * docx.ts — DOCX format handler
 *
 * Handles Word .docx files using lightweight XML tree operations.
 * Only loads word/document.xml for content operations.
 */

import * as fs from 'fs';
import PizZip from 'pizzip';
import { BaseDocumentHandler } from './base';
import { readPart, writePart, listParts, hasPart } from '../core/ooxml';
import { parseXml, serializeXml, nthChild, childrenOf, textOf, el, txt, appendChild, removeChild, insertAfter } from '../core/xml-tree';
import { streamParseXML, collectText } from '../core/stream-parser';
import type { OOXMLDocument, CLIOptions, CommandResult } from '../types';
import type { XmlTree, XmlNode } from '../core/xml-tree';

// Re-export XmlNode for local use
type XNode = XmlNode;

// ── Create ─────────────────────────────────────────────────────

export class DocxHandler extends BaseDocumentHandler {
  async create(filePath: string): Promise<void> {
    const zip = new PizZip();
    zip.file('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>');
    zip.file('word/document.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" ' +
      'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
      'xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
      'xmlns:v="urn:schemas-microsoft-com:vml" ' +
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
      'xmlns:w10="urn:schemas-microsoft-com:office:word" ' +
      'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ' +
      'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" ' +
      'xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" ' +
      'xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" ' +
      'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" ' +
      'mc:Ignorable="w14 wp14">' +
      '<w:body><w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p></w:body>' +
      '</w:document>');
    zip.file('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>');
    zip.file('word/_rels/document.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
    fs.writeFileSync(filePath, zip.generate({ type: 'nodebuffer' }) as Buffer);
  }

  // ── View ────────────────────────────────────────────────────

  async view(doc: OOXMLDocument, options: CLIOptions): Promise<CommandResult> {
    const xml = readPart(doc, 'word/document.xml');
    const tree = parseXml(xml);
    const body = findBody(tree);

    const paragraphs = childrenOf(body, 'w:p');
    const tables = childrenOf(body, 'w:tbl');

    const structure: any[] = [];
    let idx = 0;
    for (const child of body?.children ?? []) {
      if (child.type !== 'element') continue;
      idx++;
      if (child.tag === 'w:p') {
        const text = paraText(child);
        structure.push({ path: `/paragraph[${idx}]`, type: 'paragraph', text: text.substring(0, 200) });
      } else if (child.tag === 'w:tbl') {
        const rows = childrenOf(child, 'w:tr').length;
        const cols = childrenOf(childrenOf(child, 'w:tr')[0], 'w:tc').length;
        // 输出单元格文本矩阵，让用户/AI 直接看到表格内容
        const cells: string[][] = [];
        const trs = childrenOf(child, 'w:tr');
        let truncated = false;
        for (const tr of trs) {
          const tcs = childrenOf(tr, 'w:tc');
          const row: string[] = [];
          for (const tc of tcs) {
            // 单元格文本 = 所有 w:p 的纯文本拼接
            let text = '';
            for (const p of childrenOf(tc, 'w:p')) {
              text += paraText(p);
            }
            if (text.length > 200) {
              text = text.substring(0, 200) + '...';
              truncated = true;
            }
            row.push(text);
          }
          cells.push(row);
        }
        structure.push({
          path: `/table[${idx}]`,
          type: 'table',
          rows,
          cols,
          cells,
          ...(truncated ? { truncated: true } : {}),
        });
      }
    }

    return {
      success: true,
      data: {
        type: 'docx',
        paragraphs: paragraphs.length,
        tables: tables.length,
        structure,
      },
    };
  }

  // ── Get ─────────────────────────────────────────────────────

  async get(doc: OOXMLDocument, path: string, prop: string, _options: CLIOptions): Promise<CommandResult> {
    const xml = readPart(doc, 'word/document.xml');
    const tree = parseXml(xml);
    const body = findBody(tree);
    if (!body) return { success: false, error: 'Invalid document: no body' };

    const elem = resolveDocxElement(body, path);
    if (!elem) return { success: false, error: `Element not found: ${path}` };

    const value = getElementProp(elem, prop);
    if (value === null) return { success: false, error: `Property "${prop}" not found` };
    return { success: true, data: { path, property: prop, value } };
  }

  // ── Set ─────────────────────────────────────────────────────

  async set(doc: OOXMLDocument, path: string, prop: string, value: string, _options: CLIOptions): Promise<CommandResult> {
    const xml = readPart(doc, 'word/document.xml');
    const tree = parseXml(xml);
    const body = findBody(tree);
    if (!body) return { success: false, error: 'Invalid document: no body' };

    const elem = resolveDocxElement(body, path);
    if (!elem) return { success: false, error: `Element not found: ${path}` };

    const ok = setElementProp(elem, prop, value, tree);
    if (!ok) return { success: false, error: `Cannot set property "${prop}"` };

    writePart(doc, 'word/document.xml', serializeXml(tree));
    return { success: true, message: `Set ${prop}="${value}" at ${path}` };
  }

  // ── Add ─────────────────────────────────────────────────────

  async add(doc: OOXMLDocument, path: string, type: string, options: CLIOptions): Promise<CommandResult> {
    const xml = readPart(doc, 'word/document.xml');
    const tree = parseXml(xml);
    const body = findBody(tree);
    if (!body) return { success: false, error: 'Invalid document: no body' };

    const newText = (options as any).text ?? '';

    if (type === 'paragraph' || type === 'p') {
      const newPara = createParagraph(newText);
      if (path === '/') {
        appendChild(body, newPara);
      } else {
        const ref = resolveDocxElement(body, path);
        if (!ref) return { success: false, error: `Reference element not found: ${path}` };
        // 关键：如果父路径指向 cell（w:tc），段落应作为 cell 内部子元素追加
        // （OOXML 模型：w:tc 内可含多个 w:p）；其他场景沿用 insertAfter（同级插入）
        if (ref.tag === 'w:tc') {
          appendChild(ref, newPara);
        } else {
          insertAfter(body, ref, newPara);
        }
      }
      writePart(doc, 'word/document.xml', serializeXml(tree));
      return { success: true, message: `Added paragraph` };
    }

    if (type === 'pageBreak' || type === 'pagebreak') {
      const br = el('w:p', {}, [
        el('w:r', {}, [
          el('w:br', { 'w:type': 'page' }),
        ]),
      ]);
      appendChild(body, br);
      writePart(doc, 'word/document.xml', serializeXml(tree));
      return { success: true, message: 'Added page break' };
    }

    if (type === 'table') {
      const rows = parseInt((options as any).rows ?? '2', 10);
      const cols = parseInt((options as any).cols ?? '2', 10);
      const tbl = createTable(rows, cols);
      if (path === '/') {
        appendChild(body, tbl);
      } else {
        const ref = resolveDocxElement(body, path);
        if (!ref) return { success: false, error: `Reference not found: ${path}` };
        insertAfter(body, ref, tbl);
      }
      writePart(doc, 'word/document.xml', serializeXml(tree));
      return { success: true, message: `Added table ${rows}x${cols}` };
    }

    if (type === 'row') {
      // 在指定表格末尾或指定位置插入空行
      const tbl = resolveDocxElement(body, path);
      if (!tbl || tbl.tag !== 'w:tbl') {
        return { success: false, error: `Table not found or path is not a table: ${path}` };
      }
      const existingRows = childrenOf(tbl, 'w:tr');
      const cols = existingRows.length > 0
        ? childrenOf(existingRows[0], 'w:tc').length
        : childrenOf(childrenOf(tbl, 'w:tblGrid')[0] ?? { children: [] }, 'w:gridCol').length;
      const newRow = createRow(cols);
      appendChild(tbl, newRow);
      writePart(doc, 'word/document.xml', serializeXml(tree));
      return { success: true, message: `Added row (${cols} cells)` };
    }

    if (type === 'column' || type === 'col') {
      // 给表格所有行追加一个空单元格
      const tbl = resolveDocxElement(body, path);
      if (!tbl || tbl.tag !== 'w:tbl') {
        return { success: false, error: `Table not found or path is not a table: ${path}` };
      }
      const rows = childrenOf(tbl, 'w:tr');
      if (rows.length === 0) {
        return { success: false, error: 'Table has no rows' };
      }
      for (const tr of rows) {
        appendChild(tr, el('w:tc', {}, [el('w:p', {}, [])]));
      }
      // 同步更新 tblGrid（如果存在）
      const grid = childrenOf(tbl, 'w:tblGrid')[0];
      if (grid) {
        appendChild(grid, el('w:gridCol', {}));
      }
      writePart(doc, 'word/document.xml', serializeXml(tree));
      const newCols = childrenOf(rows[0], 'w:tc').length;
      return { success: true, message: `Added column (total cols: ${newCols})` };
    }

    return { success: false, error: `Unknown add type: ${type}` };
  }

  // ── Remove ──────────────────────────────────────────────────

  async remove(doc: OOXMLDocument, path: string, _options: CLIOptions): Promise<CommandResult> {
    const xml = readPart(doc, 'word/document.xml');
    const tree = parseXml(xml);
    const body = findBody(tree);
    if (!body) return { success: false, error: 'Invalid document' };

    const elem = resolveDocxElement(body, path);
    if (!elem) return { success: false, error: `Element not found: ${path}` };

    // 关键修复：必须找到 elem 的真正父节点（旧实现总是传 body，导致表格行/单元格静默失败）
    const parent = findParentNode(body, elem);
    if (!parent) {
      return { success: false, error: `Cannot find parent of ${path}` };
    }
    const removed = removeChild(parent, elem);
    if (!removed) {
      return { success: false, error: `Failed to remove ${path}` };
    }
    writePart(doc, 'word/document.xml', serializeXml(tree));
    return { success: true, message: `Removed ${path}`, data: { removed: 1 } };
  }

  // ── Find ────────────────────────────────────────────────────

  async find(doc: OOXMLDocument, pattern: string, _options: CLIOptions): Promise<CommandResult> {
    const xml = readPart(doc, 'word/document.xml');
    const tree = parseXml(xml);
    const body = findBody(tree);

    const isRegex = _options.verbose; // Use verbose flag to indicate regex
    const regex = isRegex ? new RegExp(pattern, 'gi') : null;
    const results: { path: string; text: string }[] = [];

    let bodyIdx = 0;
    for (const child of body?.children ?? []) {
      if (child.type !== 'element') continue;
      bodyIdx++;
      if (child.tag === 'w:p') {
        const t = paraText(child);
        if (matchText(t, pattern, regex)) {
          results.push({ path: `/paragraph[${bodyIdx}]`, text: t.substring(0, 200) });
        }
      } else if (child.tag === 'w:tbl') {
        // Search table cells
        let rowIdx = 0;
        for (const row of childrenOf(child, 'w:tr')) {
          rowIdx++;
          let colIdx = 0;
          for (const cell of childrenOf(row, 'w:tc')) {
            colIdx++;
            for (const p of childrenOf(cell, 'w:p')) {
              const t = paraText(p);
              if (matchText(t, pattern, regex)) {
                results.push({ path: `/table[${bodyIdx}]/row[${rowIdx}]/cell[${colIdx}]`, text: t.substring(0, 200) });
              }
            }
          }
        }
      }
    }

    return { success: true, data: { matches: results.length, results } };
  }

  // ── Replace ─────────────────────────────────────────────────

  async replace(doc: OOXMLDocument, oldText: string, newText: string, _options: CLIOptions): Promise<CommandResult> {
    const xml = readPart(doc, 'word/document.xml');
    const tree = parseXml(xml);

    let count = 0;
    replaceInTree(tree.nodes, oldText, newText, () => { count++; });

    writePart(doc, 'word/document.xml', serializeXml(tree));
    return { success: true, data: { replacements: count } };
  }

  // ── Merge (template) ────────────────────────────────────────

  async merge(doc: OOXMLDocument, jsonData: string, _options: CLIOptions): Promise<CommandResult> {
    let data: Record<string, string>;
    try {
      data = JSON.parse(jsonData);
    } catch {
      return { success: false, error: 'Invalid JSON data' };
    }

    const xml = readPart(doc, 'word/document.xml');
    let modified = xml;
    let count = 0;

    for (const [key, val] of Object.entries(data)) {
      const placeholder = `{{${key}}}`;
      // Simple string replacement in the raw XML
      while (modified.includes(placeholder)) {
        modified = modified.replace(placeholder, escXml(String(val)));
        count++;
      }
    }

    writePart(doc, 'word/document.xml', modified);
    return { success: true, data: { replacements: count } };
  }

  // ── Apply style from template ───────────────────────────────

  async applyStyle(targetDoc: OOXMLDocument, templateDoc: OOXMLDocument, _options: CLIOptions): Promise<CommandResult> {
    const applied: string[] = [];

    // 1. Copy styles.xml from template to target
    if (hasPart(templateDoc, 'word/styles.xml')) {
      const templateStyles = readPart(templateDoc, 'word/styles.xml');
      writePart(targetDoc, 'word/styles.xml', templateStyles);
      applied.push('styles (fonts, heading formats, paragraph defaults)');
    }

    // 2. Copy section properties (page margins, page size) from template to target
    if (hasPart(templateDoc, 'word/document.xml') && hasPart(targetDoc, 'word/document.xml')) {
      const templateXml = readPart(templateDoc, 'word/document.xml');
      const targetXml = readPart(targetDoc, 'word/document.xml');

      // Extract sectPr from template (the last one in body, before </w:body>)
      const templateSectPrMatch = templateXml.match(/<w:sectPr[^>]*>[\s\S]*?<\/w:sectPr>/g);
      if (templateSectPrMatch && templateSectPrMatch.length > 0) {
        // Get the LAST sectPr (which is the final section properties)
        const templateSectPr = templateSectPrMatch[templateSectPrMatch.length - 1];

        // Replace existing sectPr in target, or insert before </w:body>
        let modifiedTarget = targetXml;
        const existingSectPrMatch = targetXml.match(/<w:sectPr[^>]*>[\s\S]*?<\/w:sectPr>/g);
        if (existingSectPrMatch && existingSectPrMatch.length > 0) {
          // Replace the last sectPr
          const lastSectPr = existingSectPrMatch[existingSectPrMatch.length - 1];
          const lastIdx = modifiedTarget.lastIndexOf(lastSectPr);
          modifiedTarget = modifiedTarget.substring(0, lastIdx) + templateSectPr + modifiedTarget.substring(lastIdx + lastSectPr.length);
        } else {
          // Insert before </w:body>
          modifiedTarget = modifiedTarget.replace('</w:body>', templateSectPr + '</w:body>');
        }

        writePart(targetDoc, 'word/document.xml', modifiedTarget);
        applied.push('page layout (margins, page size, orientation)');
      }
    }

    // 3. Copy numbering.xml if exists (for list styles)
    if (hasPart(templateDoc, 'word/numbering.xml')) {
      const templateNumbering = readPart(templateDoc, 'word/numbering.xml');
      writePart(targetDoc, 'word/numbering.xml', templateNumbering);
      applied.push('numbering/list styles');
    }

    if (applied.length === 0) {
      return { success: false, error: 'No styles found in template document' };
    }

    return { success: true, message: `Applied template styles: ${applied.join(', ')}` };
  }

  // ── Validate ────────────────────────────────────────────────

  /**
   * 轻量结构校验：检查 OOXML 合规性问题。
   * - w:tc 第一个子元素必须是块级（w:p 或 w:tbl），不能是 w:r
   * - w:tr 内所有 w:tc 数量一致（列对齐）
   * - w:tbl 必须含 w:tblGrid（推荐，缺失警告）
   * - 关键 part 存在性检查（document.xml / styles.xml）
   */
  async validate(doc: OOXMLDocument, _options: CLIOptions): Promise<CommandResult> {
    const issues: { severity: 'error' | 'warning'; path: string; message: string }[] = [];

    // 1. document.xml 必须存在
    if (!hasPart(doc, 'word/document.xml')) {
      return {
        success: true,
        data: { valid: false, issues: [{ severity: 'error', path: 'word/document.xml', message: 'document.xml 不存在' }] },
      };
    }

    const xml = readPart(doc, 'word/document.xml');
    const tree = parseXml(xml);
    const body = findBody(tree);

    if (!body) {
      return {
        success: true,
        data: { valid: false, issues: [{ severity: 'error', path: 'word/document.xml', message: '缺少 w:body 元素' }] },
      };
    }

    // 2. 遍历所有表格做结构检查
    let tblIdx = 0;
    for (const child of body.children ?? []) {
      if (child.type !== 'element' || child.tag !== 'w:tbl') continue;
      tblIdx++;
      const tblPath = `/table[${tblIdx}]`;

      // 2a. 列对齐：所有 w:tr 的 w:tc 数量应一致
      const rows = childrenOf(child, 'w:tr');
      const colCounts = rows.map(tr => childrenOf(tr, 'w:tc').length);
      const uniqueColCounts = new Set(colCounts);
      if (uniqueColCounts.size > 1) {
        issues.push({
          severity: 'error',
          path: tblPath,
          message: `表格列数不一致：各行 cell 数为 ${colCounts.join(', ')}`,
        });
      }

      // 2b. 每行检查 cell 结构合法性
      let rowIdx = 0;
      for (const tr of rows) {
        rowIdx++;
        let cellIdx = 0;
        for (const tc of childrenOf(tr, 'w:tc')) {
          cellIdx++;
          // tc 的第一个元素子节点必须是块级（w:p 或 w:tbl），不能是 w:r
          const firstElemChild = (tc.children ?? []).find(c => c.type === 'element');
          if (firstElemChild && firstElemChild.tag === 'w:r') {
            issues.push({
              severity: 'error',
              path: `${tblPath}/row[${rowIdx}]/cell[${cellIdx}]`,
              message: 'w:tc 第一个子元素是 w:r（非法），应为 w:p',
            });
          }
          if (!firstElemChild) {
            issues.push({
              severity: 'warning',
              path: `${tblPath}/row[${rowIdx}]/cell[${cellIdx}]`,
              message: 'w:tc 为空（无块级子元素）',
            });
          }
        }
      }

      // 2c. tblGrid 推荐
      if (childrenOf(child, 'w:tblGrid').length === 0) {
        issues.push({
          severity: 'warning',
          path: tblPath,
          message: '表格缺少 w:tblGrid（影响列宽渲染）',
        });
      }
    }

    const errors = issues.filter(i => i.severity === 'error');
    const valid = errors.length === 0;

    return {
      success: true,
      data: {
        valid,
        errorCount: errors.length,
        warningCount: issues.length - errors.length,
        issues,
      },
      message: valid
        ? `文档结构合法（${issues.length} 个警告）`
        : `发现 ${errors.length} 个结构错误`,
    };
  }
}

// ── Helper functions ───────────────────────────────────────────

function findBody(tree: XmlTree): XmlNode | null {
  const doc = tree.nodes.find(n => n.type === 'element' && n.tag === 'w:document');
  if (!doc) return null;
  return childrenOf(doc, 'w:body')[0] ?? null;
}

function paraText(para: XmlNode): string {
  let result = '';
  for (const run of childrenOf(para, 'w:r')) {
    for (const t of childrenOf(run, 'w:t')) {
      result += textOf(t);
    }
  }
  return result;
}

/**
 * 按元素类型智能提取文本。
 * - w:tbl → 行间 \n、cell 间 \t
 * - w:tr  → cell 间 \t
 * - w:tc  → 内部多段落用 \n 分隔
 * - w:p   → 走 paraText（直接子 w:r/w:t）
 * - 其他  → 递归收集所有 w:t 文本（兜底）
 */
function elementText(elem: XmlNode): string {
  if (elem.tag === 'w:tbl') {
    const rows: string[] = [];
    for (const tr of childrenOf(elem, 'w:tr')) {
      const cells = childrenOf(tr, 'w:tc').map(elementText);
      rows.push(cells.join('\t'));
    }
    return rows.join('\n');
  }
  if (elem.tag === 'w:tr') {
    return childrenOf(elem, 'w:tc').map(elementText).join('\t');
  }
  if (elem.tag === 'w:tc') {
    return childrenOf(elem, 'w:p').map(paraText).filter(s => s.length > 0).join('\n');
  }
  if (elem.tag === 'w:p') {
    return paraText(elem);
  }
  // 兜底：递归收集所有 w:t
  return collectAllText(elem);
}

function collectAllText(node: XmlNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (!node.children) return '';
  return node.children.map(collectAllText).join('');
}

/** Resolve a path like "/paragraph[3]" or "/table[1]/row[2]/cell[1]" to an element node. */
function resolveDocxElement(body: XmlNode, path: string): XmlNode | null {
  const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);
  let current: XmlNode | null = body;

  for (const part of parts) {
    if (!current) return null;
    const m = part.match(/^(\w+)\[(\d+)\]$/);
    if (!m) return null;

    const [, segName, idxStr] = m;
    const idx = parseInt(idxStr, 10);
    const tagMap: Record<string, string> = {
      paragraph: 'w:p', run: 'w:r', text: 'w:t',
      table: 'w:tbl', row: 'w:tr', cell: 'w:tc',
      body: 'w:body', image: 'w:drawing',
    };
    const tag = tagMap[segName];
    if (!tag) return null;

    // Count body-level index (including all element types)
    if (current === body) {
      // At body level, index counts ALL element children
      let count = 0;
      for (const c of current.children ?? []) {
        if (c.type !== 'element') continue;
        count++;
        if (count === idx) { current = c; break; }
      }
      if (count < idx) return null;
    } else {
      current = nthChild(current, tag, idx);
    }
  }

  return current;
}

function getElementProp(elem: XmlNode, prop: string): string | null {
  switch (prop) {
    case 'text':
      // 根据元素类型智能提取文本：
      // - w:p    → 段落 run 文本（旧行为，保持兼容）
      // - w:tc   → 单元格内所有 w:p 文本，用 \n 分隔（多段落场景）
      // - w:tr   → 行内所有 cell 文本，用 \t 分隔
      // - w:tbl  → 整表所有行，行间 \n、cell 间 \t
      // - 其他   → 递归收集所有 w:t 文本
      return elementText(elem);
    case 'style': {
      const pPr = childrenOf(elem, 'w:pPr')[0];
      if (!pPr) return 'Normal';
      const pStyle = childrenOf(pPr, 'w:pStyle')[0];
      return pStyle?.attrs?.['w:val'] ?? 'Normal';
    }
    case 'bold': {
      const rPr = findRunProp(elem);
      const b = childrenOf(rPr, 'w:b')[0];
      return b ? 'true' : 'false';
    }
    case 'italic': {
      const rPr = findRunProp(elem);
      const i = childrenOf(rPr, 'w:i')[0];
      return i ? 'true' : 'false';
    }
    case 'fontSize': {
      const rPr = findRunProp(elem);
      const sz = childrenOf(rPr, 'w:sz')[0];
      return sz?.attrs?.['w:val'] ? String(parseInt(sz.attrs['w:val'], 10) / 2) + 'pt' : null;
    }
    case 'color': {
      const rPr = findRunProp(elem);
      const c = childrenOf(rPr, 'w:color')[0];
      return c?.attrs?.['w:val'] ?? null;
    }
    case 'rows': {
      if (elem.tag !== 'w:tbl') return null;
      return String(childrenOf(elem, 'w:tr').length);
    }
    case 'cols': {
      if (elem.tag !== 'w:tbl') return null;
      const firstRow = childrenOf(elem, 'w:tr')[0];
      if (!firstRow) return '0';
      return String(childrenOf(firstRow, 'w:tc').length);
    }
    case 'cells': {
      if (elem.tag !== 'w:tbl') return null;
      const matrix: string[][] = [];
      for (const tr of childrenOf(elem, 'w:tr')) {
        const row: string[] = [];
        for (const tc of childrenOf(tr, 'w:tc')) {
          let text = '';
          for (const p of childrenOf(tc, 'w:p')) {
            text += paraText(p);
          }
          row.push(text);
        }
        matrix.push(row);
      }
      return JSON.stringify(matrix);
    }
    case 'runs': {
      // 返回 run 级数组：[{text, bold, italic, fontSize, color}]
      const runs = childrenOf(elem, 'w:r');
      const result = runs.map(r => {
        const rPr = childrenOf(r, 'w:rPr')[0];
        const text = childrenOf(r, 'w:t').map(t => textOf(t)).join('');
        const bold = rPr && childrenOf(rPr, 'w:b').length > 0;
        const italic = rPr && childrenOf(rPr, 'w:i').length > 0;
        const sz = rPr && childrenOf(rPr, 'w:sz')[0];
        const color = rPr && childrenOf(rPr, 'w:color')[0];
        return {
          text,
          bold: !!bold,
          italic: !!italic,
          ...(sz?.attrs?.['w:val'] ? { fontSize: String(parseInt(sz.attrs['w:val'], 10) / 2) + 'pt' } : {}),
          ...(color?.attrs?.['w:val'] ? { color: color.attrs['w:val'] } : {}),
        };
      });
      return JSON.stringify(result);
    }
    default:
      return elem.attrs?.[prop] ?? null;
  }
}

function findRunProp(para: XmlNode): XmlNode {
  const run = childrenOf(para, 'w:r')[0];
  if (run) {
    const rPr = childrenOf(run, 'w:rPr')[0];
    if (rPr) return rPr;
  }
  const pPr = childrenOf(para, 'w:pPr')[0];
  return pPr ?? { type: 'element', tag: 'w:rPr', attrs: {}, children: [] };
}

function setElementProp(elem: XmlNode, prop: string, value: string, tree: XmlTree): boolean {
  switch (prop) {
    case 'text': {
      // 表格单元格 (w:tc) 内部必须先有 w:p，再把 w:r 放入 w:p，否则会产生
      // 非法结构 <w:tc><w:r>...</w:r><w:p/></w:tc>，Word/python-docx 读不到内容。
      const target = ensureParagraphHost(elem);
      // Find or create w:r > w:t inside the host paragraph
      let run = childrenOf(target, 'w:r')[0];
      if (!run) {
        run = el('w:r', {}, [el('w:t', { 'xml:space': 'preserve' }, [txt(value)])]);
        // Ensure w:pPr comes before w:r
        const pPr = childrenOf(target, 'w:pPr')[0];
        if (pPr) {
          insertAfter(target, pPr, run);
        } else {
          target.children!.unshift(run);
        }
        return true;
      }
      let tNode = childrenOf(run, 'w:t')[0];
      if (!tNode) {
        tNode = el('w:t', { 'xml:space': 'preserve' }, [txt(value)]);
        appendChild(run, tNode);
      } else {
        tNode.children = [txt(value)];
      }
      return true;
    }
    case 'bold': {
      setRunFormatting(ensureParagraphHost(elem), 'w:b', value !== 'false');
      return true;
    }
    case 'italic': {
      setRunFormatting(ensureParagraphHost(elem), 'w:i', value !== 'false');
      return true;
    }
    case 'fontSize': {
      const halfPts = Math.round(parseFloat(value) * 2);
      setRunFormatting(ensureParagraphHost(elem), 'w:sz', true, String(halfPts));
      return true;
    }
    case 'color': {
      setRunFormatting(ensureParagraphHost(elem), 'w:color', true, value);
      return true;
    }
    case 'alignment': {
      // OOXML 标准要求对齐放在 <w:pPr><w:jc w:val="..."/></w:pPr>
      const p = ensureParagraphHost(elem);
      let pPr = childrenOf(p, 'w:pPr')[0];
      if (!pPr) {
        pPr = el('w:pPr', {}, []);
        p.children!.unshift(pPr);
      }
      let jc = childrenOf(pPr, 'w:jc')[0];
      if (!jc) {
        jc = el('w:jc', {}, []);
        appendChild(pPr, jc);
      }
      if (!jc.attrs) jc.attrs = {};
      jc.attrs['w:val'] = value;
      return true;
    }
    case 'width': {
      // 表格宽度：<w:tbl><w:tblPr><w:tblW w:w="..." w:type="..."/></w:tblPr>
      if (elem.tag === 'w:tbl') {
        let tblPr = childrenOf(elem, 'w:tblPr')[0];
        if (!tblPr) {
          tblPr = el('w:tblPr', {}, []);
          elem.children!.unshift(tblPr);
        }
        let tblW = childrenOf(tblPr, 'w:tblW')[0];
        if (!tblW) {
          tblW = el('w:tblW', {}, []);
          appendChild(tblPr, tblW);
        }
        if (!tblW.attrs) tblW.attrs = {};
        tblW.attrs['w:w'] = value;
        tblW.attrs['w:type'] = 'dxa';
        return true;
      }
      // 其他场景降级为属性挂载
      if (elem.attrs) {
        elem.attrs[prop] = value;
        return true;
      }
      return false;
    }
    default:
      if (elem.attrs) {
        elem.attrs[prop] = value;
        return true;
      }
      return false;
  }
}

/**
 * 确保返回一个合法的段落宿主（w:p）用于挂载 w:r。
 * - 如果 elem 本身就是 w:p，直接返回
 * - 如果 elem 是 w:tc（表格单元格），返回/创建其内部的第一个 w:p
 * - 其他情况返回 elem 自身（让默认行为兼容旘认法）
 */
function ensureParagraphHost(elem: XmlNode): XmlNode {
  if (elem.tag === 'w:p') return elem;
  if (elem.tag === 'w:tc') {
    let p = childrenOf(elem, 'w:p')[0];
    if (!p) {
      p = el('w:p', {}, []);
      // tc 内部第一个子元素应为块级 w:p
      elem.children = [p, ...(elem.children ?? [])];
    }
    return p;
  }
  return elem;
}

function setRunFormatting(para: XmlNode, tag: string, on: boolean, val?: string): void {
  let run = childrenOf(para, 'w:r')[0];
  if (!run) {
    run = el('w:r', {}, []);
    appendChild(para, run);
  }
  let rPr = childrenOf(run, 'w:rPr')[0];
  if (!rPr) {
    rPr = el('w:rPr', {}, []);
    run.children!.unshift(rPr);
  }
  const existing = childrenOf(rPr, tag)[0];
  if (on) {
    if (existing) {
      if (val !== undefined && existing.attrs) existing.attrs['w:val'] = val;
    } else {
      const attrs: Record<string, string> = {};
      if (val !== undefined) attrs['w:val'] = val;
      appendChild(rPr, el(tag, attrs));
    }
  } else {
    if (existing) removeChild(rPr, existing);
  }
}

function createParagraph(text: string): XmlNode {
  const children: XmlNode[] = [];
  if (text) {
    children.push(el('w:r', {}, [
      el('w:t', { 'xml:space': 'preserve' }, [txt(text)]),
    ]));
  }
  return el('w:p', {}, children);
}

function createTable(rows: number, cols: number): XmlNode {
  const trs: XmlNode[] = [];
  for (let r = 0; r < rows; r++) {
    trs.push(createRow(cols));
  }
  return el('w:tbl', {}, [
    el('w:tblPr', {}, [
      el('w:tblStyle', { 'w:val': 'TableGrid' }),
      el('w:tblW', { 'w:w': '0', 'w:type': 'auto' }),
    ]),
    el('w:tblGrid', {}, Array(cols).fill(null).map(() => el('w:gridCol', {}))),
    ...trs,
  ]);
}

/** 创建一个包含 cols 个空单元格的表格行 */
function createRow(cols: number): XmlNode {
  const tcs: XmlNode[] = [];
  for (let c = 0; c < cols; c++) {
    tcs.push(el('w:tc', {}, [el('w:p', {}, [])]));
  }
  return el('w:tr', {}, tcs);
}

/**
 * 在 root 子树内 DFS 搜索 target 节点的真正父节点。
 * 用于 remove 操作：elem 可能是 w:tr / w:tc，其父级不是 body。
 */
function findParentNode(root: XmlNode, target: XmlNode): XmlNode | null {
  if (!root.children) return null;
  for (const child of root.children) {
    if (child === target) return root;
    if (child.type === 'element') {
      const found = findParentNode(child, target);
      if (found) return found;
    }
  }
  return null;
}

function replaceInTree(nodes: XmlNode[], oldText: string, newText: string, onReplace: () => void): void {
  for (const node of nodes) {
    if (node.type === 'text' && node.text) {
      if (node.text.includes(oldText)) {
        const count = node.text.split(oldText).length - 1;
        node.text = node.text.split(oldText).join(newText);
        for (let i = 0; i < count; i++) onReplace();
      }
    }
    if (node.children) replaceInTree(node.children, oldText, newText, onReplace);
  }
}

function matchText(text: string, pattern: string, regex: RegExp | null): boolean {
  if (regex) return regex.test(text);
  return text.toLowerCase().includes(pattern.toLowerCase());
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
