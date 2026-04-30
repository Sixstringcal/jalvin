// ─────────────────────────────────────────────────────────────────────────────
// stdlib/strings.ts — String utilities and StringBuilder
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// String predicates
// ─────────────────────────────────────────────────────────────────────────────

export function isBlank(s: string): boolean {
  return s.trim().length === 0;
}

export function isNotBlank(s: string): boolean {
  return s.trim().length > 0;
}

export function isNullOrBlank(s: string | null | undefined): boolean {
  return s == null || s.trim().length === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing with fallback
// ─────────────────────────────────────────────────────────────────────────────

export function toIntOrNull(s: string): number | null {
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

export function toDoubleOrNull(s: string): number | null {
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function toBooleanOrNull(s: string): boolean | null {
  if (s.toLowerCase() === "true")  return true;
  if (s.toLowerCase() === "false") return false;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Padding and repetition
// ─────────────────────────────────────────────────────────────────────────────

export function padStart(s: string, length: number, padChar = " "): string {
  return s.padStart(length, padChar);
}

export function padEnd(s: string, length: number, padChar = " "): string {
  return s.padEnd(length, padChar);
}

export function repeat_(s: string, n: number): string {
  return s.repeat(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Case and casing helpers
// ─────────────────────────────────────────────────────────────────────────────

export function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

export function decapitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toLowerCase() + s.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Substring extraction
// ─────────────────────────────────────────────────────────────────────────────

export function substringBefore(s: string, delimiter: string): string {
  const idx = s.indexOf(delimiter);
  return idx === -1 ? s : s.slice(0, idx);
}

export function substringAfter(s: string, delimiter: string): string {
  const idx = s.indexOf(delimiter);
  return idx === -1 ? "" : s.slice(idx + delimiter.length);
}

export function substringBeforeLast(s: string, delimiter: string): string {
  const idx = s.lastIndexOf(delimiter);
  return idx === -1 ? s : s.slice(0, idx);
}

export function substringAfterLast(s: string, delimiter: string): string {
  const idx = s.lastIndexOf(delimiter);
  return idx === -1 ? "" : s.slice(idx + delimiter.length);
}

export function removePrefix(s: string, prefix: string): string {
  return s.startsWith(prefix) ? s.slice(prefix.length) : s;
}

export function removeSuffix(s: string, suffix: string): string {
  return s.endsWith(suffix) ? s.slice(0, s.length - suffix.length) : s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Line splitting
// ─────────────────────────────────────────────────────────────────────────────

export function lines(s: string): string[] {
  return s.split(/\r?\n/);
}

export function lineSequence(s: string): string[] {
  return lines(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Default-if-empty helpers
// ─────────────────────────────────────────────────────────────────────────────

export function ifEmpty<T extends string | null | undefined>(value: T, default_: () => T): T {
  return (value == null || (value as string).length === 0) ? default_() : value;
}

export function ifBlank<T extends string | null | undefined>(value: T, default_: () => T): T {
  return (value == null || (value as string).trim().length === 0) ? default_() : value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Indent trimming — strips the common leading whitespace from all lines
// ─────────────────────────────────────────────────────────────────────────────

export function trimIndent(s: string): string {
  const allLines  = s.split("\n");
  const nonEmpty  = allLines.filter((l) => l.trim().length > 0);
  const minIndent = nonEmpty.reduce((min, l) => {
    const match = l.match(/^(\s*)/);
    return Math.min(min, match?.[1]?.length ?? 0);
  }, Infinity);
  const indentToStrip = isFinite(minIndent) ? minIndent : 0;
  return allLines
    .map((l) => l.slice(indentToStrip))
    .join("\n")
    .replace(/^\n/, "")
    .replace(/\n$/, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// StringBuilder — mutable string builder for efficient concatenation
// ─────────────────────────────────────────────────────────────────────────────

export class StringBuilder {
  private readonly _parts: string[] = [];

  append(s: unknown):     this { this._parts.push(String(s ?? "")); return this; }
  appendLine(s: unknown = ""): this { this._parts.push(String(s), "\n"); return this; }
  prepend(s: unknown):    this { this._parts.unshift(String(s ?? "")); return this; }
  clear():                this { this._parts.length = 0; return this; }

  get length(): number   { return this._parts.reduce((sum, p) => sum + p.length, 0); }
  isEmpty():   boolean   { return this.length === 0; }
  isNotEmpty(): boolean  { return this.length > 0; }
  toString():  string    { return this._parts.join(""); }
}

export function buildString(fn: (sb: StringBuilder) => void): string {
  const sb = new StringBuilder();
  fn(sb);
  return sb.toString();
}
