export declare class Random {
    /**
     * Generates a random integer.
     *
     * Overloads:
     *   nextInt()              → [0, Int.MAX_VALUE)
     *   nextInt(until)         → [0, until)
     *   nextInt(from, until)   → [from, until)
     */
    nextInt(): number;
    nextInt(until: number): number;
    nextInt(from: number, until: number): number;
    nextLong(until?: number): number;
    nextDouble(): number;
    nextFloat(): number;
    nextBoolean(): boolean;
    nextBytes(size: number): Uint8Array;
}
/** The default global Random instance. */
export declare const Default: Random;
/** Generates a RFC 4122 v4 UUID string. */
export declare function randomUUID(): string;
//# sourceMappingURL=random.d.ts.map