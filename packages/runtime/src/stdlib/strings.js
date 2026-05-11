// ─────────────────────────────────────────────────────────────────────────────
// stdlib/strings.ts — String utilities and StringBuilder
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// String predicates
// ─────────────────────────────────────────────────────────────────────────────
export function isBlank(s) {
    return s.trim().length === 0;
}
export function isNotBlank(s) {
    return s.trim().length > 0;
}
export function isNullOrBlank(s) {
    return s == null || s.trim().length === 0;
}
// ─────────────────────────────────────────────────────────────────────────────
// Parsing with fallback
// ─────────────────────────────────────────────────────────────────────────────
export function toIntOrNull(s) {
    const n = parseInt(s, 10);
    return isNaN(n) ? null : n;
}
export function toDoubleOrNull(s) {
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
}
export function toBooleanOrNull(s) {
    if (s.toLowerCase() === "true")
        return true;
    if (s.toLowerCase() === "false")
        return false;
    return null;
}
// ─────────────────────────────────────────────────────────────────────────────
// Padding and repetition
// ─────────────────────────────────────────────────────────────────────────────
export function padStart(s, length, padChar = " ") {
    return s.padStart(length, padChar);
}
export function padEnd(s, length, padChar = " ") {
    return s.padEnd(length, padChar);
}
export function repeat_(s, n) {
    return s.repeat(n);
}
// ─────────────────────────────────────────────────────────────────────────────
// Case and casing helpers
// ─────────────────────────────────────────────────────────────────────────────
export function capitalize(s) {
    return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
export function decapitalize(s) {
    return s.length === 0 ? s : s[0].toLowerCase() + s.slice(1);
}
// ─────────────────────────────────────────────────────────────────────────────
// Substring extraction
// ─────────────────────────────────────────────────────────────────────────────
export function substringBefore(s, delimiter) {
    const idx = s.indexOf(delimiter);
    return idx === -1 ? s : s.slice(0, idx);
}
export function substringAfter(s, delimiter) {
    const idx = s.indexOf(delimiter);
    return idx === -1 ? "" : s.slice(idx + delimiter.length);
}
export function substringBeforeLast(s, delimiter) {
    const idx = s.lastIndexOf(delimiter);
    return idx === -1 ? s : s.slice(0, idx);
}
export function substringAfterLast(s, delimiter) {
    const idx = s.lastIndexOf(delimiter);
    return idx === -1 ? "" : s.slice(idx + delimiter.length);
}
export function removePrefix(s, prefix) {
    return s.startsWith(prefix) ? s.slice(prefix.length) : s;
}
export function removeSuffix(s, suffix) {
    return s.endsWith(suffix) ? s.slice(0, s.length - suffix.length) : s;
}
// ─────────────────────────────────────────────────────────────────────────────
// Line splitting
// ─────────────────────────────────────────────────────────────────────────────
export function lines(s) {
    return s.split(/\r?\n/);
}
export function lineSequence(s) {
    return lines(s);
}
// ─────────────────────────────────────────────────────────────────────────────
// Default-if-empty helpers
// ─────────────────────────────────────────────────────────────────────────────
export function ifEmpty(value, default_) {
    return (value == null || value.length === 0) ? default_() : value;
}
export function ifBlank(value, default_) {
    return (value == null || value.trim().length === 0) ? default_() : value;
}
// ─────────────────────────────────────────────────────────────────────────────
// Indent trimming — strips the common leading whitespace from all lines
// ─────────────────────────────────────────────────────────────────────────────
export function trimIndent(s) {
    const allLines = s.split("\n");
    const nonEmpty = allLines.filter((l) => l.trim().length > 0);
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
    _parts = [];
    append(s) { this._parts.push(String(s ?? "")); return this; }
    appendLine(s = "") { this._parts.push(String(s), "\n"); return this; }
    prepend(s) { this._parts.unshift(String(s ?? "")); return this; }
    clear() { this._parts.length = 0; return this; }
    get length() { return this._parts.reduce((sum, p) => sum + p.length, 0); }
    isEmpty() { return this.length === 0; }
    isNotEmpty() { return this.length > 0; }
    toString() { return this._parts.join(""); }
}
export function buildString(fn) {
    const sb = new StringBuilder();
    fn(sb);
    return sb.toString();
}
//# sourceMappingURL=strings.js.map