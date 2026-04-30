// ─────────────────────────────────────────────────────────────────────────────
// stdlib/index.ts — Re-exports the entire Jalvin standard library
//
// Module map — find any function by its file:
//
//   io.ts          println, print
//   types.ts       notNull, NullPointerException, safeCast, checkNotNull,
//                  requireNotNull, requireCondition, check, error,
//                  IllegalArgumentException, IllegalStateException,
//                  UnsupportedOperationException, IndexOutOfBoundsException,
//                  NoSuchElementException
//   delegates.ts   PropertyDelegate, delegate, LazyDelegate, lazy,
//                  ObservableDelegate, Delegates,
//                  let_, run_, apply, also, with_, takeIf, takeUnless
//   collections.ts listOf, mutableListOf, setOf, mutableSetOf, mapOf,
//                  mutableMapOf, pairOf, tripleOf,
//                  map, filter, filterNotNull, forEach, fold, reduce,
//                  flatMap, flatten, groupBy, associate, zip,
//                  sumOf, any, all, none, count,
//                  minOf, maxOf, minOrNull, maxOrNull, joinToString,
//                  first, firstOrNull, last, lastOrNull, find, findLast,
//                  distinct, distinctBy, sortedBy, sortedByDescending,
//                  reversed, take, takeWhile, drop, dropWhile,
//                  chunked, windowed, partition, withIndex,
//                  buildList, buildSet, buildMap
//   strings.ts     isBlank, isNotBlank, isNullOrBlank,
//                  toIntOrNull, toDoubleOrNull, toBooleanOrNull,
//                  padStart, padEnd, repeat_, capitalize, decapitalize,
//                  substringBefore, substringAfter, substringBeforeLast,
//                  substringAfterLast, removePrefix, removeSuffix,
//                  lines, lineSequence, ifEmpty, ifBlank,
//                  trimIndent, StringBuilder, buildString
//   math.ts        abs, ceil, floor, round, sqrt, pow, exp, ln, log2, log10,
//                  sin, cos, tan, asin, acos, atan, atan2, sign, hypot,
//                  truncate, PI, E, clamp, truncDiv,
//                  coerceAtLeast, coerceAtMost, coerceIn, Int, Long
//   conversions.ts toInt, toLong, toFloat, toDouble, toChar, charCodeOf,
//                  toString, Pair, Triple, range, IntRange, downTo, step
//   result.ts      Result, runCatching, runCatchingAsync
//   regex.ts       Regex, RegexResult, JalvinRegex
//   random.ts      Random, Default, randomUUID
//   timing.ts      measureTimeMillis, measureTimeMillisAsync,
//                  TimedValue, measureTimedValue
//   equality.ts    jalvinEquals
// ─────────────────────────────────────────────────────────────────────────────

export * from "./io.js";
export * from "./types.js";
export * from "./delegates.js";
export * from "./collections.js";
export * from "./strings.js";
export * from "./math.js";
export * from "./conversions.js";
export * from "./result.js";
export * from "./regex.js";
export * from "./random.js";
export * from "./timing.js";
export * from "./equality.js";
