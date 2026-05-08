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

// ---------------------------------------------------------------------------
// WindowSizeClass — adaptive layout breakpoints (mirrors Compose WindowSizeClass)
//
// Breakpoints match Material Design 3 / Compose for Mobile:
//   Compact  < 600dp   — phones in portrait
//   Medium   600–839dp — tablets, foldables, large phones landscape
//   Expanded ≥ 840dp   — desktop, large tablets
// ---------------------------------------------------------------------------

export type WindowSizeClass = "Compact" | "Medium" | "Expanded";

/** @internal — exported for testing */
export function widthToSizeClass(widthPx: number): WindowSizeClass {
  if (widthPx < 600) return "Compact";
  if (widthPx < 840) return "Medium";
  return "Expanded";
}

/** @internal — exported for testing */
export function heightToSizeClass(heightPx: number): WindowSizeClass {
  if (heightPx < 480) return "Compact";
  if (heightPx < 900) return "Medium";
  return "Expanded";
}

export interface WindowSizeClassState {
  widthSizeClass: WindowSizeClass;
  heightSizeClass: WindowSizeClass;
}

// ---------------------------------------------------------------------------
// WindowSizeClassProvider — single resize listener for the whole tree
//
// Mount this once at the app root. All calls to calculateWindowSizeClass()
// read from this context, so a single resize event produces exactly one
// coordinated state update regardless of how many components call the hook.
// ---------------------------------------------------------------------------

const DEFAULT_WINDOW_SIZE_CLASS: WindowSizeClassState = {
  widthSizeClass: "Expanded",
  heightSizeClass: "Medium",
};

// Lazily created so the module remains usable in non-React (Node) builds.
let _WindowSizeClassContext: import("react").Context<WindowSizeClassState> | null = null;

function getWindowSizeClassContext(): import("react").Context<WindowSizeClassState> {
  if (!_WindowSizeClassContext) {
    _WindowSizeClassContext = getReact().createContext<WindowSizeClassState>(DEFAULT_WINDOW_SIZE_CLASS);
  }
  return _WindowSizeClassContext;
}

/**
 * Mount once at the app root. Registers a single `resize` listener and
 * distributes the current {@link WindowSizeClassState} to all descendants
 * that call {@link calculateWindowSizeClass}.
 *
 * The vite-plugin entry module wraps the root component in this provider
 * automatically when the `entry` option is used.
 *
 * @example
 * ```jalvin
 * // main entry
 * root.render(
 *   WindowSizeClassProvider { MyApp() }
 * )
 * ```
 */
export function WindowSizeClassProvider(
  { children }: { children?: import("react").ReactNode },
): import("react").ReactElement {
  const R = getReact();

  const getState = (): WindowSizeClassState => ({
    widthSizeClass:  widthToSizeClass(typeof window !== "undefined" ? window.innerWidth  : 1280),
    heightSizeClass: heightToSizeClass(typeof window !== "undefined" ? window.innerHeight : 800),
  });

  const [state, setState] = R.useState<WindowSizeClassState>(getState);

  R.useEffect(() => {
    const onResize = () => {
      const next = getState();
      setState(prev =>
        prev.widthSizeClass === next.widthSizeClass &&
        prev.heightSizeClass === next.heightSizeClass
          ? prev
          : next
      );
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ctx = getWindowSizeClassContext();
  return R.createElement(ctx.Provider, { value: state }, children);
}

/**
 * Returns the current {@link WindowSizeClassState}. Re-renders only when the
 * window crosses a breakpoint boundary.
 *
 * Requires {@link WindowSizeClassProvider} to be mounted somewhere above this
 * component in the tree (the vite-plugin does this automatically). If no
 * provider is found the hook falls back to "Expanded/Medium" and logs a
 * warning in development.
 *
 * Mirrors `calculateWindowSizeClass()` from Compose Material3 Adaptive.
 *
 * @example
 * ```jalvin
 * component fun AdaptiveLayout() {
 *   val windowSize = calculateWindowSizeClass()
 *   if (windowSize.widthSizeClass == "Compact") {
 *     MobileLayout()
 *   } else {
 *     DesktopLayout()
 *   }
 * }
 * ```
 */
export function calculateWindowSizeClass(): WindowSizeClassState {
  const R = getReact();
  return R.useContext(getWindowSizeClassContext());
}
