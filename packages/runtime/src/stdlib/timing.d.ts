export interface TimedValue<T> {
    value: T;
    /** Elapsed time in milliseconds */
    duration: number;
}
/** Measures how long a synchronous block takes in milliseconds. */
export declare function measureTimeMillis(fn: () => void): number;
/** Measures how long an async block takes in milliseconds. */
export declare function measureTimeMillisAsync(fn: () => Promise<void>): Promise<number>;
/** Runs a block and returns both its result and the elapsed time. */
export declare function measureTimedValue<T>(fn: () => T): TimedValue<T>;
//# sourceMappingURL=timing.d.ts.map