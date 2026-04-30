import { describe, it, expect } from "vitest";
import { Regex, RegexResult } from "../stdlib/regex.js";

// ---------------------------------------------------------------------------
// Regex.matches (full-string anchored match)
// ---------------------------------------------------------------------------

describe("Regex.matches", () => {
  it("matches when the entire string matches", () => {
    const re = new Regex("[0-9]+");
    expect(re.matches("12345")).toBe(true);
  });

  it("does not match partial strings", () => {
    const re = new Regex("[0-9]+");
    expect(re.matches("123abc")).toBe(false);
  });

  it("supports IGNORE_CASE option", () => {
    const re = new Regex("hello", "IGNORE_CASE");
    expect(re.matches("HELLO")).toBe(true);
    expect(re.matches("WORLD")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Regex.containsMatchIn (partial match)
// ---------------------------------------------------------------------------

describe("Regex.containsMatchIn", () => {
  it("returns true if any part matches", () => {
    const re = new Regex("[0-9]+");
    expect(re.containsMatchIn("hello 42 world")).toBe(true);
  });

  it("returns false if no part matches", () => {
    const re = new Regex("[0-9]+");
    expect(re.containsMatchIn("no digits here")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Regex.find
// ---------------------------------------------------------------------------

describe("Regex.find", () => {
  it("returns the first match", () => {
    const re = new Regex("[0-9]+");
    const result = re.find("abc 123 def 456");
    expect(result).not.toBeNull();
    expect(result!.value).toBe("123");
    expect(result!.range.start).toBe(4);
  });

  it("returns null when no match", () => {
    expect(new Regex("[0-9]+").find("no digits")).toBeNull();
  });

  it("respects startIndex", () => {
    const re = new Regex("[0-9]+");
    const result = re.find("abc 123 def 456", 8);
    expect(result!.value).toBe("456");
  });

  it("includes capture groups in groupValues", () => {
    const re = new Regex("([a-z]+)([0-9]+)");
    const result = re.find("hello42")!;
    expect(result.groupValues).toEqual(["hello", "42"]);
  });
});

// ---------------------------------------------------------------------------
// Regex.findAll
// ---------------------------------------------------------------------------

describe("Regex.findAll", () => {
  it("returns all non-overlapping matches", () => {
    const re = new Regex("[0-9]+");
    const results = re.findAll("1 and 22 and 333");
    expect(results.map((r) => r.value)).toEqual(["1", "22", "333"]);
  });

  it("returns empty array when no matches", () => {
    expect(new Regex("[0-9]+").findAll("no digits")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Regex.replace / replaceFirst
// ---------------------------------------------------------------------------

describe("Regex.replace", () => {
  it("replaces all occurrences with a string", () => {
    const re = new Regex("[aeiou]");
    expect(re.replace("hello world", "*")).toBe("h*ll* w*rld");
  });

  it("replaces all occurrences using a transform function", () => {
    const re = new Regex("[0-9]+");
    const result = re.replace("a1b22c333", (m) => `(${m.value})`);
    expect(result).toBe("a(1)b(22)c(333)");
  });
});

describe("Regex.replaceFirst", () => {
  it("replaces only the first occurrence", () => {
    const re = new Regex("[0-9]+");
    expect(re.replaceFirst("1 and 2 and 3", "X")).toBe("X and 2 and 3");
  });
});

// ---------------------------------------------------------------------------
// Regex.split
// ---------------------------------------------------------------------------

describe("Regex.split", () => {
  it("splits on the pattern", () => {
    const re = new Regex(",\\s*");
    expect(re.split("a, b, c")).toEqual(["a", "b", "c"]);
  });

  it("respects an optional limit", () => {
    const re = new Regex(",");
    expect(re.split("a,b,c,d", 2)).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// RegexResult shape
// ---------------------------------------------------------------------------

describe("RegexResult", () => {
  it("exposes value, range and groupValues", () => {
    const re = new Regex("(\\w+)");
    const result = re.find("hello")!;
    expect(result).toBeInstanceOf(RegexResult);
    expect(result.value).toBe("hello");
    expect(result.range).toMatchObject({ start: 0 });
    expect(result.groupValues).toEqual(["hello"]);
  });
});
