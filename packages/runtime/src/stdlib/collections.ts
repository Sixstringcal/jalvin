// ─────────────────────────────────────────────────────────────────────────────
// stdlib/collections.ts — Collection constructors, operators, and builders
// ─────────────────────────────────────────────────────────────────────────────

import { NoSuchElementException } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Immutable and mutable factory functions
// ─────────────────────────────────────────────────────────────────────────────

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

/** Creates a 2-element tuple. Use `Pair` from `conversions.ts` for the class form. */
export function pairOf<A, B>(first: A, second: B): [A, B] {
  return [first, second];
}

/** Creates a 3-element tuple. Use `Triple` from `conversions.ts` for the class form. */
export function tripleOf<A, B, C>(first: A, second: B, third: C): [A, B, C] {
  return [first, second, third];
}

// ─────────────────────────────────────────────────────────────────────────────
// Transformation operators
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
  const result = new Map<K, T[]>();
  for (const item of iterable) {
    const key   = keySelector(item);
    const group = result.get(key);
    if (group) group.push(item);
    else result.set(key, [item]);
  }
  return result;
}

export function associate<T, K, V>(
  iterable: Iterable<T>,
  transform: (item: T) => [K, V]
): Map<K, V> {
  const result = new Map<K, V>();
  for (const item of iterable) {
    const [k, v] = transform(item);
    result.set(k, v);
  }
  return result;
}

export function zip<A, B>(a: A[], b: B[]): [A, B][] {
  const len    = Math.min(a.length, b.length);
  const result: [A, B][] = [];
  for (let i = 0; i < len; i++) result.push([a[i]!, b[i]!]);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation operators
// ─────────────────────────────────────────────────────────────────────────────

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
  let minVal  = selector(minItem);
  for (let i = 1; i < arr.length; i++) {
    const v = selector(arr[i]!);
    if (v < minVal) { minVal = v; minItem = arr[i]!; }
  }
  return minItem;
}

export function maxOrNull<T>(arr: T[], selector: (item: T) => number): T | null {
  if (arr.length === 0) return null;
  let maxItem = arr[0]!;
  let maxVal  = selector(maxItem);
  for (let i = 1; i < arr.length; i++) {
    const v = selector(arr[i]!);
    if (v > maxVal) { maxVal = v; maxItem = arr[i]!; }
  }
  return maxItem;
}

export function joinToString<T>(
  iterable:  Iterable<T>,
  separator  = ", ",
  prefix     = "",
  suffix     = "",
  transform?: (item: T) => string
): string {
  const parts: string[] = [];
  for (const item of iterable) parts.push(transform ? transform(item) : String(item));
  return prefix + parts.join(separator) + suffix;
}

// ─────────────────────────────────────────────────────────────────────────────
// Search operators
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Ordering and deduplication
// ─────────────────────────────────────────────────────────────────────────────

export function distinct<T>(iterable: Iterable<T>): T[] {
  return [...new Set(iterable)];
}

export function distinctBy<T, K>(iterable: Iterable<T>, selector: (item: T) => K): T[] {
  const seen   = new Set<K>();
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

// ─────────────────────────────────────────────────────────────────────────────
// Slicing and windowing
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Collection builders — buildList {}, buildSet {}, buildMap {}
// ─────────────────────────────────────────────────────────────────────────────

interface ListBuilder<T> {
  add(item: T): void;
  addAll(items: Iterable<T>): void;
  readonly size: number;
}

export function buildList<T>(fn: (list: ListBuilder<T>) => void): T[] {
  const arr: T[] = [];
  fn({
    add(item: T)               { arr.push(item); },
    addAll(items: Iterable<T>) { for (const i of items) arr.push(i); },
    get size()                 { return arr.length; },
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
    add(item: T)               { s.add(item); },
    addAll(items: Iterable<T>) { for (const i of items) s.add(i); },
    get size()                 { return s.size; },
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
    put(key: K, value: V)              { m.set(key, value); },
    putAll(entries: Iterable<[K, V]>) { for (const [k, v] of entries) m.set(k, v); },
    get size()                         { return m.size; },
  });
  return m;
}
