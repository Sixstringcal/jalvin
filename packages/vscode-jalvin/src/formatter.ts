// ─────────────────────────────────────────────────────────────────────────────
// Jalvin source formatter
//
// Strategy: line-by-line pass with a character-level state machine to correctly
// handle strings, raw strings, line comments, and block comments.
// Indentation is re-derived from a running `{` / `}` depth counter that only
// counts braces that appear outside of any string or comment context.
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

  let depth = 0;
  let inBlockComment = false;
  let inRawString = false;
  let blanks = 0;

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();

    // ── Blank lines ──────────────────────────────────────────────────────────
    if (trimmed === "") {
      blanks++;
      if (blanks <= maxBlank) {
        out.push("");
      }
      continue;
    }
    blanks = 0;

    // ── Raw string continuation ──────────────────────────────────────────────
    // Preserve raw string body lines exactly (no re-indentation).
    if (inRawString) {
      out.push(rawLine.trimEnd());
      if (rawLineClosesRawString(trimmed)) {
        inRawString = false;
      }
      continue;
    }

    // ── Block comment continuation ───────────────────────────────────────────
    if (inBlockComment) {
      // Align the leading `*` (if present) one space after the current indent.
      if (trimmed.startsWith("*")) {
        out.push(IND.repeat(depth) + " " + trimmed.trimEnd());
      } else {
        out.push(IND.repeat(depth) + "   " + trimmed.trimEnd());
      }
      if (trimmed.includes("*/")) {
        inBlockComment = false;
      }
      continue;
    }

    // ── Count leading `}` for dedent-before-line ─────────────────────────────
    // A line that starts with one or more `}` should be placed at a lower
    // indent level than the body it closes.
    const leading = countLeadingClose(trimmed);

    // ── State-aware scan: count real braces and detect multi-line openers ─────
    const scan = scanLine(trimmed);

    if (scan.endsInBlockComment) {
      inBlockComment = true;
    }
    if (scan.endsInRawString) {
      inRawString = true;
    }

    // ── Compute this line's indent ────────────────────────────────────────────
    const lineIndent = Math.max(0, depth - leading);

    // ── Emit ─────────────────────────────────────────────────────────────────
    out.push(IND.repeat(lineIndent) + trimmed.trimEnd());

    // ── Update depth for subsequent lines ────────────────────────────────────
    depth = Math.max(0, depth + scan.opens - scan.closes);
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

/** Count the number of `}` at the very start of a trimmed line. */
function countLeadingClose(trimmed: string): number {
  let n = 0;
  for (const ch of trimmed) {
    if (ch === "}") {
      n++;
    } else {
      break;
    }
  }
  return n;
}

interface ScanResult {
  /** Net opening braces found in code context. */
  opens: number;
  /** Net closing braces found in code context. */
  closes: number;
  /** Line ends inside a block comment opened on this line. */
  endsInBlockComment: boolean;
  /** Line ends inside a triple-quoted raw string opened on this line. */
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
 * `{` / `}` that appear in code context only.
 */
function scanLine(line: string): ScanResult {
  let opens = 0;
  let closes = 0;
  let state: LineState = "code";
  let i = 0;

  while (i < line.length) {
    const c = line[i]!;

    switch (state) {
      case "lineComment":
        // The rest of the line is a comment — nothing more to scan.
        i = line.length;
        break;

      case "blockComment":
        if (c === "*" && line[i + 1] === "/") {
          i += 2;
          state = "code";
        } else {
          i++;
        }
        break;

      case "rawString":
        if (c === '"' && line[i + 1] === '"' && line[i + 2] === '"') {
          i += 3;
          state = "code";
        } else {
          i++;
        }
        break;

      case "string":
        if (c === "\\") {
          // Escape sequence — skip both the backslash and the next char.
          i += 2;
        } else if (c === '"') {
          i++;
          state = "code";
        } else {
          i++;
        }
        break;

      case "code":
        if (c === "/" && line[i + 1] === "/") {
          state = "lineComment";
          i += 2;
        } else if (c === "/" && line[i + 1] === "*") {
          state = "blockComment";
          i += 2;
        } else if (c === '"' && line[i + 1] === '"' && line[i + 2] === '"') {
          state = "rawString";
          i += 3;
        } else if (c === '"') {
          state = "string";
          i++;
        } else if (c === "{") {
          opens++;
          i++;
        } else if (c === "}") {
          closes++;
          i++;
        } else {
          i++;
        }
        break;
    }
  }

  return {
    opens,
    closes,
    endsInBlockComment: state === "blockComment",
    endsInRawString: state === "rawString",
  };
}

/**
 * Returns true if `line` (trimmed) contains the closing `"""` of a raw string.
 * This is intentionally simple — triple-quote inside a raw string that also
 * closes it is an edge case we accept handling imperfectly.
 */
function rawLineClosesRawString(line: string): boolean {
  return line.includes('"""');
}
