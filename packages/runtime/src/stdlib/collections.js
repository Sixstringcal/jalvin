// ─────────────────────────────────────────────────────────────────────────────
// stdlib/collections.ts — Collection constructors, operators, and builders
// ─────────────────────────────────────────────────────────────────────────────
import { NoSuchElementException } from "./types.js";
// ─────────────────────────────────────────────────────────────────────────────
// Immutable and mutable factory functions
// ─────────────────────────────────────────────────────────────────────────────
export function listOf(...items) {
    return Object.freeze([...items]);
}
export function mutableListOf(...items) {
    return [...items];
}
export function setOf(...items) {
    return Object.freeze(new Set(items));
}
export function mutableSetOf(...items) {
    return new Set(items);
}
export function mapOf(...entries) {
    return Object.freeze(new Map(entries));
}
export function mutableMapOf(...entries) {
    return new Map(entries);
}
/** Creates a 2-element tuple. Use `Pair` from `conversions.ts` for the class form. */
export function pairOf(first, second) {
    return [first, second];
}
/** Creates a 3-element tuple. Use `Triple` from `conversions.ts` for the class form. */
export function tripleOf(first, second, third) {
    return [first, second, third];
}
// ─────────────────────────────────────────────────────────────────────────────
// Transformation operators
// ─────────────────────────────────────────────────────────────────────────────
export function map(iterable, transform) {
    const result = [];
    for (const item of iterable)
        result.push(transform(item));
    return result;
}
export function filter(iterable, predicate) {
    const result = [];
    for (const item of iterable)
        if (predicate(item))
            result.push(item);
    return result;
}
export function filterNotNull(iterable) {
    const result = [];
    for (const item of iterable)
        if (item != null)
            result.push(item);
    return result;
}
export function forEach(iterable, action) {
    for (const item of iterable)
        action(item);
}
export function fold(iterable, initial, operation) {
    let acc = initial;
    for (const item of iterable)
        acc = operation(acc, item);
    return acc;
}
export function reduce(iterable, operation) {
    let first = true;
    let acc;
    for (const item of iterable) {
        if (first) {
            acc = item;
            first = false;
        }
        else
            acc = operation(acc, item);
    }
    if (first)
        throw new NoSuchElementException("Collection is empty");
    return acc;
}
export function flatMap(iterable, transform) {
    const result = [];
    for (const item of iterable)
        for (const inner of transform(item))
            result.push(inner);
    return result;
}
export function flatten(iterable) {
    const result = [];
    for (const inner of iterable)
        for (const item of inner)
            result.push(item);
    return result;
}
export function groupBy(iterable, keySelector) {
    const result = new Map();
    for (const item of iterable) {
        const key = keySelector(item);
        const group = result.get(key);
        if (group)
            group.push(item);
        else
            result.set(key, [item]);
    }
    return result;
}
export function associate(iterable, transform) {
    const result = new Map();
    for (const item of iterable) {
        const [k, v] = transform(item);
        result.set(k, v);
    }
    return result;
}
export function zip(a, b) {
    const len = Math.min(a.length, b.length);
    const result = [];
    for (let i = 0; i < len; i++)
        result.push([a[i], b[i]]);
    return result;
}
// ─────────────────────────────────────────────────────────────────────────────
// Aggregation operators
// ─────────────────────────────────────────────────────────────────────────────
export function sumOf(iterable, selector) {
    let sum = 0;
    for (const item of iterable)
        sum += selector(item);
    return sum;
}
export function any(iterable, predicate) {
    for (const item of iterable)
        if (predicate(item))
            return true;
    return false;
}
export function all(iterable, predicate) {
    for (const item of iterable)
        if (!predicate(item))
            return false;
    return true;
}
export function none(iterable, predicate) {
    for (const item of iterable)
        if (predicate(item))
            return false;
    return true;
}
export function count(iterable, predicate) {
    let n = 0;
    for (const item of iterable)
        if (!predicate || predicate(item))
            n++;
    return n;
}
export function minOf(iterable, selector) {
    let min = Infinity;
    for (const item of iterable) {
        const v = selector(item);
        if (v < min)
            min = v;
    }
    return min;
}
export function maxOf(iterable, selector) {
    let max = -Infinity;
    for (const item of iterable) {
        const v = selector(item);
        if (v > max)
            max = v;
    }
    return max;
}
export function minOrNull(arr, selector) {
    if (arr.length === 0)
        return null;
    let minItem = arr[0];
    let minVal = selector(minItem);
    for (let i = 1; i < arr.length; i++) {
        const v = selector(arr[i]);
        if (v < minVal) {
            minVal = v;
            minItem = arr[i];
        }
    }
    return minItem;
}
export function maxOrNull(arr, selector) {
    if (arr.length === 0)
        return null;
    let maxItem = arr[0];
    let maxVal = selector(maxItem);
    for (let i = 1; i < arr.length; i++) {
        const v = selector(arr[i]);
        if (v > maxVal) {
            maxVal = v;
            maxItem = arr[i];
        }
    }
    return maxItem;
}
export function joinToString(iterable, separator = ", ", prefix = "", suffix = "", transform) {
    const parts = [];
    for (const item of iterable)
        parts.push(transform ? transform(item) : String(item));
    return prefix + parts.join(separator) + suffix;
}
// ─────────────────────────────────────────────────────────────────────────────
// Search operators
// ─────────────────────────────────────────────────────────────────────────────
export function first(iterable, predicate) {
    for (const item of iterable)
        if (!predicate || predicate(item))
            return item;
    throw new NoSuchElementException("No element matching predicate");
}
export function firstOrNull(iterable, predicate) {
    for (const item of iterable)
        if (!predicate || predicate(item))
            return item;
    return null;
}
export function last(arr, predicate) {
    for (let i = arr.length - 1; i >= 0; i--) {
        if (!predicate || predicate(arr[i]))
            return arr[i];
    }
    throw new NoSuchElementException("No element matching predicate");
}
export function lastOrNull(arr, predicate) {
    for (let i = arr.length - 1; i >= 0; i--) {
        if (!predicate || predicate(arr[i]))
            return arr[i];
    }
    return null;
}
export function find(iterable, predicate) {
    return firstOrNull(iterable, predicate);
}
export function findLast(arr, predicate) {
    return lastOrNull(arr, predicate);
}
// ─────────────────────────────────────────────────────────────────────────────
// Ordering and deduplication
// ─────────────────────────────────────────────────────────────────────────────
export function distinct(iterable) {
    return [...new Set(iterable)];
}
export function distinctBy(iterable, selector) {
    const seen = new Set();
    const result = [];
    for (const item of iterable) {
        const key = selector(item);
        if (!seen.has(key)) {
            seen.add(key);
            result.push(item);
        }
    }
    return result;
}
export function sortedBy(arr, selector) {
    return [...arr].sort((a, b) => {
        const ka = selector(a), kb = selector(b);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
}
export function sortedByDescending(arr, selector) {
    return [...arr].sort((a, b) => {
        const ka = selector(a), kb = selector(b);
        return ka > kb ? -1 : ka < kb ? 1 : 0;
    });
}
export function reversed(arr) {
    return [...arr].reverse();
}
// ─────────────────────────────────────────────────────────────────────────────
// Slicing and windowing
// ─────────────────────────────────────────────────────────────────────────────
export function take(arr, n) {
    return arr.slice(0, n);
}
export function takeWhile(iterable, predicate) {
    const result = [];
    for (const item of iterable) {
        if (!predicate(item))
            break;
        result.push(item);
    }
    return result;
}
export function drop(arr, n) {
    return arr.slice(n);
}
export function dropWhile(iterable, predicate) {
    const result = [];
    let dropping = true;
    for (const item of iterable) {
        if (dropping && predicate(item))
            continue;
        dropping = false;
        result.push(item);
    }
    return result;
}
export function chunked(arr, size) {
    const result = [];
    for (let i = 0; i < arr.length; i += size)
        result.push(arr.slice(i, i + size));
    return result;
}
export function windowed(arr, size, step = 1) {
    const result = [];
    for (let i = 0; i <= arr.length - size; i += step)
        result.push(arr.slice(i, i + size));
    return result;
}
export function partition(iterable, predicate) {
    const yes = [], no = [];
    for (const item of iterable)
        (predicate(item) ? yes : no).push(item);
    return [yes, no];
}
export function withIndex(iterable) {
    const result = [];
    let i = 0;
    for (const value of iterable)
        result.push({ index: i++, value });
    return result;
}
export function buildList(fn) {
    const arr = [];
    fn({
        add(item) { arr.push(item); },
        addAll(items) { for (const i of items)
            arr.push(i); },
        get size() { return arr.length; },
    });
    return arr;
}
export function buildSet(fn) {
    const s = new Set();
    fn({
        add(item) { s.add(item); },
        addAll(items) { for (const i of items)
            s.add(i); },
        get size() { return s.size; },
    });
    return s;
}
export function buildMap(fn) {
    const m = new Map();
    fn({
        put(key, value) { m.set(key, value); },
        putAll(entries) { for (const [k, v] of entries)
            m.set(k, v); },
        get size() { return m.size; },
    });
    return m;
}
//# sourceMappingURL=collections.js.map