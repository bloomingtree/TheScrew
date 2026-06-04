/**
 * path-resolver.ts — Path syntax resolver
 *
 * Translates human-friendly OOXML paths into part + xpath pairs:
 *   /paragraph[3]            → word/document.xml + //w:p[3]
 *   /slide[1]/shape[2]       → ppt/slides/slide1.xml + //p:sp[2]
 *   /sheet[1]/cell[B2]       → xl/worksheets/sheet1.xml + //c:r[@r='B2']
 *   /table[1]/row[3]/cell[1] → word/document.xml + //w:tbl[1]/w:tr[3]/w:tc[1]
 */

import type { DocumentType, PathComponents } from '../types';

// ── Segment type maps per document type ────────────────────────

interface SegmentMapping {
  /** XML tag name (without prefix) */
  tag: string;
  /** Namespace prefix */
  prefix: string;
  /** How to build the part path template — receives the numeric index */
  partTemplate?: (index: number) => string;
}

const DOCX_SEGMENTS: Record<string, SegmentMapping> = {
  paragraph: { tag: 'p', prefix: 'w' },
  run:       { tag: 'r', prefix: 'w' },
  text:      { tag: 't', prefix: 'w' },
  table:     { tag: 'tbl', prefix: 'w' },
  row:       { tag: 'tr', prefix: 'w' },
  cell:      { tag: 'tc', prefix: 'w' },
  image:     { tag: 'drawing', prefix: 'w' },
  header:    { tag: 'headerReference', prefix: 'w', partTemplate: (i) => `word/header${i}.xml` },
  footer:    { tag: 'footerReference', prefix: 'w', partTemplate: (i) => `word/footer${i}.xml` },
  style:     { tag: 'style', prefix: 'w' },
  section:   { tag: 'sectPr', prefix: 'w' },
  bookmark:  { tag: 'bookmarkStart', prefix: 'w' },
  hyperlink: { tag: 'hyperlink', prefix: 'w' },
};

const PPTX_SEGMENTS: Record<string, SegmentMapping> = {
  slide:      { tag: 'sld', prefix: 'p', partTemplate: (i) => `ppt/slides/slide${i}.xml` },
  shape:      { tag: 'sp', prefix: 'p' },
  textbox:    { tag: 'sp', prefix: 'p' },
  image:      { tag: 'pic', prefix: 'p' },
  group:      { tag: 'grpSp', prefix: 'p' },
  table:      { tag: 'graphicFrame', prefix: 'p' },
  note:       { tag: 'notes', prefix: 'p', partTemplate: (i) => `ppt/notesSlides/notesSlide${i}.xml` },
  paragraph:  { tag: 'p', prefix: 'a' },
  run:        { tag: 'r', prefix: 'a' },
  text:       { tag: 't', prefix: 'a' },
  row:        { tag: 'tr', prefix: 'a' },
  cell:       { tag: 'tc', prefix: 'a' },
};

const XLSX_SEGMENTS: Record<string, SegmentMapping> = {
  sheet:   { tag: 'worksheet', prefix: '', partTemplate: (i) => `xl/worksheets/sheet${i}.xml` },
  row:     { tag: 'row', prefix: '' },
  cell:    { tag: 'c', prefix: '' },
  formula: { tag: 'f', prefix: '' },
  value:   { tag: 'v', prefix: '' },
};

const SEGMENT_MAPS: Record<DocumentType, Record<string, SegmentMapping>> = {
  docx: DOCX_SEGMENTS,
  pptx: PPTX_SEGMENTS,
  xlsx: XLSX_SEGMENTS,
};

// ── Default part paths ─────────────────────────────────────────

const DEFAULT_PARTS: Record<DocumentType, string> = {
  docx: 'word/document.xml',
  pptx: 'ppt/presentation.xml',
  xlsx: 'xl/workbook.xml',
};

// ── Path tokenizer ─────────────────────────────────────────────

interface PathSegment {
  /** Segment name, e.g. "slide", "shape", "cell" */
  name: string;
  /** Numeric 1-based index, e.g. 1, 2, 3 */
  index: number | null;
  /** Cell reference like "B2" (xlsx cells only) */
  cellRef: string | null;
}

/**
 * Tokenise a path string like "/slide[1]/shape[2]" into segments.
 * Also supports "/sheet[1]/cell[B2]" for spreadsheet cell references.
 */
function tokenizePath(rawPath: string): PathSegment[] {
  const segments: PathSegment[] = [];
  // Normalise: leading slash, split by /
  const parts = rawPath.replace(/^\/+/, '').split('/').filter(Boolean);

  for (const part of parts) {
    const m = part.match(/^([a-zA-Z_]\w*)\[(.+)\]$/) ;
    if (m) {
      const name = m[1];
      const bracket = m[2];
      // Check for cell reference: uppercase letter(s) + digit(s)
      const cellMatch = bracket.match(/^([A-Z]+[0-9]+)$/);
      if (cellMatch) {
        segments.push({ name, index: null, cellRef: cellMatch[1] });
      } else {
        const idx = parseInt(bracket, 10);
        if (isNaN(idx) || idx < 1) {
          throw new Error(`Invalid index in path segment "${part}": index must be >= 1`);
        }
        segments.push({ name, index: idx, cellRef: null });
      }
    } else {
      // No index — treat as [1]
      segments.push({ name: part, index: 1, cellRef: null });
    }
  }

  return segments;
}

// ── Resolver ───────────────────────────────────────────────────

/**
 * Resolve a human-friendly path to a { partPath, xpath } pair.
 *
 * @param rawPath  The path string, e.g. "/slide[1]/shape[2]"
 * @param docType  The document type (needed for namespace resolution)
 */
export function resolvePath(rawPath: string, docType: DocumentType): PathComponents {
  const segments = tokenizePath(rawPath);
  if (segments.length === 0) {
    throw new Error('Empty path');
  }

  const map = SEGMENT_MAPS[docType];
  let partPath = DEFAULT_PARTS[docType];
  const xpathParts: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const mapping = map[seg.name];
    if (!mapping) {
      throw new Error(
        `Unknown path segment "${seg.name}" for .${docType} files. ` +
        `Available: ${Object.keys(map).join(', ')}`
      );
    }

    // If this segment declares a partTemplate, it changes the target part
    if (mapping.partTemplate && seg.index !== null) {
      partPath = mapping.partTemplate(seg.index);
      // The first segment with a partTemplate does NOT contribute an xpath step
      // (the part path itself encodes the selection)
      if (mapping.partTemplate !== map[Object.keys(map).find(k => map[k] === mapping) ?? '']?.partTemplate || i === 0) {
        // If it's the first segment, skip xpath contribution — the part IS the target
        continue;
      }
    }

    // Build xpath step
    const idx = seg.index ?? 1;

    if (seg.cellRef) {
      // Cell reference like B2 → //c[@r='B2']
      xpathParts.push(`//${mapping.prefix ? mapping.prefix + ':' : ''}${mapping.tag}[@r='${seg.cellRef}']`);
    } else {
      const p = mapping.prefix ? `${mapping.prefix}:` : '';
      xpathParts.push(`//${p}${mapping.tag}[${idx}]`);
    }
  }

  // If only one xpath step, keep it simple; otherwise join them
  // For nested paths, subsequent "//" should be relative to the previous context
  const xpath = xpathParts.length > 0 ? xpathParts.join('') : '/';

  return {
    partPath,
    xpath,
    rawPath,
    docType,
  };
}

/**
 * List all available segment names for a document type.
 */
export function listSegments(docType: DocumentType): string[] {
  return Object.keys(SEGMENT_MAPS[docType]);
}
