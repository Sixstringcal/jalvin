// ─────────────────────────────────────────────────────────────────────────────
// stdlib/result.ts — Result<T> — wraps a success value or a failure exception
// ─────────────────────────────────────────────────────────────────────────────

export class Result<T> {
  private constructor(
    private readonly _value: T | undefined,
    private readonly _error: unknown,
    private readonly _ok:    boolean
  ) { }

  static success<T>(value: T):      Result<T> { return new Result<T>(value, undefined, true); }
  static failure<T>(error: unknown): Result<T> { return new Result<T>(undefined, error, false); }

  get isSuccess(): boolean { return this._ok; }
  get isFailure(): boolean { return !this._ok; }

  getOrNull():      T | null      { return this._ok ? this._value as T : null; }
  getOrUndefined(): T | undefined { return this._ok ? this._value : undefined; }

  getOrThrow(): T {
    if (this._ok) return this._value as T;
    throw this._error;
  }

  getOrDefault(default_: T): T {
    return this._ok ? this._value as T : default_;
  }

  getOrElse(fn: (e: unknown) => T): T {
    return this._ok ? this._value as T : fn(this._error);
  }

  exceptionOrNull(): unknown | null { return this._ok ? null : this._error; }

  map<U>(fn: (value: T) => U): Result<U> {
    if (!this._ok) return Result.failure<U>(this._error);
    try      { return Result.success(fn(this._value as T)); }
    catch (e) { return Result.failure(e); }
  }

  /** Alias for `map` — always wraps the transform in a try/catch. */
  mapCatching<U>(fn: (value: T) => U): Result<U> { return this.map(fn); }

  recover(fn: (e: unknown) => T): Result<T> {
    if (this._ok) return this;
    try      { return Result.success(fn(this._error)); }
    catch (e) { return Result.failure(e); }
  }

  onSuccess(fn: (value: T) => void): this {
    if (this._ok) fn(this._value as T);
    return this;
  }

  onFailure(fn: (error: unknown) => void): this {
    if (!this._ok) fn(this._error);
    return this;
  }

  fold<R>(onSuccess: (value: T) => R, onFailure: (error: unknown) => R): R {
    return this._ok ? onSuccess(this._value as T) : onFailure(this._error);
  }

  toString(): string {
    return this._ok
      ? `Result.success(${this._value})`
      : `Result.failure(${this._error})`;
  }
}

/** Wraps a throwing synchronous call in a Result. */
export function runCatching<T>(fn: () => T): Result<T> {
  try      { return Result.success(fn()); }
  catch (e) { return Result.failure(e); }
}

/** Wraps a throwing async call in a Result. */
export async function runCatchingAsync<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try      { return Result.success(await fn()); }
  catch (e) { return Result.failure(e); }
}
