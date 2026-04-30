// ─────────────────────────────────────────────────────────────────────────────
// stdlib/timing.ts — Performance measurement utilities
// ─────────────────────────────────────────────────────────────────────────────

export interface TimedValue<T> {
  value:    T;
  /** Elapsed time in milliseconds */
  duration: number;
}

/** Measures how long a synchronous block takes in milliseconds. */
export function measureTimeMillis(fn: () => void): number {
  const start = performance.now();
  fn();
  return Math.round(performance.now() - start);
}

/** Measures how long an async block takes in milliseconds. */
export async function measureTimeMillisAsync(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return Math.round(performance.now() - start);
}

/** Runs a block and returns both its result and the elapsed time. */
export function measureTimedValue<T>(fn: () => T): TimedValue<T> {
  const start = performance.now();
  const value = fn();
  return { value, duration: Math.round(performance.now() - start) };
}
