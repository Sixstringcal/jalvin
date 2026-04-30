import { describe, it, expect, vi } from "vitest";
import {
  lazy, LazyDelegate,
  ObservableDelegate, Delegates,
  let_, run_, apply, also, with_, takeIf, takeUnless,
} from "../stdlib/delegates.js";

// ---------------------------------------------------------------------------
// lazy / LazyDelegate
// ---------------------------------------------------------------------------

describe("lazy", () => {
  it("does not call the initializer until first access", () => {
    const init = vi.fn(() => 42);
    const delegate = lazy(init);
    expect(init).not.toHaveBeenCalled();
    expect(delegate.getValue()).toBe(42);
    expect(init).toHaveBeenCalledOnce();
  });

  it("only calls the initializer once (memoises)", () => {
    let calls = 0;
    const d = lazy(() => { calls++; return "value"; });
    d.getValue();
    d.getValue();
    expect(calls).toBe(1);
  });

  it("setValue throws", () => {
    const d = lazy(() => 0);
    expect(() => d.setValue(99)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ObservableDelegate
// ---------------------------------------------------------------------------

describe("ObservableDelegate", () => {
  it("notifies onChange when value is set", () => {
    const changes: Array<{ old: number; new_: number }> = [];
    const d = new ObservableDelegate(0, (_prop, old, new_) => changes.push({ old, new_ }));

    d.setValue(1);
    d.setValue(2);

    expect(d.getValue()).toBe(2);
    expect(changes).toEqual([{ old: 0, new_: 1 }, { old: 1, new_: 2 }]);
  });
});

// ---------------------------------------------------------------------------
// Delegates.observable / Delegates.notNull
// ---------------------------------------------------------------------------

describe("Delegates.observable", () => {
  it("creates an observable delegate", () => {
    let notified = false;
    const d = Delegates.observable("initial", () => { notified = true; });
    d.setValue("changed");
    expect(notified).toBe(true);
    expect(d.getValue()).toBe("changed");
  });
});

describe("Delegates.notNull", () => {
  it("throws when getValue is called before setValue", () => {
    const d = Delegates.notNull<string>();
    expect(() => d.getValue()).toThrow();
  });

  it("returns value after setValue is called", () => {
    const d = Delegates.notNull<string>();
    d.setValue("hello");
    expect(d.getValue()).toBe("hello");
  });
});

// ---------------------------------------------------------------------------
// Scope functions
// ---------------------------------------------------------------------------

describe("let_", () => {
  it("passes the value to the block and returns the result", () => {
    expect(let_(5, (x) => x * 2)).toBe(10);
    expect(let_("hello", (s) => s.toUpperCase())).toBe("HELLO");
  });
});

describe("run_", () => {
  it("calls the block with the value as receiver", () => {
    const result = run_({ x: 10 }, function(this: { x: number }) { return this.x * 3; });
    expect(result).toBe(30);
  });
});

describe("apply", () => {
  it("calls the block as receiver and returns the original object", () => {
    const obj = { count: 0 };
    const returned = apply(obj, function(this: typeof obj) { this.count = 42; });
    expect(returned).toBe(obj);
    expect(obj.count).toBe(42);
  });
});

describe("also", () => {
  it("calls the block with the value and returns the original value", () => {
    const visited: number[] = [];
    const result = also(7, (x) => visited.push(x));
    expect(result).toBe(7);
    expect(visited).toEqual([7]);
  });
});

describe("with_", () => {
  it("calls the block as receiver and returns the block result", () => {
    const result = with_({ name: "world" }, function(this: { name: string }) {
      return `Hello, ${this.name}!`;
    });
    expect(result).toBe("Hello, world!");
  });
});

describe("takeIf", () => {
  it("returns the value when predicate is true", () => {
    expect(takeIf(5, (x) => x > 0)).toBe(5);
  });

  it("returns null when predicate is false", () => {
    expect(takeIf(5, (x) => x > 10)).toBeNull();
  });
});

describe("takeUnless", () => {
  it("returns the value when predicate is false", () => {
    expect(takeUnless(5, (x) => x > 10)).toBe(5);
  });

  it("returns null when predicate is true", () => {
    expect(takeUnless(5, (x) => x > 0)).toBeNull();
  });
});
