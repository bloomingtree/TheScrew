/**
 * xlsx.ts — XLSX format handler
 *
 * Handles Excel .xlsx files. Supports shared strings, cell references,
 * and basic formula operations. Only loads target sheet XML parts.
 */

import * as fs from 'fs';
import PizZip from 'pizzip';
import { BaseDocumentHandler } from './base';
import { readPart, writePart, listParts } from '../core/ooxml';
import { parseXml, serializeXml, nthChild, childrenOf, textOf, el, txt, appendChild, removeChild } from '../core/xml-tree';
import type { OOXMLDocument, CLIOptions, CommandResult } from '../types';
import type { XmlTree, XmlNode } from '../core/xml-tree';

// ── Create ─────────────────────────────────────────────────────

export class XlsxHandler extends BaseDocumentHandler {
  async create(filePath: string): Promise<void> {
    const zip = new PizZip();
    zip.file('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>');
    zip.file('xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>');
    zip.file('xl/worksheets/sheet1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>');
    zip.file('xl/sharedStrings.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>');
    zip.file('xl/styles.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>');
    zip.file('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.file('xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    fs.writeFileSync(filePath, zip.generate({ type: 'nodebuffer' }) as Buffer);
  }

  // ── View ────────────────────────────────────────────────────

  async view(doc: OOXMLDocument, options: CLIOptions): Promise<CommandResult> {
    const wbXml = readPart(doc, 'xl/workbook.xml');
    const wbTree = parseXml(wbXml);
    const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

    const wb = wbTree.nodes.find(n => n.type === 'element')!;
    const sheetsEl = childrenOf(wb, `${ns}:sheets`)[0] ?? childrenOf(wb, 'sheets')[0];
    const sheetEntries = sheetsEl ? childrenOf(sheetsEl, `${ns}:sheet`).length || childrenOf(sheetsEl, 'sheet').length : 0;

    const sheets: { name: string; index: number; rows: number; cols: number }[] = [];
    for (let i = 1; i <= sheetEntries; i++) {
      const sheetPath = `xl/worksheets/sheet${i}.xml`;
      try {
        const sXml = readPart(doc, sheetPath);
        const sTree = parseXml(sXml);
        const ws = sTree.nodes.find(n => n.type === 'element')!;
        const sd = childrenOf(ws, `${ns}:sheetData`)[0] ?? childrenOf(ws, 'sheetData')[0];
        const rows = sd ? childrenOf(sd, `${ns}:row`).length || childrenOf(sd, 'row').length : 0;
        let maxCol = 0;
        if (sd) {
          const allRows = childrenOf(sd, `${ns}:row`).length ? childrenOf(sd, `${ns}:row`) : childrenOf(sd, 'row');
          for (const row of allRows) {
            const cells = childrenOf(row, `${ns}:c`).length ? childrenOf(row, `${ns}:c`) : childrenOf(row, 'c');
            maxCol = Math.max(maxCol, cells.length);
          }
        }
        const sheetName = sheetsEl ? (nthChild(sheetsEl, `${ns}:sheet`, i) ?? nthChild(sheetsEl, 'sheet', i))?.attrs?.['name'] : `Sheet${i}`;
        sheets.push({ name: sheetName ?? `Sheet${i}`, index: i, rows, cols: maxCol });
      } catch {
        sheets.push({ name: `Sheet${i}`, index: i, rows: 0, cols: 0 });
      }
    }

    return { success: true, data: { type: 'xlsx', sheetCount: sheetEntries, sheets } };
  }

  // ── Get ─────────────────────────────────────────────────────

  async get(doc: OOXMLDocument, path: string, prop: string, _options: CLIOptions): Promise<CommandResult> {
    const { sheetIdx, cellRef, rowIdx } = parseXlsxPath(path);
    const sheetPath = `xl/worksheets/sheet${sheetIdx}.xml`;

    let xml: string;
    try { xml = readPart(doc, sheetPath); } catch { return { success: false, error: `Sheet ${sheetIdx} not found` }; }

    const tree = parseXml(xml);
    const ws = tree.nodes.find(n => n.type === 'element')!;

    if (cellRef) {
      const cell = findCell(ws, cellRef);
      if (!cell) return { success: false, error: `Cell ${cellRef} not found` };

      const value = getCellValue(doc, cell);
      if (prop === 'value') return { success: true, data: { path, cell: cellRef, value } };
      if (prop === 'formula') {
        const f = childrenOf(cell, findNs(ws, 'f'))[0];
        return { success: true, data: { path, cell: cellRef, formula: f ? textOf(f) : null } };
      }
      return { success: true, data: { path, cell: cellRef, value, type: cell.attrs?.['t'] ?? 'n' } };
    }

    if (rowIdx) {
      const row = findRow(ws, rowIdx);
      if (!row) return { success: false, error: `Row ${rowIdx} not found` };
      const ns = findNs(ws, 'c');
      const cells = childrenOf(row, ns).map((c: XmlNode) => ({
        ref: c.attrs?.['r'] ?? '',
        value: getCellValue(doc, c),
      }));
      return { success: true, data: { path, row: rowIdx, cells } };
    }

    return { success: false, error: 'Invalid path' };
  }

  // ── Set ─────────────────────────────────────────────────────

  async set(doc: OOXMLDocument, path: string, prop: string, value: string, _options: CLIOptions): Promise<CommandResult> {
    const { sheetIdx, cellRef } = parseXlsxPath(path);
    const sheetPath = `xl/worksheets/sheet${sheetIdx}.xml`;

    let xml: string;
    try { xml = readPart(doc, sheetPath); } catch { return { success: false, error: `Sheet ${sheetIdx} not found` }; }

    const tree = parseXml(xml);
    const ws = tree.nodes.find(n => n.type === 'element')!;
    const ns = findNs(ws, 'sheetData');
    const sd = childrenOf(ws, ns)[0];
    if (!sd) return { success: false, error: 'No sheetData' };

    let cell = findCell(ws, cellRef ?? 'A1');
    if (!cell) {
      // Create cell
      const row = findOrCreateRow(sd, cellRef ?? 'A1', ws);
      const rowNs = findNs(row, 'c');
      cell = el(rowNs, { r: cellRef ?? 'A1', t: 's' }, [el(findNs(ws, 'v'), {}, [txt('0')])]);
      appendChild(row, cell);
    }

    if (prop === 'value') {
      const isFormula = value.startsWith('=');
      if (isFormula) {
        delete cell.attrs!['t'];
        // Remove existing v and f
        cell.children = cell.children?.filter((c: XmlNode) => {
          const tag = c.tag ?? '';
          return !tag.endsWith(':v') && !tag.endsWith(':f') && tag !== 'v' && tag !== 'f';
        }) ?? [];
        cell.children!.push(el(findNs(ws, 'f'), {}, [txt(value.substring(1))]));
      } else {
        const numVal = Number(value);
        if (!isNaN(numVal) && value.trim() !== '') {
          delete cell.attrs!['t'];
          setCellValue(cell, String(numVal), ws);
        } else {
          // String value — use shared strings
          const ssIdx = addSharedString(doc, value);
          cell.attrs!['t'] = 's';
          setCellValue(cell, String(ssIdx), ws);
        }
      }
    } else if (prop === 'formula') {
      // Remove existing formula
      const fNs = findNs(ws, 'f');
      cell.children = cell.children?.filter(c => c.tag !== fNs) ?? [];
      cell.children!.push(el(fNs, {}, [txt(value)]));
    }

    writePart(doc, sheetPath, serializeXml(tree));
    return { success: true, message: `Set ${cellRef} ${prop}="${value}"` };
  }

  // ── Add ─────────────────────────────────────────────────────

  async add(doc: OOXMLDocument, path: string, type: string, options: CLIOptions): Promise<CommandResult> {
    const { sheetIdx } = parseXlsxPath(path);

    if (type === 'sheet') {
      const name = (options as any).name ?? `Sheet${sheetIdx + 1}`;
      const newIndex = sheetIdx + 1;
      const sheetPath = `xl/worksheets/sheet${newIndex}.xml`;

      // Create new sheet
      const zip = doc.zip as PizZip;
      zip.file(sheetPath,
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>');

      // Update workbook
      const wbXml = readPart(doc, 'xl/workbook.xml');
      const wbTree = parseXml(wbXml);
      const wb = wbTree.nodes.find(n => n.type === 'element')!;
      const ns = findNs(wb, 'sheets');
      const sheetsEl = childrenOf(wb, ns)[0];
      if (sheetsEl) {
        const sheetNs = findNs(sheetsEl, 'sheet');
        appendChild(sheetsEl, el(sheetNs, { name, sheetId: String(newIndex), 'r:id': `rId${newIndex}` }));
      }
      writePart(doc, 'xl/workbook.xml', serializeXml(wbTree));

      return { success: true, message: `Added sheet "${name}"` };
    }

    return { success: false, error: `Unknown add type: ${type}` };
  }

  // ── Remove ──────────────────────────────────────────────────

  async remove(doc: OOXMLDocument, path: string, _options: CLIOptions): Promise<CommandResult> {
    const { sheetIdx, cellRef, rowIdx } = parseXlsxPath(path);

    if (cellRef || rowIdx) {
      const sheetPath = `xl/worksheets/sheet${sheetIdx}.xml`;
      let xml: string;
      try { xml = readPart(doc, sheetPath); } catch { return { success: false, error: `Sheet not found` }; }

      const tree = parseXml(xml);
      const ws = tree.nodes.find(n => n.type === 'element')!;

      if (rowIdx) {
        const row = findRow(ws, rowIdx);
        if (!row) return { success: false, error: `Row ${rowIdx} not found` };
        const sd = childrenOf(ws, findNs(ws, 'sheetData'))[0];
        removeChild(sd, row);
      } else if (cellRef) {
        const cell = findCell(ws, cellRef);
        if (!cell) return { success: false, error: `Cell ${cellRef} not found` };
        const row = findRow(ws, parseInt(cellRef.match(/\d+/)?.[0] ?? '1', 10));
        if (row) removeChild(row, cell);
      }

      writePart(doc, sheetPath, serializeXml(tree));
      return { success: true, message: `Removed ${path}` };
    }

    return { success: false, error: 'Cannot remove entire sheet (path too vague)' };
  }

  // ── Find ────────────────────────────────────────────────────

  async find(doc: OOXMLDocument, pattern: string, _options: CLIOptions): Promise<CommandResult> {
    const results: { sheet: number; cell: string; value: string }[] = [];
    const wbXml = readPart(doc, 'xl/workbook.xml');
    const wbTree = parseXml(wbXml);
    const wb = wbTree.nodes.find(n => n.type === 'element')!;
    const ns = findNs(wb, 'sheets');
    const sheetsEl = childrenOf(wb, ns)[0];
    const sheetCount = sheetsEl ? childrenOf(sheetsEl, findNs(sheetsEl, 'sheet')).length : 0;

    for (let s = 1; s <= sheetCount; s++) {
      try {
        const sheetXml = readPart(doc, `xl/worksheets/sheet${s}.xml`);
        const tree = parseXml(sheetXml);
        const ws = tree.nodes.find(n => n.type === 'element')!;
        const sd = childrenOf(ws, findNs(ws, 'sheetData'))[0];
        if (!sd) continue;

        const rowNs = findNs(sd, 'row');
        for (const row of childrenOf(sd, rowNs)) {
          const cNs = findNs(row, 'c');
          for (const cell of childrenOf(row, cNs)) {
            const val = getCellValue(doc, cell);
            if (val && val.toLowerCase().includes(pattern.toLowerCase())) {
              results.push({ sheet: s, cell: cell.attrs?.['r'] ?? '', value: val.substring(0, 200) });
            }
          }
        }
      } catch { /* skip unreadable sheets */ }
    }

    return { success: true, data: { matches: results.length, results } };
  }

  // ── Replace ─────────────────────────────────────────────────

  async replace(doc: OOXMLDocument, oldText: string, newText: string, _options: CLIOptions): Promise<CommandResult> {
    let count = 0;

    // Replace in shared strings first
    let ssModified = false;
    try {
      const ssXml = readPart(doc, 'xl/sharedStrings.xml');
      if (ssXml.includes(oldText)) {
        const modified = ssXml.split(oldText).join(newText);
        writePart(doc, 'xl/sharedStrings.xml', modified);
        ssModified = true;
      }
    } catch { /* no shared strings */ }

    // Also replace inline strings in sheets
    const wbXml = readPart(doc, 'xl/workbook.xml');
    const wbTree = parseXml(wbXml);
    const wb = wbTree.nodes.find(n => n.type === 'element')!;
    const ns = findNs(wb, 'sheets');
    const sheetsEl = childrenOf(wb, ns)[0];
    const sheetCount = sheetsEl ? childrenOf(sheetsEl, findNs(sheetsEl, 'sheet')).length : 0;

    for (let s = 1; s <= sheetCount; s++) {
      try {
        const sp = `xl/worksheets/sheet${s}.xml`;
        const xml = readPart(doc, sp);
        if (xml.includes(oldText)) {
          writePart(doc, sp, xml.split(oldText).join(newText));
          count++;
        }
      } catch { /* skip */ }
    }

    if (ssModified) count++;
    return { success: true, data: { replacements: count } };
  }

  // ── Merge ───────────────────────────────────────────────────

  async merge(doc: OOXMLDocument, jsonData: string, _options: CLIOptions): Promise<CommandResult> {
    let data: Record<string, string>;
    try { data = JSON.parse(jsonData); } catch { return { success: false, error: 'Invalid JSON' }; }

    let count = 0;
    const parts = listParts(doc).filter(p => p.endsWith('.xml'));
    for (const part of parts) {
      let xml = readPart(doc, part);
      let modified = false;
      for (const [key, val] of Object.entries(data)) {
        const ph = `{{${key}}}`;
        if (xml.includes(ph)) {
          xml = xml.split(ph).join(escXml(String(val)));
          modified = true;
        }
      }
      if (modified) {
        writePart(doc, part, xml);
        count++;
      }
    }

    return { success: true, data: { partsModified: count } };
  }
}

// ── Helpers ────────────────────────────────────────────────────

interface XlsxPathInfo {
  sheetIdx: number;
  cellRef: string | null;
  rowIdx: number | null;
}

function parseXlsxPath(path: string): XlsxPathInfo {
  const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);
  let sheetIdx = 1;
  let cellRef: string | null = null;
  let rowIdx: number | null = null;

  for (const part of parts) {
    const m = part.match(/^(\w+)\[(.+)\]$/);
    if (!m) continue;
    const [, name, val] = m;
    if (name === 'sheet') {
      sheetIdx = parseInt(val, 10);
    } else if (name === 'cell') {
      cellRef = val;
    } else if (name === 'row') {
      rowIdx = parseInt(val, 10);
    }
  }

  return { sheetIdx, cellRef, rowIdx };
}

function findNs(parent: XmlNode, localName: string): string {
  // Check if children use namespace-prefixed tags
  if (parent.children) {
    for (const c of parent.children) {
      if (c.type === 'element' && c.tag) {
        const colonIdx = c.tag.indexOf(':');
        if (colonIdx > 0) {
          const prefix = c.tag.substring(0, colonIdx);
          return `${prefix}:${localName}`;
        }
        if (c.tag === localName) return localName;
      }
    }
  }
  // Check parent tag prefix
  if (parent.tag) {
    const colonIdx = parent.tag.indexOf(':');
    if (colonIdx > 0) {
      return parent.tag.substring(0, colonIdx) + ':' + localName;
    }
  }
  // Check attrs for xmlns
  if (parent.attrs) {
    for (const [k] of Object.entries(parent.attrs)) {
      if (k === 'xmlns') return localName;
    }
  }
  return localName;
}

function findCell(ws: XmlNode, cellRef: string): XmlNode | null {
  const sd = childrenOf(ws, findNs(ws, 'sheetData'))[0];
  if (!sd) return null;
  const rowNs = findNs(sd, 'row');
  const rowNr = parseInt(cellRef.match(/\d+/)?.[0] ?? '0', 10);

  for (const row of childrenOf(sd, rowNs)) {
    const rowAttr = row.attrs?.['r'];
    if (rowAttr && parseInt(rowAttr, 10) === rowNr) {
      const cNs = findNs(row, 'c');
      for (const cell of childrenOf(row, cNs)) {
        if (cell.attrs?.['r'] === cellRef) return cell;
      }
    }
  }
  return null;
}

function findRow(ws: XmlNode, rowNr: number): XmlNode | null {
  const sd = childrenOf(ws, findNs(ws, 'sheetData'))[0];
  if (!sd) return null;
  const rowNs = findNs(sd, 'row');
  for (const row of childrenOf(sd, rowNs)) {
    if (row.attrs?.['r'] === String(rowNr)) return row;
  }
  // Try by index
  return nthChild(sd, rowNs, rowNr);
}

function findOrCreateRow(sd: XmlNode, cellRef: string, ws: XmlNode): XmlNode {
  const rowNr = parseInt(cellRef.match(/\d+/)?.[0] ?? '1', 10);
  const rowNs = findNs(sd, 'row');
  for (const row of childrenOf(sd, rowNs)) {
    if (row.attrs?.['r'] === String(rowNr)) return row;
  }
  // Create new row
  const newRow = el(rowNs, { r: String(rowNr) }, []);
  appendChild(sd, newRow);
  return newRow;
}

function getCellValue(doc: OOXMLDocument, cell: XmlNode): string {
  const vNs = findNs(cell, 'v');
  const vNode = childrenOf(cell, vNs)[0];
  const rawValue = vNode ? textOf(vNode) : '';

  // Check if it's a shared string reference
  const cellType = cell.attrs?.['t'];
  if (cellType === 's' && rawValue) {
    const ssIdx = parseInt(rawValue, 10);
    try {
      const ssXml = readPart(doc, 'xl/sharedStrings.xml');
      const ssTree = parseXml(ssXml);
      const sst = ssTree.nodes.find(n => n.type === 'element')!;
      const siNs = findNs(sst, 'si');
      const si = nthChild(sst, siNs, ssIdx + 1);
      if (si) return textOf(si);
    } catch { /* no shared strings */ }
  }

  // Check for formula
  const fNs = findNs(cell, 'f');
  const fNode = childrenOf(cell, fNs)[0];
  if (fNode) {
    const formula = textOf(fNode);
    return rawValue ? `${formula} = ${rawValue}` : formula;
  }

  return rawValue;
}

function setCellValue(cell: XmlNode, value: string, ws: XmlNode): void {
  const vNs = findNs(cell, 'v');
  let vNode = childrenOf(cell, vNs)[0];
  if (!vNode) {
    vNode = el(vNs, {}, [txt(value)]);
    appendChild(cell, vNode);
  } else {
    vNode.children = [txt(value)];
  }
}

function addSharedString(doc: OOXMLDocument, text: string): number {
  let ssXml: string;
  try {
    ssXml = readPart(doc, 'xl/sharedStrings.xml');
  } catch {
    return 0;
  }

  const ssTree = parseXml(ssXml);
  const sst = ssTree.nodes.find(n => n.type === 'element')!;
  const siNs = findNs(sst, 'si');
  const existing = childrenOf(sst, siNs);

  // Check if string already exists
  for (let i = 0; i < existing.length; i++) {
    if (textOf(existing[i]) === text) return i;
  }

  // Add new shared string
  const tNs = findNs(sst, 't');
  const newSi = el(siNs, {}, [el(tNs, {}, [txt(text)])]);
  appendChild(sst, newSi);

  // Update count/uniqueCount
  if (sst.attrs) {
    sst.attrs['uniqueCount'] = String(existing.length + 1);
    sst.attrs['count'] = String((parseInt(sst.attrs['count'] ?? '0', 10) || 0) + 1);
  }

  writePart(doc, 'xl/sharedStrings.xml', serializeXml(ssTree));
  return existing.length;
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
