import { describe, it, expect } from "vitest";
import { lex } from "../../dist/lexer.js";
import { DiagnosticBag } from "../../dist/diagnostics.js";

// TokenKind is a const enum — values are inlined as string literals at compile time.
// We use the string values directly here so that dist imports work correctly.
const TK = {
  IntLiteral:     "IntLiteral",
  LongLiteral:    "LongLiteral",
  FloatLiteral:   "FloatLiteral",
  DoubleLiteral:  "DoubleLiteral",
  BooleanLiteral: "BooleanLiteral",
  NullLiteral:    "NullLiteral",
  StringLiteral:  "StringLiteral",
  Semicolon:      "Semicolon",
  KwFun:          "KwFun",
  KwComponent:    "KwComponent",
  KwVal:          "KwVal",
  KwVar:          "KwVar",
  KwWhen:         "KwWhen",
  KwSuspend:      "KwSuspend",
  KwSealed:       "KwSealed",
  KwData:         "KwData",
  QuestionDot:    "QuestionDot",
  QuestionColon:  "QuestionColon",
  BangBang:       "BangBang",
  DotDot:         "DotDot",
  DotDotLt:       "DotDotLt",
  Arrow:          "Arrow",
} as const;

function tokens(src: string) {
  const diag = new DiagnosticBag();
  return lex(src, "<test>", diag);
}

function noErrors(src: string) {
  const diag = new DiagnosticBag();
  lex(src, "<test>", diag);
  return diag.items;
}

describe("Lexer — literals", () => {
  it("tokenises integer literal", () => {
    const toks = tokens("42");
    expect(toks[0]?.kind).toBe(TK.IntLiteral);
    expect(toks[0]?.text).toBe("42");
  });

  it("tokenises long literal", () => {
    const toks = tokens("42L");
    expect(toks[0]?.kind).toBe(TK.LongLiteral);
  });

  it("tokenises float literal", () => {
    const toks = tokens("3.14f");
    expect(toks[0]?.kind).toBe(TK.FloatLiteral);
  });

  it("tokenises double literal", () => {
    const toks = tokens("3.14");
    expect(toks[0]?.kind).toBe(TK.DoubleLiteral);
  });

  it("tokenises boolean literals", () => {
    const t = tokens("true false");
    expect(t[0]?.kind).toBe(TK.BooleanLiteral);
    expect(t[1]?.kind).toBe(TK.BooleanLiteral);
  });

  it("tokenises null literal", () => {
    const t = tokens("null");
    expect(t[0]?.kind).toBe(TK.NullLiteral);
  });

  it("tokenises string literal", () => {
    const t = tokens('"hello"');
    expect(t.some((x) => x.kind === TK.StringLiteral)).toBe(true);
  });

  it("tokenises hex int literal", () => {
    const t = tokens("0xFF");
    expect(t[0]?.kind).toBe(TK.IntLiteral);
  });

  it("tokenises binary int literal", () => {
    const t = tokens("0b1010");
    expect(t[0]?.kind).toBe(TK.IntLiteral);
  });

  it("tokenises underscore-separated int", () => {
    const t = tokens("1_000_000");
    expect(t[0]?.kind).toBe(TK.IntLiteral);
  });
});

describe("Lexer — keywords", () => {
  it("recognises 'fun' keyword", () => {
    const t = tokens("fun");
    expect(t[0]?.kind).toBe(TK.KwFun);
  });

  it("recognises 'component' keyword", () => {
    const t = tokens("component");
    expect(t[0]?.kind).toBe(TK.KwComponent);
  });

  it("recognises 'val' and 'var'", () => {
    const t = tokens("val var");
    expect(t[0]?.kind).toBe(TK.KwVal);
    expect(t[1]?.kind).toBe(TK.KwVar);
  });

  it("recognises 'when'", () => {
    const t = tokens("when");
    expect(t[0]?.kind).toBe(TK.KwWhen);
  });

  it("recognises 'suspend'", () => {
    const t = tokens("suspend");
    expect(t[0]?.kind).toBe(TK.KwSuspend);
  });

  it("recognises 'sealed' and 'data'", () => {
    const t = tokens("sealed data");
    expect(t[0]?.kind).toBe(TK.KwSealed);
    expect(t[1]?.kind).toBe(TK.KwData);
  });
});

describe("Lexer — operators", () => {
  it("tokenises safe call operator", () => {
    const t = tokens("x?.y");
    const kinds = t.map((x) => x.kind);
    expect(kinds).toContain(TK.QuestionDot);
  });

  it("tokenises Elvis operator", () => {
    const t = tokens("a ?: b");
    const kinds = t.map((x) => x.kind);
    expect(kinds).toContain(TK.QuestionColon);
  });

  it("tokenises not-null assertion", () => {
    const t = tokens("x!!");
    const kinds = t.map((x) => x.kind);
    expect(kinds).toContain(TK.BangBang);
  });

  it("tokenises range operator", () => {
    const t = tokens("0..9");
    const kinds = t.map((x) => x.kind);
    expect(kinds).toContain(TK.DotDot);
  });

  it("tokenises exclusive range", () => {
    const t = tokens("0..<10");
    const kinds = t.map((x) => x.kind);
    expect(kinds).toContain(TK.DotDotLt);
  });

  it("tokenises arrow", () => {
    const t = tokens("-> ");
    expect(t[0]?.kind).toBe(TK.Arrow);
  });
});

describe("Lexer — automatic semicolon insertion", () => {
  it("inserts semicolon after identifier on newline", () => {
    const t = tokens("foo\nbar");
    const kinds = t.map((x) => x.kind);
    expect(kinds).toContain(TK.Semicolon);
  });

  it("inserts semicolon after closing paren on newline", () => {
    const t = tokens("(x)\nfoo");
    const kinds = t.map((x) => x.kind);
    expect(kinds).toContain(TK.Semicolon);
  });

  it("does NOT insert semicolon after binary operator", () => {
    const t = tokens("a +\nb");
    const kinds = t.map((x) => x.kind);
    const semis = kinds.filter((k) => k === TK.Semicolon);
    expect(semis.length).toBe(0);
  });
});

describe("Lexer — errors", () => {
  it("reports E0001 for unterminated string", () => {
    const diag = new DiagnosticBag();
    lex('"unterminated', "<test>", diag);
    expect(diag.items.some((d) => d.code === "E0001")).toBe(true);
  });

  it("reports E0010 for unexpected character", () => {
    const diag = new DiagnosticBag();
    lex("@#$", "<test>", diag);
    // @-sign is used for annotations, # is not valid
    expect(diag.items.length).toBeGreaterThan(0);
  });

  it("reports E0004 for unterminated block comment", () => {
    const diag = new DiagnosticBag();
    lex("/* never closed", "<test>", diag);
    expect(diag.items.some((d) => d.code === "E0004")).toBe(true);
  });

  it("produces no errors for valid source", () => {
    expect(noErrors("val x: Int = 42")).toHaveLength(0);
  });
});
