import { describe, it, expect } from "vitest";
import { Result, runCatching, runCatchingAsync } from "../stdlib/result.js";

// ---------------------------------------------------------------------------
// Result.success / Result.failure
// ---------------------------------------------------------------------------

describe("Result", () => {
  describe("success", () => {
    it("isSuccess is true", () => {
      expect(Result.success(42).isSuccess).toBe(true);
    });

    it("isFailure is false", () => {
      expect(Result.success(42).isFailure).toBe(false);
    });

    it("getOrNull returns the value", () => {
      expect(Result.success("hello").getOrNull()).toBe("hello");
    });

    it("getOrThrow returns the value without throwing", () => {
      expect(Result.success(99).getOrThrow()).toBe(99);
    });

    it("getOrDefault returns the value, not the default", () => {
      expect(Result.success(5).getOrDefault(0)).toBe(5);
    });

    it("exceptionOrNull returns null", () => {
      expect(Result.success(1).exceptionOrNull()).toBeNull();
    });
  });

  describe("failure", () => {
    const err = new Error("oops");

    it("isSuccess is false", () => {
      expect(Result.failure(err).isSuccess).toBe(false);
    });

    it("isFailure is true", () => {
      expect(Result.failure(err).isFailure).toBe(true);
    });

    it("getOrNull returns null", () => {
      expect(Result.failure<number>(err).getOrNull()).toBeNull();
    });

    it("getOrThrow rethrows the error", () => {
      expect(() => Result.failure(err).getOrThrow()).toThrow("oops");
    });

    it("getOrDefault returns the default", () => {
      expect(Result.failure<number>(err).getOrDefault(-1)).toBe(-1);
    });

    it("getOrElse calls the recovery function", () => {
      const result = Result.failure<number>(err).getOrElse(() => 42);
      expect(result).toBe(42);
    });

    it("exceptionOrNull returns the error", () => {
      expect(Result.failure(err).exceptionOrNull()).toBe(err);
    });
  });

  // ── map ──────────────────────────────────────────────────────────────────

  describe("map", () => {
    it("transforms a successful result", () => {
      expect(Result.success(5).map((x) => x * 2).getOrThrow()).toBe(10);
    });

    it("passes through a failed result unchanged", () => {
      const err = new Error("fail");
      const mapped = Result.failure<number>(err).map((x) => x * 2);
      expect(mapped.isFailure).toBe(true);
      expect(mapped.exceptionOrNull()).toBe(err);
    });

    it("captures exceptions thrown inside the transform", () => {
      const mapped = Result.success(1).map(() => { throw new Error("transform failed"); });
      expect(mapped.isFailure).toBe(true);
    });
  });

  // ── recover ───────────────────────────────────────────────────────────────

  describe("recover", () => {
    it("converts failure to success via recovery function", () => {
      const result = Result.failure<number>(new Error("bad")).recover(() => 0);
      expect(result.isSuccess).toBe(true);
      expect(result.getOrThrow()).toBe(0);
    });

    it("leaves a success result untouched", () => {
      const result = Result.success(7).recover(() => 0);
      expect(result.getOrThrow()).toBe(7);
    });
  });

  // ── onSuccess / onFailure ─────────────────────────────────────────────────

  describe("onSuccess / onFailure callbacks", () => {
    it("onSuccess fires for a success result", () => {
      const visited: number[] = [];
      Result.success(1).onSuccess((v) => visited.push(v));
      expect(visited).toEqual([1]);
    });

    it("onSuccess is skipped for a failure result", () => {
      const visited: number[] = [];
      Result.failure<number>(new Error()).onSuccess((v) => visited.push(v));
      expect(visited).toEqual([]);
    });

    it("onFailure fires for a failure result", () => {
      const errors: unknown[] = [];
      Result.failure(new Error("e")).onFailure((e) => errors.push(e));
      expect(errors).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// runCatching / runCatchingAsync
// ---------------------------------------------------------------------------

describe("runCatching", () => {
  it("wraps a successful synchronous block", () => {
    const result = runCatching(() => 42);
    expect(result.isSuccess).toBe(true);
    expect(result.getOrThrow()).toBe(42);
  });

  it("wraps a thrown exception as failure", () => {
    const result = runCatching(() => { throw new Error("fail"); });
    expect(result.isFailure).toBe(true);
    expect((result.exceptionOrNull() as Error).message).toBe("fail");
  });
});

describe("runCatchingAsync", () => {
  it("wraps a resolved promise", async () => {
    const result = await runCatchingAsync(async () => "ok");
    expect(result.isSuccess).toBe(true);
    expect(result.getOrThrow()).toBe("ok");
  });

  it("wraps a rejected promise as failure", async () => {
    const result = await runCatchingAsync(async () => { throw new Error("async fail"); });
    expect(result.isFailure).toBe(true);
    expect((result.exceptionOrNull() as Error).message).toBe("async fail");
  });
});
