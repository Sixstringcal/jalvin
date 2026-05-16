// ─────────────────────────────────────────────────────────────────────────────
// Jalvin UI runtime — Vanilla DOM reactivity system
// ─────────────────────────────────────────────────────────────────────────────

import type { StateFlow } from "./stateflow.js";
import { ViewModel, viewModel as vmLookup, clearViewModel } from "./stateflow.js";

// -- Hook slot types -----------------------------------------------------------

type HookSlot =
  | { kind: "memo"; value: any; deps: readonly unknown[] }
  | { kind: "effect"; deps: readonly unknown[]; cleanup: (() => void) | undefined }
  | { kind: "subscription"; flowRef: StateFlow<any>; unsub: () => void; state: MutableState<any> };

// -- Per-render context --------------------------------------------------------
// Each call to render() gets its own RenderContext so multiple independent
// component trees cannot corrupt each other's hook state.

interface RenderContext {
  hookSlots: HookSlot[];
  hookIndex: number;
}

let _currentContext: RenderContext | null = null;

function getCurrentContext(): RenderContext {
  if (!_currentContext) throw new Error("Hook called outside a render context");
  return _currentContext;
}

// -- Reactivity Core ----------------------------------------------------------

type Subscriber = () => void;
let activeSubscriber: Subscriber | null = null;
let stateHolderIdCounter = 0;

class StateHolder<T> {
  private _value: T;
  private subscribers = new Set<Subscriber>();
  readonly id = ++stateHolderIdCounter;

  constructor(initial: T) {
    this._value = initial;
  }

  get value(): T {
    if (activeSubscriber) {
      this.subscribers.add(activeSubscriber);
    }
    return this._value;
  }

  set value(next: T) {
    if (!Object.is(this._value, next)) {
      this._value = next;
      this.notify();
    }
  }

  private notify() {
    for (const sub of Array.from(this.subscribers)) {
      sub();
    }
  }
}

// -- Dep comparison helper ----------------------------------------------------

function depsEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

// -- Public Primitives --------------------------------------------------------

export interface MutableState<T> {
  value: T;
}

export function mutableStateOf<T>(initial: T): MutableState<T> {
  return new StateHolder(initial);
}

/**
 * Persists a value across re-renders.
 * When deps change, the previous cleanup (if any) is called before recomputing.
 */
export function remember<T>(compute: () => T, deps: readonly unknown[] = []): T {
  const ctx = getCurrentContext();
  const idx = ctx.hookIndex++;
  const slot = ctx.hookSlots[idx] as ({ kind: "memo"; value: any; deps: readonly unknown[] } | undefined);

  if (slot?.kind === "memo" && depsEqual(slot.deps, deps)) {
    return slot.value as T;
  }

  const value = compute();
  ctx.hookSlots[idx] = { kind: "memo", value, deps };
  return value;
}

export function rememberMutableStateOf<T>(initial: T): MutableState<T> {
  return remember(() => mutableStateOf(initial));
}

/**
 * Collects a StateFlow into reactive state.
 * The subscription is tracked per-context slot and cleaned up when the flow changes.
 */
export function collectAsState<T>(flow: StateFlow<T>): T {
  const ctx = getCurrentContext();
  const idx = ctx.hookIndex++;
  const existing = ctx.hookSlots[idx] as ({ kind: "subscription"; flowRef: StateFlow<any>; unsub: () => void; state: MutableState<any> } | undefined);

  if (existing?.kind === "subscription" && existing.flowRef === flow) {
    return existing.state.value as T;
  }

  // Flow changed or first render — clean up old subscription, create new one.
  if (existing?.kind === "subscription") {
    existing.unsub();
  }

  const state = mutableStateOf(flow.value);
  const unsub = flow.collect((v) => { state.value = v; });
  ctx.hookSlots[idx] = { kind: "subscription", flowRef: flow, unsub, state };
  return state.value as T;
}

/**
 * Runs an async effect. Re-runs (and cancels the previous run) when deps change.
 * The returned AbortSignal lets long-running effects detect cancellation.
 */
export function LaunchedEffect(
  deps: readonly unknown[],
  fn: (signal: AbortSignal) => Promise<void>
): void {
  const ctx = getCurrentContext();
  const idx = ctx.hookIndex++;
  const existing = ctx.hookSlots[idx] as ({ kind: "effect"; deps: readonly unknown[]; cleanup: (() => void) | undefined } | undefined);

  if (existing?.kind === "effect" && depsEqual(existing.deps, deps)) return;

  // Cancel the previous effect if still running.
  if (existing?.cleanup) existing.cleanup();

  const controller = new AbortController();
  fn(controller.signal).catch((e) => {
    if (e?.name !== "AbortError") console.error("LaunchedEffect error:", e);
  });
  ctx.hookSlots[idx] = {
    kind: "effect",
    deps,
    cleanup: () => controller.abort(),
  };
}

/**
 * Runs a synchronous effect and stores its cleanup. Cleanup is called when
 * deps change or the slot is evicted.
 */
export function DisposableEffect(
  deps: readonly unknown[],
  fn: () => (() => void)
): void {
  const ctx = getCurrentContext();
  const idx = ctx.hookIndex++;
  const existing = ctx.hookSlots[idx] as ({ kind: "effect"; deps: readonly unknown[]; cleanup: (() => void) | undefined } | undefined);

  if (existing?.kind === "effect" && depsEqual(existing.deps, deps)) return;

  // Run the previous cleanup before re-running.
  if (existing?.cleanup) existing.cleanup();

  const cleanup = fn();
  ctx.hookSlots[idx] = { kind: "effect", deps, cleanup };
}

export function SideEffect(fn: () => void): void {
  fn();
}

// -- Window Size --------------------------------------------------------------

export type WindowSizeClass = "Compact" | "Medium" | "Expanded";

export function widthToSizeClass(widthPx: number): WindowSizeClass {
  if (widthPx < 600) return "Compact";
  if (widthPx < 840) return "Medium";
  return "Expanded";
}

export function heightToSizeClass(heightPx: number): WindowSizeClass {
  if (heightPx < 480) return "Compact";
  if (heightPx < 900) return "Medium";
  return "Expanded";
}

export interface WindowSizeClassState {
  widthSizeClass: WindowSizeClass;
  heightSizeClass: WindowSizeClass;
}

const windowSizeState = new StateHolder<WindowSizeClassState>({
  widthSizeClass: widthToSizeClass(typeof window !== "undefined" ? window.innerWidth : 1280),
  heightSizeClass: heightToSizeClass(typeof window !== "undefined" ? window.innerHeight : 800),
});

if (typeof window !== "undefined") {
  window.addEventListener("resize", () => {
    windowSizeState.value = {
      widthSizeClass: widthToSizeClass(window.innerWidth),
      heightSizeClass: heightToSizeClass(window.innerHeight),
    };
  });
}

export function calculateWindowSizeClass(): WindowSizeClassState {
  return windowSizeState.value;
}

export function WindowSizeClassProvider({ children }: { children?: any }): any {
  return children;
}

// -- ViewModels ---------------------------------------------------------------

export { viewModel as useViewModel } from "./stateflow.js";

// -- Root Rendering -----------------------------------------------------------

import { patch } from "./dom.js";
import type { VNode } from "./dom.js";

/**
 * Runs all effect cleanups stored in a context's hook slots.
 * Call before evicting a context (e.g., component unmount).
 */
function cleanupContext(ctx: RenderContext): void {
  for (const slot of ctx.hookSlots) {
    if (!slot) continue;
    if (slot.kind === "effect" && slot.cleanup) slot.cleanup();
    if (slot.kind === "subscription") slot.unsub();
  }
}

/**
 * Mounts a Jalvin component to the DOM and sets up the re-render loop.
 * Each call creates an isolated RenderContext so multiple independent trees
 * cannot corrupt each other's hook state.
 */
export function render(rootComponent: () => VNode, container: HTMLElement): void {
  const ctx: RenderContext = { hookSlots: [], hookIndex: 0 };
  let oldVNode: VNode | null = (container as any)._jalvin_vnode || null;

  const update = () => {
    const prevContext = _currentContext;
    _currentContext = ctx;
    activeSubscriber = update;

    // On first mount, clear any stale slots from a previous render() call on the same container.
    if (oldVNode === null) ctx.hookSlots = [];

    ctx.hookIndex = 0;

    // Save focused element to restore after patch.
    let activeId = "";
    if (document.activeElement && document.activeElement.id) {
      activeId = document.activeElement.id;
    } else if (document.activeElement && document.activeElement.tagName === "INPUT") {
      activeId = (document.activeElement as HTMLInputElement).name;
    }

    let newVNode: VNode;
    try {
      newVNode = rootComponent();
    } catch (e) {
      activeSubscriber = null;
      _currentContext = prevContext;
      throw e;
    }

    // If the root key changed, wipe slots and re-render so the incoming component
    // starts with a clean hook slate (guards against hook-slot collisions between
    // two components that share the same root tag but carry different keys).
    const oldKey = (oldVNode as VNode | null)?.props?.key;
    const newKey = (newVNode as VNode)?.props?.key;
    if (newKey !== undefined && oldKey !== undefined && newKey !== oldKey) {
      cleanupContext(ctx);
      ctx.hookSlots = [];
      ctx.hookIndex = 0;
      try {
        newVNode = rootComponent();
      } catch (e) {
        activeSubscriber = null;
        _currentContext = prevContext;
        throw e;
      }
    }

    activeSubscriber = null;
    _currentContext = prevContext;

    patch(container, newVNode, oldVNode);
    oldVNode = newVNode;
    (container as any)._jalvin_vnode = oldVNode;

    if (activeId) {
      const toFocus = document.getElementById(activeId) || document.querySelector(`input[name="${activeId}"]`);
      if (toFocus) (toFocus as HTMLElement).focus();
    }
  };

  update();
}
