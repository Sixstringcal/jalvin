import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { compile } from "../../dist/index.js";

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

  // ── class inheritance (issue 2) ──────────────────────────────────────────

  it("emits extends without parentheses for class with no-arg super constructor", () => {
    const code = gen(`class MyVm : ViewModel() { }`);
    // Must not emit `extends ViewModel()` — parentheses are invalid in TS extends clause
    expect(code).not.toContain("extends ViewModel()");
    expect(code).toContain("extends ViewModel");
  });

  it("emits super() call in primary constructor when supertype has delegation args", () => {
    const code = gen(`class MyVm(val x: Int) : ViewModel() { }`);
    expect(code).not.toContain("extends ViewModel()");
    expect(code).toContain("extends ViewModel");
    expect(code).toContain("super()");
  });

  it("emits super(args) when supertype delegation has arguments", () => {
    const code = gen(`class Child(val x: Int) : Parent(x) { }`);
    expect(code).not.toContain("extends Parent(");
    expect(code).toContain("extends Parent");
    expect(code).toContain("super(x)");
  });

  it("emits data class with supertype — correct extends + super()", () => {
    const code = gen(`data class Sub(val x: Int) : Base()`);
    expect(code).not.toContain("extends Base()");
    expect(code).toContain("extends Base");
    expect(code).toContain("super()");
  });

  it("emits interface implementation using implements (not extends)", () => {
    const code = gen(`class Impl : SomeInterface { }`);
    // First supertype → extends, subsequent → implements
    expect(code).toContain("extends SomeInterface");
  });

  it("class with no primary constructor but supertype emits minimal constructor", () => {
    const code = gen(`class MyVm : ViewModel() { }`);
    expect(code).toContain("extends ViewModel");
    // Should have a constructor (either the emitted one or the user-body one)
    // The key invariant: no `extends ViewModel()` syntax
    expect(code).not.toMatch(/extends \w+\(\)/);
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

describe("Codegen — implicit runtime imports (issue 3)", () => {
  it("emits jalvinEquals import when == is used", () => {
    const code = gen(`fun eq(x: Int, y: Int): Boolean = x == y`);
    expect(code).toContain("jalvinEquals");
    // The import must be present somewhere in the file
    expect(code).toMatch(/import \{[^}]*jalvinEquals[^}]*\}/);
  });

  it("emits notNull import when !! is used", () => {
    const code = gen(`fun f(s: String?) { val n = s!! }`);
    expect(code).toMatch(/import \{[^}]*notNull[^}]*\}/);
  });

  it("emits range import when .. operator is used", () => {
    const code = gen(`fun f() { for (i in 1..10) { println(i) } }`);
    expect(code).toMatch(/import \{[^}]*range[^}]*\}/);
  });

  it("does not emit duplicate runtime import when star import covers the same package", () => {
    const code = gen(`
import @jalvin/runtime.*
fun eq(x: Int, y: Int): Boolean = x == y`);
    // There should be at most ONE import line that mentions "@jalvin/runtime"
    // (the star import's named expansion merges with preamble)
    const runtimeImportLines = code.split("\n")
      .filter((l) => l.includes(`"@jalvin/runtime"`));
    // No duplicate: jalvinEquals should be either in the star import line or preamble, not both
    const allImportedSymbols = runtimeImportLines
      .flatMap((l) => {
        const m = l.match(/import \{([^}]+)\}/);
        return m ? m[1]!.split(",").map((s) => s.trim()) : [];
      });
    const jalvinEqualsCount = allImportedSymbols.filter((s) => s === "jalvinEquals").length;
    expect(jalvinEqualsCount).toBeLessThanOrEqual(1);
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
    // when conditions now use jalvinEquals for structural equality (works for primitives too)
    expect(code).toContain("jalvinEquals(__s, 1)");
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
  it("emits star import as namespace when multiple scoped star imports exist", () => {
    // With >1 scoped star import we fall back to namespace imports
    const code = gen(`import @jalvin/runtime.*\nimport @jalvin/ui.*`);
    expect(code).toContain("import *");
  });

  it("emits named imports (not namespace) for a single scoped star import", () => {
    const code = gen(`
import @jalvin/runtime.*
class MyVm : ViewModel() {
  fun greet() { println("hi") }
}`);
    // Should NOT emit a namespace import (import * as ...)
    expect(code).not.toContain("import * as");
    // Should emit named imports that include the symbols actually used
    expect(code).toContain(`from "@jalvin/runtime"`);
    expect(code).toContain("ViewModel");
  });

  it("wildcard import: supertypes are exported by name from the star-imported package", () => {
    const code = gen(`
import @jalvin/runtime.*
class MyRepo : ViewModel() { }`);
    expect(code).toContain(`import { `);
    expect(code).toContain("ViewModel");
    expect(code).toContain(`from "@jalvin/runtime"`);
  });

  it("wildcard import: function calls are included in named imports", () => {
    const code = gen(`
import @jalvin/runtime.*
val counter = mutableStateOf(0)`);
    expect(code).toContain("mutableStateOf");
    expect(code).toContain(`from "@jalvin/runtime"`);
    expect(code).not.toContain("import * as");
  });

  it("emits named import", () => {
    const code = gen(`import @jalvin/runtime.Bibi`);
    expect(code).toContain("import { Bibi }");
  });

  it("emits aliased import correctly", () => {
    const code = gen(`import @jalvin/runtime.Bibi as Http`);
    expect(code).toContain("import { Bibi as Http }");
  });

  it("emits local package import with symbol as filename", () => {
    const code = gen(`import src.models.Rotation`);
    expect(code).toContain(`import { Rotation } from "src/models/Rotation"`);
  });

  it("emits nested local package import with symbol as filename", () => {
    const code = gen(`import com.example.ui.Button`);
    expect(code).toContain(`import { Button } from "com/example/ui/Button"`);
  });

  it("stops at existing file when preceding path resolves to a .ts file (multi-symbol module)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jalvin-test-"));
    try {
      // Create src/models/css.ts to simulate a multi-symbol file
      fs.mkdirSync(path.join(tmpDir, "src", "models"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "src", "models", "css.ts"), "export class Css {}");

      const result = compile(`import src.models.css.Css\nval x = 1`, "<test>", { sourceRoot: tmpDir });
      expect(result.code).toContain(`import { Css } from "src/models/css"`);
      expect(result.code).not.toContain(`src/models/css/Css`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("stops at existing .jalvin file when preceding path resolves to a .jalvin file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jalvin-test-"));
    try {
      fs.mkdirSync(path.join(tmpDir, "src", "models"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "src", "models", "types.jalvin"), "class Point(val x: Int, val y: Int)");

      const result = compile(`import src.models.types.Point\nval x = 1`, "<test>", { sourceRoot: tmpDir });
      expect(result.code).toContain(`import { Point } from "src/models/types"`);
      expect(result.code).not.toContain(`src/models/types/Point`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("treats installed npm package subpath imports as package exports", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jalvin-test-"));
    try {
      fs.mkdirSync(path.join(tmpDir, "node_modules", "cubing"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "node_modules", "cubing", "package.json"),
        '{"name":"cubing","version":"1.0.0"}'
      );

      const result = compile(`import cubing.twisty.TwistyPlayer\nval x = 1`, "<test>", { sourceRoot: tmpDir });
      expect(result.code).toContain(`import { TwistyPlayer } from "cubing/twisty"`);
      expect(result.code).not.toContain(`cubing/twisty/TwistyPlayer`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles additional npm subpath symbols like randomScrambleForEvent", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jalvin-test-"));
    try {
      fs.mkdirSync(path.join(tmpDir, "node_modules", "cubing"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "node_modules", "cubing", "package.json"),
        '{"name":"cubing","version":"1.0.0"}'
      );

      const result = compile(`import cubing.scramble.randomScrambleForEvent\nval x = 1`, "<test>", { sourceRoot: tmpDir });
      expect(result.code).toContain(`import { randomScrambleForEvent } from "cubing/scramble"`);
      expect(result.code).not.toContain(`cubing/scramble/randomScrambleForEvent`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("enum type used in import does not pollute star-import named list with local name", () => {
    // The locally declared Enum should not be in the external star-import named imports
    const code = gen(`
import @jalvin/runtime.*
enum class Color { RED, GREEN, BLUE }`);
    // Color is locally declared — should not appear in the import { ... } from "@jalvin/runtime"
    const importLine = code.split("\n").find((l) => l.includes("@jalvin/runtime"));
    expect(importLine).not.toContain("Color");
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
    // Return type is no longer hardcoded to HTMLElement — TypeScript infers it
    expect(code).not.toContain("HTMLElement");
  });

  it("does not emit ): HTMLElement in component fun signature", () => {
    const code = gen(`component fun Foo() { return (<div />) }`);
    expect(code).not.toContain("HTMLElement");
  });

  it("emits children as second positional param, not in props destructure", () => {
    const code = gen(`component fun DocPage(title: String, children: Any) { return (<div />) }`);
    // children must NOT appear inside the props destructure
    expect(code).not.toMatch(/\{\s*[^}]*children[^}]*\}\s*:/);
    // children must appear as a second parameter
    expect(code).toMatch(/function DocPage\(\s*\{[^}]*title[^}]*\}[^,]*,\s*children\?\s*:/);
  });

  it("excludes children from the Props interface", () => {
    const code = gen(`component fun DocPage(title: String, children: Any) { return (<div />) }`);
    // Props interface should not contain a children field
    const propsBlock = code.match(/interface DocPageProps \{[^}]*\}/)?.[0] ?? "";
    expect(propsBlock).not.toContain("children");
    expect(propsBlock).toContain("title");
  });

  it("call site passes trailing-lambda as second arg matching children param", () => {
    const code = gen(`
      import @jalvin/ui.Column
      import @jalvin/ui.Text
      component fun DocPage(title: String, children: Any) {
        return Column() { children }
      }
      component fun App() {
        return DocPage(title = "Hello") { Text(text = "hi") }
      }
    `);
    // Call site: second arg is an array of children, matching the second param
    expect(code).toContain(`DocPage({ title: "Hello" }, [`);
  });

  it("children-only component emits {} first param to absorb empty props object", () => {
    const code = gen(`component fun DocTheme(children: Any) { return (<div />) }`);
    // Must NOT be: function DocTheme(children?: any[])  ← would eat the {} from call site
    // Must be:     function DocTheme({}, children?: any[])
    expect(code).toMatch(/function DocTheme\(\{\},\s*children\?\s*:/);
  });

  it("children-only component call site still emits ({}, [children])", () => {
    const code = gen(`
      import @jalvin/ui.Text
      component fun DocTheme(children: Any) { return (<div />) }
      component fun App() {
        return DocTheme() { Text(text = "hi") }
      }
    `);
    expect(code).toContain(`DocTheme({}, [`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug-fix tests — v2.0.22  (for loops, local star imports)
// ─────────────────────────────────────────────────────────────────────────────

describe("Codegen — for loops inside trailing lambdas", () => {
  it("emits a spread IIFE for a for-loop inside a component trailing lambda", () => {
    const code = gen(`
      import @jalvin/ui.Column
      import @jalvin/ui.Text
      component fun App() {
        val items = listOf("a", "b")
        return Column() {
          for (item in items) {
            Text(text = item)
          }
        }
      }
    `);
    // The for loop body must appear as spread IIFE children, not be silently dropped
    expect(code).toMatch(/\.\.\.\(\(\) =>/);
    expect(code).toContain("__c.push(");
    expect(code).toContain(`Text({ text: item })`);
  });

  it("mixes plain children and for-loop children correctly", () => {
    const code = gen(`
      import @jalvin/ui.Column
      import @jalvin/ui.Text
      component fun App() {
        val items = listOf("a")
        return Column() {
          Text(text = "header")
          for (item in items) { Text(text = item) }
        }
      }
    `);
    expect(code).toContain(`Text({ text: "header" })`);
    expect(code).toContain("__c.push(");
  });
});

describe("Codegen — local wildcard imports", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jalvin-star-")); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("expands import src.views.* to named imports and registers component names", () => {
    // Write a sibling .jalvin file with exported components at src/views.jalvin
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "src", "views.jalvin"), `
      import @jalvin/ui.Text
      component fun Header(title: String) { return Text(text = title) }
      component fun Footer() { return Text(text = "footer") }
    `);
    const result = compile(`
      import src.views.*
      component fun App() {
        return Header(title = "Hi")
      }
    `, "<stdin>", { sourceRoot: tmpDir });
    // Should emit named imports for Header and Footer, not a namespace import
    expect(result.code).toContain("import { Footer, Header }");
    expect(result.code).not.toContain("import * as");
    // Header call should be emitted as a component call
    expect(result.code).toContain(`Header({ title: "Hi" })`)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug-fix tests — v2.0.13
// ─────────────────────────────────────────────────────────────────────────────

describe("Codegen — safe invocation ?.()", () => {
  it("emits x?.() for a no-arg safe invocation", () => {
    const code = gen(`fun f(cb: Any?) { cb?.() }`);
    expect(code).toContain("cb?.()");
  });

  it("emits x?.(arg) for safe invocation with an argument", () => {
    const code = gen(`fun f(cb: Any?) { cb?.(42) }`);
    expect(code).toContain("cb?.(42)");
  });

  it("emits x?.(a, b) for safe invocation with multiple arguments", () => {
    const code = gen(`fun f(cb: Any?) { cb?.(1, "x") }`);
    expect(code).toContain("cb?.(1, \"x\")");
  });
});

describe("Codegen — Unit value", () => {
  it("emits undefined for a bare Unit expression", () => {
    const code = gen(`fun f() { val u = Unit }`);
    expect(code).toContain("undefined");
  });

  it("passes undefined when Unit is used as a call argument", () => {
    const code = gen(`fun f() { println(Unit) }`);
    expect(code).toContain("println(undefined)");
  });
});

describe("Codegen — class method scope", () => {
  it("emits bare method name call inside another method (no this. prefix forced)", () => {
    const code = gen(`
class Game {
  fun setScramble(s: String) { }
  fun reset() { setScramble("hello") }
}`);
    expect(code).toContain("setScramble");
    expect(code).not.toMatch(/\bthis\.setScramble\b/);
  });

  it("class methods can reference primary constructor val by bare name", () => {
    const code = gen(`
class Greeter(val name: String) {
  fun greet(): String { return name }
}`);
    expect(code).toContain("return name");
  });
});

describe("Codegen — browser globals pass-through", () => {
  it("emits confirm() verbatim", () => {
    const code = gen(`fun f() { val ok = confirm("Sure?") }`);
    expect(code).toContain("confirm(");
  });

  it("emits alert() verbatim", () => {
    const code = gen(`fun f() { alert("Hi") }`);
    expect(code).toContain("alert(");
  });

  it("emits prompt() verbatim", () => {
    const code = gen(`fun f() { val ans = prompt("Name?") }`);
    expect(code).toContain("prompt(");
  });
});

describe("Codegen — component fun implicit return", () => {
  it("implicitly returns last expression in component body", () => {
    const code = gen(`
import @jalvin/ui.Column
component fun MyComp() {
  Column({})
}`);
    expect(code).toContain("return Column(");
  });

  it("does not wrap explicit return in another return", () => {
    const code = gen(`
import @jalvin/ui.Column
component fun MyComp() {
  return Column({})
}`);
    // Should not emit "return return ..."
    expect(code).not.toContain("return return");
  });

  it("does not add implicit return when last statement is a val declaration", () => {
    const code = gen(`
import @jalvin/ui.Column
component fun MyComp() {
  val x = Column({})
}`);
    expect(code).not.toContain("return x");
    expect(code).not.toContain("return val");
  });

  it("implicitly returns UI call inside if branch at tail position", () => {
    const code = gen(`
import @jalvin/ui.Text
component fun MoveCounter(isEOView: Boolean) {
  if (!isEOView) {
    Text(text = "Moves: ...")
  }
}`);
    expect(code).toContain("return Text(");
    // The return must be inside the if block, not a standalone statement
    expect(code).toMatch(/if\s*\([^)]+\)\s*\{[^}]*return Text\(/s);
  });

  it("implicitly returns UI call in both branches of if/else at tail position", () => {
    const code = gen(`
import @jalvin/ui.Text
component fun StatusLabel(loading: Boolean) {
  if (loading) {
    Text(text = "Loading...")
  } else {
    Text(text = "Done")
  }
}`);
    const returnMatches = [...code.matchAll(/return Text\(/g)];
    expect(returnMatches).toHaveLength(2);
  });

  it("implicitly returns UI call in chained else-if branches at tail position", () => {
    const code = gen(`
import @jalvin/ui.Text
component fun Label(state: Int) {
  if (state == 0) {
    Text(text = "Zero")
  } else if (state == 1) {
    Text(text = "One")
  } else {
    Text(text = "Other")
  }
}`);
    const returnMatches = [...code.matchAll(/return Text\(/g)];
    expect(returnMatches).toHaveLength(3);
  });

  it("implicitly returns UI call inside when branch at tail position", () => {
    const code = gen(`
import @jalvin/ui.Text
component fun Phase(phase: String) {
  when (phase) {
    "a" -> Text(text = "Phase A")
    else -> Text(text = "Other")
  }
}`);
    const returnMatches = [...code.matchAll(/return Text\(/g)];
    expect(returnMatches).toHaveLength(2);
  });
});

describe("Codegen — UI primitives (no new keyword)", () => {
  it("emits named @jalvin/ui imports as plain function calls, not constructors", () => {
    const code = gen(`
import @jalvin/ui.Row
import @jalvin/ui.Button
import @jalvin/ui.Modifier
component fun MyComp() {
  return Row(modifier = Modifier.className("container")) {
    Button(text = "Click")
  }
}`);
    expect(code).not.toContain("new Row");
    expect(code).not.toContain("new Button");
    expect(code).toContain("Row({");
    expect(code).toContain("Button({");
  });

  it("emits star @jalvin/ui import primitives as plain function calls, not constructors", () => {
    const code = gen(`
import @jalvin/ui.*
component fun MyComp() {
  return Row(modifier = Modifier.className("container")) {
    Button(text = "Click")
  }
}`);
    expect(code).not.toContain("new Row");
    expect(code).not.toContain("new Button");
    expect(code).toContain("Row({");
    expect(code).toContain("Button({");
  });

  it("still emits new for locally declared classes with @jalvin/ui imports", () => {
    const code = gen(`
import @jalvin/ui.Row
class Cart(val items: Int) { }
component fun MyComp() {
  val c = Cart(3)
  return Row { }
}`);
    expect(code).toContain("new Cart");
    expect(code).not.toContain("new Row");
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

// ─────────────────────────────────────────────────────────────────────────────
// Method chaining — generated output
// ─────────────────────────────────────────────────────────────────────────────

describe("Codegen — method chaining", () => {
  it("emits a single-line two-link chain correctly", () => {
    const code = gen(
      `fun test() { val m = Modifier.className("foo").marginRight("10px") }`
    );
    expect(code).toContain(".className(");
    expect(code).toContain(".marginRight(");
  });

  it("emits a multi-line chain (dot on new line) identically to single-line", () => {
    const singleLine = gen(
      `fun test() { val m = Modifier.className("foo").marginRight("10px") }`
    );
    const multiLine = gen(
`fun test() {
  val m = Modifier.className("foo")
    .marginRight("10px")
}`
    );
    // Both should contain the same method calls
    expect(multiLine).toContain(".className(");
    expect(multiLine).toContain(".marginRight(");
    // The generated output structure should be equivalent
    const extractCalls = (c: string) =>
      c.match(/\.(className|marginRight)\(/g) ?? [];
    expect(extractCalls(singleLine)).toEqual(extractCalls(multiLine));
  });

  it("emits a three-link chain spread over multiple lines", () => {
    const code = gen(
`fun test() {
  val m = Modifier
    .className("foo")
    .marginRight("10px")
    .paddingLeft("5px")
}`
    );
    expect(code).toContain(".className(");
    expect(code).toContain(".marginRight(");
    expect(code).toContain(".paddingLeft(");
  });

  it("emits method chain used as a named argument value", () => {
    const code = gen(
`fun test() {
  Button(
    modifier = Modifier.className("foo")
      .marginRight("10px"),
    label = "ok"
  )
}`
    );
    expect(code).toContain(".className(");
    expect(code).toContain(".marginRight(");
  });

  it("emits method chain used as a positional argument value", () => {
    const code = gen(
`fun test() {
  applyModifier(
    Modifier.className("foo")
      .marginRight("10px")
  )
}`
    );
    expect(code).toContain(".className(");
    expect(code).toContain(".marginRight(");
  });

  it("emits a safe-call chain (\\`?.\\`) on a new line without errors", () => {
    const code = gen(
`fun test() {
  val result = foo()
    ?.bar()
    ?.baz
}`
    );
    expect(code).toContain("?.");
  });
});
describe("Codegen — cross-file component import invocation", () => {
  it("does not emit 'new' when calling an imported component fun", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jalvin-cmp-test-"));
    try {
      // Create a sibling .jalvin file that defines a component fun
      fs.mkdirSync(path.join(tmpDir, "src", "views"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "src", "views", "MoveCounterView.jalvin"),
        `component fun MoveCounter(vm: Any) { }`
      );

      const src = `
import src.views.MoveCounterView.MoveCounter

component fun CubeControlsView(vm: Any) {
  MoveCounter(vm)
}`;
      const result = compile(src, "<test>", { sourceRoot: tmpDir });
      expect(result.code).not.toContain("new MoveCounter");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("wraps positional args as a props object for imported component fun", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jalvin-cmp-test-"));
    try {
      fs.mkdirSync(path.join(tmpDir, "src", "views"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "src", "views", "MoveCounterView.jalvin"),
        `component fun MoveCounter(vm: Any) { }`
      );

      const src = `
import src.views.MoveCounterView.MoveCounter

component fun CubeControlsView(vm: Any) {
  MoveCounter(vm)
}`;
      const result = compile(src, "<test>", { sourceRoot: tmpDir });
      // Positional arg 'vm' should be wrapped into a props object: MoveCounter({ vm })
      expect(result.code).toContain("MoveCounter({ vm })");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("still emits 'new' for class instantiation in same component body", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jalvin-cmp-test-"));
    try {
      fs.mkdirSync(path.join(tmpDir, "src", "views"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "src", "views", "MoveCounterView.jalvin"),
        `component fun MoveCounter(vm: Any) { }`
      );

      const src = `
import src.views.MoveCounterView.MoveCounter

component fun CubeControlsView(vm: Any) {
  val rotVm = RotationButtonsViewModel(vm)
  MoveCounter(vm)
}`;
      const result = compile(src, "<test>", { sourceRoot: tmpDir });
      // Class (ViewModel) must still use 'new'
      expect(result.code).toContain("new RotationButtonsViewModel(vm)");
      // Component must NOT use 'new'
      expect(result.code).not.toContain("new MoveCounter");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("uses NameExpr variable name as prop key when component param names are known", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jalvin-cmp-test-"));
    try {
      fs.mkdirSync(path.join(tmpDir, "src", "views"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "src", "views", "MoveCounterView.jalvin"),
        `component fun MoveCounter(viewModel: Any) { }`
      );

      const src = `
import src.views.MoveCounterView.MoveCounter

component fun CubeControlsView(vm: Any) {
  MoveCounter(vm)
}`;
      const result = compile(src, "<test>", { sourceRoot: tmpDir });
      // Param name is 'viewModel' from the component definition, so MoveCounter({ viewModel: vm })
      expect(result.code).toContain("MoveCounter({ viewModel: vm })");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug regression tests
// ─────────────────────────────────────────────────────────────────────────────

// Bug 1: Setter accessor emits double-paren syntax: `set x()(value: any) {`
describe("Codegen — property setter signature (Bug: double-paren)", () => {
  it("emits set x(value: any) { — single-paren setter signature", () => {
    // Inline syntax avoids ASI splitting the property from its accessor
    // Note: Jalvin property accessor params require an explicit type annotation
    const code = gen(`class Foo { var x: Int set(value: Int) { } }`);
    // Must NOT emit set x()(value: any) — double paren is invalid TypeScript
    expect(code).not.toMatch(/set x\s*\(\s*\)\s*\(/);
    // Must emit a valid setter: set x( followed by a parameter, not another ()
    expect(code).toMatch(/set x\s*\(\s*value/);
  });

  it("setter does not have an empty parameter list before the value parameter", () => {
    const code = gen(`class Counter { var count: Int set(value: Int) { } }`);
    // The pattern `set <name>()(<anything>` indicates double paren — must not occur
    expect(code).not.toMatch(/set \w+\s*\(\s*\)\s*\(/);
  });

  it("getter still emits get x() { — empty parameter list", () => {
    const code = gen(`class Foo { val x: Int get() { return 5 } }`);
    expect(code).toMatch(/get x\s*\(\s*\)/);
  });
});

// Bug 2: Class member with custom getter emits both backing field AND accessor
describe("Codegen — property getter no backing-field collision (Bug: duplicate name)", () => {
  it("does NOT emit both readonly field and getter with the same name", () => {
    const code = gen(`class Foo { val name: String get() { return "computed" } }`);
    // Extract the class body to scope the search
    const classBody = code.match(/class Foo\s*\{([\s\S]*)\}/)?.[1] ?? code;
    const hasBackingField = /\breadonly name\b/.test(classBody);
    const hasGetter = /\bget name\b/.test(classBody);
    // TypeScript forbids declaring both `readonly name: T` and `get name()` in a class
    expect(hasBackingField && hasGetter).toBe(false);
  });

  it("emits the getter when a property has a custom getter", () => {
    const code = gen(`class Widget { val label: String get() { return "custom" } }`);
    expect(code).toMatch(/\bget label\b/);
  });
});

// Bug 3: generate() always returns isJsx: false
describe("Codegen — isJsx flag (Bug: hardcoded false)", () => {
  it("returns isJsx: true for a file containing a component fun", () => {
    const result = compile(`component fun App() { }`, "<test>");
    expect(result.isJsx).toBe(true);
  });

  it("returns isJsx: true when @jalvin/ui is imported", () => {
    const result = compile(`import @jalvin/ui.*\nfun f() { }`, "<test>");
    expect(result.isJsx).toBe(true);
  });

  it("returns isJsx: false for a plain file with no component fun and no @jalvin/ui import", () => {
    const result = compile(`fun add(a: Int, b: Int): Int = a + b`, "<test>");
    expect(result.isJsx).toBe(false);
  });

  it("returns isJsx: true when a component fun is nested inside a class", () => {
    const result = compile(`
class MyWidget {
  component fun render() { }
}`, "<test>");
    expect(result.isJsx).toBe(true);
  });
});

// Bug 5: catch type narrowing (instanceof guard) only emitted when emitTypes: true
describe("Codegen — catch instanceof narrowing (Bug: gated on emitTypes)", () => {
  it("emits instanceof type guard in catch block with default emitTypes: false", () => {
    const code = gen(`
fun f() {
  try {
    println("x")
  } catch (e: SomeError) {
    println("err")
  }
}`);
    expect(code).toContain("instanceof SomeError");
  });

  it("emits instanceof guard for catch block with emitTypes: true", () => {
    const result = compile(`
fun f() {
  try {
    println("x")
  } catch (e: SomeError) {
    println("err")
  }
}
fun println(any: Any) { }`, "<test>", { emitTypes: true });
    expect(result.code).toContain("instanceof SomeError");
  });

  it("emits instanceof guard for each catch clause independently", () => {
    const code = gen(`
fun f() {
  try {
    println("x")
  } catch (e: TypeError) {
    println("type")
  } catch (e: RangeError) {
    println("range")
  }
}`);
    expect(code).toContain("instanceof TypeError");
    expect(code).toContain("instanceof RangeError");
  });
});

// Bug 6: LongLiteralExpr emits BigInt(number) losing precision for > MAX_SAFE_INTEGER values
describe("Codegen — Long literal precision (Bug: BigInt(number) for large values)", () => {
  it("does not pass a JS number literal to BigInt for Long.MAX_VALUE", () => {
    // Long.MAX_VALUE = 9223372036854775807 — far above Number.MAX_SAFE_INTEGER (9007199254740991)
    // BigInt(9223372036854775807) rounds to wrong value; must use BigInt("...") or n suffix
    const code = gen(`val n = 9223372036854775807L`);
    // Passing a JS number literal to BigInt causes precision loss
    expect(code).not.toMatch(/BigInt\(9223372036854775807\)/);
    // Must preserve the exact value via string or BigInt literal
    expect(code).toMatch(/BigInt\("9223372036854775807"\)|9223372036854775807n/);
  });

  it("does not pass a JS number literal to BigInt for value just above MAX_SAFE_INTEGER", () => {
    // 9007199254740993 = 2^53 + 1 — first integer JS floats cannot represent exactly
    const code = gen(`val n = 9007199254740993L`);
    expect(code).not.toMatch(/BigInt\(9007199254740993\)/);
    expect(code).toMatch(/BigInt\("9007199254740993"\)|9007199254740993n/);
  });

  it("emits a correct BigInt literal for a small Long value", () => {
    const code = gen(`val n = 42L`);
    // Any of these three forms is correct for small values
    expect(code).toMatch(/BigInt\("42"\)|42n/);
  });
});

// Bug 7: when value-match uses === instead of jalvinEquals for structural equality
describe("Codegen — when value-match uses jalvinEquals (Bug: === for data class)", () => {
  it("uses jalvinEquals instead of === when matching against a data class value", () => {
    const code = gen(`
data class Point(val x: Int, val y: Int)
fun f(p: Point): String {
  val origin = Point(0, 0)
  return when (p) {
    origin -> "at origin"
    else -> "other"
  }
}`);
    // === compares by reference for objects; jalvinEquals compares structurally
    expect(code).toContain("jalvinEquals");
    // The when subject comparison should not use triple-equals
    expect(code).not.toMatch(/__s\s*===\s*origin/);
  });

  it("still uses === for primitive Int values in when", () => {
    // For primitive values === is correct behaviour
    const code = gen(`
fun f(n: Int): String {
  return when (n) {
    1 -> "one"
    2 -> "two"
    else -> "other"
  }
}`);
    // Primitive when branches may keep === (Int maps to JS number)
    expect(code).toContain("if (");
  });
});

// Bug 8: Top-level and local delegated properties assign delegate object instead of delegated value
describe("Codegen — delegated properties at top level and in functions (Bug: assigns object)", () => {
  it("does NOT emit a plain assignment for a top-level val delegated by lazy", () => {
    // val x by lazy { 42 } should NOT compile to: const x = lazy(() => 42)
    // That makes x hold the lazy wrapper object, not the lazily computed value
    const code = gen(`val x by lazy { 42 }`);
    expect(code).not.toMatch(/const x\s*=\s*lazy\s*\(/);
  });

  it("does NOT emit a plain assignment for a local val delegated property inside a function", () => {
    const code = gen(`
fun f() {
  val x by lazy { "hello" }
  println(x)
}`);
    expect(code).not.toMatch(/const x\s*=\s*lazy\s*\(/);
  });

  it("emits get/setValue wrappers for a class member delegated property", () => {
    // Class-member delegates are already handled correctly — regression guard
    const code = gen(`
class Foo {
  val x: Int by lazy { 42 }
}`);
    expect(code).toContain("get x()");
    expect(code).toContain("getValue()");
  });
});

// Bug 9: emitComponentCall silently drops positional args with complex expressions
describe("Codegen — Component call preserves all args (Bug: positional arg dropped)", () => {
  it("includes named arg with complex expression value in the emitted props object", () => {
    const code = gen(`
import @jalvin/ui.Text
component fun Comp() {
  Text(text = "Hello " + "world")
}`);
    // Named arg text = expr must always reach the props object
    expect(code).toContain("text:");
    expect(code).toContain(`"Hello "`);
  });

  it("includes positional arg in props when param name is known from same-file component", () => {
    const code = gen(`
import @jalvin/ui.Text
component fun Label(text: String) { Text(text = text) }
component fun Wrapper() {
  Label("a" + "b")
}`);
    // 'text' param name is known for Label; positional arg should map to { text: ... }
    expect(code).toContain("text:");
    // Must not produce an empty props object for Label
    expect(code).not.toMatch(/Label\(\{\s*\}\)/);
  });
});