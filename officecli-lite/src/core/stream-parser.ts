/**
 * stream-parser.ts — Streaming SAX XML parser wrapper using saxes
 *
 * Provides memory-efficient XML parsing by streaming through content
 * with SAX events instead of building a full DOM.
 */

import { SaxesParser } from 'saxes';
import type { SAXHandlers, ElementInfo } from '../types';

/**
 * Stream-parse an XML string using SAX, calling handlers for each event.
 * Returns a promise that resolves when parsing is complete.
 */
export async function streamParseXML(xmlString: string, handlers: SAXHandlers): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const parser = new SaxesParser();

    parser.on('error', (err: Error) => {
      reject(new Error(`XML parse error: ${err.message}`));
    });

    parser.on('end', () => {
      if (handlers.onEnd) {
        handlers.onEnd();
      }
      resolve();
    });

    parser.on('opentag', (tag: SaxesParser['tag']) => {
      if (handlers.onOpenTag) {
        // Convert saxes attributes object to a plain Record
        const attrs: Record<string, string> = {};
        for (const [key, val] of Object.entries(tag.attributes)) {
          attrs[key] = typeof val === 'string' ? val : (val as { value: string }).value;
        }
        handlers.onOpenTag(tag.name, attrs);
      }
    });

    parser.on('closetag', (tag: { name: string }) => {
      if (handlers.onCloseTag) {
        handlers.onCloseTag(tag.name);
      }
    });

    parser.on('text', (text: string) => {
      if (handlers.onText) {
        handlers.onText(text);
      }
    });

    parser.write(xmlString).close();
  });
}

/**
 * Find the first N elements with the given local tag name without
 * building a full DOM. Uses early termination to minimise work.
 *
 * The `tagName` is matched against the local part after any prefix
 * (e.g. "p:sp" matches tag name "p:sp").
 */
export async function findFirstElements(
  xmlString: string,
  tagName: string,
  count: number,
): Promise<ElementInfo[]> {
  const results: ElementInfo[] = [];

  // Track the current open tag stack so we can capture text content
  const tagStack: Array<{ name: string; attrs: Record<string, string>; text: string }> = [];

  await streamParseXML(xmlString, {
    onOpenTag(name: string, attrs: Record<string, string>) {
      tagStack.push({ name, attrs, text: '' });
    },
    onText(text: string) {
      if (tagStack.length > 0) {
        tagStack[tagStack.length - 1].text += text;
      }
    },
    onCloseTag(name: string) {
      const top = tagStack.pop();
      if (top && top.name === tagName && results.length < count) {
        const colonIdx = name.indexOf(':');
        const prefix = colonIdx > 0 ? name.substring(0, colonIdx) : undefined;
        const local = colonIdx > 0 ? name.substring(colonIdx + 1) : name;

        results.push({
          tag: local,
          prefix,
          index: results.length + 1,
          attributes: top.attrs,
          text: top.text || undefined,
        });
      }
    },
  });

  return results;
}

/**
 * Collect all text content for a given tag name across the document.
 * Stops after `limit` results (0 = no limit).
 */
export async function collectText(
  xmlString: string,
  tagName: string,
  limit: number = 0,
): Promise<string[]> {
  const texts: string[] = [];
  let currentText = '';

  await streamParseXML(xmlString, {
    onOpenTag(name: string) {
      if (name === tagName) {
        currentText = '';
      }
    },
    onText(text: string) {
      currentText += text;
    },
    onCloseTag(name: string) {
      if (name === tagName) {
        const trimmed = currentText.trim();
        if (trimmed.length > 0) {
          texts.push(trimmed);
          if (limit > 0 && texts.length >= limit) {
            throw new Error('__LIMIT_REACHED__');
          }
        }
        currentText = '';
      }
    },
  }).catch((err: Error) => {
    // Swallow the early-termination signal
    if (err.message !== '__LIMIT_REACHED__') {
      throw err;
    }
  });

  return texts;
}
