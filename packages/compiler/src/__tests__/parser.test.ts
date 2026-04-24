import { describe, it, expect } from "vitest";
import { lex } from "../../dist/lexer.js";
import { parse } from "../../dist/parser.js";
import { DiagnosticBag } from "../../dist/diagnostics.js";
import type { Program, FunDecl, ClassDecl, DataClassDecl } from "../../dist/ast.js";

function parseSource(src: string): { program: Program; diag: DiagnosticBag } {
  const diag = new DiagnosticBag();
  const tokens = lex(src, "<test>", diag);
  const program = parse(tokens, "<test>", diag, src);
  return { program, diag };
}

describe("Parser — function declarations", () => {
  it("parses a simple fun with no params", () => {
    const { program, diag } = parseSource(`fun hello() { }`);
    expect(diag.items).toHaveLength(0);
    expect(program.declarations).toHaveLength(1);
    const fn = program.declarations[0] as FunDecl;
    expect(fn.kind).toBe("FunDecl");
    expect(fn.name).toBe("hello");
    expect(fn.params).toHaveLength(0);
  });

  it("parses a fun with parameters and return type", () => {
    const { program, diag } = parseSource(`fun add(a: Int, b: Int): Int { return a + b }`);
    expect(diag.hasErrors).toBe(false);
    const fn = program.declarations[0] as FunDecl;
    expect(fn.params).toHaveLength(2);
    expect(fn.params[0]?.name).toBe("a");
    expect(fn.params[1]?.name).toBe("b");
    expect(fn.returnType).toBeTruthy();
  });

  it("parses expression body function", () => {
    const { program, diag } = parseSource(`fun square(x: Int) = x * x`);
    expect(diag.hasErrors).toBe(false);
    const fn = program.declarations[0] as FunDecl;
    expect(fn.body).toBeTruthy();
  });

  it("parses suspend fun", () => {
    const { program, diag } = parseSource(`suspend fun loadData(): String { return "ok" }`);
    expect(diag.hasErrors).toBe(false);
    const fn = program.declarations[0] as FunDecl;
    expect(fn.modifiers.modifiers).toContain("suspend");
  });

  it("parses default parameter values", () => {
    const { program, diag } = parseSource(`fun greet(name: String = "World") { }`);
    expect(diag.hasErrors).toBe(false);
    const fn = program.declarations[0] as FunDecl;
    expect(fn.params[0]?.defaultValue).toBeTruthy();
  });
});

describe("Parser — class declarations", () => {
  it("parses a simple class", () => {
    const { program, diag } = parseSource(`class Foo { }`);
    expect(diag.hasErrors).toBe(false);
    const cls = program.declarations[0] as ClassDecl;
    expect(cls.kind).toBe("ClassDecl");
    expect(cls.name).toBe("Foo");
  });

  it("parses primary constructor", () => {
    const { program, diag } = parseSource(`class Point(val x: Double, val y: Double) { }`);
    expect(diag.hasErrors).toBe(false);
    const cls = program.declarations[0] as ClassDecl;
    expect(cls.primaryConstructor).toBeTruthy();
    expect(cls.primaryConstructor?.params).toHaveLength(2);
  });

  it("parses data class", () => {
    const { program, diag } = parseSource(`data class User(val id: Int, val name: String)`);
    expect(diag.hasErrors).toBe(false);
    const dc = program.declarations[0] as DataClassDecl;
    expect(dc.kind).toBe("DataClassDecl");
    expect(dc.primaryConstructor.params).toHaveLength(2);
  });

  it("parses sealed class with subtypes", () => {
    const { program, diag } = parseSource(`
sealed class Result {
  data class Success(val value: String) : Result()
  data class Failure(val error: String) : Result()
}`);
    expect(diag.hasErrors).toBe(false);
    const sc = program.declarations[0];
    expect(sc?.kind).toBe("SealedClassDecl");
  });

  it("parses class with companion object", () => {
    const { program, diag } = parseSource(`
class Foo {
  companion object {
    fun create(): Foo = Foo()
  }
}`);
    expect(diag.hasErrors).toBe(false);
  });
});

describe("Parser — control flow", () => {
  it("parses if expression", () => {
    const { program, diag } = parseSource(`val x = if (true) 1 else 2`);
    expect(diag.hasErrors).toBe(false);
  });

  it("parses when statement", () => {
    const { program, diag } = parseSource(`
fun check(n: Int) {
  when (n) {
    1 -> println("one")
    2 -> println("two")
    else -> println("other")
  }
}`);
    expect(diag.hasErrors).toBe(false);
  });

  it("parses for loop with range", () => {
    const { program, diag } = parseSource(`
fun loop() {
  for (i in 0..9) { }
}`);
    expect(diag.hasErrors).toBe(false);
  });

  it("parses try/catch/finally", () => {
    const { program, diag } = parseSource(`
val r = try { 42 } catch (e: Exception) { 0 } finally { }`);
    expect(diag.hasErrors).toBe(false);
  });

  it("parses while loop", () => {
    const { program, diag } = parseSource(`
fun run() {
  var i = 0
  while (i < 10) { i = i + 1 }
}`);
    expect(diag.hasErrors).toBe(false);
  });
});

describe("Parser — expressions", () => {
  it("parses lambda with trailing syntax", () => {
    const { program, diag } = parseSource(`val doubled = listOf(1, 2).map { it * 2 }`);
    expect(diag.hasErrors).toBe(false);
  });

  it("parses string template", () => {
    const { program, diag } = parseSource(`val s = "Hello $name!"`);
    expect(diag.hasErrors).toBe(false);
  });

  it("parses string template with expression", () => {
    const { program, diag } = parseSource(`val s = "Result: \${a + b}"`);
    expect(diag.hasErrors).toBe(false);
  });

  it("parses safe call chain", () => {
    const { program, diag } = parseSource(`val n = x?.length`);
    expect(diag.hasErrors).toBe(false);
  });

  it("parses Elvis operator", () => {
    const { program, diag } = parseSource(`val n = x ?: 0`);
    expect(diag.hasErrors).toBe(false);
  });

  it("parses type check expression", () => {
    const { program, diag } = parseSource(`val b = x is String`);
    expect(diag.hasErrors).toBe(false);
  });

  it("parses safe cast expression", () => {
    const { program, diag } = parseSource(`val s = x as? String`);
    expect(diag.hasErrors).toBe(false);
  });

  it("parses destructuring declaration", () => {
    const { program, diag } = parseSource(`val (a, b) = pair`);
    expect(diag.hasErrors).toBe(false);
  });
});

describe("Parser — imports", () => {
  it("parses star import", () => {
    const { program, diag } = parseSource(`import @jalvin/runtime.*`);
    expect(diag.hasErrors).toBe(false);
    expect(program.imports[0]?.star).toBe(true);
  });

  it("parses named import", () => {
    const { program, diag } = parseSource(`import @jalvin/runtime.Bibi`);
    expect(diag.hasErrors).toBe(false);
    expect(program.imports[0]?.star).toBeFalsy();
  });

  it("parses import alias", () => {
    const { program, diag } = parseSource(`import @jalvin/runtime.Bibi as Http`);
    expect(diag.hasErrors).toBe(false);
    expect(program.imports[0]?.alias).toBe("Http");
  });
});
