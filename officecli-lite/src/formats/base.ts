/**
 * base.ts — Base DocumentHandler abstract class
 *
 * Provides default implementations that throw "not implemented".
 * Each format handler (docx, xlsx, pptx) extends this.
 */

import type { OOXMLDocument, CLIOptions, CommandResult, DocumentHandler } from '../types';

export abstract class BaseDocumentHandler implements DocumentHandler {
  abstract create(filePath: string): Promise<void>;

  async view(doc: OOXMLDocument, _options: CLIOptions): Promise<CommandResult> {
    return { success: false, error: `view not implemented for .${doc.docType}` };
  }

  async get(
    doc: OOXMLDocument,
    _path: string,
    _prop: string,
    _options: CLIOptions,
  ): Promise<CommandResult> {
    return { success: false, error: `get not implemented for .${doc.docType}` };
  }

  async set(
    doc: OOXMLDocument,
    _path: string,
    _prop: string,
    _value: string,
    _options: CLIOptions,
  ): Promise<CommandResult> {
    return { success: false, error: `set not implemented for .${doc.docType}` };
  }

  async add(
    doc: OOXMLDocument,
    _path: string,
    _type: string,
    _options: CLIOptions,
  ): Promise<CommandResult> {
    return { success: false, error: `add not implemented for .${doc.docType}` };
  }

  async remove(
    doc: OOXMLDocument,
    _path: string,
    _options: CLIOptions,
  ): Promise<CommandResult> {
    return { success: false, error: `remove not implemented for .${doc.docType}` };
  }

  async find(
    doc: OOXMLDocument,
    _pattern: string,
    _options: CLIOptions,
  ): Promise<CommandResult> {
    return { success: false, error: `find not implemented for .${doc.docType}` };
  }

  async replace(
    doc: OOXMLDocument,
    _oldText: string,
    _newText: string,
    _options: CLIOptions,
  ): Promise<CommandResult> {
    return { success: false, error: `replace not implemented for .${doc.docType}` };
  }

  async merge(
    doc: OOXMLDocument,
    _jsonData: string,
    _options: CLIOptions,
  ): Promise<CommandResult> {
    return { success: false, error: `merge not implemented for .${doc.docType}` };
  }

  async applyStyle(
    targetDoc: OOXMLDocument,
    _templateDoc: OOXMLDocument,
    _options: CLIOptions,
  ): Promise<CommandResult> {
    return { success: false, error: `applyStyle not implemented for .${targetDoc.docType}` };
  }
}
