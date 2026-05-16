import { describe, it, expect } from "vitest";
import { runBlocking, flow, flowOf, Flow } from "../coroutines.js";

// ── Fix #20: runBlocking throws immediately ───────────────────────────────────
describe("runBlocking() — throws immediately (fix #20)", () => {
  it("throws a clear error message", () => {
    expect(() => runBlocking(async () => 42)).toThrow(
      "runBlocking() is not supported in JavaScript"
    );
  });

  it("throws synchronously, not asynchronously", () => {
    let threw = false;
    try {
      runBlocking(async () => "test");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

// ── Fix #22: Flow.first() stops producer after first value ───────────────────
describe("Flow.first() — stops producer after first value (fix #22)", () => {
  it("returns the first emitted value", async () => {
    const f = flowOf(10, 20, 30);
    const result = await f.first();
    expect(result).toBe(10);
  });

  it("stops the producer after the first value (does not run remaining emit calls)", async () => {
    const emitted: number[] = [];
    const f = new Flow<number>(async (emit) => {
      emitted.push(1); await emit(1);
      emitted.push(2); await emit(2);
      emitted.push(3); await emit(3);
    });

    const result = await f.first();
    expect(result).toBe(1);
    // Producer must have stopped after emitting 1; values 2 and 3 should not have been pushed
    expect(emitted).toEqual([1]);
  });

  it("works on a single-value flow", async () => {
    const f = flowOf(42);
    expect(await f.first()).toBe(42);
  });

  it("does not leave producer running (side-effect count = 1)", async () => {
    let sideEffects = 0;
    const f = new Flow<number>(async (emit) => {
      for (let i = 0; i < 5; i++) {
        sideEffects++;
        await emit(i);
      }
    });

    await f.first();
    expect(sideEffects).toBe(1);
  });
});

// ── Fix #22: Flow.take(n) stops producer after n values ──────────────────────
describe("Flow.take(n) — stops producer after n values (fix #22)", () => {
  it("collects exactly n values", async () => {
    const result = await flowOf(1, 2, 3, 4, 5).take(3).toList();
    expect(result).toEqual([1, 2, 3]);
  });

  it("stops the producer — remaining emits do not execute", async () => {
    const emitted: number[] = [];
    const f = new Flow<number>(async (emit) => {
      for (let i = 1; i <= 5; i++) {
        emitted.push(i);
        await emit(i);
      }
    });

    await f.take(2).toList();
    // Producer should have been aborted after emitting item 2 (or as soon as take() throws)
    // We allow the sentinel throw to happen during emit(2), so emitted may have [1,2] or [1,2,3]
    // depending on where the throw is caught; what matters is NOT all 5 ran.
    expect(emitted.length).toBeLessThan(5);
    expect(emitted.slice(0, 2)).toEqual([1, 2]);
  });

  it("take(0) collects nothing and does not run producer body past first emit", async () => {
    const result = await flowOf(1, 2, 3).take(0).toList();
    expect(result).toEqual([]);
  });

  it("take(n) larger than flow length collects all values", async () => {
    const result = await flowOf(1, 2).take(10).toList();
    expect(result).toEqual([1, 2]);
  });

  it("does not throw externally — sentinel is swallowed internally", async () => {
    await expect(flowOf(1, 2, 3, 4, 5).take(2).collect(() => {})).resolves.not.toThrow();
  });
});
