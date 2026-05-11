export declare function isBlank(s: string): boolean;
export declare function isNotBlank(s: string): boolean;
export declare function isNullOrBlank(s: string | null | undefined): boolean;
export declare function toIntOrNull(s: string): number | null;
export declare function toDoubleOrNull(s: string): number | null;
export declare function toBooleanOrNull(s: string): boolean | null;
export declare function padStart(s: string, length: number, padChar?: string): string;
export declare function padEnd(s: string, length: number, padChar?: string): string;
export declare function repeat_(s: string, n: number): string;
export declare function capitalize(s: string): string;
export declare function decapitalize(s: string): string;
export declare function substringBefore(s: string, delimiter: string): string;
export declare function substringAfter(s: string, delimiter: string): string;
export declare function substringBeforeLast(s: string, delimiter: string): string;
export declare function substringAfterLast(s: string, delimiter: string): string;
export declare function removePrefix(s: string, prefix: string): string;
export declare function removeSuffix(s: string, suffix: string): string;
export declare function lines(s: string): string[];
export declare function lineSequence(s: string): string[];
export declare function ifEmpty<T extends string | null | undefined>(value: T, default_: () => T): T;
export declare function ifBlank<T extends string | null | undefined>(value: T, default_: () => T): T;
export declare function trimIndent(s: string): string;
export declare class StringBuilder {
    private readonly _parts;
    append(s: unknown): this;
    appendLine(s?: unknown): this;
    prepend(s: unknown): this;
    clear(): this;
    get length(): number;
    isEmpty(): boolean;
    isNotEmpty(): boolean;
    toString(): string;
}
export declare function buildString(fn: (sb: StringBuilder) => void): string;
//# sourceMappingURL=strings.d.ts.map