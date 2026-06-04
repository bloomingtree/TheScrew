/**
 * pptx.ts — PPTX format handler
 *
 * Handles PowerPoint .pptx files. Supports slides, shapes, text,
 * and basic shape properties. Only loads target slide XML parts.
 */

import * as fs from 'fs';
import PizZip from 'pizzip';
import { BaseDocumentHandler } from './base';
import { readPart, writePart, listParts, hasPart } from '../core/ooxml';
import { parseXml, serializeXml, nthChild, childrenOf, textOf, el, txt, appendChild, removeChild, insertAfter } from '../core/xml-tree';
import type { OOXMLDocument, CLIOptions, CommandResult } from '../types';
import type { XmlTree, XmlNode } from '../core/xml-tree';

// EMU constants
const EMU_PER_CM = 360000;
const EMU_PER_INCH = 914400;
const EMU_PER_PT = 12700;

// ── Create ─────────────────────────────────────────────────────

export class PptxHandler extends BaseDocumentHandler {
  async create(filePath: string): Promise<void> {
    const zip = new PizZip();
    zip.file('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' +
      '</Types>');
    zip.file('ppt/presentation.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>' +
      '<p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>' +
      '</p:presentation>');
    zip.file('ppt/slides/slide1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr/></p:spTree></p:cSld></p:sld>');
    zip.file('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>');
    zip.file('ppt/_rels/presentation.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>');
    fs.writeFileSync(filePath, zip.generate({ type: 'nodebuffer' }) as Buffer);
  }

  // ── View ────────────────────────────────────────────────────

  async view(doc: OOXMLDocument, options: CLIOptions): Promise<CommandResult> {
    const slideCount = countSlides(doc);
    const slides: { index: number; shapes: { name: string; type: string; text: string; path: string }[] }[] = [];

    for (let i = 1; i <= slideCount; i++) {
      const sp = `ppt/slides/slide${i}.xml`;
      try {
        const xml = readPart(doc, sp);
        const tree = parseXml(xml);
        const shapes = extractShapes(tree);
        slides.push({ index: i, shapes });
      } catch {
        slides.push({ index: i, shapes: [] });
      }
    }

    return { success: true, data: { type: 'pptx', slideCount, slides } };
  }

  // ── Get ─────────────────────────────────────────────────────

  async get(doc: OOXMLDocument, path: string, prop: string, _options: CLIOptions): Promise<CommandResult> {
    const { slideIdx, shapeIdx } = parsePptxPath(path);
    const sp = `ppt/slides/slide${slideIdx}.xml`;

    let xml: string;
    try { xml = readPart(doc, sp); } catch { return { success: false, error: `Slide ${slideIdx} not found` }; }

    const tree = parseXml(xml);
    const shape = findShape(tree, shapeIdx ?? 1);
    if (!shape) return { success: false, error: `Shape ${shapeIdx} not found on slide ${slideIdx}` };

    const value = getShapeProp(shape, prop);
    if (value === null) return { success: false, error: `Property "${prop}" not found` };
    return { success: true, data: { path, property: prop, value } };
  }

  // ── Set ─────────────────────────────────────────────────────

  async set(doc: OOXMLDocument, path: string, prop: string, value: string, _options: CLIOptions): Promise<CommandResult> {
    const { slideIdx, shapeIdx } = parsePptxPath(path);
    const sp = `ppt/slides/slide${slideIdx}.xml`;

    let xml: string;
    try { xml = readPart(doc, sp); } catch { return { success: false, error: `Slide ${slideIdx} not found` }; }

    const tree = parseXml(xml);
    const shape = findShape(tree, shapeIdx ?? 1);
    if (!shape) return { success: false, error: `Shape ${shapeIdx} not found` };

    const ok = setShapeProp(shape, prop, value);
    if (!ok) return { success: false, error: `Cannot set "${prop}"` };

    writePart(doc, sp, serializeXml(tree));
    return { success: true, message: `Set ${prop}="${value}" at ${path}` };
  }

  // ── Add ─────────────────────────────────────────────────────

  async add(doc: OOXMLDocument, path: string, type: string, options: CLIOptions): Promise<CommandResult> {
    if (type === 'slide') {
      return addSlide(doc);
    }

    const { slideIdx } = parsePptxPath(path);
    const sp = `ppt/slides/slide${slideIdx}.xml`;
    let xml: string;
    try { xml = readPart(doc, sp); } catch { return { success: false, error: `Slide ${slideIdx} not found` }; }

    const tree = parseXml(xml);
    const spTree = findSpTree(tree);

    if (type === 'shape' || type === 'rect') {
      const x = parseUnit((options as any).x ?? '2cm');
      const y = parseUnit((options as any).y ?? '2cm');
      const w = parseUnit((options as any).width ?? '5cm');
      const h = parseUnit((options as any).height ?? '3cm');
      const text = (options as any).text ?? '';
      const newShape = createRectShape(nextId(spTree), x, y, w, h, text);
      appendChild(spTree, newShape);
      writePart(doc, sp, serializeXml(tree));
      return { success: true, message: 'Added shape' };
    }

    if (type === 'textbox' || type === 'text') {
      const x = parseUnit((options as any).x ?? '2cm');
      const y = parseUnit((options as any).y ?? '2cm');
      const w = parseUnit((options as any).width ?? '8cm');
      const h = parseUnit((options as any).height ?? '2cm');
      const text = (options as any).text ?? 'Text';
      const newShape = createTextbox(nextId(spTree), x, y, w, h, text);
      appendChild(spTree, newShape);
      writePart(doc, sp, serializeXml(tree));
      return { success: true, message: 'Added textbox' };
    }

    return { success: false, error: `Unknown add type: ${type}` };
  }

  // ── Remove ──────────────────────────────────────────────────

  async remove(doc: OOXMLDocument, path: string, _options: CLIOptions): Promise<CommandResult> {
    const { slideIdx, shapeIdx } = parsePptxPath(path);

    if (!shapeIdx) {
      // Remove entire slide
      return removeSlide(doc, slideIdx);
    }

    const sp = `ppt/slides/slide${slideIdx}.xml`;
    let xml: string;
    try { xml = readPart(doc, sp); } catch { return { success: false, error: `Slide not found` }; }

    const tree = parseXml(xml);
    const spTree = findSpTree(tree);
    const shape = findShape(tree, shapeIdx);
    if (!shape) return { success: false, error: `Shape not found` };

    removeChild(spTree, shape);
    writePart(doc, sp, serializeXml(tree));
    return { success: true, message: `Removed shape ${shapeIdx} from slide ${slideIdx}` };
  }

  // ── Find ────────────────────────────────────────────────────

  async find(doc: OOXMLDocument, pattern: string, _options: CLIOptions): Promise<CommandResult> {
    const results: { slide: number; shape: number; text: string }[] = [];
    const slideCount = countSlides(doc);

    for (let s = 1; s <= slideCount; s++) {
      try {
        const xml = readPart(doc, `ppt/slides/slide${s}.xml`);
        const tree = parseXml(xml);
        const shapes = getShapeList(tree);
        for (let i = 0; i < shapes.length; i++) {
          const t = shapeText(shapes[i]);
          if (t.toLowerCase().includes(pattern.toLowerCase())) {
            results.push({ slide: s, shape: i + 1, text: t.substring(0, 200) });
          }
        }
      } catch { /* skip */ }
    }

    return { success: true, data: { matches: results.length, results } };
  }

  // ── Replace ─────────────────────────────────────────────────

  async replace(doc: OOXMLDocument, oldText: string, newText: string, _options: CLIOptions): Promise<CommandResult> {
    let count = 0;
    const slideCount = countSlides(doc);

    for (let s = 1; s <= slideCount; s++) {
      const sp = `ppt/slides/slide${s}.xml`;
      try {
        let xml = readPart(doc, sp);
        if (xml.includes(oldText)) {
          writePart(doc, sp, xml.split(oldText).join(newText));
          count++;
        }
      } catch { /* skip */ }
    }

    return { success: true, data: { slidesModified: count } };
  }

  // ── Merge ───────────────────────────────────────────────────

  async merge(doc: OOXMLDocument, jsonData: string, _options: CLIOptions): Promise<CommandResult> {
    let data: Record<string, string>;
    try { data = JSON.parse(jsonData); } catch { return { success: false, error: 'Invalid JSON' }; }

    let count = 0;
    const slideCount = countSlides(doc);
    for (let s = 1; s <= slideCount; s++) {
      const sp = `ppt/slides/slide${s}.xml`;
      try {
        let xml = readPart(doc, sp);
        let modified = false;
        for (const [key, val] of Object.entries(data)) {
          const ph = `{{${key}}}`;
          if (xml.includes(ph)) {
            xml = xml.split(ph).join(escXml(String(val)));
            modified = true;
          }
        }
        if (modified) {
          writePart(doc, sp, xml);
          count++;
        }
      } catch { /* skip */ }
    }

    return { success: true, data: { slidesModified: count } };
  }
}

// ── Helpers ────────────────────────────────────────────────────

function countSlides(doc: OOXMLDocument): number {
  const parts = listParts(doc);
  return parts.filter(p => /ppt\/slides\/slide\d+\.xml$/.test(p)).length;
}

interface PptxPathInfo { slideIdx: number; shapeIdx: number | null; }

function parsePptxPath(path: string): PptxPathInfo {
  const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);
  let slideIdx = 1;
  let shapeIdx: number | null = null;

  for (const part of parts) {
    const m = part.match(/^(\w+)\[(.+)\]$/);
    if (!m) continue;
    const [, name, val] = m;
    if (name === 'slide') slideIdx = parseInt(val, 10);
    else if (name === 'shape') shapeIdx = parseInt(val, 10);
  }

  return { slideIdx, shapeIdx };
}

function findSpTree(tree: XmlTree): XmlNode {
  const sld = tree.nodes.find(n => n.type === 'element')!;
  const cSld = childrenOf(sld, 'p:cSld')[0];
  return childrenOf(cSld, 'p:spTree')[0] ?? cSld;
}

function findShape(tree: XmlTree, shapeIdx: number): XmlNode | null {
  const shapes = getShapeList(tree);
  return shapes[shapeIdx - 1] ?? null;
}

function getShapeList(tree: XmlTree): XmlNode[] {
  const spTree = findSpTree(tree);
  return childrenOf(spTree, 'p:sp');
}

function extractShapes(tree: XmlTree): { name: string; type: string; text: string; path: string }[] {
  const shapes = getShapeList(tree);
  return shapes.map((s, i) => {
    const name = getShapeName(s);
    const text = shapeText(s);
    return { name, type: 'shape', text: text.substring(0, 200), path: `/slide[1]/shape[${i + 1}]` };
  });
}

function getShapeName(shape: XmlNode): string {
  const nvSpPr = childrenOf(shape, 'p:nvSpPr')[0];
  if (nvSpPr) {
    const cNvPr = childrenOf(nvSpPr, 'p:cNvPr')[0];
    if (cNvPr?.attrs?.['name']) return cNvPr.attrs['name'];
  }
  return '';
}

function shapeText(shape: XmlNode): string {
  const txBody = childrenOf(shape, 'p:txBody')[0];
  if (!txBody) return '';
  let result = '';
  for (const p of childrenOf(txBody, 'a:p')) {
    for (const r of childrenOf(p, 'a:r')) {
      for (const t of childrenOf(r, 'a:t')) {
        result += textOf(t);
      }
    }
    result += '\n';
  }
  return result.trim();
}

function getShapeProp(shape: XmlNode, prop: string): string | null {
  switch (prop) {
    case 'text': return shapeText(shape);
    case 'name': return getShapeName(shape);
    case 'x': return getOffAttr(shape, 'x');
    case 'y': return getOffAttr(shape, 'y');
    case 'width': return getExtAttr(shape, 'cx');
    case 'height': return getExtAttr(shape, 'cy');
    case 'fill': {
      const spPr = childrenOf(shape, 'p:spPr')[0];
      if (!spPr) return null;
      const fill = childrenOf(spPr, 'a:solidFill')[0];
      if (!fill) return null;
      const clr = childrenOf(fill, 'a:srgbClr')[0];
      return clr?.attrs?.['val'] ?? null;
    }
    case 'fontSize': {
      const txBody = childrenOf(shape, 'p:txBody')[0];
      if (!txBody) return null;
      const p = childrenOf(txBody, 'a:p')[0];
      if (!p) return null;
      const r = childrenOf(p, 'a:r')[0];
      if (!r) return null;
      const rPr = childrenOf(r, 'a:rPr')[0];
      return rPr?.attrs?.['sz'] ? String(parseInt(rPr.attrs['sz'], 10) / 100) + 'pt' : null;
    }
    default: return shape.attrs?.[prop] ?? null;
  }
}

function getOffAttr(shape: XmlNode, attr: string): string | null {
  const spPr = childrenOf(shape, 'p:spPr')[0];
  if (!spPr) return null;
  const xfrm = childrenOf(spPr, 'a:xfrm')[0];
  if (!xfrm) return null;
  const off = childrenOf(xfrm, 'a:off')[0];
  return off?.attrs?.[attr] ?? null;
}

function getExtAttr(shape: XmlNode, attr: string): string | null {
  const spPr = childrenOf(shape, 'p:spPr')[0];
  if (!spPr) return null;
  const xfrm = childrenOf(spPr, 'a:xfrm')[0];
  if (!xfrm) return null;
  const ext = childrenOf(xfrm, 'a:ext')[0];
  return ext?.attrs?.[attr] ?? null;
}

function setShapeProp(shape: XmlNode, prop: string, value: string): boolean {
  switch (prop) {
    case 'text': {
      let txBody = childrenOf(shape, 'p:txBody')[0];
      if (!txBody) {
        txBody = el('p:txBody', {}, [
          el('a:bodyPr', {}),
          el('a:lstStyle', {}),
          el('a:p', {}, [el('a:r', {}, [el('a:rPr', { lang: 'zh-CN' }), el('a:t', {}, [txt(value)])])]),
        ]);
        appendChild(shape, txBody);
      } else {
        // Replace all paragraphs with single new one
        const pTag = findNsIn(txBody, 'p');
        txBody.children = txBody.children?.filter(c => !(c.type === 'element' && (c.tag === pTag || c.tag === 'a:p'))) ?? [];
        txBody.children!.push(
          el('a:p', {}, [el('a:r', {}, [el('a:rPr', { lang: 'zh-CN' }), el('a:t', {}, [txt(value)])])]),
        );
      }
      return true;
    }
    case 'x': case 'y': {
      const spPr = ensureSpPr(shape);
      const xfrm = ensureXfrm(spPr);
      let off = childrenOf(xfrm, 'a:off')[0];
      if (!off) {
        off = el('a:off', { x: '0', y: '0' });
        xfrm.children!.unshift(off);
      }
      if (off.attrs) off.attrs[prop] = String(parseUnit(value));
      return true;
    }
    case 'width': {
      const spPr = ensureSpPr(shape);
      const xfrm = ensureXfrm(spPr);
      let ext = childrenOf(xfrm, 'a:ext')[0];
      if (!ext) { ext = el('a:ext', { cx: '0', cy: '0' }); xfrm.children!.push(ext); }
      if (ext.attrs) ext.attrs['cx'] = String(parseUnit(value));
      return true;
    }
    case 'height': {
      const spPr = ensureSpPr(shape);
      const xfrm = ensureXfrm(spPr);
      let ext = childrenOf(xfrm, 'a:ext')[0];
      if (!ext) { ext = el('a:ext', { cx: '0', cy: '0' }); xfrm.children!.push(ext); }
      if (ext.attrs) ext.attrs['cy'] = String(parseUnit(value));
      return true;
    }
    case 'fill': {
      const spPr = ensureSpPr(shape);
      // Remove existing fills
      spPr.children = spPr.children?.filter((c: XmlNode) =>
        c.type !== 'element' || !['a:solidFill', 'a:noFill', 'a:gradFill', 'a:pattFill'].includes(c.tag ?? '')
      ) ?? [];
      appendChild(spPr, el('a:solidFill', {}, [el('a:srgbClr', { val: value.replace('#', '') })]));
      return true;
    }
    default:
      if (shape.attrs) { shape.attrs[prop] = value; return true; }
      return false;
  }
}

function ensureSpPr(shape: XmlNode): XmlNode {
  let spPr = childrenOf(shape, 'p:spPr')[0];
  if (!spPr) {
    spPr = el('p:spPr', {}, []);
    // Insert after nvSpPr
    const nvSpPr = childrenOf(shape, 'p:nvSpPr')[0];
    if (nvSpPr) insertAfter(shape, nvSpPr, spPr);
    else shape.children!.unshift(spPr);
  }
  return spPr;
}

function ensureXfrm(spPr: XmlNode): XmlNode {
  let xfrm = childrenOf(spPr, 'a:xfrm')[0];
  if (!xfrm) {
    xfrm = el('a:xfrm', {}, [el('a:off', { x: '0', y: '0' }), el('a:ext', { cx: '0', cy: '0' })]);
    spPr.children!.unshift(xfrm);
  }
  return xfrm;
}

function nextId(spTree: XmlNode): number {
  let max = 1;
  function scan(nodes: XmlNode[]) {
    for (const n of nodes) {
      if (n.type === 'element') {
        if (n.attrs?.['id']) max = Math.max(max, parseInt(n.attrs['id'], 10));
        if (n.children) scan(n.children);
      }
    }
  }
  scan([spTree]);
  return max + 1;
}

function createRectShape(id: number, x: number, y: number, w: number, h: number, text: string): XmlNode {
  return el('p:sp', {}, [
    el('p:nvSpPr', {}, [
      el('p:cNvPr', { id: String(id), name: `Rectangle ${id}` }),
      el('p:cNvSpPr', {}),
      el('p:nvPr', {}),
    ]),
    el('p:spPr', {}, [
      el('a:xfrm', {}, [
        el('a:off', { x: String(x), y: String(y) }),
        el('a:ext', { cx: String(w), cy: String(h) }),
      ]),
      el('a:prstGeom', { prst: 'rect' }),
    ]),
    el('p:txBody', {}, [
      el('a:bodyPr', {}),
      el('a:lstStyle', {}),
      el('a:p', {}, [el('a:r', {}, [el('a:rPr', { lang: 'zh-CN' }), el('a:t', {}, [txt(text)])])]),
    ]),
  ]);
}

function createTextbox(id: number, x: number, y: number, w: number, h: number, text: string): XmlNode {
  return createRectShape(id, x, y, w, h, text);
}

function addSlide(doc: OOXMLDocument): CommandResult {
  const slideCount = countSlides(doc);
  const newIdx = slideCount + 1;

  const zip = doc.zip as PizZip;
  zip.file(`ppt/slides/slide${newIdx}.xml`,
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
    '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr/></p:spTree></p:cSld></p:sld>');

  // Update presentation.xml
  const presXml = readPart(doc, 'ppt/presentation.xml');
  const presTree = parseXml(presXml);
  const pres = presTree.nodes.find(n => n.type === 'element')!;
  const sldIdLst = childrenOf(pres, 'p:sldIdLst')[0];
  if (sldIdLst) {
    const existing = childrenOf(sldIdLst, 'p:sldId');
    const maxId = existing.reduce((max, s) => Math.max(max, parseInt(s.attrs?.['id'] ?? '256', 10)), 256);
    appendChild(sldIdLst, el('p:sldId', { id: String(maxId + 1), 'r:id': `rId${newIdx + 1}` }));
  }
  writePart(doc, 'ppt/presentation.xml', serializeXml(presTree));

  // Update content types
  const ctXml = readPart(doc, '[Content_Types].xml');
  const lastOverride = ctXml.lastIndexOf('</Override>');
  const insertPos = ctXml.indexOf('</Types>');
  if (insertPos > 0) {
    const newOverride = `<Override PartName="/ppt/slides/slide${newIdx}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
    const modified = ctXml.substring(0, insertPos) + newOverride + ctXml.substring(insertPos);
    writePart(doc, '[Content_Types].xml', modified);
  }

  return { success: true, message: `Added slide ${newIdx}` };
}

function removeSlide(doc: OOXMLDocument, slideIdx: number): CommandResult {
  const slideCount = countSlides(doc);
  if (slideIdx < 1 || slideIdx > slideCount) return { success: false, error: `Slide ${slideIdx} not found` };
  if (slideCount <= 1) return { success: false, error: 'Cannot remove the last slide' };

  // Remove the slide file
  const zip = doc.zip as PizZip;
  zip.remove(`ppt/slides/slide${slideIdx}.xml`);

  // Renumber subsequent slides
  for (let i = slideIdx + 1; i <= slideCount; i++) {
    const entry = zip.file(`ppt/slides/slide${i}.xml`);
    if (entry) {
      const content = entry.asText();
      zip.remove(`ppt/slides/slide${i}.xml`);
      zip.file(`ppt/slides/slide${i - 1}.xml`, content);
    }
  }

  // Update presentation.xml
  const presXml = readPart(doc, 'ppt/presentation.xml');
  const presTree = parseXml(presXml);
  const pres = presTree.nodes.find(n => n.type === 'element')!;
  const sldIdLst = childrenOf(pres, 'p:sldIdLst')[0];
  if (sldIdLst) {
    const sldIds = childrenOf(sldIdLst, 'p:sldId');
    if (sldIds[slideIdx - 1]) removeChild(sldIdLst, sldIds[slideIdx - 1]);
  }
  writePart(doc, 'ppt/presentation.xml', serializeXml(presTree));

  return { success: true, message: `Removed slide ${slideIdx}` };
}

function parseUnit(val: string): number {
  const m = val.match(/^([\d.]+)(cm|in|pt|px|emu)?$/i);
  if (!m) return parseInt(val, 10) || 0;
  const num = parseFloat(m[1]);
  const unit = (m[2] ?? 'emu').toLowerCase();
  switch (unit) {
    case 'cm': return Math.round(num * EMU_PER_CM);
    case 'in': return Math.round(num * EMU_PER_INCH);
    case 'pt': return Math.round(num * EMU_PER_PT);
    case 'px': return Math.round(num * 9525); // 1px ≈ 9525 EMU
    default: return Math.round(num);
  }
}

function findNsIn(parent: XmlNode, localName: string): string {
  for (const c of parent.children ?? []) {
    if (c.type === 'element' && c.tag) {
      const idx = c.tag.indexOf(':');
      if (idx > 0 && c.tag.substring(idx + 1) === localName) return c.tag;
      if (c.tag === localName) return localName;
    }
  }
  return localName;
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
