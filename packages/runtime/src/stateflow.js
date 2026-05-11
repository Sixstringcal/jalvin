// ─────────────────────────────────────────────────────────────────────────────
// StateFlow / MutableStateFlow / ViewModel
//
// Implemented as reactive observable containers backed by a subscriber set.
// ─────────────────────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------
// MutableStateFlow<T> — read-write reactive state holder
// ---------------------------------------------------------------------------
export class MutableStateFlow {
    _value;
    _subscribers = new Set();
    constructor(initialValue) {
        this._value = initialValue;
    }
    get value() {
        return this._value;
    }
    set value(newValue) {
        if (Object.is(this._value, newValue))
            return; // structural equality shortcut
        this._value = newValue;
        this._emit(newValue);
    }
    /** Atomically update the value using a transform function */
    update(transform) {
        this.value = transform(this._value);
    }
    collect(subscriber) {
        this._subscribers.add(subscriber);
        subscriber(this._value); // immediate delivery of current value
        return () => this._subscribers.delete(subscriber);
    }
    asFlow() {
        const self = this;
        return {
            [Symbol.asyncIterator]() {
                let resolve = null;
                const queue = [self._value];
                let done = false;
                const unsub = self.collect((v) => {
                    if (done)
                        return;
                    if (resolve) {
                        const r = resolve;
                        resolve = null;
                        r({ value: v, done: false });
                    }
                    else {
                        queue.push(v);
                    }
                });
                return {
                    next() {
                        if (queue.length > 0) {
                            return Promise.resolve({ value: queue.shift(), done: false });
                        }
                        if (done) {
                            return Promise.resolve({ value: undefined, done: true });
                        }
                        return new Promise((res) => { resolve = res; });
                    },
                    return() {
                        done = true;
                        unsub();
                        return Promise.resolve({ value: undefined, done: true });
                    },
                };
            },
        };
    }
    _emit(value) {
        for (const sub of this._subscribers) {
            try {
                sub(value);
            }
            catch { /* subscriber errors must not break others */ }
        }
    }
    // Useful alias for `emit(value)` inside coroutines
    emit(value) {
        this.value = value;
    }
}
// ---------------------------------------------------------------------------
// Flow operators — map, filter, take, debounce
// ---------------------------------------------------------------------------
export function mapFlow(source, transform) {
    const derived = new MutableStateFlow(transform(source.value));
    source.collect((v) => { derived.value = transform(v); });
    return derived;
}
export function filterFlow(source, predicate) {
    const initial = predicate(source.value) ? source.value : undefined;
    const derived = new MutableStateFlow(initial);
    source.collect((v) => { if (predicate(v))
        derived.value = v; });
    return derived;
}
export function debounceFlow(source, delayMs) {
    const derived = new MutableStateFlow(source.value);
    let timer = null;
    source.collect((v) => {
        if (timer)
            clearTimeout(timer);
        timer = setTimeout(() => { derived.value = v; }, delayMs);
    });
    return derived;
}
// ---------------------------------------------------------------------------
// ViewModel base class
// ---------------------------------------------------------------------------
export class ViewModel {
    _onClearCallbacks = [];
    _cleared = false;
    /** Called when this ViewModel is no longer needed. Do not override — use onCleared(). */
    clear() {
        if (this._cleared)
            return;
        this._cleared = true;
        for (const cb of this._onClearCallbacks) {
            try {
                cb();
            }
            catch { /* ignore */ }
        }
        this.onCleared();
    }
    /** Override this to release resources when the ViewModel is cleared */
    onCleared() { }
    /** Register a callback to run when this ViewModel is cleared */
    addOnClearedCallback(cb) {
        this._onClearCallbacks.push(cb);
    }
    /** Convenience: create a MutableStateFlow tied to this ViewModel's lifecycle */
    stateOf(initial) {
        return new MutableStateFlow(initial);
    }
}
// ---------------------------------------------------------------------------
// viewModel() — lookup / create singleton ViewModel by type in a registry
// ---------------------------------------------------------------------------
const _vmRegistry = new Map();
export function viewModel(key, factory) {
    if (!_vmRegistry.has(key)) {
        _vmRegistry.set(key, factory());
    }
    return _vmRegistry.get(key);
}
export function clearViewModel(key) {
    const vm = _vmRegistry.get(key);
    if (vm) {
        vm.clear();
        _vmRegistry.delete(key);
    }
}
export function clearAllViewModels() {
    for (const [key] of _vmRegistry)
        clearViewModel(key);
}
//# sourceMappingURL=stateflow.js.map