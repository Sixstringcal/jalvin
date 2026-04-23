import { describe, it, expect } from "vitest";
import { compile } from "../index.js";

function gen(src: string): string {
  // Inject some standard globals so the typechecker is happy and we get code output.
  // BUT: imports must come FIRST in Jalvin. So we must inject prelude AFTER imports if they exist.
  let fullSrc = "";
  const lines = src.split("\n");
  let i = 0;
  while (i < lines.length && (lines[i]!.trim().startsWith("import ") || lines[i]!.trim() === "")) {
    fullSrc += lines[i] + "\n";
    i++;
  }

  const prelude = `
    val a = 1
    val b = 2
    val s = "hi"
    val name = "world"
    fun println(any: Any) { }
    fun mapOf(vararg pairs: Any): Any = null
    fun delay(ms: Long) { }
  `;
  
  fullSrc += prelude + lines.slice(i).join("\n");

  const res = compile(fullSrc, "<test>");
  return res.code;
}

describe("Codegen — functions", () => {
  it("emits export function", () => {
    const code = gen(`fun greet(name: String): String = "Hello, $name!"`);
    expect(code).toContain("export function greet");
  });

  it("emits async for suspend fun", () => {
    const code = gen(`suspend fun load(): String { return "ok" }`);
    expect(code).toContain("async function load");
  });

  it("emits expression body function", () => {
    const code = gen(`fun double(x: Int): Int = x * 2`);
    expect(code).toContain("return (x * 2)");
  });
});

describe("Codegen — classes", () => {
  it("emits class declaration", () => {
    const code = gen(`class Greeter(val name: String) { }`);
    expect(code).toContain("class Greeter");
  });

  it("emits data class with copy/equals/toString", () => {
    const code = gen(`data class Point(val x: Double, val y: Double)`);
    expect(code).toContain("class Point");
    expect(code).toContain("copy(");
    expect(code).toContain("toString()");
  });

  it("emits companion object members as static", () => {
    const code = gen(`
class Counter {
  companion object {
    fun zero(): Int = 0
  }
}`);
    expect(code).toContain("static zero");
  });
});

describe("Codegen — null safety", () => {
  it("emits ?? for Elvis operator", () => {
    const code = gen(`val x: Int? = null; val y = x ?: 0`);
    expect(code).toContain("??");
  });

  it("emits ?. for safe call", () => {
    const code = gen(`fun f(s: String?) { val n = s?.length }`);
    expect(code).toContain("?.");
  });

  it("emits notNull for not-null assertion", () => {
    const code = gen(`fun f(s: String?) { val n = s!! }`);
    expect(code).toContain("notNull(s)");
  });
});

describe("Codegen — collections", () => {
  it("emits Object.entries for regular map for-loop", () => {
    const code = gen(`
fun f() {
  val m = mapOf("a" to 1)
  for ((k, v) in m) { println(k) }
}`);
    // Regular map — no type info so defaults to Object.entries
    expect(code).toContain("for (const [k, v] of");
  });
});

describe("Codegen — control flow", () => {
  it("emits ternary / if-else for if expression", () => {
    const code = gen(`val max = if (a > b) a else b`);
    expect(code).toContain("? a : b");
  });

  it("emits switch-style when", () => {
    const code = gen(`
fun label(n: Int): String {
  return when (n) {
    1 -> "one"
    else -> "other"
  }
}`);
    expect(code).toContain("if (__s === 1)");
  });
});

describe("Codegen — coroutines", () => {
  it("emits IIFE for launch block", () => {
    const code = gen(`
fun start() {
  launch { println("hello") }
}`);
    expect(code).toContain("async");
  });

  it("emits Promise IIFE for async block", () => {
    const code = gen(`
suspend fun run() {
  val d = async { 42 }
}`);
    expect(code).toContain("async");
  });
});

describe("Codegen — @Nuked annotation", () => {
  it("emits @deprecated JSDoc for @Nuked function", () => {
    const code = gen(`
@Nuked("use newApi instead")
fun oldApi(): String = "legacy"`);
    expect(code).toContain("@deprecated");
    expect(code).toContain("use newApi instead");
  });
});

describe("Codegen — imports", () => {
  it("emits star import as namespace", () => {
    const code = gen(`import @jalvin/runtime.*`);
    expect(code).toContain("import *");
  });

  it("emits named import", () => {
    const code = gen(`import @jalvin/runtime.Bibi`);
    expect(code).toContain("import { Bibi }");
  });

  it("emits aliased import correctly", () => {
    const code = gen(`import @jalvin/runtime.Bibi as Http`);
    expect(code).toContain("import { Bibi as Http }");
  });
});

describe("Codegen — JSX", () => {
  it("emits JSX element", () => {
    const code = gen(`
component fun Hello() {
  return (<div class="hello">Hi</div>)
}`);
    expect(code).toContain("<div");
    expect(code).toContain("className");
  });

  it("emits JSX self-closing element", () => {
    const code = gen(`
component fun Hr() {
  return (<hr />)
}`);
    expect(code).toContain("<hr");
  });

  it("maps class attribute to className", () => {
    const code = gen(`component fun F() { return (<div class="x" />) }`);
    expect(code).toContain("className");
    expect(code).not.toContain(' class=');
  });

  it("maps for attribute to htmlFor", () => {
    const code = gen(`component fun F() { return (<label for="x" />) }`);
    expect(code).toContain("htmlFor");
  });

  it("emits component function as React FC", () => {
    const code = gen(`component fun Button(label: String) { return (<button>{label}</button>) }`);
    expect(code).toContain("export function Button");
  });
});

describe("Codegen — string templates", () => {
  it("emits template literal for interpolated string", () => {
    const code = gen(`val greeting = "Hello, $name!"`);
    expect(code).toContain("`Hello, ${name}!`");
  });

  it("emits template literal for expression interpolation", () => {
    const code = gen("val s2 = \"Result: ${a + b}\"");
    // raw string or template — either way has interpolation
    expect(code).toContain("a + b");
  });
});
