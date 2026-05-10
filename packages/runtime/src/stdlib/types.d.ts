/**
 * `notNull(value)` — emitted for Jalvin's `!!` operator.
 * Throws if value is null/undefined, otherwise returns the value.
 */
export declare function notNull<T>(value: T | null | undefined): T;
export declare class NullPointerException extends Error {
    constructor(message?: string);
}
/**
 * `safeCast<T>(value, Type)` — emitted for Jalvin's `as?` operator.
 * Returns the value if it's an instanceof Type, otherwise returns null.
 */
export declare function safeCast<T>(value: unknown, Type: new (...args: any[]) => T): T | null;
export declare function checkNotNull<T>(value: T | null | undefined, message?: string): T;
export declare function requireNotNull<T>(value: T | null | undefined, message?: string): T;
export declare function requireCondition(condition: boolean, message?: string | (() => string)): void;
export declare function check(condition: boolean, message?: string | (() => string)): void;
export declare function error(message: string): never;
export declare class IllegalArgumentException extends Error {
    constructor(message: string);
}
export declare class IllegalStateException extends Error {
    constructor(message: string);
}
export declare class UnsupportedOperationException extends Error {
    constructor(message?: string);
}
export declare class IndexOutOfBoundsException extends Error {
    constructor(message?: string);
}
export declare class NoSuchElementException extends Error {
    constructor(message?: string);
}
//# sourceMappingURL=types.d.ts.map