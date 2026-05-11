// ─────────────────────────────────────────────────────────────────────────────
// stdlib/regex.ts — Regex — thin, ergonomic wrapper over JS RegExp
// ─────────────────────────────────────────────────────────────────────────────
export class RegexResult {
    value;
    range;
    groupValues;
    constructor(value, range, groupValues) {
        this.value = value;
        this.range = range;
        this.groupValues = groupValues;
    }
}
export class Regex {
    _re;
    constructor(pattern, options = "") {
        // Map Jalvin option names to JS flags
        const flags = options
            .replace("IGNORE_CASE", "i")
            .replace("MULTILINE", "m")
            .replace("DOT_MATCHES_ALL", "s")
            .replace(/[^gimsuy]/g, "");
        this._re = new RegExp(pattern, flags || undefined);
    }
    /** Returns true if the **entire** input matches this regex (anchored). */
    matches(input) {
        const anchored = new RegExp(`^(?:${this._re.source})$`, this._re.flags.replace("g", ""));
        return anchored.test(input);
    }
    /** Returns true if any part of the input matches. */
    containsMatchIn(input) {
        const unanchored = new RegExp(this._re.source, this._re.flags.replace("g", ""));
        return unanchored.test(input);
    }
    find(input, startIndex = 0) {
        const re = new RegExp(this._re.source, "g" + this._re.flags.replace("g", ""));
        re.lastIndex = startIndex;
        const m = re.exec(input);
        if (!m)
            return null;
        return new RegexResult(m[0], { start: m.index, endInclusive: m.index + m[0].length - 1 }, m.slice(1).map((g) => g ?? ""));
    }
    findAll(input, startIndex = 0) {
        const re = new RegExp(this._re.source, "g" + this._re.flags.replace("g", ""));
        re.lastIndex = startIndex;
        const results = [];
        let m;
        while ((m = re.exec(input)) !== null) {
            results.push(new RegexResult(m[0], { start: m.index, endInclusive: m.index + m[0].length - 1 }, m.slice(1).map((g) => g ?? "")));
        }
        return results;
    }
    replace(input, replacement) {
        const re = new RegExp(this._re.source, "g" + this._re.flags.replace("g", ""));
        if (typeof replacement === "string")
            return input.replace(re, replacement);
        return input.replace(re, (match, ...groups) => {
            const index = groups[groups.length - 2];
            const r = new RegexResult(match, { start: index, endInclusive: index + match.length - 1 }, groups.slice(0, -2).map(String));
            return replacement(r);
        });
    }
    replaceFirst(input, replacement) {
        const re = new RegExp(this._re.source, this._re.flags.replace("g", ""));
        return input.replace(re, replacement);
    }
    split(input, limit) {
        const parts = input.split(this._re);
        return limit !== undefined ? parts.slice(0, limit) : parts;
    }
    toPattern() { return this._re.source; }
    toString() { return this._re.toString(); }
}
/** Constructor alias — `JalvinRegex` and `Regex` are identical. */
export { Regex as JalvinRegex };
//# sourceMappingURL=regex.js.map