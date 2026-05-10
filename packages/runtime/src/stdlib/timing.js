// ─────────────────────────────────────────────────────────────────────────────
// stdlib/timing.ts — Performance measurement utilities
// ─────────────────────────────────────────────────────────────────────────────
/** Measures how long a synchronous block takes in milliseconds. */
export function measureTimeMillis(fn) {
    const start = performance.now();
    fn();
    return Math.round(performance.now() - start);
}
/** Measures how long an async block takes in milliseconds. */
export async function measureTimeMillisAsync(fn) {
    const start = performance.now();
    await fn();
    return Math.round(performance.now() - start);
}
/** Runs a block and returns both its result and the elapsed time. */
export function measureTimedValue(fn) {
    const start = performance.now();
    const value = fn();
    return { value, duration: Math.round(performance.now() - start) };
}
//# sourceMappingURL=timing.js.map