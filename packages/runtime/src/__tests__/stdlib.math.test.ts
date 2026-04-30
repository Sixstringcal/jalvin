import { describe, it, expect } from "vitest";
import {
  abs, ceil, floor, round, sqrt, pow,
  ln, log2, log10, sin, cos,
  sign, truncate,
  PI, E,
  clamp, truncDiv,
  coerceAtLeast, coerceAtMost, coerceIn,
  Int, Long,
} from "../stdlib/math.js";

// ---------------------------------------------------------------------------
// Math function bindings
// ---------------------------------------------------------------------------

describe("math bindings", () => {
  it("abs", () => {
    expect(abs(-5)).toBe(5);
    expect(abs(3)).toBe(3);
  });

  it("ceil / floor / round / truncate", () => {
    expect(ceil(1.2)).toBe(2);
    expect(floor(1.9)).toBe(1);
    expect(round(1.5)).toBe(2);
    expect(truncate(1.9)).toBe(1);
    expect(truncate(-1.9)).toBe(-1);
  });

  it("sqrt", () => {
    expect(sqrt(9)).toBe(3);
    expect(sqrt(0)).toBe(0);
  });

  it("pow", () => {
    expect(pow(2, 10)).toBe(1024);
    expect(pow(3, 0)).toBe(1);
  });

  it("ln / log2 / log10", () => {
    expect(ln(E)).toBeCloseTo(1, 10);
    expect(log2(8)).toBeCloseTo(3, 10);
    expect(log10(1000)).toBeCloseTo(3, 10);
  });

  it("sin / cos", () => {
    expect(sin(0)).toBe(0);
    expect(cos(0)).toBe(1);
  });

  it("sign", () => {
    expect(sign(-7)).toBe(-1);
    expect(sign(0)).toBe(0);
    expect(sign(3)).toBe(1);
  });

  it("PI and E constants", () => {
    expect(PI).toBeCloseTo(3.14159, 5);
    expect(E).toBeCloseTo(2.71828, 5);
  });
});

// ---------------------------------------------------------------------------
// clamp
// ---------------------------------------------------------------------------

describe("clamp", () => {
  it("returns value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps to min", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("clamps to max", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("returns exact min/max boundary values", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// truncDiv
// ---------------------------------------------------------------------------

describe("truncDiv", () => {
  it("positive division", () => {
    expect(truncDiv(7, 2)).toBe(3);
  });

  it("truncates towards zero for negative dividend", () => {
    expect(truncDiv(-7, 2)).toBe(-3);
  });

  it("truncates towards zero for negative divisor", () => {
    expect(truncDiv(7, -2)).toBe(-3);
  });
});

// ---------------------------------------------------------------------------
// coerceAtLeast / coerceAtMost / coerceIn
// ---------------------------------------------------------------------------

describe("coerceAtLeast", () => {
  it("returns value when already above min", () => expect(coerceAtLeast(5, 3)).toBe(5));
  it("returns min when below min",            () => expect(coerceAtLeast(1, 3)).toBe(3));
});

describe("coerceAtMost", () => {
  it("returns value when already below max", () => expect(coerceAtMost(5, 10)).toBe(5));
  it("returns max when above max",           () => expect(coerceAtMost(15, 10)).toBe(10));
});

describe("coerceIn", () => {
  it("passes through in-range values", () => expect(coerceIn(5, 0, 10)).toBe(5));
  it("clamps to min",                  () => expect(coerceIn(-1, 0, 10)).toBe(0));
  it("clamps to max",                  () => expect(coerceIn(11, 0, 10)).toBe(10));
});

// ---------------------------------------------------------------------------
// Int / Long boundary constants
// ---------------------------------------------------------------------------

describe("Int / Long constants", () => {
  it("Int.MAX_VALUE is 2^31 - 1", () => {
    expect(Int.MAX_VALUE).toBe(2_147_483_647);
  });

  it("Int.MIN_VALUE is -(2^31)", () => {
    expect(Int.MIN_VALUE).toBe(-2_147_483_648);
  });

  it("Long.MAX_VALUE is 2^63 - 1", () => {
    expect(Long.MAX_VALUE).toBe(BigInt("9223372036854775807"));
  });
});
