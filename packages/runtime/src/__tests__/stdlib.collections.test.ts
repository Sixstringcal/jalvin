import { describe, it, expect } from "vitest";
import {
  listOf, mutableListOf, setOf, mutableSetOf, mapOf, mutableMapOf,
  map, filter, filterNotNull, forEach, fold, reduce,
  flatMap, flatten, groupBy, associate, zip,
  sumOf, any, all, none, count,
  minOf, maxOf, minOrNull, maxOrNull,
  joinToString,
  first, firstOrNull, last, lastOrNull, find, findLast,
  distinct, distinctBy, sortedBy, sortedByDescending, reversed,
  take, takeWhile, drop, dropWhile,
  chunked, windowed, partition, withIndex,
  buildList, buildSet, buildMap,
} from "../stdlib/collections.js";
import { NoSuchElementException } from "../stdlib/types.js";

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

describe("collection factories", () => {
  it("listOf returns a frozen readonly array", () => {
    const list = listOf(1, 2, 3);
    expect(list).toEqual([1, 2, 3]);
    expect(Object.isFrozen(list)).toBe(true);
  });

  it("mutableListOf returns a mutable array", () => {
    const list = mutableListOf(1, 2, 3);
    list.push(4);
    expect(list).toEqual([1, 2, 3, 4]);
  });

  it("setOf returns a frozen ReadonlySet", () => {
    const s = setOf(1, 2, 2, 3);
    expect(s.size).toBe(3);
    expect(Object.isFrozen(s)).toBe(true);
  });

  it("mutableSetOf returns a mutable Set", () => {
    const s = mutableSetOf(1, 2);
    s.add(3);
    expect(s.size).toBe(3);
  });

  it("mapOf returns a frozen ReadonlyMap", () => {
    const m = mapOf(["a", 1] as [string, number], ["b", 2] as [string, number]);
    expect(m.get("a")).toBe(1);
    expect(Object.isFrozen(m)).toBe(true);
  });

  it("mutableMapOf returns a mutable Map", () => {
    const m = mutableMapOf(["x", 10] as [string, number]);
    m.set("y", 20);
    expect(m.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Transformation operators
// ---------------------------------------------------------------------------

describe("map", () => {
  it("transforms each element", () => {
    expect(map([1, 2, 3], (x) => x * 2)).toEqual([2, 4, 6]);
  });

  it("works on any Iterable", () => {
    expect(map(new Set([1, 2, 3]), String)).toEqual(["1", "2", "3"]);
  });
});

describe("filter", () => {
  it("keeps only elements matching the predicate", () => {
    expect(filter([1, 2, 3, 4, 5], (x) => x % 2 === 0)).toEqual([2, 4]);
  });
});

describe("filterNotNull", () => {
  it("removes null and undefined", () => {
    expect(filterNotNull([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
  });
});

describe("forEach", () => {
  it("iterates over each element", () => {
    const visited: number[] = [];
    forEach([10, 20, 30], (x) => visited.push(x));
    expect(visited).toEqual([10, 20, 30]);
  });
});

describe("fold", () => {
  it("accumulates with an initial value", () => {
    expect(fold([1, 2, 3, 4], 0, (acc, x) => acc + x)).toBe(10);
  });

  it("returns the initial value for an empty collection", () => {
    expect(fold([], 99, (acc, x: number) => acc + x)).toBe(99);
  });
});

describe("reduce", () => {
  it("combines elements without an initial value", () => {
    expect(reduce([1, 2, 3, 4], (a, b) => a + b)).toBe(10);
  });

  it("throws NoSuchElementException on an empty collection", () => {
    expect(() => reduce([], (a: number, b: number) => a + b)).toThrow(NoSuchElementException);
  });
});

describe("flatMap", () => {
  it("maps and flattens one level", () => {
    expect(flatMap([1, 2, 3], (x) => [x, x * 10])).toEqual([1, 10, 2, 20, 3, 30]);
  });
});

describe("flatten", () => {
  it("flattens one level of nesting", () => {
    expect(flatten([[1, 2], [3, 4]])).toEqual([1, 2, 3, 4]);
  });
});

describe("groupBy", () => {
  it("groups by key selector", () => {
    const groups = groupBy(["one", "two", "three", "four"], (s) => s.length);
    expect(groups.get(3)).toEqual(["one", "two"]);
    expect(groups.get(5)).toEqual(["three"]);
    expect(groups.get(4)).toEqual(["four"]);
  });
});

describe("associate", () => {
  it("builds a Map from [key, value] pairs", () => {
    const m = associate(["a", "bb", "ccc"], (s) => [s, s.length] as [string, number]);
    expect(m.get("a")).toBe(1);
    expect(m.get("ccc")).toBe(3);
  });
});

describe("zip", () => {
  it("pairs elements from two arrays", () => {
    expect(zip([1, 2, 3], ["a", "b", "c"])).toEqual([[1, "a"], [2, "b"], [3, "c"]]);
  });

  it("stops at the shorter array", () => {
    expect(zip([1, 2], ["a", "b", "c"])).toEqual([[1, "a"], [2, "b"]]);
  });
});

// ---------------------------------------------------------------------------
// Aggregate operators
// ---------------------------------------------------------------------------

describe("sumOf", () => {
  it("sums a numeric selector", () => {
    expect(sumOf(["a", "bb", "ccc"], (s) => s.length)).toBe(6);
  });

  it("returns 0 for empty collection", () => {
    expect(sumOf([], (x: number) => x)).toBe(0);
  });
});

describe("any / all / none", () => {
  it("any returns true if at least one element matches", () => {
    expect(any([1, 2, 3], (x) => x > 2)).toBe(true);
    expect(any([1, 2, 3], (x) => x > 10)).toBe(false);
  });

  it("all returns true if every element matches", () => {
    expect(all([2, 4, 6], (x) => x % 2 === 0)).toBe(true);
    expect(all([2, 3, 6], (x) => x % 2 === 0)).toBe(false);
  });

  it("none returns true if no element matches", () => {
    expect(none([1, 2, 3], (x) => x > 10)).toBe(true);
    expect(none([1, 2, 3], (x) => x > 2)).toBe(false);
  });
});

describe("count", () => {
  it("counts elements matching a predicate", () => {
    expect(count([1, 2, 3, 4, 5], (x) => x % 2 === 0)).toBe(2);
  });

  it("counts all elements without a predicate", () => {
    expect(count([1, 2, 3])).toBe(3);
  });
});

describe("minOf / maxOf / minOrNull / maxOrNull", () => {
  it("minOf returns the smallest value by selector", () => {
    expect(minOf(["apple", "fig", "banana"], (s) => s.length)).toBe(3);
  });

  it("maxOf returns the largest value by selector", () => {
    expect(maxOf(["apple", "fig", "banana"], (s) => s.length)).toBe(6);
  });

  it("minOrNull returns null for empty collection", () => {
    expect(minOrNull([], (x: number) => x)).toBeNull();
  });

  it("maxOrNull returns null for empty collection", () => {
    expect(maxOrNull([], (x: number) => x)).toBeNull();
  });
});

describe("joinToString", () => {
  it("joins with default separator", () => {
    expect(joinToString([1, 2, 3])).toBe("1, 2, 3");
  });

  it("joins with custom separator", () => {
    expect(joinToString([1, 2, 3], " | ")).toBe("1 | 2 | 3");
  });

  it("applies prefix and suffix", () => {
    expect(joinToString([1, 2, 3], ", ", "[", "]")).toBe("[1, 2, 3]");
  });

  it("applies transform function", () => {
    expect(joinToString([1, 2, 3], ", ", "", "", undefined, String)).toBe("1, 2, 3");
  });
});

// ---------------------------------------------------------------------------
// Element access
// ---------------------------------------------------------------------------

describe("first / last", () => {
  it("first returns first element", () => {
    expect(first([10, 20, 30])).toBe(10);
  });

  it("first throws NoSuchElementException on empty", () => {
    expect(() => first([])).toThrow(NoSuchElementException);
  });

  it("last returns last element", () => {
    expect(last([10, 20, 30])).toBe(30);
  });

  it("last throws NoSuchElementException on empty", () => {
    expect(() => last([])).toThrow(NoSuchElementException);
  });
});

describe("firstOrNull / lastOrNull", () => {
  it("returns null for empty collections", () => {
    expect(firstOrNull([])).toBeNull();
    expect(lastOrNull([])).toBeNull();
  });

  it("firstOrNull with predicate", () => {
    expect(firstOrNull([1, 2, 3], (x) => x > 1)).toBe(2);
    expect(firstOrNull([1, 2, 3], (x) => x > 10)).toBeNull();
  });
});

describe("find / findLast", () => {
  it("find returns first matching element", () => {
    expect(find([1, 2, 3, 4], (x) => x % 2 === 0)).toBe(2);
    expect(find([1, 3, 5], (x) => x % 2 === 0)).toBeNull();
  });

  it("findLast returns last matching element", () => {
    expect(findLast([1, 2, 3, 4], (x) => x % 2 === 0)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Transformation / slicing
// ---------------------------------------------------------------------------

describe("distinct / distinctBy", () => {
  it("distinct removes duplicates preserving order", () => {
    expect(distinct([1, 2, 1, 3, 2])).toEqual([1, 2, 3]);
  });

  it("distinctBy deduplicates by key", () => {
    expect(distinctBy(["a", "b", "aa", "bb"], (s) => s.length)).toEqual(["a", "aa"]);
  });
});

describe("sortedBy / sortedByDescending / reversed", () => {
  it("sortedBy sorts ascending by selector", () => {
    expect(sortedBy(["banana", "fig", "apple"], (s) => s.length)).toEqual(["fig", "apple", "banana"]);
  });

  it("sortedByDescending sorts descending by selector", () => {
    expect(sortedByDescending([3, 1, 2], (x) => x)).toEqual([3, 2, 1]);
  });

  it("reversed reverses the array", () => {
    expect(reversed([1, 2, 3])).toEqual([3, 2, 1]);
  });
});

describe("take / takeWhile / drop / dropWhile", () => {
  it("take takes first n elements", () => {
    expect(take([1, 2, 3, 4, 5], 3)).toEqual([1, 2, 3]);
  });

  it("take returns entire array if n >= length", () => {
    expect(take([1, 2], 10)).toEqual([1, 2]);
  });

  it("takeWhile takes while condition holds", () => {
    expect(takeWhile([1, 2, 3, 4, 1], (x) => x < 3)).toEqual([1, 2]);
  });

  it("drop skips first n elements", () => {
    expect(drop([1, 2, 3, 4, 5], 2)).toEqual([3, 4, 5]);
  });

  it("dropWhile drops while condition holds", () => {
    expect(dropWhile([1, 2, 3, 4], (x) => x < 3)).toEqual([3, 4]);
  });
});

describe("chunked", () => {
  it("splits into chunks of given size", () => {
    expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("windowed", () => {
  it("produces sliding windows", () => {
    expect(windowed([1, 2, 3, 4], 2)).toEqual([[1, 2], [2, 3], [3, 4]]);
  });

  it("respects custom step", () => {
    expect(windowed([1, 2, 3, 4, 5], 2, 2)).toEqual([[1, 2], [3, 4]]);
  });
});

describe("partition", () => {
  it("splits into matching and non-matching", () => {
    const [evens, odds] = partition([1, 2, 3, 4, 5], (x) => x % 2 === 0);
    expect(evens).toEqual([2, 4]);
    expect(odds).toEqual([1, 3, 5]);
  });
});

describe("withIndex", () => {
  it("pairs each element with its index", () => {
    expect(withIndex(["a", "b", "c"])).toEqual([
      { index: 0, value: "a" },
      { index: 1, value: "b" },
      { index: 2, value: "c" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Builder functions
// ---------------------------------------------------------------------------

describe("buildList / buildSet / buildMap", () => {
  it("buildList populates via add/addAll", () => {
    const list = buildList<number>((b) => { b.add(1); b.add(2); b.add(3); });
    expect(list).toEqual([1, 2, 3]);
  });

  it("buildSet produces a Set", () => {
    const set = buildSet<number>((b) => { b.add(1); b.add(2); b.add(1); });
    expect(set.size).toBe(2);
  });

  it("buildMap populates via put", () => {
    const map_ = buildMap<string, number>((b) => { b.put("a", 1); b.put("b", 2); });
    expect(map_.get("a")).toBe(1);
    expect(map_.get("b")).toBe(2);
  });
});
