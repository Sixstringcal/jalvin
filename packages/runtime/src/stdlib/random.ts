// ─────────────────────────────────────────────────────────────────────────────
// stdlib/random.ts — Random number generation and UUID
// ─────────────────────────────────────────────────────────────────────────────

export class Random {
  /**
   * Generates a random integer.
   *
   * Overloads:
   *   nextInt()              → [0, Int.MAX_VALUE)
   *   nextInt(until)         → [0, until)
   *   nextInt(from, until)   → [from, until)
   */
  nextInt():                      number;
  nextInt(until: number):         number;
  nextInt(from: number, until: number): number;
  nextInt(fromOrUntil?: number, until?: number): number {
    if (fromOrUntil === undefined) return Math.floor(Math.random() * 2147483647);
    if (until === undefined)       return Math.floor(Math.random() * fromOrUntil);
    return fromOrUntil + Math.floor(Math.random() * (until - fromOrUntil));
  }

  nextLong(until?: number): number  { return this.nextInt(until ?? 2147483647); }
  nextDouble():             number  { return Math.random(); }
  nextFloat():              number  { return Math.random(); }
  nextBoolean():            boolean { return Math.random() < 0.5; }

  nextBytes(size: number): Uint8Array {
    const arr = new Uint8Array(size);
    for (let i = 0; i < size; i++) arr[i] = this.nextInt(256);
    return arr;
  }
}

/** The default global Random instance. */
export const Default = new Random();

/** Generates a RFC 4122 v4 UUID string. */
export function randomUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
