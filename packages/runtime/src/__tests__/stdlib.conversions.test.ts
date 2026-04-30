import { describe, it, expect } from "vitest";
import { toInt, toLong, toFloat, toDouble, toChar, charCodeOf, toString, Pair, Triple, range, IntRange, downTo, step } from "../stdlib/conversions.js";

// ---------------------------------------------------------------------------
// Primitive type conversions
// ---------------------------------------------------------------------------

describe("toInt", () => {
  it("converts number", () => expect(toInt(3.9)).toBe(3));
  it("truncates towards zero for negatives", () => expect(toInt(-3.9)).toBe(-3));
  it("converts string", () => expect(toInt("42")).toBe(42));
  it("converts boolean", () => {
    expect(toInt(true)).toBe(1);
    expect(toInt(false)).toBe(0);
  });
});

describe("toFloat / toDouble", () => {
  it("converts string to float", () => expect(toFloat("3.14")).toBeCloseTo(3.14));
  it("converts boolean", () => {
    expect(toDouble(true)).toBe(1);
    expect(toDouble(false)).toBe(0);
  });
});

describe("toChar / charCodeOf", () => {
  it("toChar converts a char code to a string", () => {
    expect(toChar(65)).toBe("A");
    expect(toChar(97)).toBe("a");
  });

  it("charCodeOf returns the UTF-16 code of the first character", () => {
    expect(charCodeOf("A")).toBe(65);
    expect(charCodeOf("a")).toBe(97);
  });

  it("round-trips correctly", () => {
    expect(charCodeOf(toChar(90))).toBe(90);
  });
});

describe("toString", () => {
  it("converts number to string", () => expect(toString(42)).toBe("42"));
  it("converts null to string",   () => expect(toString(null)).toBe("null"));
});

// ---------------------------------------------------------------------------
// Pair
// ---------------------------------------------------------------------------

describe("Pair", () => {
  it("stores first and second", () => {
    const p = new Pair("hello", 42);
    expect(p.first).toBe("hello");
    expect(p.second).toBe(42);
  });

  it("toList returns a 2-element tuple", () => {
    expect(new Pair(1, 2).toList()).toEqual([1, 2]);
  });

  it("is iterable", () => {
    const [a, b] = new Pair("x", "y");
    expect(a).toBe("x");
    expect(b).toBe("y");
  });

  it("copy creates a new Pair with overrides", () => {
    const p = new Pair(1, 2);
    const p2 = p.copy(10);
    expect(p2.first).toBe(10);
    expect(p2.second).toBe(2);
  });

  it("toString formats as (first, second)", () => {
    expect(new Pair(1, 2).toString()).toBe("(1, 2)");
  });
});

// ---------------------------------------------------------------------------
// Triple
// ---------------------------------------------------------------------------

describe("Triple", () => {
  it("stores first, second, third", () => {
    const t = new Triple(1, "two", true);
    expect(t.first).toBe(1);
    expect(t.second).toBe("two");
    expect(t.third).toBe(true);
  });

  it("is iterable — destructures into three elements", () => {
    const [a, b, c] = new Triple(1, "two", true);
    expect(a).toBe(1);
    expect(b).toBe("two");
    expect(c).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// range / IntRange / downTo / step
// ---------------------------------------------------------------------------

describe("range", () => {
  it("inclusive range iterates from start through end", () => {
    expect([...range(1, 5, true)]).toEqual([1, 2, 3, 4, 5]);
  });

  it("exclusive range stops before the end", () => {
    expect([...range(1, 5, false)]).toEqual([1, 2, 3, 4]);
  });

  it("produces empty output when start > end", () => {
    expect([...range(5, 3, true)]).toEqual([]);
  });
});

describe("IntRange", () => {
  it("produces the correct iteration sequence", () => {
    expect([...new IntRange(1, 4)]).toEqual([1, 2, 3, 4]);
  });
});

describe("downTo", () => {
  it("counts down from first to last (inclusive)", () => {
    expect([...downTo(5, 2)]).toEqual([5, 4, 3, 2]);
  });
});

describe("step", () => {
  it("steps through an IntRange with given increment", () => {
    const r = new IntRange(0, 10);
    expect([...step(r, 3)]).toEqual([0, 3, 6, 9]);
  });
});
