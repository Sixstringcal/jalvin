import { describe, it, expect } from "vitest";
import { lex } from "../../dist/lexer.js";
import { parse } from "../../dist/parser.js";
import { compile } from "../../dist/index.js";
import { DiagnosticBag } from "../../dist/diagnostics.js";
import type { Program, FunDecl, ClassDecl, DataClassDecl, Block, PropertyDecl, CallExpr, MemberExpr, NameExpr, ExprStmt } from "../../dist/ast.js";

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

// ─────────────────────────────────────────────────────────────────────────────
// Method chaining — same-line and multi-line
// ─────────────────────────────────────────────────────────────────────────────

describe("Parser — method chaining in call arguments", () => {
  it("parses a two-link method chain on a single line as a positional argument", () => {
    const { diag } = parseSource(
      `fun test() { foo(Modifier.className("x").marginRight("10px")) }`
    );
    expect(diag.hasErrors).toBe(false);
  });

  it("parses a named argument whose value is a single-line method chain", () => {
    const { diag } = parseSource(
      `fun test() { Button(modifier = Modifier.className("x").marginRight("10px")) }`
    );
    expect(diag.hasErrors).toBe(false);
  });

  it("parses a three-link chain on a single line", () => {
    const { diag } = parseSource(
      `fun test() { foo(Modifier.a("1").b("2").c("3")) }`
    );
    expect(diag.hasErrors).toBe(false);
  });

  it("parses a two-link chain where the dot continuation is on the next line (multi-line named arg)", () => {
    const { diag } = parseSource(
`fun test() {
  Button(
    modifier = Modifier.className("foo")
      .marginRight("10px"),
    onClick = {}
  )
}`
    );
    expect(diag.hasErrors).toBe(false);
  });

  it("parses a positional argument chain with dot on the next line", () => {
    const { diag } = parseSource(
`fun test() {
  foo(
    Modifier.className("foo")
      .marginRight("10px")
  )
}`
    );
    expect(diag.hasErrors).toBe(false);
  });

  it("parses a three-link chain spread over multiple lines", () => {
    const { diag } = parseSource(
`fun test() {
  foo(
    Modifier
      .a("1")
      .b("2")
      .c("3")
  )
}`
    );
    expect(diag.hasErrors).toBe(false);
  });

  it("parses multi-line chain as a named argument alongside other named arguments", () => {
    const { diag } = parseSource(
`fun test() {
  Button(
    modifier = Modifier.className("foo")
      .marginRight("10px")
      .paddingLeft("5px"),
    label = "Click me",
    onClick = {}
  )
}`
    );
    expect(diag.hasErrors).toBe(false);
  });

  it("parses a safe-call chain (\\`?.\\`) with dot on the next line", () => {
    const { diag } = parseSource(
`fun test() {
  foo(
    bar?.baz()
      ?.qux()
  )
}`
    );
    expect(diag.hasErrors).toBe(false);
  });

  it("parses chain on new line in an expression-body function", () => {
    const { diag } = parseSource(
`fun buildMod() = Modifier.className("foo")
  .marginRight("10px")`
    );
    expect(diag.hasErrors).toBe(false);
  });

  it("parses chain on new line in a variable initializer", () => {
    const { diag } = parseSource(
`fun test() {
  val m = Modifier.className("foo")
    .marginRight("10px")
}`
    );
    expect(diag.hasErrors).toBe(false);
  });

  it("parses chain with trailing lambda that itself follows a dot-continuation", () => {
    const { diag } = parseSource(
`fun test() {
  list
    .filter { it > 0 }
    .map { it * 2 }
}`
    );
    expect(diag.hasErrors).toBe(false);
  });
});

describe("Parser — method chaining AST shape", () => {
  it("builds a CallExpr whose callee is a MemberExpr for a two-link chain", () => {
    const { program, diag } = parseSource(
      `fun test() { val m = Modifier.className("foo").marginRight("10px") }`
    );
    expect(diag.hasErrors).toBe(false);
    // Navigate: FunDecl → body(Block) → first stmt (PropertyDecl) → initializer
    const fn = program.declarations[0] as FunDecl;
    const body = fn.body as Block;
    const prop = body.statements[0] as PropertyDecl;
    const init = prop.initializer!;
    expect(init.kind).toBe("CallExpr");
    const callExpr = init as CallExpr;
    expect(callExpr.callee.kind).toBe("MemberExpr");
    const callee = callExpr.callee as MemberExpr;
    expect(callee.member).toBe("marginRight");
    expect(callee.target.kind).toBe("CallExpr");
  });

  it("builds the same AST shape whether chain is on one line or split across lines", () => {
    const oneLine = parseSource(
      `fun test() { val m = Modifier.className("foo").marginRight("10px") }`
    );
    const multiLine = parseSource(
`fun test() {
  val m = Modifier.className("foo")
    .marginRight("10px")
}`
    );
    expect(oneLine.diag.hasErrors).toBe(false);
    expect(multiLine.diag.hasErrors).toBe(false);

    type AnyExpr = { kind: string; callee?: AnyExpr; target?: AnyExpr; member?: string; name?: string };

    const shape = (e: AnyExpr): string => {
      if (e.kind === "CallExpr") return `Call(${shape(e.callee!)})`;
      if (e.kind === "MemberExpr") return `Member(${shape(e.target!)}, ${e.member})`;
      if (e.kind === "NameExpr") return e.name!;
      return e.kind;
    };

    const extractShape = (prog: Program): string => {
      const fn = prog.declarations[0] as FunDecl;
      const body = fn.body as Block;
      const prop = body.statements[0] as PropertyDecl;
      return shape(prop.initializer! as AnyExpr);
    };

    expect(extractShape(oneLine.program)).toBe(extractShape(multiLine.program));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug-fix tests — v2.0.13
// ─────────────────────────────────────────────────────────────────────────────

describe("Parser — safe invocation ?.()", () => {
  it("parses x?.() with no args as SafeCallExpr", () => {
    const { program, diag } = parseSource(`fun f(cb: (() -> Unit)?) { cb?.() }`);
    expect(diag.hasErrors).toBe(false);
    const fn = program.declarations[0] as FunDecl;
    const body = fn.body as Block;
    const stmt = body.statements[0] as import("../../dist/ast.js").ExprStmt;
    expect(stmt.expr.kind).toBe("SafeCallExpr");
  });

  it("parses x?.(arg) with arguments as SafeCallExpr", () => {
    const { program, diag } = parseSource(`fun f(cb: ((Int) -> Unit)?) { cb?.(42) }`);
    expect(diag.hasErrors).toBe(false);
    const fn = program.declarations[0] as FunDecl;
    const body = fn.body as Block;
    const stmt = body.statements[0] as import("../../dist/ast.js").ExprStmt;
    expect(stmt.expr.kind).toBe("SafeCallExpr");
  });

  it("distinguishes ?. member access from ?.() invocation in the same source", () => {
    const { diag } = parseSource(`
fun f(s: String?, cb: (() -> Unit)?) {
  val n = s?.length
  cb?.()
}`);
    expect(diag.hasErrors).toBe(false);
  });
});

describe("Parser — nullable function types", () => {
  it("parses (() -> Unit)? as a nullable function type property", () => {
    const { program, diag } = parseSource(`class A { var onExpired: (() -> Unit)? = null }`);
    expect(diag.hasErrors).toBe(false);
    const cls = program.declarations[0] as ClassDecl;
    const prop = cls.body!.members[0] as PropertyDecl;
    expect(prop.name).toBe("onExpired");
    expect(prop.type?.kind).toBe("NullableTypeRef");
  });

  it("parses ((Int) -> String)? as a nullable parameterised function type", () => {
    const { program, diag } = parseSource(`var mapper: ((Int) -> String)? = null`);
    expect(diag.hasErrors).toBe(false);
    const prop = program.declarations[0] as PropertyDecl;
    expect(prop.type?.kind).toBe("NullableTypeRef");
  });

  it("parses ((Int, Boolean) -> Unit)? with multiple params", () => {
    const { diag } = parseSource(`var handler: ((Int, Boolean) -> Unit)? = null`);
    expect(diag.hasErrors).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug-fix tests — else-if ASI, explicit type params, null-check smart-cast
// ─────────────────────────────────────────────────────────────────────────────

describe("Parser — else if on a new line (ASI fix)", () => {
  it("parses else if on a new line without error", () => {
    const { diag } = parseSource(
`fun classify(n: Int): String {
  if (n < 0) {
    return "negative"
  } else if (n == 0) {
    return "zero"
  } else {
    return "positive"
  }
}`
    );
    expect(diag.hasErrors).toBe(false);
  });

  it("parses a three-way else-if chain with all branches on new lines", () => {
    const { diag } = parseSource(
`fun f(x: Int) {
  if (x == 1) {
    println("one")
  } else if (x == 2) {
    println("two")
  } else if (x == 3) {
    println("three")
  } else {
    println("other")
  }
}`
    );
    expect(diag.hasErrors).toBe(false);
  });

  it("produces an IfStmt with a nested IfStmt as the else clause", () => {
    const { program, diag } = parseSource(
`fun f(x: Int) {
  if (x > 0) {
    println("pos")
  } else if (x < 0) {
    println("neg")
  } else {
    println("zero")
  }
}`
    );
    expect(diag.hasErrors).toBe(false);
    const fn = program.declarations[0] as FunDecl;
    const body = fn.body as Block;
    const outer = body.statements[0] as import("../../dist/ast.js").IfStmt;
    expect(outer.kind).toBe("IfStmt");
    expect(outer.else?.kind).toBe("IfStmt");
    const inner = outer.else as import("../../dist/ast.js").IfStmt;
    expect(inner.else?.kind).toBe("Block");
  });

  it("inline else if on the same line still works", () => {
    const { diag } = parseSource(
      `fun f(x: Int) { if (x > 0) { } else if (x < 0) { } else { } }`
    );
    expect(diag.hasErrors).toBe(false);
  });
});

describe("Parser — explicit type parameters on call expressions", () => {
  it("parses mutableListOf<String>() without error", () => {
    const { diag } = parseSource(`fun f() { val xs = mutableListOf<String>() }`);
    expect(diag.hasErrors).toBe(false);
  });

  it("parses listOf<Int>() without error", () => {
    const { diag } = parseSource(`fun f() { val xs = listOf<Int>() }`);
    expect(diag.hasErrors).toBe(false);
  });

  it("parses mutableListOf<String?>() with a nullable type arg", () => {
    const { diag } = parseSource(`fun f() { val xs = mutableListOf<String?>() }`);
    expect(diag.hasErrors).toBe(false);
  });

  it("produces a CallExpr with the correct typeArgs", () => {
    const { program, diag } = parseSource(`fun f() { val xs = mutableListOf<String>() }`);
    expect(diag.hasErrors).toBe(false);
    const fn = program.declarations[0] as FunDecl;
    const body = fn.body as Block;
    const prop = body.statements[0] as PropertyDecl;
    const call = prop.initializer as CallExpr;
    expect(call.kind).toBe("CallExpr");
    expect(call.typeArgs).toHaveLength(1);
  });

  it("still parses a < comparison without treating it as a type arg", () => {
    const { diag } = parseSource(`fun f(a: Int, b: Int): Boolean { return a < b }`);
    expect(diag.hasErrors).toBe(false);
  });

  it("parses an if expression passed to mutableListOf as a call arg without confusion", () => {
    const { diag } = parseSource(
      `fun f(cond: Boolean) { val xs = mutableListOf(if (cond) "a" else "b") }`
    );
    expect(diag.hasErrors).toBe(false);
  });
});

describe("Parser — keyword tokens as named argument labels", () => {
  it("parses `as` as a named argument label without error", () => {
    const { diag } = parseSource(`fun f() { Text(as = "pre") }`);
    expect(diag.hasErrors).toBe(false);
  });

  it("produces a CallArg with name = 'as' for as = ...", () => {
    const { program, diag } = parseSource(`fun f() { Text(as = "pre") }`);
    expect(diag.hasErrors).toBe(false);
    const fn = program.declarations[0] as FunDecl;
    const body = fn.body as Block;
    const call = (body.statements[0] as ExprStmt).expr as CallExpr;
    expect(call.args[0]!.name).toBe("as");
  });

  it("compiles Text(as = 'pre') to Text({ as: 'pre' })", () => {
    const { code } = compile(`
      import @jalvin/ui.Text
      component fun App() { return Text(as = "pre") }
    `);
    expect(code).toContain(`Text({ as: "pre" })`);
  });
});
