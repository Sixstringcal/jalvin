/**
 * Structural equality check:
 *  - null-safe: `null == null` is `true`, `null == anything` is `false`
 *  - delegates to `.equals(other)` if the left operand exposes it
 *  - array-aware: recursively compares element-by-element
 *  - falls back to `===` for primitives and everything else
 */
export declare function jalvinEquals(a: unknown, b: unknown): boolean;
//# sourceMappingURL=equality.d.ts.map