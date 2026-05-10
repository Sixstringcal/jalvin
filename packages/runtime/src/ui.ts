// ─────────────────────────────────────────────────────────────────────────────
// Jalvin UI runtime — Vanilla DOM reactivity system
// ─────────────────────────────────────────────────────────────────────────────

import type { StateFlow } from "./stateflow.js";
import { ViewModel, viewModel as vmLookup, clearViewModel } from "./stateflow.js";

// -- Reactivity Core --------------------------------------------------------

type Subscriber = () => void;
let activeSubscriber: Subscriber | null = null;
let stateHolderIdCounter = 0;

class StateHolder<T> {
  private _value: T;
  private subscribers = new Set<Subscriber>();
  private readonly id = ++stateHolderIdCounter;

  constructor(initial: T) {
    this._value = initial;
  }

  get value(): T {
    if (activeSubscriber) {
      // console.log(`[State ${this.id}] Subscribing active render loop.`);
      this.subscribers.add(activeSubscriber);
    }
    return this._value;
  }

  set value(next: T) {
    if (!Object.is(this._value, next)) {
      console.log(`[State ${this.id}] Value changing:`, this._value, "->", next, "| Notifying", this.subscribers.size, "subscribers");
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

// -- Hook System ------------------------------------------------------------

let currentHookIndex = 0;
let hookState: any[] = [];

/** Reset the hook pointer (called at the start of every render). */
function resetHooks() {
  currentHookIndex = 0;
}

// -- Public Primitives ------------------------------------------------------

export interface MutableState<T> {
  value: T;
}

/**
 * Returns a reactive state holder.
 */
export function mutableStateOf<T>(initial: T): MutableState<T> {
  return new StateHolder(initial);
}

/**
 * Persists a value across re-renders.
 */
export function remember<T>(compute: () => T, deps: readonly unknown[] = []): T {
  const idx = currentHookIndex++;
  const existing = hookState[idx];

  let depsChanged = !existing || !existing.deps || existing.deps.length !== deps.length;
  if (!depsChanged && existing) {
    for (let i = 0; i < deps.length; i++) {
      if (!Object.is(deps[i], existing.deps[i])) {
        depsChanged = true;
        break;
      }
    }
  }

  if (depsChanged) {
    hookState[idx] = { value: compute(), deps };
  }
  
  return hookState[idx].value;
}

/**
 * Convenience wrapper.
 */
export function rememberMutableStateOf<T>(initial: T): MutableState<T> {
  return remember(() => mutableStateOf(initial));
}

/**
 * Collects a StateFlow into reactive state, persisting the subscription across renders.
 */
export function collectAsState<T>(flow: StateFlow<T>): T {
  const state = remember(() => {
    const s = mutableStateOf(flow.value);
    flow.collect((v) => { s.value = v; });
    return s;
  }, [flow]);
  
  return state.value;
}

/**
 * Runs an effect tied to "component" execution.
 */
export function LaunchedEffect(
  deps: readonly unknown[],
  fn: () => Promise<void>
): void {
  remember(() => {
    fn();
    return true;
  }, deps);
}

export function DisposableEffect(
  deps: readonly unknown[],
  fn: () => (() => void)
): void {
  remember(() => {
    fn();
    return true;
  }, deps);
}

export function SideEffect(fn: () => void): void {
  fn();
}

// -- Window Size ------------------------------------------------------------

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

// -- ViewModels -------------------------------------------------------------

export { viewModel as useViewModel } from "./stateflow.js";

// -- Root Rendering ---------------------------------------------------------

let renderCount = 0;
import { patch } from "./dom.js";
import type { VNode } from "./dom.js";

/**
 * Mounts a Jalvin component to the DOM and sets up the re-render loop.
 */
export function render(rootComponent: () => VNode, container: HTMLElement): void {
  // Store the last rendered VNode on the container
  let oldVNode: VNode | null = (container as any)._jalvin_vnode || null;

  const update = () => {
    renderCount++;
    console.log(`[RENDER] Cycle ${renderCount} starting...`);
    activeSubscriber = update;
    resetHooks();
    
    // Save current active element (focus) and selection
    let activeId = "";
    if (document.activeElement && document.activeElement.id) {
      activeId = document.activeElement.id;
    } else if (document.activeElement && document.activeElement.tagName === "INPUT") {
      activeId = (document.activeElement as HTMLInputElement).name;
    }
    
    const newVNode = rootComponent();
    
    // Patch the DOM instead of recreating it
    patch(container, newVNode, oldVNode);
    oldVNode = newVNode;
    (container as any)._jalvin_vnode = oldVNode;
    
    // Restore focus if possible
    if (activeId) {
      const toFocus = document.getElementById(activeId) || document.querySelector(`input[name="${activeId}"]`);
      if (toFocus) (toFocus as HTMLElement).focus();
    }
    
    activeSubscriber = null;
    console.log(`[RENDER] Cycle ${renderCount} finished.`);
  };

  update();
}
