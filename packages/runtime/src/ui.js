// ─────────────────────────────────────────────────────────────────────────────
// Jalvin UI runtime — Vanilla DOM reactivity system
// ─────────────────────────────────────────────────────────────────────────────
let activeSubscriber = null;
class StateHolder {
    _value;
    subscribers = new Set();
    constructor(initial) {
        this._value = initial;
    }
    get value() {
        if (activeSubscriber) {
            this.subscribers.add(activeSubscriber);
        }
        return this._value;
    }
    set value(next) {
        if (!Object.is(this._value, next)) {
            this._value = next;
            this.notify();
        }
    }
    notify() {
        for (const sub of this.subscribers) {
            sub();
        }
    }
}
/**
 * Returns a reactive state holder.
 */
export function mutableStateOf(initial) {
    return new StateHolder(initial);
}
/**
 * Compute an expensive value. In vanilla mode, this is currently just a pass-through
 * unless we implement a more complex component lifecycle.
 */
export function remember(compute, _deps = []) {
    return compute();
}
/**
 * Convenience wrapper.
 */
export function rememberMutableStateOf(initial) {
    return mutableStateOf(initial);
}
/**
 * Collects a StateFlow into reactive state.
 */
export function collectAsState(flow) {
    const state = mutableStateOf(flow.value);
    // In a real vanilla framework, we'd need to manage this subscription lifecycle.
    // For now, we subscribe globally.
    flow.collect((v) => { state.value = v; });
    return state.value;
}
/**
 * Runs an effect tied to "component" execution.
 */
export function LaunchedEffect(_deps, fn) {
    // Simple fire-and-forget for now
    fn();
}
export function DisposableEffect(_deps, fn) {
    fn();
}
export function SideEffect(fn) {
    fn();
}
export function widthToSizeClass(widthPx) {
    if (widthPx < 600)
        return "Compact";
    if (widthPx < 840)
        return "Medium";
    return "Expanded";
}
export function heightToSizeClass(heightPx) {
    if (heightPx < 480)
        return "Compact";
    if (heightPx < 900)
        return "Medium";
    return "Expanded";
}
const windowSizeState = new StateHolder({
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
export function calculateWindowSizeClass() {
    return windowSizeState.value;
}
// WindowSizeClassProvider is a no-op in vanilla mode as we use global state
export function WindowSizeClassProvider({ children }) {
    return children;
}
// -- Root Rendering ---------------------------------------------------------
/**
 * Mounts a Jalvin component to the DOM and sets up the re-render loop.
 */
export function render(rootComponent, container) {
    const update = () => {
        activeSubscriber = update;
        container.innerHTML = "";
        const el = rootComponent();
        if (el)
            container.appendChild(el);
        activeSubscriber = null;
    };
    update();
}
//# sourceMappingURL=ui.js.map