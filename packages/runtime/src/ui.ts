// ─────────────────────────────────────────────────────────────────────────────
// Jalvin UI runtime — React hooks for StateFlow, ViewModel, remember, mutableStateOf
//
// These are the companion hooks that make Jalvin's UI primitives
// work inside React components.
//
// `component fun` blocks compiled to React components call these hooks.
// ─────────────────────────────────────────────────────────────────────────────

// React is an optional peer dependency — guard against SSR and non-React targets
type ReactModule = typeof import("react");
let _react: ReactModule | null = null;

function getReact(): ReactModule {
  if (_react) return _react;
  try {
    // Dynamic require keeps this file tree-shakeable in non-React builds
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _react = require("react") as ReactModule;
    return _react;
  } catch {
    throw new Error(
      "[jalvin/runtime] React is required for component functions. " +
      "Install react@>=18 and add it to your peer dependencies."
    );
  }
}

import type { StateFlow, MutableStateFlow } from "./stateflow.js";
import { ViewModel, viewModel as vmLookup, clearViewModel } from "./stateflow.js";

// ---------------------------------------------------------------------------
// mutableStateOf — like React.useState but returns a holder
// ---------------------------------------------------------------------------

export interface MutableState<T> {
  value: T;
}

/**
 * Hoisted `mutableStateOf(initial)` inside a `component fun`.
 * Returns a mutable object whose `.value` setter triggers a re-render.
 *
 * Compiled output:
 *   val count = mutableStateOf(0)
 *   →  const count = mutableStateOf(0);
 *      // count.value to read; count.value = x to update
 */
export function mutableStateOf<T>(initial: T): MutableState<T> {
  const R = getReact();
  const [v, setV] = R.useState<T>(initial);
  // stateRef tracks the latest React state value. Updated on every render so
  // the value getter always returns the current value, not the initial one.
  const stateRef = R.useRef<T>(v);
  const holderRef = R.useRef<MutableState<T> | null>(null);

  stateRef.current = v;

  if (holderRef.current === null) {
    const holder = {} as MutableState<T>;
    Object.defineProperties(holder, {
      value: {
        get() { return stateRef.current; },
        set(next: T) {
          if (!Object.is(stateRef.current, next)) setV(next);
        },
        enumerable: true,
        configurable: false,
      },
    });
    holderRef.current = holder;
  }

  return holderRef.current;
}

// ---------------------------------------------------------------------------
// remember { } — memoised value across recompositions
// ---------------------------------------------------------------------------

/**
 * Compute an expensive value once and remember it.
 *
 *   val scope = remember { CoroutineScope() }
 */
export function remember<T>(compute: () => T, deps: readonly unknown[] = []): T {
  const R = getReact();
  return R.useMemo(compute, deps);
}

/**
 * `remember { mutableStateOf(0) }` — convenience wrapper.
 */
export function rememberMutableStateOf<T>(initial: T): MutableState<T> {
  const R = getReact();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return R.useMemo(() => mutableStateOf(initial), []);
}

// ---------------------------------------------------------------------------
// collectAsState — subscribe to a StateFlow inside a component
// ---------------------------------------------------------------------------

/**
 * Collects a StateFlow into React state. The component re-renders when
 * the flow emits a new value.
 *
 *   val currentName by viewModel.name.collectAsState()
 */
export function collectAsState<T>(flow: StateFlow<T>): T {
  const R = getReact();
  const [value, setValue] = R.useState<T>(flow.value);
  R.useEffect(() => {
    const unsub = flow.collect((v) => setValue(v));
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow]);
  return value;
}

// ---------------------------------------------------------------------------
// useViewModel — get or create a ViewModel scoped to a component subtree
// ---------------------------------------------------------------------------

/**
 * Returns a shared ViewModel instance for the given key.
 *
 *   val vm = useViewModel("CounterVm") { CounterViewModel() }
 */
export function useViewModel<T extends ViewModel>(
  key: string,
  factory: () => T
): T {
  const R = getReact();
  const vm = R.useMemo(() => vmLookup(key, factory), []);
  R.useEffect(() => {
    return () => clearViewModel(key);
  // Only clear when the component truly unmounts from root
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return vm;
}

// ---------------------------------------------------------------------------
// LaunchedEffect — run a suspend block tied to component lifecycle
// ---------------------------------------------------------------------------

/**
 * Runs a suspend block when deps change. Cancels on unmount.
 *
 *   LaunchedEffect(Unit) {
 *       repeat(10) { delay(1_000) }
 *   }
 */
export function LaunchedEffect(
  deps: readonly unknown[],
  fn: () => Promise<void>
): void {
  const R = getReact();
  R.useEffect(() => {
    let cancelled = false;
    const guard = async () => {
      if (!cancelled) await fn();
    };
    guard();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ---------------------------------------------------------------------------
// DisposableEffect — run setup/teardown on deps change
// ---------------------------------------------------------------------------

export function DisposableEffect(
  deps: readonly unknown[],
  fn: () => (() => void)
): void {
  const R = getReact();
  R.useEffect(() => {
    const cleanup = fn();
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ---------------------------------------------------------------------------
// SideEffect — run a non-suspending effect every recomposition
// ---------------------------------------------------------------------------

export function SideEffect(fn: () => void): void {
  const R = getReact();
  R.useEffect(fn);
}
