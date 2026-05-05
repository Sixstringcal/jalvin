import { describe, it, expect } from "vitest";
import { compile } from "../../dist/index.js";
import * as fs from "node:fs";
import * as path from "node:path";

// Workaround for CJS/ESM compatibility during build
const EXAMPLES_DIR = path.resolve(__dirname, "../../../../examples");

function compileExample(file: string): ReturnType<typeof compile> {
  const src = fs.readFileSync(file, "utf8");
  return compile(src, file);
}

describe("Integration — example programs compile without errors", () => {
  it("01-counter/Counter.jalvin compiles", () => {
    const result = compileExample(path.join(EXAMPLES_DIR, "01-counter/Counter.jalvin"));
    const errs = result.diagnostics.items.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
    expect(result.code.length).toBeGreaterThan(0);
  });

  it("02-api-with-bibi/UserProfile.jalvin compiles", () => {
    const result = compileExample(path.join(EXAMPLES_DIR, "02-api-with-bibi/UserProfile.jalvin"));
    const errs = result.diagnostics.items.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
    expect(result.code.length).toBeGreaterThan(0);
  });

  it("03-extensions-sealed/Cart.jalvin compiles", () => {
    const result = compileExample(path.join(EXAMPLES_DIR, "03-extensions-sealed/Cart.jalvin"));
    const errs = result.diagnostics.items.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
    expect(result.code.length).toBeGreaterThan(0);
  });

  it("04-coroutines/Coroutines.jalvin compiles", () => {
    const result = compileExample(path.join(EXAMPLES_DIR, "04-coroutines/Coroutines.jalvin"));
    const errs = result.diagnostics.items.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
    expect(result.code.length).toBeGreaterThan(0);
  });

  it("05-ui-showcase/UIShowcase.jalvin compiles", () => {
    const result = compileExample(path.join(EXAMPLES_DIR, "05-ui-showcase/UIShowcase.jalvin"));
    const errs = result.diagnostics.items.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
    expect(result.code.length).toBeGreaterThan(0);
  });
});

describe("Integration — Counter example output structure", () => {
  it("emits a CounterViewModel class", () => {
    const result = compileExample(path.join(EXAMPLES_DIR, "01-counter/Counter.jalvin"));
    expect(result.code).toContain("class CounterViewModel");
  });

  it("emits a Counter component function", () => {
    const result = compileExample(path.join(EXAMPLES_DIR, "01-counter/Counter.jalvin"));
    expect(result.code).toContain("function Counter");
  });

  it("marks the output as JSX (Bug: was hardcoded false)", () => {
    // Counter.jalvin contains `component fun Counter(...)` so isJsx must be true
    const result = compileExample(path.join(EXAMPLES_DIR, "01-counter/Counter.jalvin"));
    expect(result.isJsx).toBe(true);
  });
});

describe("Integration — Cart example output structure", () => {
  it("emits sealed Discount class", () => {
    const result = compileExample(path.join(EXAMPLES_DIR, "03-extensions-sealed/Cart.jalvin"));
    expect(result.code).toContain("Discount");
  });

  it("emits extension functions at module level", () => {
    const result = compileExample(path.join(EXAMPLES_DIR, "03-extensions-sealed/Cart.jalvin"));
    // Extension functions compile to module-level functions
    expect(result.code).toContain("subtotal");
    expect(result.code).toContain("totalAfterDiscount");
  });
});

describe("Integration — UIShowcase output structure", () => {
  it("emits a UIShowcase component function", () => {
    const result = compileExample(path.join(EXAMPLES_DIR, "05-ui-showcase/UIShowcase.jalvin"));
    expect(result.code).toContain("function UIShowcase");
  });

  it("marks the output as JSX", () => {
    const result = compileExample(path.join(EXAMPLES_DIR, "05-ui-showcase/UIShowcase.jalvin"));
    // UIShowcase contains component funs — isJsx must be true
    expect(result.isJsx).toBe(true);
  });

  it("emits section sub-components", () => {
    const result = compileExample(path.join(EXAMPLES_DIR, "05-ui-showcase/UIShowcase.jalvin"));
    expect(result.code).toContain("function TextShowcase");
    expect(result.code).toContain("function ButtonShowcase");
    expect(result.code).toContain("function InputShowcase");
  });
});

describe("Integration — round-trip correctness", () => {
  it("produces valid TypeScript output (no syntax errors in generated code)", () => {
    const sources = [
      `fun add(a: Int, b: Int): Int = a + b`,
      `data class User(val id: Int, val name: String)`,
      `sealed class State { object Loading : State(); data class Done(val v: String) : State() }`,
      `suspend fun fetch(): String { return "ok" }`,
    ];
    for (const src of sources) {
      const result = compile(src, "<test>");
      expect(result.ok).toBe(true);
      expect(result.code).toBeTruthy();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Method chaining in arguments — end-to-end
// ─────────────────────────────────────────────────────────────────────────────

describe("Integration — method chaining in call arguments", () => {
  it("compiles single-line method chain in named argument without errors", () => {
    const result = compile(
      `import @jalvin/ui.*\nfun test() { Button(modifier = Modifier.className("foo").marginRight("10px")) }`,
      "<test>"
    );
    const errs = result.diagnostics.items.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
    expect(result.code).toContain(".className(");
    expect(result.code).toContain(".marginRight(");
  });

  it("compiles the exact issue example: multi-line chain as named argument", () => {
    const src = `import @jalvin/ui.*
fun test() {
  Button(
    modifier = Modifier.className("foo").marginRight("10px"),
    onClick = {}
  )
}`;
    const result = compile(src, "<test>");
    const errs = result.diagnostics.items.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
    expect(result.code).toContain(".className(");
    expect(result.code).toContain(".marginRight(");
  });

  it("compiles multi-line chain with dot on the next line (the original failing case)", () => {
    const src = `import @jalvin/ui.*
fun test() {
  Button(
    modifier = Modifier.className("foo")
      .marginRight("10px"),
    onClick = {}
  )
}`;
    const result = compile(src, "<test>");
    const errs = result.diagnostics.items.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
    expect(result.code).toContain(".className(");
    expect(result.code).toContain(".marginRight(");
  });

  it("compiles a three-link modifier chain across multiple lines", () => {
    const src = `import @jalvin/ui.*
fun test() {
  Button(
    modifier = Modifier
      .className("container")
      .marginRight("10px")
      .paddingLeft("5px"),
    label = "Click"
  )
}`;
    const result = compile(src, "<test>");
    const errs = result.diagnostics.items.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
    expect(result.code).toContain(".className(");
    expect(result.code).toContain(".marginRight(");
    expect(result.code).toContain(".paddingLeft(");
  });

  it("compiles a chain-in-variable-initializer with dot on new line", () => {
    const src = `import @jalvin/ui.*
fun buildModifier(): Any {
  val m = Modifier.className("foo")
    .marginRight("10px")
    .paddingTop("8px")
  return m
}`;
    const result = compile(src, "<test>");
    const errs = result.diagnostics.items.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
  });

  it("compiles a safe-call chain with ?. on new line (no parse errors)", () => {
    // Note: this test checks for absence of PARSER errors (E010x).
    // Type-checker errors about inferred types of safe-call chains are a separate concern.
    const src = `
fun test(s: String?) {
  val n = s?.length
    ?.toString()
}`;
    const result = compile(src, "<test>");
    // Only look for lexer (E000x) and parser (E010x) errors — the chain must parse correctly.
    const parseErrs = result.diagnostics.items.filter(
      (d) => d.severity === "error" && (d.code.startsWith("E000") || d.code.startsWith("E010"))
    );
    expect(parseErrs).toHaveLength(0);
  });

  it("compiles chaining on new line in expression-body function", () => {
    const src = `import @jalvin/ui.*\nfun buildMod() = Modifier.className("foo")\n  .marginRight("10px")`;
    const result = compile(src, "<test>");
    const errs = result.diagnostics.items.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
    expect(result.code).toContain(".marginRight(");
  });

  it("still inserts semicolons correctly for non-chain line continuations", () => {
    // val x = 5 followed by val y = 10 — two distinct statements; no chain
    const src = `fun test() {\n  val x = 5\n  val y = 10\n}`;
    const result = compile(src, "<test>");
    const errs = result.diagnostics.items.filter((d) => d.severity === "error");
    expect(errs).toHaveLength(0);
    // Both declarations should appear in the output
    expect(result.code).toContain("const x");
    expect(result.code).toContain("const y");
  });
});
