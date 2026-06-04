/**
 * officecli-lite — Shared type definitions
 */

// ── Document types ──────────────────────────────────────────────

export type DocumentType = 'docx' | 'xlsx' | 'pptx';

// ── OOXML document wrapper ─────────────────────────────────────

export interface OOXMLDocument {
  /** Absolute file path on disk */
  filePath: string;
  /** Detected document type */
  docType: DocumentType;
  /** The PizZip instance (kept private in practice, typed here for internal use) */
  zip: unknown;
  /** Lazily cached XML parts: path → content string */
  cache: Map<string, string>;
  /** Set of parts modified since last save */
  dirty: Set<string>;
}

// ── Path resolution ────────────────────────────────────────────

export interface PathComponents {
  /** ZIP part path, e.g. "ppt/slides/slide1.xml" */
  partPath: string;
  /** XPath expression within that part, e.g. "//p:sp[2]" */
  xpath: string;
  /** Original raw path string */
  rawPath: string;
  /** Document type hint (needed for namespace resolution) */
  docType: DocumentType;
}

// ── Elements & properties ──────────────────────────────────────

export interface ElementInfo {
  /** Tag name (local, without prefix) */
  tag: string;
  /** Namespace prefix, e.g. "w" */
  prefix?: string;
  /** 1-based index among siblings of same tag */
  index: number;
  /** Key-value attribute map */
  attributes: Record<string, string>;
  /** Text content (direct children only) */
  text?: string;
  /** XML namespace URI */
  namespaceUri?: string;
}

export interface PropertyInfo {
  /** Property / attribute name */
  name: string;
  /** Property value */
  value: string;
  /** "attribute" | "text" | "style" */
  kind: 'attribute' | 'text' | 'style';
}

// ── SAX handler interface ──────────────────────────────────────

export interface SAXHandlers {
  onOpenTag?(name: string, attrs: Record<string, string>): void;
  onCloseTag?(name: string): void;
  onText?(text: string): void;
  onEnd?(): void;
}

// ── Selector AST ───────────────────────────────────────────────

export interface SelectorCondition {
  /** "attr" for [attr=val], "contains" for :contains("text") */
  type: 'attr' | 'contains';
  /** Attribute name (for attr type) */
  attr?: string;
  /** Value to match */
  value: string;
  /** Exact match vs substring */
  exact?: boolean;
}

export interface Selector {
  /** Tag name to match (or "*" for any) */
  tag: string;
  /** Conditions that must all be satisfied */
  conditions: SelectorCondition[];
}

// ── Command framework ──────────────────────────────────────────

export interface Command {
  /** Command name, e.g. "view" */
  name: string;
  /** One-line description */
  description: string;
  /** Execute the command */
  run(args: string[], options: CLIOptions): Promise<CommandResult>;
}

export interface CommandResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Output data (will be formatted by output module) */
  data?: unknown;
  /** Human-readable message (used when data is absent) */
  message?: string;
  /** Error message (when success is false) */
  error?: string;
}

// ── CLI options ────────────────────────────────────────────────

export interface CLIOptions {
  /** Output as JSON instead of text table */
  json: boolean;
  /** XPath for raw command */
  xpath?: string;
  /** Data payload for merge command */
  data?: string;
  /** Maximum output length (0 = unlimited) */
  maxOutput?: number;
  /** Verbose logging */
  verbose?: boolean;
}

// ── Document handler interface ─────────────────────────────────

export interface DocumentHandler {
  /** Create a new blank document at the given path */
  create(filePath: string): Promise<void>;
  /** View document structure or content */
  view(doc: OOXMLDocument, options: CLIOptions): Promise<CommandResult>;
  /** Get a property at the given path */
  get(doc: OOXMLDocument, path: string, prop: string, options: CLIOptions): Promise<CommandResult>;
  /** Set a property at the given path */
  set(doc: OOXMLDocument, path: string, prop: string, value: string, options: CLIOptions): Promise<CommandResult>;
  /** Add a new element at the given path */
  add(doc: OOXMLDocument, path: string, type: string, options: CLIOptions): Promise<CommandResult>;
  /** Remove an element at the given path */
  remove(doc: OOXMLDocument, path: string, options: CLIOptions): Promise<CommandResult>;
  /** Find elements matching text pattern */
  find(doc: OOXMLDocument, pattern: string, options: CLIOptions): Promise<CommandResult>;
  /** Replace text */
  replace(doc: OOXMLDocument, oldText: string, newText: string, options: CLIOptions): Promise<CommandResult>;
  /** Template merge */
  merge(doc: OOXMLDocument, jsonData: string, options: CLIOptions): Promise<CommandResult>;
  /** Apply styles from a template document */
  applyStyle?(targetDoc: OOXMLDocument, templateDoc: OOXMLDocument, options: CLIOptions): Promise<CommandResult>;
}
