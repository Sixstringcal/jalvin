// ─────────────────────────────────────────────────────────────────────────────
// Runtime utility helpers — used by codegen emitted code
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

/**
 * `range(from, to, inclusive)` — emitted for `..` and `..<` range operators.
 * Returns an iterable of numbers.
 */
export function* range(from: number, to: number, inclusive: boolean): Iterable<number> {
  for (let i = from; inclusive ? i <= to : i < to; i++) {
    yield i;
  }
}

/**
 * `delegate(...)` — backing store for delegated properties.
 * Used by `by lazy { }`, `by Delegates.observable(...)`, etc.
 */
export interface PropertyDelegate<T> {
  getValue(): T;
  setValue(value: T): void;
}

export function delegate<T>(
  impl: PropertyDelegate<T>,
  _name: string,
  _receiver: object
): PropertyDelegate<T> {
  return impl;
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in Delegates
// ─────────────────────────────────────────────────────────────────────────────

export class LazyDelegate<T> implements PropertyDelegate<T> {
  private _value: T | undefined;
  private _initialized = false;
  constructor(private readonly _init: () => T) { }
  getValue(): T {
    if (!this._initialized) {
      this._value = this._init();
      this._initialized = true;
    }
    return this._value as T;
  }
  setValue(_v: T): void {
    throw new Error("Cannot set a lazy property");
  }
}

export function lazy<T>(init: () => T): LazyDelegate<T> {
  return new LazyDelegate(init);
}

export class ObservableDelegate<T> implements PropertyDelegate<T> {
  constructor(
    private _value: T,
    private readonly _onChange: (property: string, oldValue: T, newValue: T) => void,
    private _name = ""
  ) { }
  getValue(): T { return this._value; }
  setValue(value: T): void {
    const old = this._value;
    this._value = value;
    this._onChange(this._name, old, value);
  }
}

export const Delegates = {
  observable<T>(initial: T, onChange: (prop: string, old: T, new_: T) => void): ObservableDelegate<T> {
    return new ObservableDelegate(initial, onChange);
  },
  notNull<T>(): PropertyDelegate<T> {
    let _v: T | undefined;
    return {
      getValue() {
        if (_v === undefined) throw new NullPointerException("Delegated property was not initialised");
        return _v;
      },
      setValue(v: T) { _v = v; },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Standard library shims
// ─────────────────────────────────────────────────────────────────────────────

export function println(...args: unknown[]): void {
  console.log(...args);
}

export function print(...args: unknown[]): void {
  process.stdout?.write(args.map(String).join(""));
}

export function listOf<T>(...items: T[]): readonly T[] {
  return Object.freeze([...items]);
}

export function mutableListOf<T>(...items: T[]): T[] {
  return [...items];
}

export function setOf<T>(...items: T[]): ReadonlySet<T> {
  return Object.freeze(new Set(items));
}

export function mutableSetOf<T>(...items: T[]): Set<T> {
  return new Set(items);
}

export function mapOf<K, V>(...entries: [K, V][]): ReadonlyMap<K, V> {
  return Object.freeze(new Map(entries));
}

export function mutableMapOf<K, V>(...entries: [K, V][]): Map<K, V> {
  return new Map(entries);
}

export function pairOf<A, B>(first: A, second: B): [A, B] {
  return [first, second];
}

export function tripleOf<A, B, C>(first: A, second: B, third: C): [A, B, C] {
  return [first, second, third];
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

// ─────────────────────────────────────────────────────────────────────────────
// Scope functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `let` — calls `block` with `this` as argument, returns the block result.
 * Usage: `value.let { v -> transform(v) }`
 */
export function let_<T, R>(value: T, block: (it: T) => R): R {
  return block(value);
}

/**
 * `run` — calls `block` with `this` as receiver, returns the block result.
 * Usage: `obj.run { doSomething() }`
 */
export function run_<T, R>(value: T, block: (this: T) => R): R {
  return block.call(value);
}

/**
 * `apply` — calls `block` with `this` as receiver, returns the original value.
 * Usage: `obj.apply { configure() }`
 */
export function apply<T>(value: T, block: (this: T) => void): T {
  block.call(value);
  return value;
}

/**
 * `also` — calls `block` with `this` as argument, returns the original value.
 * Usage: `value.also { v -> sideEffect(v) }`
 */
export function also<T>(value: T, block: (it: T) => void): T {
  block(value);
  return value;
}

/**
 * `with` — calls `block` with `receiver` as receiver, returns block result.
 * Usage: `with(obj) { doSomething() }`
 */
export function with_<T, R>(receiver: T, block: (this: T) => R): R {
  return block.call(receiver);
}

/**
 * `takeIf` — returns `this` if `predicate` is true, otherwise null.
 */
export function takeIf<T>(value: T, predicate: (it: T) => boolean): T | null {
  return predicate(value) ? value : null;
}

/**
 * `takeUnless` — returns `this` if `predicate` is false, otherwise null.
 */
export function takeUnless<T>(value: T, predicate: (it: T) => boolean): T | null {
  return predicate(value) ? null : value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard library collection extensions
// ─────────────────────────────────────────────────────────────────────────────

export function map<T, R>(iterable: Iterable<T>, transform: (item: T) => R): R[] {
  const result: R[] = [];
  for (const item of iterable) result.push(transform(item));
  return result;
}

export function filter<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): T[] {
  const result: T[] = [];
  for (const item of iterable) if (predicate(item)) result.push(item);
  return result;
}

export function filterNotNull<T>(iterable: Iterable<T | null | undefined>): T[] {
  const result: T[] = [];
  for (const item of iterable) if (item != null) result.push(item);
  return result;
}

export function forEach<T>(iterable: Iterable<T>, action: (item: T) => void): void {
  for (const item of iterable) action(item);
}

export function fold<T, R>(iterable: Iterable<T>, initial: R, operation: (acc: R, item: T) => R): R {
  let acc = initial;
  for (const item of iterable) acc = operation(acc, item);
  return acc;
}

export function reduce<T>(iterable: Iterable<T>, operation: (acc: T, item: T) => T): T {
  let first = true;
  let acc!: T;
  for (const item of iterable) {
    if (first) { acc = item; first = false; }
    else acc = operation(acc, item);
  }
  if (first) throw new NoSuchElementException("Collection is empty");
  return acc;
}

export function sumOf<T>(iterable: Iterable<T>, selector: (item: T) => number): number {
  let sum = 0;
  for (const item of iterable) sum += selector(item);
  return sum;
}

export function any<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): boolean {
  for (const item of iterable) if (predicate(item)) return true;
  return false;
}

export function all<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): boolean {
  for (const item of iterable) if (!predicate(item)) return false;
  return true;
}

export function none<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): boolean {
  for (const item of iterable) if (predicate(item)) return false;
  return true;
}

export function count<T>(iterable: Iterable<T>, predicate?: (item: T) => boolean): number {
  let n = 0;
  for (const item of iterable) if (!predicate || predicate(item)) n++;
  return n;
}

export function first<T>(iterable: Iterable<T>, predicate?: (item: T) => boolean): T {
  for (const item of iterable) if (!predicate || predicate(item)) return item;
  throw new NoSuchElementException("No element matching predicate");
}

export function firstOrNull<T>(iterable: Iterable<T>, predicate?: (item: T) => boolean): T | null {
  for (const item of iterable) if (!predicate || predicate(item)) return item;
  return null;
}

export function last<T>(arr: T[], predicate?: (item: T) => boolean): T {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (!predicate || predicate(arr[i]!)) return arr[i]!;
  }
  throw new NoSuchElementException("No element matching predicate");
}

export function lastOrNull<T>(arr: T[], predicate?: (item: T) => boolean): T | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (!predicate || predicate(arr[i]!)) return arr[i]!;
  }
  return null;
}

export function find<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): T | null {
  return firstOrNull(iterable, predicate);
}

export function findLast<T>(arr: T[], predicate: (item: T) => boolean): T | null {
  return lastOrNull(arr, predicate);
}

export function flatMap<T, R>(iterable: Iterable<T>, transform: (item: T) => Iterable<R>): R[] {
  const result: R[] = [];
  for (const item of iterable) for (const inner of transform(item)) result.push(inner);
  return result;
}

export function flatten<T>(iterable: Iterable<Iterable<T>>): T[] {
  const result: T[] = [];
  for (const inner of iterable) for (const item of inner) result.push(item);
  return result;
}

export function groupBy<T, K>(iterable: Iterable<T>, keySelector: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of iterable) {
    const key = keySelector(item);
    const group = map.get(key);
    if (group) group.push(item);
    else map.set(key, [item]);
  }
  return map;
}

export function associate<T, K, V>(
  iterable: Iterable<T>,
  transform: (item: T) => [K, V]
): Map<K, V> {
  const map = new Map<K, V>();
  for (const item of iterable) {
    const [k, v] = transform(item);
    map.set(k, v);
  }
  return map;
}

export function zip<A, B>(a: A[], b: B[]): [A, B][] {
  const len = Math.min(a.length, b.length);
  const result: [A, B][] = [];
  for (let i = 0; i < len; i++) result.push([a[i]!, b[i]!]);
  return result;
}

export function distinct<T>(iterable: Iterable<T>): T[] {
  return [...new Set(iterable)];
}

export function distinctBy<T, K>(iterable: Iterable<T>, selector: (item: T) => K): T[] {
  const seen = new Set<K>();
  const result: T[] = [];
  for (const item of iterable) {
    const key = selector(item);
    if (!seen.has(key)) { seen.add(key); result.push(item); }
  }
  return result;
}

export function sortedBy<T>(arr: T[], selector: (item: T) => number | string): T[] {
  return [...arr].sort((a, b) => {
    const ka = selector(a), kb = selector(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

export function sortedByDescending<T>(arr: T[], selector: (item: T) => number | string): T[] {
  return [...arr].sort((a, b) => {
    const ka = selector(a), kb = selector(b);
    return ka > kb ? -1 : ka < kb ? 1 : 0;
  });
}

export function reversed<T>(arr: T[]): T[] {
  return [...arr].reverse();
}

export function chunked<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

export function windowed<T>(arr: T[], size: number, step = 1): T[][] {
  const result: T[][] = [];
  for (let i = 0; i <= arr.length - size; i += step) result.push(arr.slice(i, i + size));
  return result;
}

export function partition<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): [T[], T[]] {
  const yes: T[] = [], no: T[] = [];
  for (const item of iterable) (predicate(item) ? yes : no).push(item);
  return [yes, no];
}

export function withIndex<T>(iterable: Iterable<T>): Array<{ index: number; value: T }> {
  const result: Array<{ index: number; value: T }> = [];
  let i = 0;
  for (const value of iterable) result.push({ index: i++, value });
  return result;
}

export function minOf<T>(iterable: Iterable<T>, selector: (item: T) => number): number {
  let min = Infinity;
  for (const item of iterable) { const v = selector(item); if (v < min) min = v; }
  return min;
}

export function maxOf<T>(iterable: Iterable<T>, selector: (item: T) => number): number {
  let max = -Infinity;
  for (const item of iterable) { const v = selector(item); if (v > max) max = v; }
  return max;
}

export function minOrNull<T>(arr: T[], selector: (item: T) => number): T | null {
  if (arr.length === 0) return null;
  let minItem = arr[0]!;
  let minVal = selector(minItem);
  for (let i = 1; i < arr.length; i++) {
    const v = selector(arr[i]!);
    if (v < minVal) { minVal = v; minItem = arr[i]!; }
  }
  return minItem;
}

export function maxOrNull<T>(arr: T[], selector: (item: T) => number): T | null {
  if (arr.length === 0) return null;
  let maxItem = arr[0]!;
  let maxVal = selector(maxItem);
  for (let i = 1; i < arr.length; i++) {
    const v = selector(arr[i]!);
    if (v > maxVal) { maxVal = v; maxItem = arr[i]!; }
  }
  return maxItem;
}

export function joinToString<T>(
  iterable: Iterable<T>,
  separator = ", ",
  prefix = "",
  suffix = "",
  transform?: (item: T) => string
): string {
  const parts: string[] = [];
  for (const item of iterable) parts.push(transform ? transform(item) : String(item));
  return prefix + parts.join(separator) + suffix;
}

export function take<T>(arr: T[], n: number): T[] {
  return arr.slice(0, n);
}

export function takeWhile<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): T[] {
  const result: T[] = [];
  for (const item of iterable) { if (!predicate(item)) break; result.push(item); }
  return result;
}

export function drop<T>(arr: T[], n: number): T[] {
  return arr.slice(n);
}

export function dropWhile<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): T[] {
  const result: T[] = [];
  let dropping = true;
  for (const item of iterable) {
    if (dropping && predicate(item)) continue;
    dropping = false;
    result.push(item);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Numeric extensions
// ─────────────────────────────────────────────────────────────────────────────

export function coerceAtLeast(value: number, min: number): number {
  return value < min ? min : value;
}

export function coerceAtMost(value: number, max: number): number {
  return value > max ? max : value;
}

export function coerceIn(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** `Int.MAX_VALUE` and friends */
export const Int = {
  MAX_VALUE: 2147483647,
  MIN_VALUE: -2147483648,
} as const;

export const Long = {
  MAX_VALUE: BigInt("9223372036854775807"),
  MIN_VALUE: BigInt("-9223372036854775808"),
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// String extensions
// ─────────────────────────────────────────────────────────────────────────────

export function trimIndent(s: string): string {
  const lines = s.split("\n");
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  const indent = nonEmpty.reduce((min, l) => {
    const m = l.match(/^(\s*)/);
    return Math.min(min, m?.[1]?.length ?? 0);
  }, Infinity);
  const clean = isFinite(indent) ? indent : 0;
  return lines.map((l) => l.slice(clean)).join("\n").replace(/^\n/, "").replace(/\n$/, "");
}

export function repeat_(s: string, n: number): string {
  return s.repeat(n);
}

export function isBlank(s: string): boolean {
  return s.trim().length === 0;
}

export function isNotBlank(s: string): boolean {
  return s.trim().length > 0;
}

export function isNullOrBlank(s: string | null | undefined): boolean {
  return s == null || s.trim().length === 0;
}

export function toIntOrNull(s: string): number | null {
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

export function toDoubleOrNull(s: string): number | null {
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function toBooleanOrNull(s: string): boolean | null {
  if (s.toLowerCase() === "true") return true;
  if (s.toLowerCase() === "false") return false;
  return null;
}

export function padStart(s: string, length: number, padChar = " "): string {
  return s.padStart(length, padChar);
}

export function padEnd(s: string, length: number, padChar = " "): string {
  return s.padEnd(length, padChar);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pair / Triple as classes (mirrors pairOf/tripleOf)
// ─────────────────────────────────────────────────────────────────────────────

export class Pair<A, B> {
  constructor(readonly first: A, readonly second: B) { }
  toList(): [A, B] { return [this.first, this.second]; }
  [Symbol.iterator](): Iterator<A | B> {
    let i = 0;
    const vals: (A | B)[] = [this.first, this.second];
    return { next: () => i < vals.length ? { value: vals[i++]!, done: false } : { value: undefined as unknown as A | B, done: true } };
  }
  toString(): string { return `(${this.first}, ${this.second})`; }
  copy(first = this.first, second = this.second): Pair<A, B> { return new Pair(first, second); }
}

export class Triple<A, B, C> {
  constructor(readonly first: A, readonly second: B, readonly third: C) { }
  [Symbol.iterator](): Iterator<A | B | C> {
    let i = 0;
    const vals: (A | B | C)[] = [this.first, this.second, this.third];
    return { next: () => i < vals.length ? { value: vals[i++]!, done: false } : { value: undefined as unknown as A | B | C, done: true } };
  }
  toString(): string { return `(${this.first}, ${this.second}, ${this.third})`; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Math library
// ─────────────────────────────────────────────────────────────────────────────

export const abs = Math.abs.bind(Math);
export const ceil = Math.ceil.bind(Math);
export const floor = Math.floor.bind(Math);
export const round = Math.round.bind(Math);
export const sqrt = Math.sqrt.bind(Math);
export const pow = Math.pow.bind(Math);
export const exp = Math.exp.bind(Math);
export const ln = Math.log.bind(Math);
export const log2 = Math.log2.bind(Math);
export const log10 = Math.log10.bind(Math);
export const sin = Math.sin.bind(Math);
export const cos = Math.cos.bind(Math);
export const tan = Math.tan.bind(Math);
export const asin = Math.asin.bind(Math);
export const acos = Math.acos.bind(Math);
export const atan = Math.atan.bind(Math);
export const atan2 = Math.atan2.bind(Math);
export const sign = Math.sign.bind(Math);
export const hypot = Math.hypot.bind(Math);
export const truncate = Math.trunc.bind(Math);

export const PI = Math.PI;
export const E = Math.E;

/** Clamp a numeric value to a range */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Returns the integer part, rounding towards zero */
export function truncDiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

// ─────────────────────────────────────────────────────────────────────────────
// Extended String utilities
// ─────────────────────────────────────────────────────────────────────────────

export function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

export function decapitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toLowerCase() + s.slice(1);
}

export function substringBefore(s: string, delimiter: string): string {
  const idx = s.indexOf(delimiter);
  return idx === -1 ? s : s.slice(0, idx);
}

export function substringAfter(s: string, delimiter: string): string {
  const idx = s.indexOf(delimiter);
  return idx === -1 ? "" : s.slice(idx + delimiter.length);
}

export function substringBeforeLast(s: string, delimiter: string): string {
  const idx = s.lastIndexOf(delimiter);
  return idx === -1 ? s : s.slice(0, idx);
}

export function substringAfterLast(s: string, delimiter: string): string {
  const idx = s.lastIndexOf(delimiter);
  return idx === -1 ? "" : s.slice(idx + delimiter.length);
}

export function removePrefix(s: string, prefix: string): string {
  return s.startsWith(prefix) ? s.slice(prefix.length) : s;
}

export function removeSuffix(s: string, suffix: string): string {
  return s.endsWith(suffix) ? s.slice(0, s.length - suffix.length) : s;
}

export function lines(s: string): string[] {
  return s.split(/\r?\n/);
}

export function lineSequence(s: string): string[] {
  return lines(s);
}

export function ifEmpty<T extends string | null | undefined>(value: T, default_: () => T): T {
  return (value == null || (value as string).length === 0) ? default_() : value;
}

export function ifBlank<T extends string | null | undefined>(value: T, default_: () => T): T {
  return (value == null || (value as string).trim().length === 0) ? default_() : value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type conversion helpers
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
// IntRange — backing type for `..`, `..<`, `downTo`, `step`
// ─────────────────────────────────────────────────────────────────────────────

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
    const end = this.endInclusive;
    const s = this.stepSize;
    return {
      next(): IteratorResult<number> {
        if (s > 0 ? current <= end : current >= end) {
          const value = current;
          current += s;
          return { value, done: false };
        }
        return { value: 0, done: true };
      }
    };
  }

  toList(): number[] { return [...this]; }
  count(): number { return Math.max(0, Math.floor((this.endInclusive - this.start) / this.stepSize) + 1); }
  first(): number { return this.start; }
  last(): number {
    if (this.stepSize === 0) return this.start;
    const n = Math.floor((this.endInclusive - this.start) / this.stepSize);
    return this.start + n * this.stepSize;
  }
  toString(): string { return `${this.start}..${this.endInclusive} step ${this.stepSize}`; }
}

/** `5 downTo 1` — infix desugaring `5.downTo(1)` → `downTo(5, 1)` */
export function downTo(start: number, end: number): IntRange {
  return new IntRange(start, end, -1);
}

/** `(1..10).step(2)` — sets a custom step on a range */
export function step(range_: IntRange, stepVal: number): IntRange {
  return new IntRange(range_.start, range_.endInclusive, stepVal);
}

// ─────────────────────────────────────────────────────────────────────────────
// Collection builders — buildList {}, buildSet {}, buildMap {}, buildString {}
// ─────────────────────────────────────────────────────────────────────────────

export class StringBuilder {
  private readonly _parts: string[] = [];

  append(s: unknown): this { this._parts.push(String(s ?? "")); return this; }
  appendLine(s: unknown = ""): this { this._parts.push(String(s)); this._parts.push("\n"); return this; }
  prepend(s: unknown): this { this._parts.unshift(String(s ?? "")); return this; }
  clear(): this { this._parts.length = 0; return this; }
  get length(): number { return this._parts.reduce((sum, p) => sum + p.length, 0); }
  isEmpty(): boolean { return this.length === 0; }
  isNotEmpty(): boolean { return this.length > 0; }
  toString(): string { return this._parts.join(""); }
}

export function buildString(fn: (sb: StringBuilder) => void): string {
  const sb = new StringBuilder();
  fn(sb);
  return sb.toString();
}

interface ListBuilder<T> {
  add(item: T): void;
  addAll(items: Iterable<T>): void;
  readonly size: number;
}

export function buildList<T>(fn: (list: ListBuilder<T>) => void): T[] {
  const arr: T[] = [];
  fn({
    add(item: T) { arr.push(item); },
    addAll(items: Iterable<T>) { for (const i of items) arr.push(i); },
    get size() { return arr.length; },
  });
  return arr;
}

interface SetBuilder<T> {
  add(item: T): void;
  addAll(items: Iterable<T>): void;
  readonly size: number;
}

export function buildSet<T>(fn: (set: SetBuilder<T>) => void): Set<T> {
  const s = new Set<T>();
  fn({
    add(item: T) { s.add(item); },
    addAll(items: Iterable<T>) { for (const i of items) s.add(i); },
    get size() { return s.size; },
  });
  return s;
}

interface MapBuilder<K, V> {
  put(key: K, value: V): void;
  putAll(entries: Iterable<[K, V]>): void;
  readonly size: number;
}

export function buildMap<K, V>(fn: (map: MapBuilder<K, V>) => void): Map<K, V> {
  const m = new Map<K, V>();
  fn({
    put(key: K, value: V) { m.set(key, value); },
    putAll(entries: Iterable<[K, V]>) { for (const [k, v] of entries) m.set(k, v); },
    get size() { return m.size; },
  });
  return m;
}

// ─────────────────────────────────────────────────────────────────────────────
// Result<T> — mirrors standard Result type
// ─────────────────────────────────────────────────────────────────────────────

export class Result<T> {
  private constructor(
    private readonly _value: T | undefined,
    private readonly _error: unknown,
    private readonly _ok: boolean
  ) { }

  static success<T>(value: T): Result<T> { return new Result<T>(value, undefined, true); }
  static failure<T>(error: unknown): Result<T> { return new Result<T>(undefined, error, false); }

  get isSuccess(): boolean { return this._ok; }
  get isFailure(): boolean { return !this._ok; }

  getOrNull(): T | null { return this._ok ? this._value as T : null; }
  getOrUndefined(): T | undefined { return this._ok ? this._value : undefined; }

  getOrThrow(): T {
    if (this._ok) return this._value as T;
    throw this._error;
  }

  getOrDefault(default_: T): T { return this._ok ? this._value as T : default_; }

  getOrElse(fn: (e: unknown) => T): T { return this._ok ? this._value as T : fn(this._error); }

  exceptionOrNull(): unknown | null { return this._ok ? null : this._error; }

  map<U>(fn: (value: T) => U): Result<U> {
    if (!this._ok) return Result.failure<U>(this._error);
    try { return Result.success(fn(this._value as T)); }
    catch (e) { return Result.failure(e); }
  }

  mapCatching<U>(fn: (value: T) => U): Result<U> { return this.map(fn); }

  recover(fn: (e: unknown) => T): Result<T> {
    if (this._ok) return this;
    try { return Result.success(fn(this._error)); }
    catch (e) { return Result.failure(e); }
  }

  onSuccess(fn: (value: T) => void): this {
    if (this._ok) fn(this._value as T);
    return this;
  }

  onFailure(fn: (error: unknown) => void): this {
    if (!this._ok) fn(this._error);
    return this;
  }

  fold<R>(onSuccess: (value: T) => R, onFailure: (error: unknown) => R): R {
    return this._ok ? onSuccess(this._value as T) : onFailure(this._error);
  }

  toString(): string {
    return this._ok ? `Result.success(${this._value})` : `Result.failure(${this._error})`;
  }
}

/** Wrap a throwing function call in a Result. */
export function runCatching<T>(fn: () => T): Result<T> {
  try { return Result.success(fn()); }
  catch (e) { return Result.failure(e); }
}

/** Async variant — wraps a Promise-returning function. */
export async function runCatchingAsync<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return Result.success(await fn()); }
  catch (e) { return Result.failure(e); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Regex — thin wrapper over JS RegExp
// ─────────────────────────────────────────────────────────────────────────────

export class RegexResult {
  constructor(
    readonly value: string,
    readonly range: { start: number; endInclusive: number },
    readonly groupValues: ReadonlyArray<string>
  ) { }
}

export class Regex {
  private readonly _re: RegExp;

  constructor(pattern: string, options = "") {
    // Convert regex options: IGNORE_CASE → i, MULTILINE → m
    const flags = options
      .replace("IGNORE_CASE", "i")
      .replace("MULTILINE", "m")
      .replace("DOT_MATCHES_ALL", "s")
      .replace(/[^gimsuy]/g, "");
    this._re = new RegExp(pattern, flags || undefined);
  }

  /** Returns true if the entire input matches this regex (anchored). */
  matches(input: string): boolean {
    const re = new RegExp(`^(?:${this._re.source})$`, this._re.flags.replace("g", ""));
    return re.test(input);
  }

  /** Returns true if any part of the input matches. */
  containsMatchIn(input: string): boolean {
    const re = new RegExp(this._re.source, this._re.flags.replace("g", ""));
    return re.test(input);
  }

  find(input: string, startIndex = 0): RegexResult | null {
    const re = new RegExp(this._re.source, "g" + this._re.flags.replace("g", ""));
    re.lastIndex = startIndex;
    const m = re.exec(input);
    if (!m) return null;
    return new RegexResult(
      m[0]!,
      { start: m.index, endInclusive: m.index + m[0]!.length - 1 },
      m.slice(1).map((g) => g ?? "")
    );
  }

  findAll(input: string, startIndex = 0): RegexResult[] {
    const re = new RegExp(this._re.source, "g" + this._re.flags.replace("g", ""));
    re.lastIndex = startIndex;
    const results: RegexResult[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      results.push(new RegexResult(
        m[0]!,
        { start: m.index, endInclusive: m.index + m[0]!.length - 1 },
        m.slice(1).map((g) => g ?? "")
      ));
    }
    return results;
  }

  replace(input: string, replacement: string | ((result: RegexResult) => string)): string {
    const re = new RegExp(this._re.source, "g" + this._re.flags.replace("g", ""));
    if (typeof replacement === "string") return input.replace(re, replacement);
    return input.replace(re, (match, ...groups) => {
      const index = groups[groups.length - 2] as number;
      const r = new RegexResult(match, { start: index, endInclusive: index + match.length - 1 }, groups.slice(0, -2).map(String));
      return replacement(r);
    });
  }

  replaceFirst(input: string, replacement: string): string {
    const re = new RegExp(this._re.source, this._re.flags.replace("g", ""));
    return input.replace(re, replacement);
  }

  split(input: string, limit?: number): string[] {
    const parts = input.split(this._re);
    return limit !== undefined ? parts.slice(0, limit) : parts;
  }

  toPattern(): string { return this._re.source; }
  toString(): string { return this._re.toString(); }
}

/** `Regex(pattern)` constructor alias */
export { Regex as JalvinRegex };

// ─────────────────────────────────────────────────────────────────────────────
// Timing utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Measures how long a synchronous function takes in milliseconds. */
export function measureTimeMillis(fn: () => void): number {
  const start = performance.now();
  fn();
  return Math.round(performance.now() - start);
}

/** Measures how long an async function takes in milliseconds. */
export async function measureTimeMillisAsync(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return Math.round(performance.now() - start);
}

export interface TimedValue<T> {
  value: T;
  duration: number;
}

export function measureTimedValue<T>(fn: () => T): TimedValue<T> {
  const start = performance.now();
  const value = fn();
  return { value, duration: Math.round(performance.now() - start) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Random
// ─────────────────────────────────────────────────────────────────────────────

export class Random {
  constructor(private readonly seed?: number) {
    // Seeding is approximate — JS Math.random() is not seedable natively
    // For reproducible tests, use a third-party seeded PRNG
  }

  nextInt(): number;
  nextInt(until: number): number;
  nextInt(from: number, until: number): number;
  nextInt(fromOrUntil?: number, until?: number): number {
    if (fromOrUntil === undefined) return Math.floor(Math.random() * 2147483647);
    if (until === undefined) return Math.floor(Math.random() * fromOrUntil);
    return fromOrUntil + Math.floor(Math.random() * (until - fromOrUntil));
  }

  nextLong(until?: number): number { return this.nextInt(until ?? 2147483647); }
  nextDouble(): number { return Math.random(); }
  nextFloat(): number { return Math.random(); }
  nextBoolean(): boolean { return Math.random() < 0.5; }

  nextBytes(size: number): Uint8Array {
    const arr = new Uint8Array(size);
    for (let i = 0; i < size; i++) arr[i] = this.nextInt(256);
    return arr;
  }
}

/** The default global Random instance. */
export const Default = new Random();

/** Generate a RFC 4122 v4 UUID string. */
export function randomUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Structural equality — backs the Jalvin `==` operator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structural equality check:
 *  - null-safe: `null == null` is `true`, `null == anything` is `false`
 *  - for objects that expose an `.equals(other)` method, delegates to it
 *  - for primitives and everything else, falls back to `===`
 */
export function jalvinEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (typeof a === "object" && typeof (a as Record<string, unknown>)["equals"] === "function") {
    return (a as { equals(other: unknown): boolean }).equals(b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => jalvinEquals(v, b[i]));
  }
  return false;
}


