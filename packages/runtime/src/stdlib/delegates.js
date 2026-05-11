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
export function delegate(impl, _name, _receiver) {
    return impl;
}
export class LazyDelegate {
    _init;
    _value;
    _initialized = false;
    constructor(_init) {
        this._init = _init;
    }
    getValue() {
        if (!this._initialized) {
            this._value = this._init();
            this._initialized = true;
        }
        return this._value;
    }
    setValue(_v) {
        throw new Error("Cannot set a lazy property");
    }
}
export function lazy(init) {
    return new LazyDelegate(init);
}
export class ObservableDelegate {
    _value;
    _onChange;
    _name;
    constructor(_value, _onChange, _name = "") {
        this._value = _value;
        this._onChange = _onChange;
        this._name = _name;
    }
    getValue() { return this._value; }
    setValue(value) {
        const old = this._value;
        this._value = value;
        this._onChange(this._name, old, value);
    }
}
export const Delegates = {
    observable(initial, onChange) {
        return new ObservableDelegate(initial, onChange);
    },
    notNull() {
        let _v;
        return {
            getValue() {
                if (_v === undefined)
                    throw new NullPointerException("Delegated property was not initialised");
                return _v;
            },
            setValue(v) { _v = v; },
        };
    },
};
// ─────────────────────────────────────────────────────────────────────────────
// Scope functions
// ─────────────────────────────────────────────────────────────────────────────
/** `let` — calls `block` with the value as argument, returns the block result. */
export function let_(value, block) {
    return block(value);
}
/** `run` — calls `block` with the value as receiver, returns the block result. */
export function run_(value, block) {
    return block.call(value);
}
/** `apply` — calls `block` with the value as receiver, returns the original value. */
export function apply(value, block) {
    block.call(value);
    return value;
}
/** `also` — calls `block` with the value as argument, returns the original value. */
export function also(value, block) {
    block(value);
    return value;
}
/** `with` — calls `block` with `receiver` as receiver, returns block result. */
export function with_(receiver, block) {
    return block.call(receiver);
}
/** `takeIf` — returns the value if `predicate` is true, otherwise null. */
export function takeIf(value, predicate) {
    return predicate(value) ? value : null;
}
/** `takeUnless` — returns the value if `predicate` is false, otherwise null. */
export function takeUnless(value, predicate) {
    return predicate(value) ? null : value;
}
//# sourceMappingURL=delegates.js.map