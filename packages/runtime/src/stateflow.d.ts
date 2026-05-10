export type Subscriber<T> = (value: T) => void;
export type Unsubscribe = () => void;
export interface StateFlow<T> {
    /** Current value (always up-to-date) */
    readonly value: T;
    /** Subscribe to changes. Returns an unsubscribe function. */
    collect(subscriber: Subscriber<T>): Unsubscribe;
    /** Convert to an AsyncIterable for use in for-await loops */
    asFlow(): AsyncIterable<T>;
}
export declare class MutableStateFlow<T> implements StateFlow<T> {
    private _value;
    private readonly _subscribers;
    constructor(initialValue: T);
    get value(): T;
    set value(newValue: T);
    /** Atomically update the value using a transform function */
    update(transform: (current: T) => T): void;
    collect(subscriber: Subscriber<T>): Unsubscribe;
    asFlow(): AsyncIterable<T>;
    private _emit;
    emit(value: T): void;
}
export declare function mapFlow<T, R>(source: StateFlow<T>, transform: (v: T) => R): StateFlow<R>;
export declare function filterFlow<T>(source: StateFlow<T>, predicate: (v: T) => boolean): StateFlow<T | undefined>;
export declare function debounceFlow<T>(source: StateFlow<T>, delayMs: number): StateFlow<T>;
export declare abstract class ViewModel {
    private readonly _onClearCallbacks;
    private _cleared;
    /** Called when this ViewModel is no longer needed. Do not override — use onCleared(). */
    clear(): void;
    /** Override this to release resources when the ViewModel is cleared */
    protected onCleared(): void;
    /** Register a callback to run when this ViewModel is cleared */
    protected addOnClearedCallback(cb: () => void): void;
    /** Convenience: create a MutableStateFlow tied to this ViewModel's lifecycle */
    protected stateOf<T>(initial: T): MutableStateFlow<T>;
}
export declare function viewModel<T extends ViewModel>(key: string, factory: () => T): T;
export declare function clearViewModel(key: string): void;
export declare function clearAllViewModels(): void;
//# sourceMappingURL=stateflow.d.ts.map