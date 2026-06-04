/**
 * xml-tree.ts — Lightweight XML tree parse/serialize/query
 *
 * Uses saxes for robust parsing. Only builds trees for individual
 * XML parts (not the whole document), so memory stays small.
 */

import { SaxesParser } from 'saxes';

// ── Types ──────────────────────────────────────────────────────

export interface XmlNode {
  type: 'element' | 'text';
  /** Full tag name with prefix, e.g. "w:p" */
  tag?: string;
  attrs?: Record<string, string>;
  children?: XmlNode[];
  /** Text content (for text nodes) */
  text?: string;
  selfClosing?: boolean;
}

export interface XmlTree {
  declaration: string;
  nodes: XmlNode[];
}

// ── Parse ──────────────────────────────────────────────────────

export function parseXml(xml: string): XmlTree {
  const roots: XmlNode[] = [];
  const stack: { children: XmlNode[] }[] = [{ children: roots }];
  let decl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  const parser = new SaxesParser();

  parser.on('xmldecl', (d: { version?: string; encoding?: string; standalone?: string }) => {
    const parts: string[] = ['<?xml'];
    if (d.version) parts.push(` version="${d.version}"`);
    if (d.encoding) parts.push(` encoding="${d.encoding}"`);
    if (d.standalone !== undefined) parts.push(` standalone="${d.standalone}"`);
    parts.push('?>');
    decl = parts.join('');
  });

  parser.on('opentag', (tag: SaxesParser['tag']) => {
    const attrs: Record<string, string> = {};
    for (const [key, val] of Object.entries(tag.attributes)) {
      attrs[key] = typeof val === 'string' ? val : (val as { value: string }).value;
    }
    const node: XmlNode = {
      type: 'element',
      tag: tag.name,
      attrs,
      children: [],
      selfClosing: tag.isSelfClosing,
    };
    stack[stack.length - 1].children.push(node);
    if (!tag.isSelfClosing) {
      stack.push(node as { children: XmlNode[] });
    }
  });

  parser.on('closetag', (tag: { isSelfClosing: boolean }) => {
    // saxes fires closetag for self-closing elements too,
    // but we only push non-self-closing ones, so skip the pop.
    if (!tag.isSelfClosing) {
      stack.pop();
    }
  });

  parser.on('text', (text: string) => {
    if (text.length > 0) {
      stack[stack.length - 1].children.push({ type: 'text', text });
    }
  });

  parser.on('cdata', (data: string) => {
    stack[stack.length - 1].children.push({ type: 'text', text: data });
  });

  parser.write(xml).close();
  return { declaration: decl, nodes: roots };
}

// ── Serialize ──────────────────────────────────────────────────

export function serializeXml(tree: XmlTree): string;
export function serializeXml(nodes: XmlNode[]): string;
export function serializeXml(input: XmlTree | XmlNode[]): string {
  let decl = '';
  let nodes: XmlNode[];
  if (Array.isArray(input)) {
    nodes = input;
  } else {
    decl = input.declaration + '\n';
    nodes = input.nodes;
  }
  return decl + serializeNodes(nodes);
}

function serializeNodes(nodes: XmlNode[]): string {
  let s = '';
  for (const n of nodes) {
    if (n.type === 'text') {
      s += n.text ?? '';
    } else if (n.type === 'element' && n.tag) {
      s += '<' + n.tag;
      if (n.attrs) {
        for (const [k, v] of Object.entries(n.attrs)) {
          s += ` ${k}="${escAttr(v)}"`;
        }
      }
      const kids = n.children;
      if (n.selfClosing && (!kids || kids.length === 0)) {
        s += '/>';
      } else {
        s += '>';
        if (kids) s += serializeNodes(kids);
        s += `</${n.tag}>`;
      }
    }
  }
  return s;
}

function escAttr(s: string): string {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Query helpers ──────────────────────────────────────────────

/** Find the Nth child element with a given tag (1-based). */
export function nthChild(parent: XmlNode, tag: string, n: number): XmlNode | null {
  if (!parent.children) return null;
  let count = 0;
  for (const c of parent.children) {
    if (c.type === 'element' && c.tag === tag) {
      if (++count === n) return c;
    }
  }
  return null;
}

/** Find ALL child elements with a given tag. */
export function childrenOf(parent: XmlNode | null, tag: string): XmlNode[] {
  if (!parent?.children) return [];
  return parent.children.filter(c => c.type === 'element' && c.tag === tag);
}

/** Get the concatenated text content of a node (recursive). */
export function textOf(node: XmlNode | null): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  if (!node.children) return '';
  return node.children.map(textOf).join('');
}

/** Find first descendant matching a tag chain like ["w:body","w:p","w:r","w:t"]. */
export function findDescendant(root: XmlNode, tags: string[]): XmlNode | null {
  let current: XmlNode | null = root;
  for (const tag of tags) {
    if (!current?.children) return null;
    current = current.children.find(c => c.type === 'element' && c.tag === tag) ?? null;
  }
  return current;
}

/** Remove a child node from its parent. */
export function removeChild(parent: XmlNode, child: XmlNode): boolean {
  if (!parent.children) return false;
  const idx = parent.children.indexOf(child);
  if (idx < 0) return false;
  parent.children.splice(idx, 1);
  return true;
}

/** Insert a new node after a reference child. */
export function insertAfter(parent: XmlNode, ref: XmlNode, newNode: XmlNode): void {
  if (!parent.children) {
    parent.children = [newNode];
    return;
  }
  const idx = parent.children.indexOf(ref);
  if (idx < 0) {
    parent.children.push(newNode);
  } else {
    parent.children.splice(idx + 1, 0, newNode);
  }
}

/** Append a child node. */
export function appendChild(parent: XmlNode, child: XmlNode): void {
  if (!parent.children) parent.children = [];
  parent.children.push(child);
}

// ── Element creation ───────────────────────────────────────────

export function el(tag: string, attrs?: Record<string, string>, children?: XmlNode[]): XmlNode {
  return { type: 'element', tag, attrs: attrs ?? {}, children: children ?? [], selfClosing: false };
}

export function selfEl(tag: string, attrs?: Record<string, string>): XmlNode {
  return { type: 'element', tag, attrs: attrs ?? {}, children: [], selfClosing: true };
}

export function txt(content: string): XmlNode {
  return { type: 'text', text: content };
}
