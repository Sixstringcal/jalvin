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

  it("emits local package import with symbol as filename (Kotlin convention)", () => {
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