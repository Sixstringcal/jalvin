import { describe, it, expect } from "vitest";
import { jalvinEquals } from "../stdlib/equality.js";

// ---------------------------------------------------------------------------
// Primitive equality
// ---------------------------------------------------------------------------

describe("jalvinEquals — primitives", () => {
  it("identical references are equal", () => {
    expect(jalvinEquals(1, 1)).toBe(true);
    expect(jalvinEquals("hello", "hello")).toBe(true);
    expect(jalvinEquals(null, null)).toBe(true);
  });

  it("different primitives are not equal", () => {
    expect(jalvinEquals(1, 2)).toBe(false);
    expect(jalvinEquals("a", "b")).toBe(false);
  });

  it("null vs non-null is false", () => {
    expect(jalvinEquals(null, 0)).toBe(false);
    expect(jalvinEquals(0, null)).toBe(false);
    expect(jalvinEquals(undefined, "x")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// .equals() delegation
// ---------------------------------------------------------------------------

describe("jalvinEquals — .equals() delegation", () => {
  it("delegates to a custom equals method", () => {
    const a = { value: 5, equals(other: unknown) { return other instanceof Object && (other as { value: number }).value === this.value; } };
    const b = { value: 5, equals(_other: unknown) { return false; } };
    expect(jalvinEquals(a, { value: 5 })).toBe(true);
    expect(jalvinEquals(b, { value: 5 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Array structural equality
// ---------------------------------------------------------------------------

describe("jalvinEquals — arrays", () => {
  it("equal arrays are equal", () => {
    expect(jalvinEquals([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it("different-length arrays are not equal", () => {
    expect(jalvinEquals([1, 2], [1, 2, 3])).toBe(false);
  });

  it("arrays with different elements are not equal", () => {
    expect(jalvinEquals([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it("recursively compares nested arrays", () => {
    expect(jalvinEquals([[1, 2], [3, 4]], [[1, 2], [3, 4]])).toBe(true);
    expect(jalvinEquals([[1, 2], [3, 4]], [[1, 2], [3, 5]])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Plain objects (no .equals) fall back to ===
// ---------------------------------------------------------------------------

describe("jalvinEquals — plain objects", () => {
  it("two distinct objects without .equals are not equal", () => {
    expect(jalvinEquals({ x: 1 }, { x: 1 })).toBe(false);
  });

  it("same object reference is equal", () => {
    const obj = { x: 1 };
    expect(jalvinEquals(obj, obj)).toBe(true);
  });
});
