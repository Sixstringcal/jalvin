// ─────────────────────────────────────────────────────────────────────────────
// @jalvin/compiler — public API
// ─────────────────────────────────────────────────────────────────────────────

export * from "./ast.js";
export * from "./diagnostics.js";
export { lex, Lexer, type Token, TokenKind } from "./lexer.js";
export { parse, Parser } from "./parser.js";
export { typeCheck, TypeChecker } from "./typechecker.js";
export { generate, CodeGenerator, type CodegenOptions, type CodegenResult } from "./codegen.js";

import { DiagnosticBag } from "./diagnostics.js";
import { lex } from "./lexer.js";
import { parse } from "./parser.js";
import { typeCheck } from "./typechecker.js";
import { generate, type CodegenOptions } from "./codegen.js";

export interface CompileResult {
  readonly code: string;
  readonly lineMap: number[];
  readonly isJsx: boolean;
  readonly diagnostics: DiagnosticBag;
  readonly ok: boolean;
}

/**
 * One-shot: source → TypeScript/TSX code.
 *
 * @param source  Raw .jalvin source text
 * @param file    File name (used in diagnostics / source maps)
 * @param opts    Code-generation options
 */
export function compile(
  source: string,
  file = "<stdin>",
  opts?: Partial<CodegenOptions>
): CompileResult {
  const diag = new DiagnosticBag();

  const tokens = lex(source, file, diag);
  if (diag.hasErrors) {
    return { code: "", lineMap: [], isJsx: false, diagnostics: diag, ok: false };
  }

  const ast = parse(tokens, file, diag, source);
  if (diag.hasErrors) {
    return { code: "", lineMap: [], isJsx: false, diagnostics: diag, ok: false };
  }

  const checker = typeCheck(ast, diag);
  // Type errors are non-fatal — we still emit code so the dev server keeps running

  const result = generate(ast, opts, checker.operatorOverloadMap, checker.typeMap);

  return {
    code: result.code,
    lineMap: result.lineMap,
    isJsx: result.isJsx,
    diagnostics: diag,
    ok: !diag.hasErrors,
  };
}
