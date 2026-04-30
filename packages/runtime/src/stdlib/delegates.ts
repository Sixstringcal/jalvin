// ─────────────────────────────────────────────────────────────────────────────
// stdlib/delegates.ts — Property delegates and scope functions
//
// Delegates back Jalvin's `by` keyword:
//   val x by lazy { expensiveComputation() }
//   var y by Delegates.observable(0) { _, old, new_ -> ... }
//
// Scope functions implement chaining idioms:
//   value.let { transform(it) }
//   obj.apply { configure() }
// ─────────────────────────────────────────────────────────────────────────────

import { NullPointerException } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Property delegate infrastructure
// ─────────────────────────────────────────────────────────────────────────────

export interface PropertyDelegate<T> {
  getValue(): T;
  setValue(value: T): void;
}

export function delegate<T>(
  impl: PropertyDelegate<T>,
  _name: string,
  _receiver: object
): PropertyDelegate<T> {
  return impl;
}

export class LazyDelegate<T> implements PropertyDelegate<T> {
  private _value: T | undefined;
  private _initialized = false;
  constructor(private readonly _init: () => T) { }

  getValue(): T {
    if (!this._initialized) {
      this._value = this._init();
      this._initialized = true;
    }
    return this._value as T;
  }

  setValue(_v: T): void {
    throw new Error("Cannot set a lazy property");
  }
}

export function lazy<T>(init: () => T): LazyDelegate<T> {
  return new LazyDelegate(init);
}

export class ObservableDelegate<T> implements PropertyDelegate<T> {
  constructor(
    private _value: T,
    private readonly _onChange: (property: string, oldValue: T, newValue: T) => void,
    private _name = ""
  ) { }

  getValue(): T { return this._value; }

  setValue(value: T): void {
    const old = this._value;
    this._value = value;
    this._onChange(this._name, old, value);
  }
}

export const Delegates = {
  observable<T>(initial: T, onChange: (prop: string, old: T, new_: T) => void): ObservableDelegate<T> {
    return new ObservableDelegate(initial, onChange);
  },
  notNull<T>(): PropertyDelegate<T> {
    let _v: T | undefined;
    return {
      getValue() {
        if (_v === undefined) throw new NullPointerException("Delegated property was not initialised");
        return _v;
      },
      setValue(v: T) { _v = v; },
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Scope functions
// ─────────────────────────────────────────────────────────────────────────────

/** `let` — calls `block` with the value as argument, returns the block result. */
export function let_<T, R>(value: T, block: (it: T) => R): R {
  return block(value);
}

/** `run` — calls `block` with the value as receiver, returns the block result. */
export function run_<T, R>(value: T, block: (this: T) => R): R {
  return block.call(value);
}

/** `apply` — calls `block` with the value as receiver, returns the original value. */
export function apply<T>(value: T, block: (this: T) => void): T {
  block.call(value);
  return value;
}

/** `also` — calls `block` with the value as argument, returns the original value. */
export function also<T>(value: T, block: (it: T) => void): T {
  block(value);
  return value;
}

/** `with` — calls `block` with `receiver` as receiver, returns block result. */
export function with_<T, R>(receiver: T, block: (this: T) => R): R {
  return block.call(receiver);
}

/** `takeIf` — returns the value if `predicate` is true, otherwise null. */
export function takeIf<T>(value: T, predicate: (it: T) => boolean): T | null {
  return predicate(value) ? value : null;
}

/** `takeUnless` — returns the value if `predicate` is false, otherwise null. */
export function takeUnless<T>(value: T, predicate: (it: T) => boolean): T | null {
  return predicate(value) ? null : value;
}
