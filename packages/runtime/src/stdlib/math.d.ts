export declare const abs: (x: number) => number;
export declare const ceil: (x: number) => number;
export declare const floor: (x: number) => number;
export declare const round: (x: number) => number;
export declare const sqrt: (x: number) => number;
export declare const pow: (x: number, y: number) => number;
export declare const exp: (x: number) => number;
export declare const ln: (x: number) => number;
export declare const log2: (x: number) => number;
export declare const log10: (x: number) => number;
export declare const sin: (x: number) => number;
export declare const cos: (x: number) => number;
export declare const tan: (x: number) => number;
export declare const asin: (x: number) => number;
export declare const acos: (x: number) => number;
export declare const atan: (x: number) => number;
export declare const atan2: (y: number, x: number) => number;
export declare const sign: (x: number) => number;
export declare const hypot: (...values: number[]) => number;
export declare const truncate: (x: number) => number;
export declare const PI: number;
export declare const E: number;
/** Clamps a value so it falls within [min, max]. */
export declare function clamp(value: number, min: number, max: number): number;
/** Integer division rounding towards zero. */
export declare function truncDiv(a: number, b: number): number;
export declare function coerceAtLeast(value: number, min: number): number;
export declare function coerceAtMost(value: number, max: number): number;
export declare function coerceIn(value: number, min: number, max: number): number;
export declare const Int: {
    readonly MAX_VALUE: 2147483647;
    readonly MIN_VALUE: -2147483648;
};
export declare const Long: {
    readonly MAX_VALUE: bigint;
    readonly MIN_VALUE: bigint;
};
//# sourceMappingURL=math.d.ts.map