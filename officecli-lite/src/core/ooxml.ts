/**
 * ooxml.ts — OOXML ZIP/XML core
 *
 * Open, save, read, write, and list parts inside an OOXML document (docx/xlsx/pptx).
 * Parts are lazily cached: only accessed entries are loaded into memory.
 */

import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import type { DocumentType, OOXMLDocument } from '../types';

// ── Helpers ────────────────────────────────────────────────────

const DOC_TYPE_EXTENSIONS: Record<string, DocumentType> = {
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.pptx': 'pptx',
};

function detectDocType(filePath: string): DocumentType {
  const ext = path.extname(filePath).toLowerCase();
  const dt = DOC_TYPE_EXTENSIONS[ext];
  if (!dt) {
    throw new Error(`Unsupported file extension "${ext}". Supported: .docx, .xlsx, .pptx`);
  }
  return dt;
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Open an OOXML document. The ZIP is read once; individual parts are
 * loaded on demand and cached in `doc.cache`.
 */
export async function openDocument(filePath: string): Promise<OOXMLDocument> {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }

  const buf = fs.readFileSync(abs);
  const zip = new PizZip(buf);
  const docType = detectDocType(abs);

  const doc: OOXMLDocument = {
    filePath: abs,
    docType,
    zip,
    cache: new Map(),
    dirty: new Set(),
  };

  return doc;
}

/**
 * Save the document. If `filePath` is omitted the original path is used.
 * Any cached parts that were modified are written back to the ZIP before saving.
 *
 * 写入策略：先写入同目录临时文件，再原子 rename 覆盖目标文件，
 * 避免「读到一半 / 写到一半」状态被其他进程读取。
 */
export async function saveDocument(doc: OOXMLDocument, filePath?: string): Promise<void> {
  // Flush cached dirty parts back into the ZIP
  const zip = doc.zip as PizZip;
  for (const partPath of doc.dirty) {
    const content = doc.cache.get(partPath);
    if (content !== undefined) {
      zip.file(partPath, content);
    }
  }
  doc.dirty.clear();

  const target = path.resolve(filePath ?? doc.filePath);
  const generated = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  await atomicWriteFile(target, generated as Buffer);
}

/**
 * 原子写入：写临时文件 + rename。同分区 rename 是原子操作，
 * 保证目标文件要么是旧版要么是新版，永远不会写到一半。
 */
export async function atomicWriteFile(target: string, data: Buffer): Promise<void> {
  const tmp = target + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, data);
  try {
    fs.renameSync(tmp, target);
  } catch (e) {
    // rename 失败时清理临时文件并向上抛错
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw e;
  }
}

/**
 * Read a single XML part. The content is cached so subsequent reads are free.
 */
export function readPart(doc: OOXMLDocument, partPath: string): string {
  const cached = doc.cache.get(partPath);
  if (cached !== undefined) {
    return cached;
  }

  const zip = doc.zip as PizZip;
  const entry = zip.file(partPath);
  if (!entry) {
    throw new Error(`Part not found in archive: ${partPath}`);
  }

  const content = entry.asText();
  doc.cache.set(partPath, content);
  return content;
}

/**
 * Write (update) a single XML part. The content is cached and marked dirty
 * so it will be flushed on the next `saveDocument`.
 */
export function writePart(doc: OOXMLDocument, partPath: string, content: string): void {
  doc.cache.set(partPath, content);
  doc.dirty.add(partPath);
}

/**
 * List all ZIP entry paths inside the document.
 */
export function listParts(doc: OOXMLDocument): string[] {
  const zip = doc.zip as PizZip;
  const entries: string[] = [];
  // PizZip.filter iterates every entry and returns those matching the predicate.
  // We use it as a forEach to collect all file paths.
  zip.filter((_relativePath: string, file: { name: string; dir: boolean }) => {
    if (!file.dir) {
      entries.push(file.name);
    }
    return false; // don't actually filter, just collect
  });
  return entries;
}

/**
 * Release cached parts and detach from the ZIP. Call this when you are done
 * to free memory promptly.
 */
export function closeDocument(doc: OOXMLDocument): void {
  doc.cache.clear();
  doc.dirty.clear();
  // PizZip doesn't have an explicit close, but we drop references
  (doc as Partial<OOXMLDocument>).zip = null;
}

/**
 * Check whether a given part exists in the archive (without loading it).
 */
export function hasPart(doc: OOXMLDocument, partPath: string): boolean {
  const zip = doc.zip as PizZip;
  return zip.file(partPath) !== null;
}

/**
 * Remove a part from the archive.
 */
export function removePart(doc: OOXMLDocument, partPath: string): void {
  const zip = doc.zip as PizZip;
  zip.remove(partPath);
  doc.cache.delete(partPath);
  doc.dirty.delete(partPath);
}
