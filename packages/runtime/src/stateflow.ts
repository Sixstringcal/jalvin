// ─────────────────────────────────────────────────────────────────────────────
// StateFlow / MutableStateFlow / ViewModel
//
// Implemented as reactive observable containers backed by a subscriber set.
// ─────────────────────────────────────────────────────────────────────────────

export type Subscriber<T> = (value: T) => void;
export type Unsubscribe = () => void;

// ---------------------------------------------------------------------------
// StateFlow<T> — read-only reactive state holder
// ---------------------------------------------------------------------------

export interface StateFlow<T> {
  /** Current value (always up-to-date) */
  readonly value: T;
  /** Subscribe to changes. Returns an unsubscribe function. */
  collect(subscriber: Subscriber<T>): Unsubscribe;
  /** Convert to an AsyncIterable for use in for-await loops */
  asFlow(): AsyncIterable<T>;
}

// ---------------------------------------------------------------------------
// MutableStateFlow<T> — read-write reactive state holder
// ---------------------------------------------------------------------------

export class MutableStateFlow<T> implements StateFlow<T> {
  private _value: T;
  private readonly _subscribers = new Set<Subscriber<T>>();

  constructor(initialValue: T) {
    this._value = initialValue;
  }

  get value(): T {
    return this._value;
  }

  set value(newValue: T) {
    if (Object.is(this._value, newValue)) return; // structural equality shortcut
    this._value = newValue;
    this._emit(newValue);
  }

  /** Atomically update the value using a transform function */
  update(transform: (current: T) => T): void {
    this.value = transform(this._value);
  }

  collect(subscriber: Subscriber<T>): Unsubscribe {
    this._subscribers.add(subscriber);
    subscriber(this._value); // immediate delivery of current value
    return () => this._subscribers.delete(subscriber);
  }

  asFlow(): AsyncIterable<T> {
    const self = this;
    return {
      [Symbol.asyncIterator]() {
        let resolve: ((v: IteratorResult<T>) => void) | null = null;
        const queue: T[] = [self._value];
        let done = false;

        const unsub = self.collect((v) => {
          if (done) return;
          if (resolve) {
            const r = resolve;
            resolve = null;
            r({ value: v, done: false });
          } else {
            queue.push(v);
          }
        });

        return {
          next(): Promise<IteratorResult<T>> {
            if (queue.length > 0) {
              return Promise.resolve({ value: queue.shift()!, done: false });
            }
            if (done) {
              return Promise.resolve({ value: undefined as unknown as T, done: true });
            }
            return new Promise((res) => { resolve = res; });
          },
          return(): Promise<IteratorResult<T>> {
            done = true;
            unsub();
            return Promise.resolve({ value: undefined as unknown as T, done: true });
          },
        };
      },
    };
  }

  private _emit(value: T): void {
    for (const sub of this._subscribers) {
      try { sub(value); } catch { /* subscriber errors must not break others */ }
    }
  }

  // Useful alias for `emit(value)` inside coroutines
  emit(value: T): void {
    this.value = value;
  }
}

// ---------------------------------------------------------------------------
// Flow operators — map, filter, take, debounce
// ---------------------------------------------------------------------------

export function mapFlow<T, R>(source: StateFlow<T>, transform: (v: T) => R): StateFlow<R> {
  const derived = new MutableStateFlow<R>(transform(source.value));
  source.collect((v) => { derived.value = transform(v); });
  return derived;
}

export function filterFlow<T>(source: StateFlow<T>, predicate: (v: T) => boolean): StateFlow<T | undefined> {
  const initial = predicate(source.value) ? source.value : undefined;
  const derived = new MutableStateFlow<T | undefined>(initial);
  source.collect((v) => { if (predicate(v)) derived.value = v; });
  return derived;
}

export function debounceFlow<T>(source: StateFlow<T>, delayMs: number): StateFlow<T> {
  const derived = new MutableStateFlow<T>(source.value);
  let timer: ReturnType<typeof setTimeout> | null = null;
  source.collect((v) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { derived.value = v; }, delayMs);
  });
  return derived;
}

// ---------------------------------------------------------------------------
// ViewModel base class
// ---------------------------------------------------------------------------

export abstract class ViewModel {
  private readonly _onClearCallbacks: Array<() => void> = [];
  private _cleared = false;

  /** Called when this ViewModel is no longer needed. Do not override — use onCleared(). */
  clear(): void {
    if (this._cleared) return;
    this._cleared = true;
    for (const cb of this._onClearCallbacks) {
      try { cb(); } catch { /* ignore */ }
    }
    this.onCleared();
  }

  /** Override this to release resources when the ViewModel is cleared */
  protected onCleared(): void {}

  /** Register a callback to run when this ViewModel is cleared */
  protected addOnClearedCallback(cb: () => void): void {
    this._onClearCallbacks.push(cb);
  }

  /** Convenience: create a MutableStateFlow tied to this ViewModel's lifecycle */
  protected stateOf<T>(initial: T): MutableStateFlow<T> {
    return new MutableStateFlow<T>(initial);
  }
}

// ---------------------------------------------------------------------------
// viewModel() — lookup / create singleton ViewModel by type in a registry
// ---------------------------------------------------------------------------

const _vmRegistry = new Map<string, ViewModel>();

export function viewModel<T extends ViewModel>(
  key: string,
  factory: () => T
): T {
  if (!_vmRegistry.has(key)) {
    _vmRegistry.set(key, factory());
  }
  return _vmRegistry.get(key) as T;
}

export function clearViewModel(key: string): void {
  const vm = _vmRegistry.get(key);
  if (vm) {
    vm.clear();
    _vmRegistry.delete(key);
  }
}

export function clearAllViewModels(): void {
  for (const [key] of _vmRegistry) clearViewModel(key);
}
