/**
 * commands/index.ts — Command registry
 *
 * Maps command names to their handler functions. Each command handler
 * receives the file path, positional arguments, and CLI options, then
 * returns a CommandResult.
 */

import * as path from 'path';
import type { CLIOptions, CommandResult, DocumentType, OOXMLDocument } from '../types';
import { openDocument, saveDocument, readPart, writePart, listParts, closeDocument, hasPart } from '../core/ooxml';
import { formatOutput, truncateOutput } from '../core/output';
import { resolvePath } from '../core/path-resolver';
import { DocxHandler } from '../formats/docx';
import { XlsxHandler } from '../formats/xlsx';
import { PptxHandler } from '../formats/pptx';
import type { BaseDocumentHandler } from '../formats/base';

// ── Handler lookup ─────────────────────────────────────────────

const handlers: Record<DocumentType, BaseDocumentHandler> = {
  docx: new DocxHandler(),
  xlsx: new XlsxHandler(),
  pptx: new PptxHandler(),
};

function getHandler(docType: DocumentType): BaseDocumentHandler {
  return handlers[docType];
}

function detectDocType(filePath: string): DocumentType {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.docx': return 'docx';
    case '.xlsx': return 'xlsx';
    case '.pptx': return 'pptx';
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

// ── Command implementations ────────────────────────────────────

async function cmdCreate(filePath: string, _args: string[], options: CLIOptions): Promise<CommandResult> {
  try {
    const docType = detectDocType(filePath);
    const handler = getHandler(docType);
    await handler.create(filePath);
    return { success: true, message: `Created ${filePath}` };
  } catch (err: unknown) {
    return { success: false, error: String((err as Error).message ?? err) };
  }
}

async function cmdView(filePath: string, _args: string[], options: CLIOptions): Promise<CommandResult> {
  let doc: OOXMLDocument | null = null;
  try {
    doc = await openDocument(filePath);
    const handler = getHandler(doc.docType);
    return await handler.view(doc, options);
  } catch (err: unknown) {
    return { success: false, error: String((err as Error).message ?? err) };
  } finally {
    if (doc) closeDocument(doc);
  }
}

async function cmdGet(filePath: string, args: string[], options: CLIOptions): Promise<CommandResult> {
  if (args.length < 2) {
    return { success: false, error: 'Usage: get <file> <path> <property>' };
  }
  let doc: OOXMLDocument | null = null;
  try {
    doc = await openDocument(filePath);
    const [elemPath, prop] = args;
    const handler = getHandler(doc.docType);
    return await handler.get(doc, elemPath, prop, options);
  } catch (err: unknown) {
    return { success: false, error: String((err as Error).message ?? err) };
  } finally {
    if (doc) closeDocument(doc);
  }
}

async function cmdSet(filePath: string, args: string[], options: CLIOptions): Promise<CommandResult> {
  if (args.length < 2) {
    return { success: false, error: 'Usage: set <file> <path> <prop>=<value>' };
  }
  let doc: OOXMLDocument | null = null;
  try {
    doc = await openDocument(filePath);
    const [elemPath, propExpr] = args;
    const eqIdx = propExpr.indexOf('=');
    if (eqIdx < 1) {
      return { success: false, error: 'Property must be in format: name=value' };
    }
    const prop = propExpr.substring(0, eqIdx);
    const value = propExpr.substring(eqIdx + 1);
    const handler = getHandler(doc.docType);
    const result = await handler.set(doc, elemPath, prop, value, options);
    if (result.success) {
      await saveDocument(doc);
    }
    return result;
  } catch (err: unknown) {
    return { success: false, error: String((err as Error).message ?? err) };
  } finally {
    if (doc) closeDocument(doc);
  }
}

async function cmdAdd(filePath: string, args: string[], options: CLIOptions): Promise<CommandResult> {
  if (args.length < 2) {
    return { success: false, error: 'Usage: add <file> <path> <type>' };
  }
  let doc: OOXMLDocument | null = null;
  try {
    doc = await openDocument(filePath);
    const [elemPath, type] = args;
    const handler = getHandler(doc.docType);
    const result = await handler.add(doc, elemPath, type, options);
    if (result.success) {
      await saveDocument(doc);
    }
    return result;
  } catch (err: unknown) {
    return { success: false, error: String((err as Error).message ?? err) };
  } finally {
    if (doc) closeDocument(doc);
  }
}

async function cmdRemove(filePath: string, args: string[], options: CLIOptions): Promise<CommandResult> {
  if (args.length < 1) {
    return { success: false, error: 'Usage: remove <file> <path>' };
  }
  let doc: OOXMLDocument | null = null;
  try {
    doc = await openDocument(filePath);
    const [elemPath] = args;
    const handler = getHandler(doc.docType);
    const result = await handler.remove(doc, elemPath, options);
    if (result.success) {
      await saveDocument(doc);
    }
    return result;
  } catch (err: unknown) {
    return { success: false, error: String((err as Error).message ?? err) };
  } finally {
    if (doc) closeDocument(doc);
  }
}

async function cmdFind(filePath: string, args: string[], options: CLIOptions): Promise<CommandResult> {
  if (args.length < 1) {
    return { success: false, error: 'Usage: find <file> <pattern>' };
  }
  let doc: OOXMLDocument | null = null;
  try {
    doc = await openDocument(filePath);
    const [pattern] = args;
    const handler = getHandler(doc.docType);
    return await handler.find(doc, pattern, options);
  } catch (err: unknown) {
    return { success: false, error: String((err as Error).message ?? err) };
  } finally {
    if (doc) closeDocument(doc);
  }
}

async function cmdReplace(filePath: string, args: string[], options: CLIOptions): Promise<CommandResult> {
  if (args.length < 2) {
    return { success: false, error: 'Usage: replace <file> <old> <new>' };
  }
  let doc: OOXMLDocument | null = null;
  try {
    doc = await openDocument(filePath);
    const [oldText, newText] = args;
    const handler = getHandler(doc.docType);
    const result = await handler.replace(doc, oldText, newText, options);
    if (result.success) {
      await saveDocument(doc);
    }
    return result;
  } catch (err: unknown) {
    return { success: false, error: String((err as Error).message ?? err) };
  } finally {
    if (doc) closeDocument(doc);
  }
}

async function cmdMerge(filePath: string, args: string[], options: CLIOptions): Promise<CommandResult> {
  if (!options.data) {
    return { success: false, error: 'Usage: merge <file> --data <json>' };
  }
  let doc: OOXMLDocument | null = null;
  try {
    doc = await openDocument(filePath);
    const handler = getHandler(doc.docType);
    const result = await handler.merge(doc, options.data, options);
    if (result.success) {
      await saveDocument(doc);
    }
    return result;
  } catch (err: unknown) {
    return { success: false, error: String((err as Error).message ?? err) };
  } finally {
    if (doc) closeDocument(doc);
  }
}

async function cmdBatch(filePath: string, _args: string[], options: CLIOptions): Promise<CommandResult> {
  // Read JSON array from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const input = Buffer.concat(chunks).toString('utf-8');

  let commands: Array<{ cmd: string; path?: string; prop?: string; value?: string }>;
  try {
    commands = JSON.parse(input);
    if (!Array.isArray(commands)) throw new Error('Expected array');
  } catch {
    return { success: false, error: 'stdin must be a JSON array of commands' };
  }

  const results: CommandResult[] = [];
  for (const cmd of commands) {
    const commandEntry = getCommand(cmd.cmd);
    if (!commandEntry) {
      results.push({ success: false, error: `Unknown command: ${cmd.cmd}` });
      continue;
    }
    const args: string[] = [];
    if (cmd.path) args.push(cmd.path);
    if (cmd.prop) args.push(cmd.prop);
    if (cmd.value) args.push(cmd.value);
    const result = await commandEntry.handler(filePath, args, options);
    results.push(result);
    if (!result.success) break; // Stop on first error
  }

  return {
    success: results.every(r => r.success),
    data: results,
    message: `${results.length}/${commands.length} commands succeeded`,
  };
}

async function cmdRaw(filePath: string, args: string[], options: CLIOptions): Promise<CommandResult> {
  if (!options.xpath && args.length < 1) {
    return { success: false, error: 'Usage: raw <file> --xpath <xpath>' };
  }
  let doc: OOXMLDocument | null = null;
  try {
    doc = await openDocument(filePath);
    const xpath = options.xpath ?? args[0];
    // For raw mode, just dump the main document part
    const mainPart = getMainPartPath(doc.docType);
    const xml = readPart(doc, mainPart);
    return {
      success: true,
      data: { part: mainPart, xpath, contentPreview: xml.substring(0, 2000) },
    };
  } catch (err: unknown) {
    return { success: false, error: String((err as Error).message ?? err) };
  } finally {
    if (doc) closeDocument(doc);
  }
}

async function cmdApplyStyle(filePath: string, args: string[], options: CLIOptions): Promise<CommandResult> {
  if (args.length < 1) {
    return { success: false, error: 'Usage: applyStyle <target_file> <template_file>' };
  }

  const templatePath = args[0];
  const docType = detectDocType(filePath);

  let templateDoc: OOXMLDocument | null = null;
  let targetDoc: OOXMLDocument | null = null;

  try {
    templateDoc = await openDocument(templatePath);
    targetDoc = await openDocument(filePath);

    // Verify both documents have the same type
    if (templateDoc.docType !== targetDoc.docType) {
      return { success: false, error: `Document type mismatch: template is ${templateDoc.docType}, target is ${targetDoc.docType}` };
    }

    const handler = getHandler(docType);
    const result = await handler.applyStyle(targetDoc, templateDoc, options);
    if (result.success) {
      await saveDocument(targetDoc);
    }
    return result;
  } catch (err: unknown) {
    return { success: false, error: String((err as Error).message ?? err) };
  } finally {
    if (templateDoc) closeDocument(templateDoc);
    if (targetDoc) closeDocument(targetDoc);
  }
}

// ── Helpers ────────────────────────────────────────────────────

function getMainPartPath(docType: DocumentType): string {
  switch (docType) {
    case 'docx': return 'word/document.xml';
    case 'xlsx': return 'xl/workbook.xml';
    case 'pptx': return 'ppt/presentation.xml';
  }
}

// ── Registry ───────────────────────────────────────────────────

export interface CommandEntry {
  name: string;
  description: string;
  handler: (filePath: string, args: string[], options: CLIOptions) => Promise<CommandResult>;
  /** Minimum positional args beyond the file path */
  minArgs: number;
  /** Usage string */
  usage: string;
}

export const COMMANDS: Record<string, CommandEntry> = {
  create: {
    name: 'create',
    description: 'Create a new Office document',
    handler: cmdCreate,
    minArgs: 0,
    usage: 'create <file>',
  },
  view: {
    name: 'view',
    description: 'View document structure and content',
    handler: cmdView,
    minArgs: 0,
    usage: 'view <file>',
  },
  get: {
    name: 'get',
    description: 'Get an element property',
    handler: cmdGet,
    minArgs: 2,
    usage: 'get <file> <path> <property>',
  },
  set: {
    name: 'set',
    description: 'Set an element property',
    handler: cmdSet,
    minArgs: 2,
    usage: 'set <file> <path> <prop>=<value>',
  },
  add: {
    name: 'add',
    description: 'Add a new element',
    handler: cmdAdd,
    minArgs: 2,
    usage: 'add <file> <path> <type>',
  },
  remove: {
    name: 'remove',
    description: 'Remove an element',
    handler: cmdRemove,
    minArgs: 1,
    usage: 'remove <file> <path>',
  },
  find: {
    name: 'find',
    description: 'Search for text in the document',
    handler: cmdFind,
    minArgs: 1,
    usage: 'find <file> <pattern>',
  },
  replace: {
    name: 'replace',
    description: 'Replace text in the document',
    handler: cmdReplace,
    minArgs: 2,
    usage: 'replace <file> <old> <new>',
  },
  merge: {
    name: 'merge',
    description: 'Merge data into a template',
    handler: cmdMerge,
    minArgs: 0,
    usage: 'merge <file> --data <json>',
  },
  batch: {
    name: 'batch',
    description: 'Execute batch commands from stdin',
    handler: cmdBatch,
    minArgs: 0,
    usage: 'batch <file>',
  },
  raw: {
    name: 'raw',
    description: 'Raw XML access',
    handler: cmdRaw,
    minArgs: 0,
    usage: 'raw <file> --xpath <xpath>',
  },
  applyStyle: {
    name: 'applyStyle',
    description: 'Apply styles from a template document to the target',
    handler: cmdApplyStyle,
    minArgs: 1,
    usage: 'applyStyle <target_file> <template_file>',
  },
};

/**
 * Look up a command by name.
 */
export function getCommand(name: string): CommandEntry | undefined {
  return COMMANDS[name];
}

/**
 * Get all registered command names.
 */
export function getCommandNames(): string[] {
  return Object.keys(COMMANDS);
}
