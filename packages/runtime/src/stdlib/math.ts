// ─────────────────────────────────────────────────────────────────────────────
// stdlib/math.ts — Math functions, numeric constants, and range helpers
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Math functions (direct bindings to JS Math)
// ─────────────────────────────────────────────────────────────────────────────

export const abs      = Math.abs.bind(Math);
export const ceil     = Math.ceil.bind(Math);
export const floor    = Math.floor.bind(Math);
export const round    = Math.round.bind(Math);
export const sqrt     = Math.sqrt.bind(Math);
export const pow      = Math.pow.bind(Math);
export const exp      = Math.exp.bind(Math);
export const ln       = Math.log.bind(Math);
export const log2     = Math.log2.bind(Math);
export const log10    = Math.log10.bind(Math);
export const sin      = Math.sin.bind(Math);
export const cos      = Math.cos.bind(Math);
export const tan      = Math.tan.bind(Math);
export const asin     = Math.asin.bind(Math);
export const acos     = Math.acos.bind(Math);
export const atan     = Math.atan.bind(Math);
export const atan2    = Math.atan2.bind(Math);
export const sign     = Math.sign.bind(Math);
export const hypot    = Math.hypot.bind(Math);
export const truncate = Math.trunc.bind(Math);

export const PI = Math.PI;
export const E  = Math.E;

/** Clamps a value so it falls within [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Integer division rounding towards zero. */
export function truncDiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

// ─────────────────────────────────────────────────────────────────────────────
// Numeric range clamping
// ─────────────────────────────────────────────────────────────────────────────

export function coerceAtLeast(value: number, min: number): number {
  return value < min ? min : value;
}

export function coerceAtMost(value: number, max: number): number {
  return value > max ? max : value;
}

export function coerceIn(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Integer / Long boundary constants
// ─────────────────────────────────────────────────────────────────────────────

export const Int = {
  MAX_VALUE:  2147483647,
  MIN_VALUE: -2147483648,
} as const;

export const Long = {
  MAX_VALUE: BigInt("9223372036854775807"),
  MIN_VALUE: BigInt("-9223372036854775808"),
} as const;
