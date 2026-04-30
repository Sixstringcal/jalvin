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

// Utilities / stdlib — each module is a single-purpose file under stdlib/
// See packages/runtime/src/stdlib/index.ts for the full module map.
export {
  println, print,
} from "./stdlib/io.js";
export {
  notNull, NullPointerException, safeCast,
  checkNotNull, requireNotNull, requireCondition, check, error,
  IllegalArgumentException, IllegalStateException,
  UnsupportedOperationException, IndexOutOfBoundsException, NoSuchElementException,
} from "./stdlib/types.js";
export {
  delegate, lazy, Delegates, LazyDelegate, ObservableDelegate,
  let_, run_, apply, also, with_, takeIf, takeUnless,
} from "./stdlib/delegates.js";
export type { PropertyDelegate } from "./stdlib/delegates.js";
export {
  listOf, mutableListOf, setOf, mutableSetOf, mapOf, mutableMapOf,
  pairOf, tripleOf,
  map, filter, filterNotNull, forEach, fold, reduce,
  sumOf, any, all, none, count,
  first, firstOrNull, last, lastOrNull, find, findLast,
  flatMap, flatten, groupBy, associate, zip,
  distinct, distinctBy, sortedBy, sortedByDescending, reversed,
  take, takeWhile, drop, dropWhile,
  chunked, windowed, partition, withIndex,
  minOf, maxOf, minOrNull, maxOrNull, joinToString,
  buildList, buildSet, buildMap,
} from "./stdlib/collections.js";
export {
  isBlank, isNotBlank, isNullOrBlank,
  toIntOrNull, toDoubleOrNull, toBooleanOrNull,
  padStart, padEnd, repeat_ as repeatString,
  capitalize, decapitalize,
  substringBefore, substringAfter, substringBeforeLast, substringAfterLast,
  removePrefix, removeSuffix, lines, lineSequence,
  ifEmpty, ifBlank, trimIndent,
  StringBuilder, buildString,
} from "./stdlib/strings.js";
export {
  abs, ceil, floor, round, sqrt, pow, exp, ln, log2, log10,
  sin, cos, tan, asin, acos, atan, atan2,
  sign, hypot, truncate, clamp, truncDiv, PI, E,
  coerceAtLeast, coerceAtMost, coerceIn, Int, Long,
} from "./stdlib/math.js";
export {
  toInt, toLong, toFloat, toDouble, toChar, charCodeOf, toString,
  Pair, Triple, range, IntRange, downTo, step,
} from "./stdlib/conversions.js";
export {
  Result, runCatching, runCatchingAsync,
} from "./stdlib/result.js";
export {
  Regex, RegexResult,
} from "./stdlib/regex.js";
export {
  Random, Default as DefaultRandom, randomUUID,
} from "./stdlib/random.js";
export {
  measureTimeMillis, measureTimeMillisAsync, measureTimedValue,
} from "./stdlib/timing.js";
export type { TimedValue } from "./stdlib/timing.js";
export {
  jalvinEquals,
} from "./stdlib/equality.js";
