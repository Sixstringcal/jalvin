// ─────────────────────────────────────────────────────────────────────────────
// stdlib/regex.ts — Regex — thin, ergonomic wrapper over JS RegExp
// ─────────────────────────────────────────────────────────────────────────────

export class RegexResult {
  constructor(
    readonly value:       string,
    readonly range:       { start: number; endInclusive: number },
    readonly groupValues: ReadonlyArray<string>
  ) { }
}

export class Regex {
  private readonly _re: RegExp;

  constructor(pattern: string, options = "") {
    // Map Jalvin option names to JS flags
    const flags = options
      .replace("IGNORE_CASE",      "i")
      .replace("MULTILINE",        "m")
      .replace("DOT_MATCHES_ALL",  "s")
      .replace(/[^gimsuy]/g, "");
    this._re = new RegExp(pattern, flags || undefined);
  }

  /** Returns true if the **entire** input matches this regex (anchored). */
  matches(input: string): boolean {
    const anchored = new RegExp(`^(?:${this._re.source})$`, this._re.flags.replace("g", ""));
    return anchored.test(input);
  }

  /** Returns true if any part of the input matches. */
  containsMatchIn(input: string): boolean {
    const unanchored = new RegExp(this._re.source, this._re.flags.replace("g", ""));
    return unanchored.test(input);
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
      const r = new RegexResult(
        match,
        { start: index, endInclusive: index + match.length - 1 },
        groups.slice(0, -2).map(String)
      );
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
  toString():  string { return this._re.toString(); }
}

/** Constructor alias — `JalvinRegex` and `Regex` are identical. */
export { Regex as JalvinRegex };
