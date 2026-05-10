// ─────────────────────────────────────────────────────────────────────────────
// stdlib/equality.ts — Structural equality (backs the Jalvin `==` operator)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Structural equality check:
 *  - null-safe: `null == null` is `true`, `null == anything` is `false`
 *  - delegates to `.equals(other)` if the left operand exposes it
 *  - array-aware: recursively compares element-by-element
 *  - falls back to `===` for primitives and everything else
 */
export function jalvinEquals(a, b) {
    if (a === b)
        return true;
    if (a === null || a === undefined || b === null || b === undefined)
        return false;
    if (typeof a === "object" && typeof a["equals"] === "function") {
        return a.equals(b);
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length)
            return false;
        return a.every((v, i) => jalvinEquals(v, b[i]));
    }
    return false;
}
//# sourceMappingURL=equality.js.map