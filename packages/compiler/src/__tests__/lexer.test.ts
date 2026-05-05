import { describe, it, expect } from "vitest";
import { lex } from "../../dist/lexer.js";
import { DiagnosticBag } from "../../dist/diagnostics.js";
import { compile } from "../../dist/index.js";

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
  PlusPlus:       "PlusPlus",
  MinusMinus:     "MinusMinus",
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

describe("Lexer — ASI suppressed before dot continuation", () => {
  it("does NOT insert semicolon between ) and . on next line", () => {
    const t = tokens("foo()\n.bar");
    const kinds = t.map((x) => x.kind);
    expect(kinds).not.toContain(TK.Semicolon);
  });

  it("does NOT insert semicolon between identifier and . on next line", () => {
    const t = tokens("foo\n.bar");
    const kinds = t.map((x) => x.kind);
    expect(kinds).not.toContain(TK.Semicolon);
  });

  it("does NOT insert semicolon between } and . on next line", () => {
    const t = tokens("{ }\n.bar");
    const kinds = t.map((x) => x.kind);
    expect(kinds).not.toContain(TK.Semicolon);
  });

  it("does NOT insert semicolon between ] and . on next line", () => {
    const t = tokens("[1]\n.size");
    const kinds = t.map((x) => x.kind);
    expect(kinds).not.toContain(TK.Semicolon);
  });

  it("does NOT insert semicolon between ) and ?. on next line (safe call chain)", () => {
    const t = tokens("foo()\n?.bar");
    const kinds = t.map((x) => x.kind);
    expect(kinds).not.toContain(TK.Semicolon);
  });

  it("does NOT insert semicolon before . when separated by multiple blank lines", () => {
    const t = tokens("foo()\n\n\n.bar");
    const kinds = t.map((x) => x.kind);
    expect(kinds).not.toContain(TK.Semicolon);
  });

  it("does NOT insert semicolon before . when continuation line has leading whitespace", () => {
    const t = tokens("foo()\n    .bar");
    const kinds = t.map((x) => x.kind);
    expect(kinds).not.toContain(TK.Semicolon);
  });

  it("does NOT insert semicolon before . when a line comment precedes it on the same continuation line", () => {
    // The comment on the next line should not block chain detection
    const t = tokens("foo()\n// comment\n.bar");
    const kinds = t.map((x) => x.kind);
    expect(kinds).not.toContain(TK.Semicolon);
  });

  it("DOES insert semicolon between ) and .. (range operator) on next line", () => {
    // '..' is NOT a dot continuation — it's the range operator
    const t = tokens("x\n..9");
    const kinds = t.map((x) => x.kind);
    expect(kinds).toContain(TK.Semicolon);
    expect(kinds).toContain(TK.DotDot);
  });

  it("DOES insert semicolon between ) and a non-dot token on next line", () => {
    const t = tokens("foo()\nbar");
    const kinds = t.map((x) => x.kind);
    expect(kinds).toContain(TK.Semicolon);
  });

  it("DOES insert semicolon between string literal and identifier on next line", () => {
    const t = tokens('"hello"\nfoo');
    const kinds = t.map((x) => x.kind);
    expect(kinds).toContain(TK.Semicolon);
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

// Bug: PlusPlus and MinusMinus tokens are missing from ASI_SET, so
// a newline after i++ or i-- does not insert a semicolon.
describe("Lexer — ASI after ++ and -- (Bug: missing from ASI_SET)", () => {
  it("inserts semicolon after ++ at end of line", () => {
    const t = tokens("i++\nfoo");
    const kinds = t.map((x) => x.kind);
    expect(kinds).toContain(TK.Semicolon);
    // Semicolon must appear after the ++ token, not before it
    const ppIdx = kinds.indexOf(TK.PlusPlus);
    const semiIdx = kinds.indexOf(TK.Semicolon);
    expect(ppIdx).toBeGreaterThanOrEqual(0);
    expect(semiIdx).toBeGreaterThan(ppIdx);
  });

  it("inserts semicolon after -- at end of line", () => {
    const t = tokens("i--\nfoo");
    const kinds = t.map((x) => x.kind);
    expect(kinds).toContain(TK.Semicolon);
    const mmIdx = kinds.indexOf(TK.MinusMinus);
    const semiIdx = kinds.indexOf(TK.Semicolon);
    expect(mmIdx).toBeGreaterThanOrEqual(0);
    expect(semiIdx).toBeGreaterThan(mmIdx);
  });

  it("does NOT insert semicolon before ++ when ++ starts the next line (prefix)", () => {
    // `x\n++y` — here ++ is a prefix on the next line; should split into two statements
    // x gets a semicolon because it is an Identifier
    const t = tokens("x\n++y");
    const kinds = t.map((x) => x.kind);
    expect(kinds).toContain(TK.Semicolon);
  });

  it("++ followed by newline and call statement compiles without parse errors", () => {
    const result = compile(
      `fun f() {\n  var i = 0\n  i++\n  println(i)\n}\nfun println(any: Any) { }`,
      "<test>"
    );
    const errors = result.diagnostics.items.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("-- followed by newline and call statement compiles without parse errors", () => {
    const result = compile(
      `fun f() {\n  var i = 5\n  i--\n  println(i)\n}\nfun println(any: Any) { }`,
      "<test>"
    );
    const errors = result.diagnostics.items.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  it("post-increment result still emits correctly after ASI fix", () => {
    const result = compile(
      `fun f() {\n  var i = 0\n  i++\n  println(i)\n}\nfun println(any: Any) { }`,
      "<test>"
    );
    expect(result.code).toContain("i++");
  });
});
