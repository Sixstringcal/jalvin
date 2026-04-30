// ─────────────────────────────────────────────────────────────────────────────
// stdlib/types.ts — Null safety, preconditions, and exception classes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `notNull(value)` — emitted for Jalvin's `!!` operator.
 * Throws if value is null/undefined, otherwise returns the value.
 */
export function notNull<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new NullPointerException("!! operator invoked on null or undefined value");
  }
  return value;
}

export class NullPointerException extends Error {
  constructor(message = "Value was null") {
    super(message);
    this.name = "NullPointerException";
  }
}

/**
 * `safeCast<T>(value, Type)` — emitted for Jalvin's `as?` operator.
 * Returns the value if it's an instanceof Type, otherwise returns null.
 */
export function safeCast<T>(
  value: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Type: new (...args: any[]) => T
): T | null {
  return value instanceof Type ? value : null;
}

export function checkNotNull<T>(value: T | null | undefined, message = "Value must not be null"): T {
  return notNull(value) ?? (() => { throw new NullPointerException(message); })();
}

export function requireNotNull<T>(value: T | null | undefined, message = "Required value was null"): T {
  return notNull(value);
}

export function requireCondition(condition: boolean, message: string | (() => string) = "Requirement failed"): void {
  if (!condition) {
    throw new IllegalArgumentException(typeof message === "function" ? message() : message);
  }
}

export function check(condition: boolean, message: string | (() => string) = "Check failed"): void {
  if (!condition) {
    throw new IllegalStateException(typeof message === "function" ? message() : message);
  }
}

export function error(message: string): never {
  throw new IllegalStateException(message);
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard exception hierarchy
// ─────────────────────────────────────────────────────────────────────────────

export class IllegalArgumentException extends Error {
  constructor(message: string) { super(message); this.name = "IllegalArgumentException"; }
}

export class IllegalStateException extends Error {
  constructor(message: string) { super(message); this.name = "IllegalStateException"; }
}

export class UnsupportedOperationException extends Error {
  constructor(message = "Operation is not supported") { super(message); this.name = "UnsupportedOperationException"; }
}

export class IndexOutOfBoundsException extends Error {
  constructor(message = "Index out of bounds") { super(message); this.name = "IndexOutOfBoundsException"; }
}

export class NoSuchElementException extends Error {
  constructor(message = "No such element") { super(message); this.name = "NoSuchElementException"; }
}
