// ─────────────────────────────────────────────────────────────────────────────
// stdlib/conversions.ts — Type conversions, Pair/Triple, and range types
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Primitive type conversions
// ─────────────────────────────────────────────────────────────────────────────

export function toInt(v: string | number | boolean): number {
  return typeof v === "boolean" ? (v ? 1 : 0) : Math.trunc(Number(v));
}

export function toLong(v: string | number | boolean): number {
  return toInt(v);
}

export function toFloat(v: string | number | boolean): number {
  return Number(v);
}

export function toDouble(v: string | number | boolean): number {
  return Number(v);
}

export function toChar(code: number): string {
  return String.fromCharCode(code);
}

export function charCodeOf(ch: string): number {
  return ch.charCodeAt(0);
}

export function toString(v: unknown): string {
  return String(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pair and Triple — structured 2- and 3-element tuples
// ─────────────────────────────────────────────────────────────────────────────

export class Pair<A, B> {
  constructor(readonly first: A, readonly second: B) { }

  toList(): [A, B] { return [this.first, this.second]; }

  [Symbol.iterator](): Iterator<A | B> {
    let i = 0;
    const vals: (A | B)[] = [this.first, this.second];
    return {
      next: () => i < vals.length
        ? { value: vals[i++]!, done: false }
        : { value: undefined as unknown as A | B, done: true },
    };
  }

  copy(first = this.first, second = this.second): Pair<A, B> {
    return new Pair(first, second);
  }

  toString(): string { return `(${this.first}, ${this.second})`; }
}

export class Triple<A, B, C> {
  constructor(readonly first: A, readonly second: B, readonly third: C) { }

  [Symbol.iterator](): Iterator<A | B | C> {
    let i = 0;
    const vals: (A | B | C)[] = [this.first, this.second, this.third];
    return {
      next: () => i < vals.length
        ? { value: vals[i++]!, done: false }
        : { value: undefined as unknown as A | B | C, done: true },
    };
  }

  toString(): string { return `(${this.first}, ${this.second}, ${this.third})`; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Range types — back the `..`, `..<`, `downTo`, and `step` operators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `range(from, to, inclusive)` — emitted for `..` and `..<` range operators.
 * Returns an iterable of numbers.
 */
export function* range(from: number, to: number, inclusive: boolean): Iterable<number> {
  for (let i = from; inclusive ? i <= to : i < to; i++) {
    yield i;
  }
}

export class IntRange implements Iterable<number> {
  constructor(
    readonly start: number,
    readonly endInclusive: number,
    readonly stepSize: number = 1
  ) { }

  get isEmpty(): boolean {
    return this.stepSize > 0 ? this.start > this.endInclusive : this.start < this.endInclusive;
  }

  contains(n: number): boolean {
    if (this.stepSize > 0) return n >= this.start && n <= this.endInclusive;
    return n <= this.start && n >= this.endInclusive;
  }

  [Symbol.iterator](): Iterator<number> {
    let current = this.start;
    const end      = this.endInclusive;
    const stepSize = this.stepSize;
    return {
      next(): IteratorResult<number> {
        const inRange = stepSize > 0 ? current <= end : current >= end;
        if (inRange) {
          const value = current;
          current += stepSize;
          return { value, done: false };
        }
        return { value: 0, done: true };
      },
    };
  }

  toList():   number[] { return [...this]; }
  count():    number   { return Math.max(0, Math.floor((this.endInclusive - this.start) / this.stepSize) + 1); }
  first():    number   { return this.start; }
  last():     number   {
    if (this.stepSize === 0) return this.start;
    const n = Math.floor((this.endInclusive - this.start) / this.stepSize);
    return this.start + n * this.stepSize;
  }
  toString(): string   { return `${this.start}..${this.endInclusive} step ${this.stepSize}`; }
}

/** `5 downTo 1` — desugars `5.downTo(1)` into a descending IntRange. */
export function downTo(start: number, end: number): IntRange {
  return new IntRange(start, end, -1);
}

/** `(1..10).step(2)` — creates an IntRange with a custom step. */
export function step(range_: IntRange, stepVal: number): IntRange {
  return new IntRange(range_.start, range_.endInclusive, stepVal);
}
