import { describe, it, expect } from "vitest";
import { measureTimeMillis, measureTimeMillisAsync, measureTimedValue } from "../stdlib/timing.js";

describe("measureTimeMillis", () => {
  it("returns a non-negative integer", () => {
    const ms = measureTimeMillis(() => {
      // tiny synchronous work
      let x = 0;
      for (let i = 0; i < 1000; i++) x += i;
      return x;
    });
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(ms)).toBe(true);
  });

  it("actually executes the function", () => {
    let ran = false;
    measureTimeMillis(() => { ran = true; });
    expect(ran).toBe(true);
  });
});

describe("measureTimeMillisAsync", () => {
  it("returns a non-negative integer", async () => {
    const ms = await measureTimeMillisAsync(async () => {
      await Promise.resolve();
    });
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(ms)).toBe(true);
  });

  it("actually awaits the async function", async () => {
    let ran = false;
    await measureTimeMillisAsync(async () => { ran = true; });
    expect(ran).toBe(true);
  });
});

describe("measureTimedValue", () => {
  it("returns the function's result alongside the duration", () => {
    const { value, duration } = measureTimedValue(() => 42);
    expect(value).toBe(42);
    expect(duration).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(duration)).toBe(true);
  });

  it("works with non-numeric return values", () => {
    const { value } = measureTimedValue(() => "hello");
    expect(value).toBe("hello");
  });
});
