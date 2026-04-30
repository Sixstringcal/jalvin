// ─────────────────────────────────────────────────────────────────────────────
// Jalvin source formatter
//
// Strategy: line-by-line pass with a character-level state machine to correctly
// handle strings, raw strings, line comments, and block comments.
// Indentation is derived from the combined depth of `{`, `(`, and `[` that
// appear outside of any string or comment context.
//
// Special cases:
//   • Leading `}`, `)`, `]` on a line de-indent that line before the depth is
//     updated (so closing tokens align with their opener).
//   • A line starting with `.` while inside parens or brackets receives one
//     extra indent level (method-chain continuation).
// ─────────────────────────────────────────────────────────────────────────────

export interface FormatOptions {
  /** Number of spaces per indent level. Default: 4 */
  indentSize?: number;
  /** Maximum consecutive blank lines to allow. Default: 1 */
  maxBlankLines?: number;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function format(source: string, opts: FormatOptions = {}): string {
  const indentSize = opts.indentSize ?? 4;
  const maxBlank = opts.maxBlankLines ?? 1;
  const IND = " ".repeat(indentSize);

  const rawLines = source.split("\n");
  const out: string[] = [];

  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let inBlockComment = false;
  let inRawString = false;
  let blanks = 0;

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();

    // ── Blank lines ──────────────────────────────────────────────────────────
    if (trimmed === "") {
      blanks++;
      if (blanks <= maxBlank) out.push("");
      continue;
    }
    blanks = 0;

    // ── Raw string continuation ──────────────────────────────────────────────
    if (inRawString) {
      out.push(rawLine.trimEnd());
      if (rawLineClosesRawString(trimmed)) inRawString = false;
      continue;
    }

    const totalDepth = braceDepth + parenDepth + bracketDepth;

    // ── Block comment continuation ───────────────────────────────────────────
    if (inBlockComment) {
      if (trimmed.startsWith("*")) {
        out.push(IND.repeat(totalDepth) + " " + trimmed.trimEnd());
      } else {
        out.push(IND.repeat(totalDepth) + "   " + trimmed.trimEnd());
      }
      if (trimmed.includes("*/")) inBlockComment = false;
      continue;
    }

    // ── Count leading close tokens for dedent-before-line ────────────────────
    const leading = countLeadingClose(trimmed);

    // ── State-aware scan ─────────────────────────────────────────────────────
    const scan = scanLine(trimmed);

    if (scan.endsInBlockComment) inBlockComment = true;
    if (scan.endsInRawString) inRawString = true;

    // ── Method-chain continuation ─────────────────────────────────────────────
    // A line starting with `.` inside parens or brackets (e.g. multi-line
    // method chain) gets one extra indent level so it visually nests under
    // the argument it belongs to.
    const chainBonus = trimmed.startsWith(".") && (parenDepth + bracketDepth) > 0 ? 1 : 0;

    const lineIndent = Math.max(0, totalDepth - leading + chainBonus);

    // ── Emit ─────────────────────────────────────────────────────────────────
    out.push(IND.repeat(lineIndent) + trimmed.trimEnd());

    // ── Update depths for subsequent lines ───────────────────────────────────
    braceDepth   = Math.max(0, braceDepth   + scan.braceOpens   - scan.braceCloses);
    parenDepth   = Math.max(0, parenDepth   + scan.parenOpens   - scan.parenCloses);
    bracketDepth = Math.max(0, bracketDepth + scan.bracketOpens - scan.bracketCloses);
  }

  // Strip trailing blank lines.
  while (out.length > 0 && out[out.length - 1] === "") {
    out.pop();
  }

  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Count `}`, `)`, `]` at the very start of a trimmed line.
 * These are applied as a pre-dedent so closing tokens align with their opener.
 */
function countLeadingClose(trimmed: string): number {
  let n = 0;
  for (const ch of trimmed) {
    if (ch === "}" || ch === ")" || ch === "]") {
      n++;
    } else {
      break;
    }
  }
  return n;
}

interface ScanResult {
  braceOpens: number;
  braceCloses: number;
  parenOpens: number;
  parenCloses: number;
  bracketOpens: number;
  bracketCloses: number;
  endsInBlockComment: boolean;
  endsInRawString: boolean;
}

type LineState =
  | "code"
  | "lineComment"
  | "blockComment"
  | "string"
  | "rawString";

/**
 * Walk `line` character by character, tracking lexical state, and count
 * `{`/`}`, `(`/`)`, `[`/`]` that appear in code context only.
 */
function scanLine(line: string): ScanResult {
  let braceOpens = 0, braceCloses = 0;
  let parenOpens = 0, parenCloses = 0;
  let bracketOpens = 0, bracketCloses = 0;
  let state: LineState = "code";
  let i = 0;

  while (i < line.length) {
    const c = line[i]!;

    switch (state) {
      case "lineComment":
        i = line.length;
        break;

      case "blockComment":
        if (c === "*" && line[i + 1] === "/") { i += 2; state = "code"; }
        else i++;
        break;

      case "rawString":
        if (c === '"' && line[i + 1] === '"' && line[i + 2] === '"') { i += 3; state = "code"; }
        else i++;
        break;

      case "string":
        if (c === "\\") i += 2;          // escape — skip next char
        else if (c === '"') { i++; state = "code"; }
        else i++;
        break;

      case "code":
        if (c === "/" && line[i + 1] === "/") {
          state = "lineComment"; i += 2;
        } else if (c === "/" && line[i + 1] === "*") {
          state = "blockComment"; i += 2;
        } else if (c === '"' && line[i + 1] === '"' && line[i + 2] === '"') {
          state = "rawString"; i += 3;
        } else if (c === '"') {
          state = "string"; i++;
        } else if (c === "{")  { braceOpens++;   i++; }
        else if (c === "}")    { braceCloses++;  i++; }
        else if (c === "(")    { parenOpens++;   i++; }
        else if (c === ")")    { parenCloses++;  i++; }
        else if (c === "[")    { bracketOpens++; i++; }
        else if (c === "]")    { bracketCloses++;i++; }
        else i++;
        break;
    }
  }

  return {
    braceOpens, braceCloses,
    parenOpens, parenCloses,
    bracketOpens, bracketCloses,
    endsInBlockComment: state === "blockComment",
    endsInRawString: state === "rawString",
  };
}

function rawLineClosesRawString(line: string): boolean {
  return line.includes('"""');
}
