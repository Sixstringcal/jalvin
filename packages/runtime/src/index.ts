// @jalvin/runtime — public API

// HTTP client
export { Bibi, BibiRequestBuilder, BibiError } from "./bibi.js";
export type { BibiMethod, BibiRequestOptions, BibiResponse, BibiInterceptor } from "./bibi.js";

// Coroutines
export {
  Job, JobCancellationException,
  Deferred,
  CoroutineScope,
  launch, async_ as async,
  delay, withContext, repeat, runBlocking,
  yield_,
  withTimeout, withTimeoutOrNull, TimeoutCancellationException,
  Channel, ChannelClosedException,
  Flow, flow, flowOf, asFlow,
  coroutineScope, supervisorScope,
} from "./coroutines.js";
export type { Dispatcher, FlowCollector } from "./coroutines.js";

// StateFlow / ViewModel
export {
  MutableStateFlow,
  mapFlow, filterFlow, debounceFlow,
  ViewModel, viewModel, clearViewModel, clearAllViewModels,
} from "./stateflow.js";
export type { StateFlow, Subscriber, Unsubscribe } from "./stateflow.js";

// UI hooks (React)
export {
  mutableStateOf, remember, rememberMutableStateOf,
  collectAsState, useViewModel,
  LaunchedEffect, DisposableEffect, SideEffect,
} from "./ui.js";
export type { MutableState } from "./ui.js";

// Utilities / stdlib shims
export {
  notNull, NullPointerException,
  safeCast,
  range,
  delegate, lazy, Delegates,
  LazyDelegate, ObservableDelegate,
  println, print,
  listOf, mutableListOf, setOf, mutableSetOf, mapOf, mutableMapOf,
  pairOf, tripleOf,
  checkNotNull, requireNotNull, requireCondition, check, error,
  IllegalArgumentException, IllegalStateException,
  UnsupportedOperationException, IndexOutOfBoundsException, NoSuchElementException,
  // Scope functions
  let_, run_, apply, also, with_, takeIf, takeUnless,
  // Collection operators
  map, filter, filterNotNull, forEach, fold, reduce,
  sumOf, any, all, none, count,
  first, firstOrNull, last, lastOrNull, find, findLast,
  flatMap, flatten, groupBy, associate, zip,
  distinct, distinctBy,
  sortedBy, sortedByDescending, reversed,
  chunked, windowed, partition, withIndex,
  minOf, maxOf, minOrNull, maxOrNull, joinToString,
  take, takeWhile, drop, dropWhile,
  // Numeric helpers
  coerceAtLeast, coerceAtMost, coerceIn, Int, Long,
  // String helpers
  trimIndent, repeat_ as repeatString, isBlank, isNotBlank, isNullOrBlank,
  toIntOrNull, toDoubleOrNull, toBooleanOrNull, padStart, padEnd,
  // Extended string utilities
  capitalize, decapitalize,
  substringBefore, substringAfter, substringBeforeLast, substringAfterLast,
  removePrefix, removeSuffix, lines, lineSequence,
  ifEmpty, ifBlank,
  // Type conversions
  toInt, toLong, toFloat, toDouble, toChar, charCodeOf, toString,
  // Math functions
  abs, ceil, floor, round, sqrt, pow, exp, ln, log2, log10,
  sin, cos, tan, asin, acos, atan, atan2,
  sign, hypot, truncate, clamp, truncDiv, PI, E,
  // IntRange + range operators
  IntRange, downTo, step,
  // Collection builders
  StringBuilder, buildString, buildList, buildSet, buildMap,
  // Result<T>
  Result, runCatching, runCatchingAsync,
  // Regex
  Regex, RegexResult,
  // Timing
  measureTimeMillis, measureTimeMillisAsync, measureTimedValue,
  // Random
  Random, Default as DefaultRandom, randomUUID,
  // Structural equality (backs the == operator)
  jalvinEquals,
  // Pair / Triple as classes
  Pair, Triple,
} from "./utils.js";
export type { PropertyDelegate, TimedValue } from "./utils.js";
