export declare class RegexResult {
    readonly value: string;
    readonly range: {
        start: number;
        endInclusive: number;
    };
    readonly groupValues: ReadonlyArray<string>;
    constructor(value: string, range: {
        start: number;
        endInclusive: number;
    }, groupValues: ReadonlyArray<string>);
}
export declare class Regex {
    private readonly _re;
    constructor(pattern: string, options?: string);
    /** Returns true if the **entire** input matches this regex (anchored). */
    matches(input: string): boolean;
    /** Returns true if any part of the input matches. */
    containsMatchIn(input: string): boolean;
    find(input: string, startIndex?: number): RegexResult | null;
    findAll(input: string, startIndex?: number): RegexResult[];
    replace(input: string, replacement: string | ((result: RegexResult) => string)): string;
    replaceFirst(input: string, replacement: string): string;
    split(input: string, limit?: number): string[];
    toPattern(): string;
    toString(): string;
}
/** Constructor alias — `JalvinRegex` and `Regex` are identical. */
export { Regex as JalvinRegex };
//# sourceMappingURL=regex.d.ts.map