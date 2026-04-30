// ─────────────────────────────────────────────────────────────────────────────
// Jalvin Lexer
//
// Tokenises a .jalvin source file. Key behaviours:
//   • Automatic semicolon insertion (like Go) after certain tokens
//     when a newline is encountered.
//   • String templates: `"Hello $name"` and `"Hello ${expr}"`.
//   • Triple-quoted raw strings: `"""..."""`.
//   • Coroutine keywords: launch, async, suspend, await.
//   • `component` keyword for UI declarations.
//   • `Bibi` is just an identifier — treated normally by the lexer.
// ─────────────────────────────────────────────────────────────────────────────

import {
  DiagnosticBag,
  E_UNEXPECTED_CHAR,
  E_UNTERMINATED_STRING,
  E_INVALID_ESCAPE,
  E_UNTERMINATED_BLOCK_COMMENT,
  E_INVALID_NUMBER_LITERAL,
} from "./diagnostics.js";
import type { Span } from "./ast.js";

// ---------------------------------------------------------------------------
// Token kinds
// ---------------------------------------------------------------------------

export const enum TokenKind {
  // Literals
  IntLiteral = "IntLiteral",
  LongLiteral = "LongLiteral",
  FloatLiteral = "FloatLiteral",
  DoubleLiteral = "DoubleLiteral",
  BooleanLiteral = "BooleanLiteral",
  NullLiteral = "NullLiteral",
  StringLiteral = "StringLiteral",
  RawStringLiteral = "RawStringLiteral",
  StringTemplateStart = "StringTemplateStart", // " or $"
  StringTemplatePart = "StringTemplatePart",   // text inside template
  StringTemplateExprStart = "StringTemplateExprStart", // ${
  StringTemplateExprEnd = "StringTemplateExprEnd",   // }
  StringTemplateEnd = "StringTemplateEnd",     // "

  // Identifiers
  Identifier = "Identifier",

  // Keywords
  KwFun = "KwFun",
  KwComponent = "KwComponent",
  KwVal = "KwVal",
  KwVar = "KwVar",
  KwClass = "KwClass",
  KwData = "KwData",
  KwSealed = "KwSealed",
  KwObject = "KwObject",
  KwInterface = "KwInterface",
  KwEnum = "KwEnum",
  KwWhen = "KwWhen",
  KwIf = "KwIf",
  KwElse = "KwElse",
  KwFor = "KwFor",
  KwWhile = "KwWhile",
  KwDo = "KwDo",
  KwReturn = "KwReturn",
  KwBreak = "KwBreak",
  KwContinue = "KwContinue",
  KwImport = "KwImport",
  KwPackage = "KwPackage",
  KwIs = "KwIs",
  KwAs = "KwAs",
  KwIn = "KwIn",
  KwBy = "KwBy",
  KwOverride = "KwOverride",
  KwOpen = "KwOpen",
  KwAbstract = "KwAbstract",
  KwCompanion = "KwCompanion",
  KwInit = "KwInit",
  KwConstructor = "KwConstructor",
  KwThis = "KwThis",
  KwSuper = "KwSuper",
  KwLaunch = "KwLaunch",
  KwAsync = "KwAsync",
  KwSuspend = "KwSuspend",
  KwAwait = "KwAwait",
  KwThrow = "KwThrow",
  KwTry = "KwTry",
  KwCatch = "KwCatch",
  KwFinally = "KwFinally",
  KwTypealias = "KwTypealias",
  KwOperator = "KwOperator",
  KwInfix = "KwInfix",
  KwInline = "KwInline",
  KwReified = "KwReified",
  KwExternal = "KwExternal",
  KwInternal = "KwInternal",
  KwPrivate = "KwPrivate",
  KwProtected = "KwProtected",
  KwPublic = "KwPublic",
  KwTailrec = "KwTailrec",
  KwConst = "KwConst",
  KwLateinit = "KwLateinit",
  KwFinal = "KwFinal",

  // Operators
  Plus = "Plus",
  Minus = "Minus",
  Star = "Star",
  Slash = "Slash",
  Percent = "Percent",
  Eq = "Eq",
  EqEq = "EqEq",
  BangEq = "BangEq",
  EqEqEq = "EqEqEq",
  BangEqEq = "BangEqEq",
  Lt = "Lt",
  Gt = "Gt",
  LtEq = "LtEq",
  GtEq = "GtEq",
  AmpAmp = "AmpAmp",
  PipePipe = "PipePipe",
  Bang = "Bang",
  Question = "Question",
  QuestionColon = "QuestionColon",   // ?:
  QuestionDot = "QuestionDot",       // ?.
  BangBang = "BangBang",             // !!
  Arrow = "Arrow",                   // ->
  FatArrow = "FatArrow",             // =>
  DotDot = "DotDot",                 // ..
  DotDotLt = "DotDotLt",             // ..<
  Dot = "Dot",
  Comma = "Comma",
  Colon = "Colon",
  ColonColon = "ColonColon",         // ::
  Semicolon = "Semicolon",
  At = "At",
  Hash = "Hash",
  Amp = "Amp",
  Pipe = "Pipe",
  Caret = "Caret",
  Tilde = "Tilde",
  PlusEq = "PlusEq",
  MinusEq = "MinusEq",
  StarEq = "StarEq",
  SlashEq = "SlashEq",
  PercentEq = "PercentEq",
  PlusPlus = "PlusPlus",
  MinusMinus = "MinusMinus",
  Underscore = "Underscore",

  // Delimiters
  LBrace = "LBrace",
  RBrace = "RBrace",
  LParen = "LParen",
  RParen = "RParen",
  LBracket = "LBracket",
  RBracket = "RBracket",

  // Special
  EOF = "EOF",
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

export interface Token {
  readonly kind: TokenKind;
  readonly span: Span;
  /** Raw source text of this token */
  readonly text: string;
  /** Parsed value for literals */
  readonly value?: string | number | bigint | boolean | null;
}

// ---------------------------------------------------------------------------
// Keyword map
// ---------------------------------------------------------------------------

const KEYWORDS: Readonly<Record<string, TokenKind>> = {
  fun: TokenKind.KwFun,
  component: TokenKind.KwComponent,
  val: TokenKind.KwVal,
  var: TokenKind.KwVar,
  class: TokenKind.KwClass,
  data: TokenKind.KwData,
  sealed: TokenKind.KwSealed,
  object: TokenKind.KwObject,
  interface: TokenKind.KwInterface,
  enum: TokenKind.KwEnum,
  when: TokenKind.KwWhen,
  if: TokenKind.KwIf,
  else: TokenKind.KwElse,
  for: TokenKind.KwFor,
  while: TokenKind.KwWhile,
  do: TokenKind.KwDo,
  return: TokenKind.KwReturn,
  break: TokenKind.KwBreak,
  continue: TokenKind.KwContinue,
  import: TokenKind.KwImport,
  package: TokenKind.KwPackage,
  is: TokenKind.KwIs,
  as: TokenKind.KwAs,
  in: TokenKind.KwIn,
  by: TokenKind.KwBy,
  override: TokenKind.KwOverride,
  open: TokenKind.KwOpen,
  abstract: TokenKind.KwAbstract,
  companion: TokenKind.KwCompanion,
  init: TokenKind.KwInit,
  constructor: TokenKind.KwConstructor,
  this: TokenKind.KwThis,
  super: TokenKind.KwSuper,
  launch: TokenKind.KwLaunch,
  async: TokenKind.KwAsync,
  suspend: TokenKind.KwSuspend,
  await: TokenKind.KwAwait,
  throw: TokenKind.KwThrow,
  try: TokenKind.KwTry,
  catch: TokenKind.KwCatch,
  finally: TokenKind.KwFinally,
  typealias: TokenKind.KwTypealias,
  operator: TokenKind.KwOperator,
  infix: TokenKind.KwInfix,
  inline: TokenKind.KwInline,
  reified: TokenKind.KwReified,
  external: TokenKind.KwExternal,
  internal: TokenKind.KwInternal,
  private: TokenKind.KwPrivate,
  protected: TokenKind.KwProtected,
  public: TokenKind.KwPublic,
  tailrec: TokenKind.KwTailrec,
  const: TokenKind.KwConst,
  lateinit: TokenKind.KwLateinit,
  final: TokenKind.KwFinal,
  true: TokenKind.BooleanLiteral,
  false: TokenKind.BooleanLiteral,
  null: TokenKind.NullLiteral,
};

/** Tokens after which a newline triggers automatic semicolon insertion */
const ASI_SET = new Set<TokenKind>([
  TokenKind.Identifier,
  TokenKind.IntLiteral,
  TokenKind.LongLiteral,
  TokenKind.FloatLiteral,
  TokenKind.DoubleLiteral,
  TokenKind.BooleanLiteral,
  TokenKind.NullLiteral,
  TokenKind.StringLiteral,
  TokenKind.RawStringLiteral,
  TokenKind.StringTemplateEnd,
  TokenKind.RParen,
  TokenKind.RBrace,
  TokenKind.RBracket,
  TokenKind.KwReturn,
  TokenKind.KwBreak,
  TokenKind.KwContinue,
  TokenKind.KwThis,
  TokenKind.KwSuper,
  TokenKind.BangBang,
]);

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

export class Lexer {
  private pos = 0;
  private line = 0;
  private col = 0;
  private readonly src: string;
  private readonly file: string;
  private readonly diag: DiagnosticBag;

  constructor(src: string, file: string, diag: DiagnosticBag) {
    this.src = src;
    this.file = file;
    this.diag = diag;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];
    let prevKind: TokenKind | null = null;

    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];

      // ── Whitespace ───────────────────────────────────────────────────────
      if (ch === " " || ch === "\t" || ch === "\r") {
        this.advance();
        continue;
      }

      // ── Newline → potential semicolon ────────────────────────────────────
      if (ch === "\n") {
        if (prevKind !== null && ASI_SET.has(prevKind) && !this.peekIsDotContinuation()) {
          const span = this.spanAt(this.pos, this.pos);
          tokens.push({ kind: TokenKind.Semicolon, span, text: "\n" });
          prevKind = TokenKind.Semicolon;
        }
        this.advance();
        continue;
      }

      // ── Comments ─────────────────────────────────────────────────────────
      if (ch === "/" && this.peek(1) === "/") {
        this.skipLineComment();
        continue;
      }
      if (ch === "/" && this.peek(1) === "*") {
        this.skipBlockComment();
        continue;
      }

      const tok = this.nextToken();
      if (tok) {
        tokens.push(tok);
        prevKind = tok.kind;
      }
    }

    // EOF
    tokens.push({
      kind: TokenKind.EOF,
      span: this.spanAt(this.pos, this.pos),
      text: "",
    });

    return tokens;
  }

  // ── Token dispatch ─────────────────────────────────────────────────────────

  private nextToken(): Token | null {
    const start = this.pos;
    const ch = this.src[start];
    if (ch === undefined) return null;

    // Identifiers & keywords
    if (isIdentStart(ch)) return this.lexIdentOrKeyword();

    // Numbers
    if (isDigit(ch)) return this.lexNumber();

    // Strings
    if (ch === '"') {
      if (this.peek(1) === '"' && this.peek(2) === '"') {
        return this.lexRawString();
      }
      return this.lexString();
    }

    // Operators & punctuation
    return this.lexSymbol();
  }

  // ── Identifier / keyword ───────────────────────────────────────────────────

  private lexIdentOrKeyword(): Token {
    const start = this.pos;
    const startLine = this.line;
    const startCol = this.col;

    while (this.pos < this.src.length && isIdentContinue(this.src[this.pos]!)) {
      this.advance();
    }

    const text = this.src.slice(start, this.pos);
    const span = this.makeSpan(start, startLine, startCol);

    if (text === "_") {
      return { kind: TokenKind.Underscore, span, text };
    }

    const kwKind = Object.prototype.hasOwnProperty.call(KEYWORDS, text) ? KEYWORDS[text] : undefined;
    if (kwKind !== undefined) {
      switch (kwKind) {
        case TokenKind.BooleanLiteral:
          return { kind: kwKind, span, text, value: text === "true" };
        case TokenKind.NullLiteral:
          return { kind: kwKind, span, text, value: null };
        default:
          return { kind: kwKind, span, text };
      }
    }

    return { kind: TokenKind.Identifier, span, text };
  }

  // ── Number literals ────────────────────────────────────────────────────────

  private lexNumber(): Token {
    const start = this.pos;
    const startLine = this.line;
    const startCol = this.col;

    let isHex = false;
    let isBinary = false;

    if (this.src[this.pos] === "0") {
      const next = this.peek(1);
      if (next === "x" || next === "X") {
        this.advance(); this.advance();
        isHex = true;
      } else if (next === "b" || next === "B") {
        this.advance(); this.advance();
        isBinary = true;
      }
    }

    if (isHex) {
      while (this.pos < this.src.length && isHexDigit(this.src[this.pos]!)) {
        this.advance();
      }
    } else if (isBinary) {
      while (this.pos < this.src.length && (this.src[this.pos] === "0" || this.src[this.pos] === "1")) {
        this.advance();
      }
    } else {
      while (this.pos < this.src.length && (isDigit(this.src[this.pos]!) || this.src[this.pos] === "_")) {
        this.advance();
      }
    }

    let isFloat = false;
    let isDouble = false;

    if (!isHex && !isBinary) {
      if (this.src[this.pos] === "." && isDigit(this.peek(1) ?? "")) {
        isDouble = true;
        this.advance(); // consume '.'
        while (this.pos < this.src.length && (isDigit(this.src[this.pos]!) || this.src[this.pos] === "_")) {
          this.advance();
        }
      }
      // Exponent
      if (this.src[this.pos] === "e" || this.src[this.pos] === "E") {
        isDouble = true;
        this.advance();
        if (this.src[this.pos] === "+" || this.src[this.pos] === "-") this.advance();
        while (this.pos < this.src.length && isDigit(this.src[this.pos]!)) this.advance();
      }
    }

    let suffix = "";
    const sc = this.src[this.pos];
    if (sc === "L" || sc === "l") { suffix = "L"; this.advance(); }
    else if (sc === "f" || sc === "F") { suffix = "f"; isFloat = true; this.advance(); }
    else if (sc === "d" || sc === "D") { suffix = "d"; isDouble = true; this.advance(); }

    const text = this.src.slice(start, this.pos);
    const span = this.makeSpan(start, startLine, startCol);
    const clean = text.replace(/_/g, "").replace(/[LlfFdD]$/, "");

    if (suffix === "L") {
      let val: bigint;
      try { val = BigInt(clean); }
      catch { this.diag.error(span, E_INVALID_NUMBER_LITERAL, `Invalid long literal: ${text}`); val = 0n; }
      return { kind: TokenKind.LongLiteral, span, text, value: val };
    }

    if (isFloat) {
      return { kind: TokenKind.FloatLiteral, span, text, value: parseFloat(clean) };
    }

    if (isDouble || text.includes(".") || text.toLowerCase().includes("e")) {
      return { kind: TokenKind.DoubleLiteral, span, text, value: parseFloat(clean) };
    }

    const intVal = isHex
      ? parseInt(clean.slice(2), 16)
      : isBinary
        ? parseInt(clean.slice(2), 2)
        : parseInt(clean, 10);

    if (isNaN(intVal)) {
      this.diag.error(span, E_INVALID_NUMBER_LITERAL, `Invalid integer literal: ${text}`);
      return { kind: TokenKind.IntLiteral, span, text, value: 0 };
    }

    return { kind: TokenKind.IntLiteral, span, text, value: intVal };
  }

  // ── String literals ────────────────────────────────────────────────────────

  private lexString(): Token {
    const start = this.pos;
    const startLine = this.line;
    const startCol = this.col;
    this.advance(); // consume opening "

    let value = "";
    let isTemplate = false;
    let closed = false;
    const templateParts: string[] = [];

    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === "\"") {
        this.advance();
        closed = true;
        break;
      }
      if (ch === "\n") {
        break;
      }
      if (ch === "$") {
        if (this.peek(1) === "{") {
          isTemplate = true;
          templateParts.push(value);
          value = "";
          // We just return the string fragment; the parser handles interpolation
          // by re-lexing nested expressions. For simplicity we encode templates
          // into a single StringTemplateExpr token with the raw text.
          // Consume ${ block
          this.advance(); this.advance();
          let depth = 1;
          let exprText = "";
          while (this.pos < this.src.length && depth > 0) {
            const ec = this.src[this.pos]!;
            if (ec === "{") depth++;
            else if (ec === "}") { depth--; if (depth === 0) { this.advance(); break; } }
            exprText += ec;
            this.advance();
          }
          templateParts.push(`\${${exprText}}`);
        } else if (isIdentStart(this.peek(1) ?? "")) {
          isTemplate = true;
          templateParts.push(value);
          value = "";
          this.advance(); // $
          const identStart = this.pos;
          while (this.pos < this.src.length && isIdentContinue(this.src[this.pos]!)) this.advance();
          const ident = this.src.slice(identStart, this.pos);
          templateParts.push(`\${${ident}}`);
        } else {
          value += ch;
          this.advance();
        }
        continue;
      }
      if (ch === "\\") {
        const span = this.makeSpan(this.pos, this.line, this.col);
        value += this.parseEscape(span);
        continue;
      }
      value += ch;
      this.advance();
    }

    if (!closed) {
      const span = this.makeSpan(start, startLine, startCol);
      this.diag.error(span, E_UNTERMINATED_STRING, "Unterminated string literal");
    }

    const text = this.src.slice(start, this.pos);
    const span = this.makeSpan(start, startLine, startCol);

    if (isTemplate) {
      const raw = templateParts.join("") + value;
      return { kind: TokenKind.StringLiteral, span, text, value: raw };
    }
    return { kind: TokenKind.StringLiteral, span, text, value };
  }

  private lexRawString(): Token {
    const start = this.pos;
    const startLine = this.line;
    const startCol = this.col;
    this.advance(); this.advance(); this.advance(); // consume """

    let value = "";
    let closed = false;
    while (this.pos < this.src.length) {
      if (this.src[this.pos] === '"' && this.peek(1) === '"' && this.peek(2) === '"') {
        this.advance(); this.advance(); this.advance();
        closed = true;
        break;
      }
      const c = this.src[this.pos]!;
      if (c === "\n") this.line++; // no col tracking in raw strings
      value += c;
      this.advance();
    }

    if (!closed) {
      const span = this.makeSpan(start, startLine, startCol);
      this.diag.error(span, E_UNTERMINATED_STRING, "Unterminated triple-quoted string");
    }

    const text = this.src.slice(start, this.pos);
    const span = this.makeSpan(start, startLine, startCol);
    return { kind: TokenKind.RawStringLiteral, span, text, value };
  }

  private parseEscape(span: Span): string {
    this.advance(); // consume backslash
    const ec = this.src[this.pos];
    this.advance();
    switch (ec) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case "\\": return "\\";
      case '"': return '"';
      case "'": return "'";
      case "0": return "\0";
      case "$": return "$";
      case "u": {
        if (this.src[this.pos] === "{") {
          this.advance(); // {
          let hex = "";
          while (this.pos < this.src.length && this.src[this.pos] !== "}") {
            hex += this.src[this.pos];
            this.advance();
          }
          this.advance(); // }
          const cp = parseInt(hex, 16);
          if (isNaN(cp)) {
            this.diag.error(span, E_INVALID_ESCAPE, `Invalid unicode escape: \\u{${hex}}`);
            return "";
          }
          return String.fromCodePoint(cp);
        }
        // \uXXXX
        let hex = "";
        for (let i = 0; i < 4; i++) {
          hex += this.src[this.pos] ?? "";
          this.advance();
        }
        const cp = parseInt(hex, 16);
        if (isNaN(cp)) {
          this.diag.error(span, E_INVALID_ESCAPE, `Invalid unicode escape: \\u${hex}`);
          return "";
        }
        return String.fromCharCode(cp);
      }
      default:
        this.diag.error(span, E_INVALID_ESCAPE, `Unknown escape sequence: \\${ec ?? ""}`);
        return ec ?? "";
    }
  }

  // ── Symbols & operators ────────────────────────────────────────────────────

  private lexSymbol(): Token | null {
    const start = this.pos;
    const startLine = this.line;
    const startCol = this.col;
    const ch = this.src[this.pos]!;
    const next = this.peek(1);
    const next2 = this.peek(2);

    const mk = (kind: TokenKind, len: number): Token => {
      const text = this.src.slice(start, start + len);
      for (let i = 0; i < len; i++) this.advance();
      return { kind, span: this.makeSpan(start, startLine, startCol), text };
    };

    switch (ch) {
      case "+":
        if (next === "+") return mk(TokenKind.PlusPlus, 2);
        if (next === "=") return mk(TokenKind.PlusEq, 2);
        return mk(TokenKind.Plus, 1);
      case "-":
        if (next === "-") return mk(TokenKind.MinusMinus, 2);
        if (next === "=") return mk(TokenKind.MinusEq, 2);
        if (next === ">") return mk(TokenKind.Arrow, 2);
        return mk(TokenKind.Minus, 1);
      case "*":
        if (next === "=") return mk(TokenKind.StarEq, 2);
        return mk(TokenKind.Star, 1);
      case "/":
        if (next === "=") return mk(TokenKind.SlashEq, 2);
        return mk(TokenKind.Slash, 1);
      case "%":
        if (next === "=") return mk(TokenKind.PercentEq, 2);
        return mk(TokenKind.Percent, 1);
      case "=":
        if (next === "=" && next2 === "=") return mk(TokenKind.EqEqEq, 3);
        if (next === "=") return mk(TokenKind.EqEq, 2);
        if (next === ">") return mk(TokenKind.FatArrow, 2);
        return mk(TokenKind.Eq, 1);
      case "!":
        if (next === "=" && next2 === "=") return mk(TokenKind.BangEqEq, 3);
        if (next === "=") return mk(TokenKind.BangEq, 2);
        if (next === "!") return mk(TokenKind.BangBang, 2);
        return mk(TokenKind.Bang, 1);
      case "<":
        if (next === "=") return mk(TokenKind.LtEq, 2);
        return mk(TokenKind.Lt, 1);
      case ">":
        if (next === "=") return mk(TokenKind.GtEq, 2);
        return mk(TokenKind.Gt, 1);
      case "&":
        if (next === "&") return mk(TokenKind.AmpAmp, 2);
        return mk(TokenKind.Amp, 1);
      case "|":
        if (next === "|") return mk(TokenKind.PipePipe, 2);
        return mk(TokenKind.Pipe, 1);
      case "?":
        if (next === ":") return mk(TokenKind.QuestionColon, 2);
        if (next === ".") return mk(TokenKind.QuestionDot, 2);
        return mk(TokenKind.Question, 1);
      case ".":
        if (next === "." && next2 === "<") return mk(TokenKind.DotDotLt, 3);
        if (next === ".") return mk(TokenKind.DotDot, 2);
        return mk(TokenKind.Dot, 1);
      case ":":
        if (next === ":") return mk(TokenKind.ColonColon, 2);
        return mk(TokenKind.Colon, 1);
      case "{": return mk(TokenKind.LBrace, 1);
      case "}": return mk(TokenKind.RBrace, 1);
      case "(": return mk(TokenKind.LParen, 1);
      case ")": return mk(TokenKind.RParen, 1);
      case "[": return mk(TokenKind.LBracket, 1);
      case "]": return mk(TokenKind.RBracket, 1);
      case ",": return mk(TokenKind.Comma, 1);
      case ";": return mk(TokenKind.Semicolon, 1);
      case "@": return mk(TokenKind.At, 1);
      case "#": return mk(TokenKind.Hash, 1);
      case "^": return mk(TokenKind.Caret, 1);
      case "~": return mk(TokenKind.Tilde, 1);
      default: {
        const span = this.makeSpan(start, startLine, startCol);
        this.diag.error(span, E_UNEXPECTED_CHAR, `Unexpected character: '${ch}'`);
        this.advance();
        return null;
      }
    }
  }

  // ── Comment skipping ───────────────────────────────────────────────────────

  private skipLineComment(): void {
    while (this.pos < this.src.length && this.src[this.pos] !== "\n") {
      this.advance();
    }
  }

  private skipBlockComment(): void {
    const start = this.pos;
    const startLine = this.line;
    const startCol = this.col;
    this.advance(); this.advance(); // /*
    let depth = 1;
    while (this.pos < this.src.length) {
      const c = this.src[this.pos]!;
      if (c === "/" && this.peek(1) === "*") { depth++; this.advance(); this.advance(); continue; }
      if (c === "*" && this.peek(1) === "/") {
        depth--;
        this.advance(); this.advance();
        if (depth === 0) return;
        continue;
      }
      this.advance();
    }
    const span = this.makeSpan(start, startLine, startCol);
    this.diag.error(span, E_UNTERMINATED_BLOCK_COMMENT, "Unterminated block comment");
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  /**
   * Returns true when the next meaningful token after the current newline is a
   * dot-continuation (`.member` or `?.member`), in which case ASI must NOT be
   * inserted so that multi-line method chains work correctly.
   *
   * Scans forward from `this.pos + 1` skipping whitespace and comments.
   * `.` followed by another `.` (range `..`) does NOT count as continuation.
   */
  private peekIsDotContinuation(): boolean {
    let i = this.pos + 1; // start after current '\n'
    while (i < this.src.length) {
      const c = this.src[i]!;
      // Skip horizontal whitespace and additional newlines
      if (c === " " || c === "\t" || c === "\r" || c === "\n") {
        i++;
        continue;
      }
      // Skip line comment
      if (c === "/" && this.src[i + 1] === "/") {
        while (i < this.src.length && this.src[i] !== "\n") i++;
        continue;
      }
      // Skip block comment
      if (c === "/" && this.src[i + 1] === "*") {
        i += 2;
        while (i < this.src.length - 1) {
          if (this.src[i] === "*" && this.src[i + 1] === "/") { i += 2; break; }
          i++;
        }
        continue;
      }
      // Single '.' that is NOT part of '..' (range) is a chain continuation
      if (c === ".") {
        return this.src[i + 1] !== ".";
      }
      // '?.' is a safe-call chain continuation
      if (c === "?" && this.src[i + 1] === ".") {
        return true;
      }
      // Any other character — not a chain continuation
      return false;
    }
    return false;
  }

  private advance(): void {
    if (this.src[this.pos] === "\n") {
      this.line++;
      this.col = 0;
    } else {
      this.col++;
    }
    this.pos++;
  }

  private peek(offset: number): string | undefined {
    return this.src[this.pos + offset];
  }

  private spanAt(startPos: number, endPos: number): Span {
    return {
      file: this.file,
      startLine: this.line,
      startCol: this.col,
      endLine: this.line,
      endCol: this.col,
      startOffset: startPos,
      endOffset: endPos,
    };
  }

  private makeSpan(startOffset: number, startLine: number, startCol: number): Span {
    return {
      file: this.file,
      startLine,
      startCol,
      endLine: this.line,
      endCol: this.col,
      startOffset,
      endOffset: this.pos,
    };
  }
}

// ---------------------------------------------------------------------------
// Character classification helpers
// ---------------------------------------------------------------------------

function isIdentStart(ch: string): boolean {
  return /[a-zA-Z_]/.test(ch);
}

function isIdentContinue(ch: string): boolean {
  return /[a-zA-Z0-9_]/.test(ch);
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isHexDigit(ch: string): boolean {
  return (ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f") || (ch >= "A" && ch <= "F");
}

// ---------------------------------------------------------------------------
// Public helper: lex a source file
// ---------------------------------------------------------------------------

export function lex(src: string, file: string, diag: DiagnosticBag): Token[] {
  return new Lexer(src, file, diag).tokenize();
}
