import { describe, it, expect } from "vitest";
import {
  notNull,
  NullPointerException,
  safeCast,
  checkNotNull,
  requireNotNull,
  requireCondition,
  check,
  IllegalArgumentException,
  IllegalStateException,
  UnsupportedOperationException,
  IndexOutOfBoundsException,
  NoSuchElementException,
} from "../stdlib/types.js";

// ---------------------------------------------------------------------------
// notNull / NullPointerException
// ---------------------------------------------------------------------------

describe("notNull", () => {
  it("returns the value when non-null", () => {
    expect(notNull(42)).toBe(42);
    expect(notNull("hello")).toBe("hello");
    expect(notNull(false)).toBe(false);
  });

  it("throws NullPointerException for null", () => {
    expect(() => notNull(null)).toThrow(NullPointerException);
  });

  it("throws NullPointerException for undefined", () => {
    expect(() => notNull(undefined)).toThrow(NullPointerException);
  });

  it("exception has correct name property", () => {
    try { notNull(null); }
    catch (e) { expect((e as Error).name).toBe("NullPointerException"); }
  });
});

// ---------------------------------------------------------------------------
// safeCast
// ---------------------------------------------------------------------------

describe("safeCast", () => {
  class Animal { }
  class Dog extends Animal { }
  class Cat extends Animal { }

  it("returns the value when instanceof matches", () => {
    const dog = new Dog();
    expect(safeCast(dog, Dog)).toBe(dog);
  });

  it("returns null when instanceof does not match", () => {
    const dog = new Dog();
    expect(safeCast(dog, Cat)).toBeNull();
  });

  it("returns null for null input", () => {
    expect(safeCast(null, Dog)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkNotNull / requireNotNull
// ---------------------------------------------------------------------------

describe("checkNotNull", () => {
  it("passes through non-null values", () => {
    expect(checkNotNull(99)).toBe(99);
  });

  it("throws NullPointerException for null", () => {
    expect(() => checkNotNull(null)).toThrow(NullPointerException);
  });
});

describe("requireNotNull", () => {
  it("passes through non-null values", () => {
    expect(requireNotNull("ok")).toBe("ok");
  });

  it("throws for null", () => {
    expect(() => requireNotNull(null)).toThrow(NullPointerException);
  });
});

// ---------------------------------------------------------------------------
// requireCondition / check
// ---------------------------------------------------------------------------

describe("requireCondition", () => {
  it("does nothing when condition is true", () => {
    expect(() => requireCondition(true, "bad")).not.toThrow();
  });

  it("throws IllegalArgumentException when condition is false", () => {
    expect(() => requireCondition(false, "bad arg")).toThrow(IllegalArgumentException);
  });

  it("accepts a lazy message factory", () => {
    expect(() => requireCondition(false, () => "lazy message")).toThrow("lazy message");
  });
});

describe("check", () => {
  it("does nothing when condition is true", () => {
    expect(() => check(true)).not.toThrow();
  });

  it("throws IllegalStateException when condition is false", () => {
    expect(() => check(false, "bad state")).toThrow(IllegalStateException);
  });

  it("accepts a lazy message factory", () => {
    expect(() => check(false, () => "lazy state")).toThrow("lazy state");
  });
});

// ---------------------------------------------------------------------------
// Exception hierarchy — name properties
// ---------------------------------------------------------------------------

describe("exception classes", () => {
  it("IllegalArgumentException has correct name", () => {
    expect(new IllegalArgumentException("x").name).toBe("IllegalArgumentException");
  });

  it("IllegalStateException has correct name", () => {
    expect(new IllegalStateException("x").name).toBe("IllegalStateException");
  });

  it("UnsupportedOperationException has correct name and default message", () => {
    const e = new UnsupportedOperationException();
    expect(e.name).toBe("UnsupportedOperationException");
    expect(e.message).toContain("not supported");
  });

  it("IndexOutOfBoundsException has correct name", () => {
    expect(new IndexOutOfBoundsException().name).toBe("IndexOutOfBoundsException");
  });

  it("NoSuchElementException has correct name", () => {
    expect(new NoSuchElementException().name).toBe("NoSuchElementException");
  });
});
