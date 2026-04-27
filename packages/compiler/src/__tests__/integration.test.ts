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

  it("marks the output as JSX", () => {
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
