// ─────────────────────────────────────────────────────────────────────────────
// stdlib/conversions.ts — Type conversions, Pair/Triple, and range types
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Primitive type conversions
// ─────────────────────────────────────────────────────────────────────────────
export function toInt(v) {
    return typeof v === "boolean" ? (v ? 1 : 0) : Math.trunc(Number(v));
}
export function toLong(v) {
    return toInt(v);
}
export function toFloat(v) {
    return Number(v);
}
export function toDouble(v) {
    return Number(v);
}
export function toChar(code) {
    return String.fromCharCode(code);
}
export function charCodeOf(ch) {
    return ch.charCodeAt(0);
}
export function toString(v) {
    return String(v);
}
// ─────────────────────────────────────────────────────────────────────────────
// Pair and Triple — structured 2- and 3-element tuples
// ─────────────────────────────────────────────────────────────────────────────
export class Pair {
    first;
    second;
    constructor(first, second) {
        this.first = first;
        this.second = second;
    }
    toList() { return [this.first, this.second]; }
    [Symbol.iterator]() {
        let i = 0;
        const vals = [this.first, this.second];
        return {
            next: () => i < vals.length
                ? { value: vals[i++], done: false }
                : { value: undefined, done: true },
        };
    }
    copy(first = this.first, second = this.second) {
        return new Pair(first, second);
    }
    toString() { return `(${this.first}, ${this.second})`; }
}
export class Triple {
    first;
    second;
    third;
    constructor(first, second, third) {
        this.first = first;
        this.second = second;
        this.third = third;
    }
    [Symbol.iterator]() {
        let i = 0;
        const vals = [this.first, this.second, this.third];
        return {
            next: () => i < vals.length
                ? { value: vals[i++], done: false }
                : { value: undefined, done: true },
        };
    }
    toString() { return `(${this.first}, ${this.second}, ${this.third})`; }
}
// ─────────────────────────────────────────────────────────────────────────────
// Range types — back the `..`, `..<`, `downTo`, and `step` operators
// ─────────────────────────────────────────────────────────────────────────────
/**
 * `range(from, to, inclusive)` — emitted for `..` and `..<` range operators.
 * Returns an iterable of numbers.
 */
export function* range(from, to, inclusive) {
    for (let i = from; inclusive ? i <= to : i < to; i++) {
        yield i;
    }
}
export class IntRange {
    start;
    endInclusive;
    stepSize;
    constructor(start, endInclusive, stepSize = 1) {
        this.start = start;
        this.endInclusive = endInclusive;
        this.stepSize = stepSize;
    }
    get isEmpty() {
        return this.stepSize > 0 ? this.start > this.endInclusive : this.start < this.endInclusive;
    }
    contains(n) {
        if (this.stepSize > 0)
            return n >= this.start && n <= this.endInclusive;
        return n <= this.start && n >= this.endInclusive;
    }
    [Symbol.iterator]() {
        let current = this.start;
        const end = this.endInclusive;
        const stepSize = this.stepSize;
        return {
            next() {
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
    toList() { return [...this]; }
    count() { return Math.max(0, Math.floor((this.endInclusive - this.start) / this.stepSize) + 1); }
    first() { return this.start; }
    last() {
        if (this.stepSize === 0)
            return this.start;
        const n = Math.floor((this.endInclusive - this.start) / this.stepSize);
        return this.start + n * this.stepSize;
    }
    toString() { return `${this.start}..${this.endInclusive} step ${this.stepSize}`; }
}
/** `5 downTo 1` — desugars `5.downTo(1)` into a descending IntRange. */
export function downTo(start, end) {
    return new IntRange(start, end, -1);
}
/** `(1..10).step(2)` — creates an IntRange with a custom step. */
export function step(range_, stepVal) {
    return new IntRange(range_.start, range_.endInclusive, stepVal);
}
//# sourceMappingURL=conversions.js.map