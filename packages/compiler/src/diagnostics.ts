// ─────────────────────────────────────────────────────────────────────────────
// Jalvin Diagnostics — structured error/warning/info reporting
// ─────────────────────────────────────────────────────────────────────────────

import type { Span } from "./ast.js";

export type DiagnosticSeverity = "error" | "warning" | "info" | "hint";

export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  readonly span: Span;
  readonly code: string;
  readonly message: string;
  readonly notes: ReadonlyArray<DiagnosticNote>;
}

export interface DiagnosticNote {
  readonly span: Span | null;
  readonly message: string;
}

export class DiagnosticBag {
  private readonly _items: Diagnostic[] = [];

  get items(): ReadonlyArray<Diagnostic> {
    return this._items;
  }

  get hasErrors(): boolean {
    return this._items.some((d) => d.severity === "error");
  }

  [Symbol.iterator](): IterableIterator<Diagnostic> {
    return this._items[Symbol.iterator]();
  }

  get errorCount(): number {
    return this._items.filter((d) => d.severity === "error").length;
  }

  get warningCount(): number {
    return this._items.filter((d) => d.severity === "warning").length;
  }

  error(span: Span, code: string, message: string, notes: DiagnosticNote[] = []): void {
    this._items.push({ severity: "error", span, code, message, notes });
  }

  warning(span: Span, code: string, message: string, notes: DiagnosticNote[] = []): void {
    this._items.push({ severity: "warning", span, code, message, notes });
  }

  info(span: Span, code: string, message: string, notes: DiagnosticNote[] = []): void {
    this._items.push({ severity: "info", span, code, message, notes });
  }

  hint(span: Span, code: string, message: string, notes: DiagnosticNote[] = []): void {
    this._items.push({ severity: "hint", span, code, message, notes });
  }

  merge(other: DiagnosticBag): void {
    this._items.push(...other._items);
  }

  /** Returns an opaque checkpoint value for rolling back speculative diagnostics. */
  checkpoint(): number {
    return this._items.length;
  }

  /** Rolls back all diagnostics emitted since the given checkpoint. */
  rollback(checkpoint: number): void {
    this._items.length = checkpoint;
  }

  /** Format diagnostics as a human-readable string (for CLI output). */
  format(source?: string): string {
    const lines = source?.split("\n");
    return this._items
      .map((d) => {
        const loc = `${d.span.file}:${d.span.startLine + 1}:${d.span.startCol + 1}`;
        const sev = d.severity.toUpperCase();
        let out = `\n${sev} [${d.code}] ${loc}\n  ${d.message}`;
        if (lines) {
          const srcLine = lines[d.span.startLine];
          if (srcLine !== undefined) {
            const caretLen = Math.max(1, d.span.endCol - d.span.startCol);
            const caret = "^".repeat(caretLen);
            out += `\n  ${srcLine}\n  ${" ".repeat(d.span.startCol)}${caret}`;
          }
        }
        for (const note of d.notes) {
          const noteLoc = note.span
            ? ` (${note.span.file}:${note.span.startLine + 1}:${note.span.startCol + 1})`
            : "";
          out += `\n  note${noteLoc}: ${note.message}`;
        }
        return out;
      })
      .join("\n");
  }
}

// ─── Error code registry ────────────────────────────────────────────────────

// Lexer errors: E0001–E0099
export const E_UNTERMINATED_STRING = "E0001";
export const E_INVALID_ESCAPE = "E0002";
export const E_UNEXPECTED_CHAR = "E0003";
export const E_UNTERMINATED_BLOCK_COMMENT = "E0004";
export const E_INVALID_NUMBER_LITERAL = "E0005";

// Parser errors: E0100–E0299
export const E_UNEXPECTED_TOKEN = "E0100";
export const E_EXPECTED_TOKEN = "E0101";
export const E_EXPECTED_EXPRESSION = "E0102";
export const E_EXPECTED_TYPE = "E0103";
export const E_DUPLICATE_MODIFIER = "E0104";
export const E_INCOMPATIBLE_MODIFIERS = "E0105";
export const E_MISSING_RETURN_TYPE = "E0106";
export const E_WHEN_MISSING_ELSE = "E0107";

// Type errors: E0300–E0499
export const E_TYPE_MISMATCH = "E0300";
export const E_UNDEFINED_SYMBOL = "E0301";
export const E_NOT_NULLABLE = "E0302";
export const E_UNSAFE_NULL_DEREFERENCE = "E0303";
export const E_WRONG_ARG_COUNT = "E0304";
export const E_NOT_A_FUNCTION = "E0305";
export const E_WHEN_NOT_EXHAUSTIVE = "E0306";
export const E_SEALED_SUBTYPE_OUTSIDE_PACKAGE = "E0307";
export const E_SUSPEND_IN_NON_SUSPEND = "E0308";
export const E_DUPLICATE_CLASS_MEMBER = "E0309";
export const E_ABSTRACT_MEMBER_NOT_IMPLEMENTED = "E0310";
export const E_OVERRIDE_NOTHING = "E0311";
export const E_CLASS_EXTENDS_FINAL = "E0312";
export const E_CONST_VAL_REASSIGNMENT = "E0320";
export const E_LATEINIT_INVALID = "E0321";

// Codegen warnings: W0001–W0099
export const W_UNUSED_VARIABLE = "W0001";
export const W_UNREACHABLE_CODE = "W0002";
export const W_IMPLICIT_ANY = "W0003";
export const W_DEPRECATED = "W0004";
