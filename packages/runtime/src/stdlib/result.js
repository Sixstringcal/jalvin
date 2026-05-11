// ─────────────────────────────────────────────────────────────────────────────
// stdlib/result.ts — Result<T> — wraps a success value or a failure exception
// ─────────────────────────────────────────────────────────────────────────────
export class Result {
    _value;
    _error;
    _ok;
    constructor(_value, _error, _ok) {
        this._value = _value;
        this._error = _error;
        this._ok = _ok;
    }
    static success(value) { return new Result(value, undefined, true); }
    static failure(error) { return new Result(undefined, error, false); }
    get isSuccess() { return this._ok; }
    get isFailure() { return !this._ok; }
    getOrNull() { return this._ok ? this._value : null; }
    getOrUndefined() { return this._ok ? this._value : undefined; }
    getOrThrow() {
        if (this._ok)
            return this._value;
        throw this._error;
    }
    getOrDefault(default_) {
        return this._ok ? this._value : default_;
    }
    getOrElse(fn) {
        return this._ok ? this._value : fn(this._error);
    }
    exceptionOrNull() { return this._ok ? null : this._error; }
    map(fn) {
        if (!this._ok)
            return Result.failure(this._error);
        try {
            return Result.success(fn(this._value));
        }
        catch (e) {
            return Result.failure(e);
        }
    }
    /** Alias for `map` — always wraps the transform in a try/catch. */
    mapCatching(fn) { return this.map(fn); }
    recover(fn) {
        if (this._ok)
            return this;
        try {
            return Result.success(fn(this._error));
        }
        catch (e) {
            return Result.failure(e);
        }
    }
    onSuccess(fn) {
        if (this._ok)
            fn(this._value);
        return this;
    }
    onFailure(fn) {
        if (!this._ok)
            fn(this._error);
        return this;
    }
    fold(onSuccess, onFailure) {
        return this._ok ? onSuccess(this._value) : onFailure(this._error);
    }
    toString() {
        return this._ok
            ? `Result.success(${this._value})`
            : `Result.failure(${this._error})`;
    }
}
/** Wraps a throwing synchronous call in a Result. */
export function runCatching(fn) {
    try {
        return Result.success(fn());
    }
    catch (e) {
        return Result.failure(e);
    }
}
/** Wraps a throwing async call in a Result. */
export async function runCatchingAsync(fn) {
    try {
        return Result.success(await fn());
    }
    catch (e) {
        return Result.failure(e);
    }
}
//# sourceMappingURL=result.js.map