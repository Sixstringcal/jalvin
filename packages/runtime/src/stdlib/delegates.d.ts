export interface PropertyDelegate<T> {
    getValue(): T;
    setValue(value: T): void;
}
export declare function delegate<T>(impl: PropertyDelegate<T>, _name: string, _receiver: object): PropertyDelegate<T>;
export declare class LazyDelegate<T> implements PropertyDelegate<T> {
    private readonly _init;
    private _value;
    private _initialized;
    constructor(_init: () => T);
    getValue(): T;
    setValue(_v: T): void;
}
export declare function lazy<T>(init: () => T): LazyDelegate<T>;
export declare class ObservableDelegate<T> implements PropertyDelegate<T> {
    private _value;
    private readonly _onChange;
    private _name;
    constructor(_value: T, _onChange: (property: string, oldValue: T, newValue: T) => void, _name?: string);
    getValue(): T;
    setValue(value: T): void;
}
export declare const Delegates: {
    observable<T>(initial: T, onChange: (prop: string, old: T, new_: T) => void): ObservableDelegate<T>;
    notNull<T>(): PropertyDelegate<T>;
};
/** `let` — calls `block` with the value as argument, returns the block result. */
export declare function let_<T, R>(value: T, block: (it: T) => R): R;
/** `run` — calls `block` with the value as receiver, returns the block result. */
export declare function run_<T, R>(value: T, block: (this: T) => R): R;
/** `apply` — calls `block` with the value as receiver, returns the original value. */
export declare function apply<T>(value: T, block: (this: T) => void): T;
/** `also` — calls `block` with the value as argument, returns the original value. */
export declare function also<T>(value: T, block: (it: T) => void): T;
/** `with` — calls `block` with `receiver` as receiver, returns block result. */
export declare function with_<T, R>(receiver: T, block: (this: T) => R): R;
/** `takeIf` — returns the value if `predicate` is true, otherwise null. */
export declare function takeIf<T>(value: T, predicate: (it: T) => boolean): T | null;
/** `takeUnless` — returns the value if `predicate` is false, otherwise null. */
export declare function takeUnless<T>(value: T, predicate: (it: T) => boolean): T | null;
//# sourceMappingURL=delegates.d.ts.map