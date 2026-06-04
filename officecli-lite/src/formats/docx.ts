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
        structure.push({ path: `/table[${idx}]`, type: 'table', rows, cols });
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
        insertAfter(body, ref, newPara);
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

    removeChild(body, elem);
    writePart(doc, 'word/document.xml', serializeXml(tree));
    return { success: true, message: `Removed ${path}` };
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
      return paraText(elem);
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
      // Find or create w:r > w:t
      let run = childrenOf(elem, 'w:r')[0];
      if (!run) {
        run = el('w:r', {}, [el('w:t', { 'xml:space': 'preserve' }, [txt(value)])]);
        // Ensure w:pPr comes before w:r
        const pPr = childrenOf(elem, 'w:pPr')[0];
        if (pPr) {
          insertAfter(elem, pPr, run);
        } else {
          elem.children!.unshift(run);
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
      setRunFormatting(elem, 'w:b', value !== 'false');
      return true;
    }
    case 'italic': {
      setRunFormatting(elem, 'w:i', value !== 'false');
      return true;
    }
    case 'fontSize': {
      const halfPts = Math.round(parseFloat(value) * 2);
      setRunFormatting(elem, 'w:sz', true, String(halfPts));
      return true;
    }
    case 'color': {
      setRunFormatting(elem, 'w:color', true, value);
      return true;
    }
    default:
      if (elem.attrs) {
        elem.attrs[prop] = value;
        return true;
      }
      return false;
  }
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
    const tcs: XmlNode[] = [];
    for (let c = 0; c < cols; c++) {
      tcs.push(el('w:tc', {}, [el('w:p', {}, [])]));
    }
    trs.push(el('w:tr', {}, tcs));
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
