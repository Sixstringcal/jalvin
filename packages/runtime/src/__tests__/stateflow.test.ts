import { describe, it, expect, vi } from "vitest";
import { MutableStateFlow, mapFlow, filterFlow, debounceFlow } from "../stateflow.js";

// ── Fix #17: asFlow does not double-emit initial value ───────────────────────
describe("MutableStateFlow.asFlow() — no double-emit on subscribe (fix #17)", () => {
  it("emits each value exactly once via for-await", async () => {
    const flow = new MutableStateFlow(0);
    const received: number[] = [];

    const iter = flow.asFlow()[Symbol.asyncIterator]();

    // Collect the current value (immediate delivery via collect())
    const p1 = iter.next();
    const r1 = await p1;
    received.push(r1.value);

    // Emit one more value
    flow.value = 1;
    const r2 = await iter.next();
    received.push(r2.value);

    await iter.return!();

    // Without the fix, the initial value (0) would appear twice
    expect(received).toEqual([0, 1]);
  });

  it("only emits new values after initial", async () => {
    const flow = new MutableStateFlow("hello");
    const received: string[] = [];

    const iter = flow.asFlow()[Symbol.asyncIterator]();

    // Get initial value
    const r0 = await iter.next();
    received.push(r0.value);

    flow.value = "world";
    const r1 = await iter.next();
    received.push(r1.value);

    await iter.return!();

    expect(received).toEqual(["hello", "world"]);
    // "hello" must appear exactly once
    expect(received.filter((v) => v === "hello")).toHaveLength(1);
  });
});

// ── Fix #18: DerivedFlow.dispose() stops updates ─────────────────────────────
describe("mapFlow() — dispose() unsubscribes from source (fix #18)", () => {
  it("stops receiving updates after dispose()", () => {
    const source = new MutableStateFlow(1);
    const mapped = mapFlow(source, (v) => v * 2);

    expect(mapped.value).toBe(2);

    source.value = 5;
    expect(mapped.value).toBe(10);

    mapped.dispose();

    // After dispose, updates to source must NOT propagate
    source.value = 100;
    expect(mapped.value).toBe(10); // unchanged
  });

  it("does not throw when dispose() is called multiple times", () => {
    const source = new MutableStateFlow(0);
    const mapped = mapFlow(source, (v) => v);
    expect(() => { mapped.dispose(); mapped.dispose(); }).not.toThrow();
  });
});

describe("filterFlow() — dispose() unsubscribes from source (fix #18)", () => {
  it("stops receiving updates after dispose()", () => {
    const source = new MutableStateFlow(2);
    const filtered = filterFlow(source, (v) => v % 2 === 0);

    expect(filtered.value).toBe(2);

    source.value = 4;
    expect(filtered.value).toBe(4);

    filtered.dispose();

    source.value = 6;
    expect(filtered.value).toBe(4); // unchanged after dispose
  });
});

describe("debounceFlow() — dispose() cancels timer and unsubscribes (fix #18)", () => {
  it("stops receiving updates after dispose()", async () => {
    vi.useFakeTimers();

    const source = new MutableStateFlow(0);
    const debounced = debounceFlow(source, 100);

    expect(debounced.value).toBe(0);

    // Emit a value but don't advance timers
    source.value = 42;

    // Dispose before the debounce timer fires
    debounced.dispose();

    // Advance timers — the update should NOT apply since we disposed
    vi.advanceTimersByTime(200);
    expect(debounced.value).toBe(0);

    vi.useRealTimers();
  });

  it("clears pending timer on dispose so no late emissions occur", async () => {
    vi.useFakeTimers();

    const source = new MutableStateFlow("a");
    const debounced = debounceFlow(source, 50);
    const received: string[] = [];
    debounced.collect((v) => { received.push(v); });

    // clear initial
    received.length = 0;

    source.value = "b";
    debounced.dispose(); // dispose mid-flight
    vi.advanceTimersByTime(200);

    // "b" must never arrive
    expect(received).not.toContain("b");

    vi.useRealTimers();
  });
});
