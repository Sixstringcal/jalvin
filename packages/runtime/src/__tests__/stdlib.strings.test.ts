import { describe, it, expect } from "vitest";
import {
  isBlank, isNotBlank, isNullOrBlank,
  toIntOrNull, toDoubleOrNull, toBooleanOrNull,
  padStart, padEnd, repeat_,
  capitalize, decapitalize,
  substringBefore, substringAfter,
  substringBeforeLast, substringAfterLast,
  removePrefix, removeSuffix,
  lines,
  ifEmpty, ifBlank, trimIndent,
  StringBuilder, buildString,
} from "../stdlib/strings.js";

// ---------------------------------------------------------------------------
// String predicates
// ---------------------------------------------------------------------------

describe("isBlank / isNotBlank / isNullOrBlank", () => {
  it("isBlank returns true for empty and whitespace-only strings", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank("   ")).toBe(true);
    expect(isBlank("\t\n")).toBe(true);
  });

  it("isBlank returns false for strings with content", () => {
    expect(isBlank("a")).toBe(false);
    expect(isBlank("  a  ")).toBe(false);
  });

  it("isNotBlank is the inverse of isBlank", () => {
    expect(isNotBlank("hello")).toBe(true);
    expect(isNotBlank("   ")).toBe(false);
  });

  it("isNullOrBlank handles null and undefined", () => {
    expect(isNullOrBlank(null)).toBe(true);
    expect(isNullOrBlank(undefined)).toBe(true);
    expect(isNullOrBlank("")).toBe(true);
    expect(isNullOrBlank("x")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Parsing with fallback
// ---------------------------------------------------------------------------

describe("toIntOrNull", () => {
  it("parses valid integers", () => {
    expect(toIntOrNull("42")).toBe(42);
    expect(toIntOrNull("-7")).toBe(-7);
  });

  it("returns null for non-integers", () => {
    expect(toIntOrNull("abc")).toBeNull();
    expect(toIntOrNull("")).toBeNull();
    expect(toIntOrNull("3.14")).toBe(3); // parseInt stops at decimal point
  });
});

describe("toDoubleOrNull", () => {
  it("parses valid doubles", () => {
    expect(toDoubleOrNull("3.14")).toBeCloseTo(3.14);
    expect(toDoubleOrNull("-0.5")).toBeCloseTo(-0.5);
  });

  it("returns null for non-numerics", () => {
    expect(toDoubleOrNull("nope")).toBeNull();
    expect(toDoubleOrNull("")).toBeNull();
  });
});

describe("toBooleanOrNull", () => {
  it("parses case-insensitive true/false", () => {
    expect(toBooleanOrNull("true")).toBe(true);
    expect(toBooleanOrNull("TRUE")).toBe(true);
    expect(toBooleanOrNull("false")).toBe(false);
    expect(toBooleanOrNull("False")).toBe(false);
  });

  it("returns null for unrecognised strings", () => {
    expect(toBooleanOrNull("yes")).toBeNull();
    expect(toBooleanOrNull("1")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Padding and repetition
// ---------------------------------------------------------------------------

describe("padStart / padEnd / repeat_", () => {
  it("padStart pads on the left", () => {
    expect(padStart("5", 3, "0")).toBe("005");
    expect(padStart("abc", 5)).toBe("  abc");
  });

  it("padEnd pads on the right", () => {
    expect(padEnd("hi", 5, "-")).toBe("hi---");
  });

  it("does not truncate strings already at target length", () => {
    expect(padStart("hello", 3)).toBe("hello");
  });

  it("repeat_ repeats a string n times", () => {
    expect(repeat_("ab", 3)).toBe("ababab");
    expect(repeat_("x", 0)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Case helpers
// ---------------------------------------------------------------------------

describe("capitalize / decapitalize", () => {
  it("capitalize uppercases first character", () => {
    expect(capitalize("hello")).toBe("Hello");
    expect(capitalize("HELLO")).toBe("HELLO");
  });

  it("decapitalize lowercases first character", () => {
    expect(decapitalize("Hello")).toBe("hello");
    expect(decapitalize("ABC")).toBe("aBC");
  });

  it("handles empty strings", () => {
    expect(capitalize("")).toBe("");
    expect(decapitalize("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Substring extraction
// ---------------------------------------------------------------------------

describe("substringBefore / substringAfter", () => {
  it("substringBefore returns text before first occurrence", () => {
    expect(substringBefore("foo.bar.baz", ".")).toBe("foo");
  });

  it("substringBefore returns full string when delimiter not found", () => {
    expect(substringBefore("hello", ".")).toBe("hello");
  });

  it("substringAfter returns text after first occurrence", () => {
    expect(substringAfter("foo.bar.baz", ".")).toBe("bar.baz");
  });

  it("substringAfter returns empty string when delimiter not found", () => {
    expect(substringAfter("hello", ".")).toBe("");
  });
});

describe("substringBeforeLast / substringAfterLast", () => {
  it("substringBeforeLast uses last occurrence", () => {
    expect(substringBeforeLast("foo.bar.baz", ".")).toBe("foo.bar");
  });

  it("substringAfterLast uses last occurrence", () => {
    expect(substringAfterLast("foo.bar.baz", ".")).toBe("baz");
  });
});

describe("removePrefix / removeSuffix", () => {
  it("removePrefix strips prefix", () => {
    expect(removePrefix("hello world", "hello ")).toBe("world");
    expect(removePrefix("hello world", "xyz")).toBe("hello world");
  });

  it("removeSuffix strips suffix", () => {
    expect(removeSuffix("hello.ts", ".ts")).toBe("hello");
    expect(removeSuffix("hello.ts", ".js")).toBe("hello.ts");
  });
});

// ---------------------------------------------------------------------------
// lines
// ---------------------------------------------------------------------------

describe("lines", () => {
  it("splits on newlines", () => {
    expect(lines("a\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("handles empty string", () => {
    expect(lines("")).toEqual([""]);
  });
});

// ---------------------------------------------------------------------------
// ifEmpty / ifBlank
// ---------------------------------------------------------------------------

describe("ifEmpty / ifBlank", () => {
  it("ifEmpty returns default for empty string", () => {
    expect(ifEmpty("", () => "default")).toBe("default");
    expect(ifEmpty("hi", () => "default")).toBe("hi");
  });

  it("ifBlank returns default for blank string", () => {
    expect(ifBlank("   ", () => "default")).toBe("default");
    expect(ifBlank("hi", () => "default")).toBe("hi");
  });
});

// ---------------------------------------------------------------------------
// trimIndent
// ---------------------------------------------------------------------------

describe("trimIndent", () => {
  it("removes common leading whitespace", () => {
    const result = trimIndent("    line1\n    line2\n    line3");
    expect(result).toBe("line1\nline2\nline3");
  });

  it("preserves relative indentation", () => {
    const result = trimIndent("  a\n    b\n  c");
    expect(result).toBe("a\n  b\nc");
  });

  it("ignores blank lines when computing base indent", () => {
    const result = trimIndent("  hello\n\n  world");
    expect(result).toBe("hello\n\nworld");
  });
});

// ---------------------------------------------------------------------------
// StringBuilder / buildString
// ---------------------------------------------------------------------------

describe("StringBuilder", () => {
  it("append builds up the string", () => {
    const sb = new StringBuilder();
    sb.append("Hello").append(", ").append("World");
    expect(sb.toString()).toBe("Hello, World");
  });

  it("appendLine adds a newline", () => {
    const sb = new StringBuilder();
    sb.appendLine("foo").appendLine("bar");
    expect(sb.toString()).toBe("foo\nbar\n");
  });

  it("clear resets the buffer", () => {
    const sb = new StringBuilder();
    sb.append("filled");
    sb.clear();
    expect(sb.toString()).toBe("");
    expect(sb.length).toBe(0);
  });

  it("tracks length correctly", () => {
    const sb = new StringBuilder();
    sb.append("ab");
    expect(sb.length).toBe(2);
    sb.append("cd");
    expect(sb.length).toBe(4);
  });
});

describe("buildString", () => {
  it("builds a string using the builder", () => {
    const result = buildString((sb) => {
      sb.append("one").append(", ").append("two");
    });
    expect(result).toBe("one, two");
  });
});
