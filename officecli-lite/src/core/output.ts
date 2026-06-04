/**
 * output.ts — Output formatting (text table, JSON, truncated)
 *
 * Converts structured results into user-facing text or JSON output.
 */

// ── Public API ─────────────────────────────────────────────────

/**
 * Format a data payload for CLI output.
 * If `json` is true, emit JSON. Otherwise emit a human-readable text table.
 */
export function formatOutput(data: unknown, json: boolean): string {
  if (json) {
    return JSON.stringify(data, null, 2);
  }

  // --- Text mode ---
  if (data === null || data === undefined) {
    return '';
  }

  if (typeof data === 'string') {
    return data;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return String(data);
  }

  // Array of flat objects → text table
  if (Array.isArray(data)) {
    if (data.length === 0) return '(empty)';
    if (typeof data[0] !== 'object' || data[0] === null) {
      return data.map(String).join('\n');
    }
    return formatTable(data as Record<string, unknown>[]);
  }

  if (typeof data === 'object') {
    // Single object — key-value pairs
    return formatKeyValue(data as Record<string, unknown>);
  }

  return String(data);
}

/**
 * Smart truncation: keep the head and tail of a string, inserting a marker
 * in the middle to indicate omitted content.
 */
export function truncateOutput(text: string, maxLen: number): string {
  if (maxLen <= 0 || text.length <= maxLen) {
    return text;
  }

  const marker = `\n... (${text.length - maxLen} more characters) ...\n`;
  const markerLen = marker.length;

  // If the marker itself is too large, just hard-truncate
  if (markerLen >= maxLen) {
    return text.substring(0, maxLen);
  }

  const usable = maxLen - markerLen;
  const headLen = Math.ceil(usable * 0.6);
  const tailLen = usable - headLen;

  return text.substring(0, headLen) + marker + text.substring(text.length - tailLen);
}

// ── Internal helpers ───────────────────────────────────────────

/**
 * Render an array of flat objects as a simple text table.
 */
function formatTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '(empty)';

  const keys = collectKeys(rows);
  const colWidths = keys.map((k) => {
    const headerLen = k.length;
    const maxDataLen = Math.max(
      ...rows.map((r) => String(r[k] ?? '').length),
    );
    return Math.min(Math.max(headerLen, maxDataLen) + 2, 50);
  });

  // Header row
  const header = keys.map((k, i) => padRight(k, colWidths[i])).join('| ');
  const sep = keys.map((_k, i) => '-'.repeat(colWidths[i])).join('+-');

  const lines: string[] = [header, sep];

  for (const row of rows) {
    const line = keys
      .map((k, i) => padRight(String(row[k] ?? ''), colWidths[i]))
      .join('| ');
    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Render an object as key-value lines.
 */
function formatKeyValue(obj: Record<string, unknown>, indent: string = ''): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${indent}${key}:`);
      lines.push(formatKeyValue(value as Record<string, unknown>, indent + '  '));
    } else if (Array.isArray(value)) {
      lines.push(`${indent}${key}: [${value.length} items]`);
    } else {
      lines.push(`${indent}${key}: ${value ?? ''}`);
    }
  }
  return lines.join('\n');
}

/**
 * Collect all unique keys across an array of objects (preserving first-seen order).
 */
function collectKeys(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) seen.add(key);
    }
  }
  return Array.from(seen);
}

/**
 * Right-pad a string to the given length.
 */
function padRight(str: string, len: number): string {
  if (str.length >= len) return str.substring(0, len);
  return str + ' '.repeat(len - str.length);
}
