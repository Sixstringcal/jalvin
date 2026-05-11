export declare function toInt(v: string | number | boolean): number;
export declare function toLong(v: string | number | boolean): number;
export declare function toFloat(v: string | number | boolean): number;
export declare function toDouble(v: string | number | boolean): number;
export declare function toChar(code: number): string;
export declare function charCodeOf(ch: string): number;
export declare function toString(v: unknown): string;
export declare class Pair<A, B> {
    readonly first: A;
    readonly second: B;
    constructor(first: A, second: B);
    toList(): [A, B];
    [Symbol.iterator](): Iterator<A | B>;
    copy(first?: A, second?: B): Pair<A, B>;
    toString(): string;
}
export declare class Triple<A, B, C> {
    readonly first: A;
    readonly second: B;
    readonly third: C;
    constructor(first: A, second: B, third: C);
    [Symbol.iterator](): Iterator<A | B | C>;
    toString(): string;
}
/**
 * `range(from, to, inclusive)` — emitted for `..` and `..<` range operators.
 * Returns an iterable of numbers.
 */
export declare function range(from: number, to: number, inclusive: boolean): Iterable<number>;
export declare class IntRange implements Iterable<number> {
    readonly start: number;
    readonly endInclusive: number;
    readonly stepSize: number;
    constructor(start: number, endInclusive: number, stepSize?: number);
    get isEmpty(): boolean;
    contains(n: number): boolean;
    [Symbol.iterator](): Iterator<number>;
    toList(): number[];
    count(): number;
    first(): number;
    last(): number;
    toString(): string;
}
/** `5 downTo 1` — desugars `5.downTo(1)` into a descending IntRange. */
export declare function downTo(start: number, end: number): IntRange;
/** `(1..10).step(2)` — creates an IntRange with a custom step. */
export declare function step(range_: IntRange, stepVal: number): IntRange;
//# sourceMappingURL=conversions.d.ts.map