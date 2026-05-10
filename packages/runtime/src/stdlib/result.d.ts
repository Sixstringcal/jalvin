export declare class Result<T> {
    private readonly _value;
    private readonly _error;
    private readonly _ok;
    private constructor();
    static success<T>(value: T): Result<T>;
    static failure<T>(error: unknown): Result<T>;
    get isSuccess(): boolean;
    get isFailure(): boolean;
    getOrNull(): T | null;
    getOrUndefined(): T | undefined;
    getOrThrow(): T;
    getOrDefault(default_: T): T;
    getOrElse(fn: (e: unknown) => T): T;
    exceptionOrNull(): unknown | null;
    map<U>(fn: (value: T) => U): Result<U>;
    /** Alias for `map` — always wraps the transform in a try/catch. */
    mapCatching<U>(fn: (value: T) => U): Result<U>;
    recover(fn: (e: unknown) => T): Result<T>;
    onSuccess(fn: (value: T) => void): this;
    onFailure(fn: (error: unknown) => void): this;
    fold<R>(onSuccess: (value: T) => R, onFailure: (error: unknown) => R): R;
    toString(): string;
}
/** Wraps a throwing synchronous call in a Result. */
export declare function runCatching<T>(fn: () => T): Result<T>;
/** Wraps a throwing async call in a Result. */
export declare function runCatchingAsync<T>(fn: () => Promise<T>): Promise<Result<T>>;
//# sourceMappingURL=result.d.ts.map