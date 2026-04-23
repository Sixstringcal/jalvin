// ─────────────────────────────────────────────────────────────────────────────
// Jalvin Coroutine runtime
//
// Provides primitives on top of the JS event loop:
//   • launch { }       — fire-and-forget, returns a Job
//   • async { }        — returns a Deferred<T>  (a typed Promise)
//   • Dispatchers      — Main, IO, Default (all map to appropriate JS queues)
//   • withContext      — switch dispatcher mid-coroutine
//   • delay            — suspendable sleep
//   • CoroutineScope   — structured concurrency scope
//   • cancelAll        — cancel all children of a scope
// ─────────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

export type JobState = "active" | "cancelling" | "cancelled" | "completed";

export class Job {
  private _state: JobState = "active";
  private _children: Set<Job> = new Set();
  private readonly _promise: Promise<void>;
  private _resolve!: () => void;
  private _reject!: (reason?: unknown) => void;

  constructor() {
    this._promise = new Promise<void>((res, rej) => {
      this._resolve = res;
      this._reject = rej;
    });
  }

  get isActive(): boolean { return this._state === "active"; }
  get isCancelled(): boolean { return this._state === "cancelled" || this._state === "cancelling"; }
  get isCompleted(): boolean { return this._state === "completed"; }

  async join(): Promise<void> {
    return this._promise;
  }

  cancel(reason?: string): void {
    if (this._state !== "active") return;
    this._state = "cancelling";
    for (const child of this._children) child.cancel(reason);
    this._state = "cancelled";
    this._reject(new JobCancellationException(reason ?? "Job was cancelled"));
  }

  /** @internal */
  _complete(): void {
    if (this._state === "active") {
      this._state = "completed";
      this._resolve();
    }
  }

  /** @internal */
  _fail(reason: unknown): void {
    if (this._state === "active") {
      this._state = "cancelled";
      this._reject(reason);
    }
  }

  /** @internal */
  _addChild(job: Job): void {
    this._children.add(job);
    job._promise.finally(() => this._children.delete(job));
  }
}

export class JobCancellationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobCancellationException";
  }
}

// ---------------------------------------------------------------------------
// Deferred<T>
// ---------------------------------------------------------------------------

export class Deferred<T> {
  private readonly _promise: Promise<T>;
  private _resolve!: (value: T) => void;
  private _reject!: (reason?: unknown) => void;
  private _completed = false;

  constructor() {
    this._promise = new Promise<T>((res, rej) => {
      this._resolve = res;
      this._reject = rej;
    });
  }

  complete(value: T): void {
    if (!this._completed) {
      this._completed = true;
      this._resolve(value);
    }
  }

  completeExceptionally(reason: unknown): void {
    if (!this._completed) {
      this._completed = true;
      this._reject(reason);
    }
  }

  async await(): Promise<T> {
    return this._promise;
  }

  /** @internal */
  toPromise(): Promise<T> {
    return this._promise;
  }
}

// ---------------------------------------------------------------------------
// Dispatchers
// ---------------------------------------------------------------------------

export type Dispatcher = "Main" | "IO" | "Default";

/** Yield to the next microtask */
export async function yield_(): Promise<void> {
  return new Promise<void>((res) => setTimeout(res, 0));
}

// ---------------------------------------------------------------------------
// CoroutineScope
// ---------------------------------------------------------------------------

export class CoroutineScope {
  private readonly _jobs: Set<Job> = new Set();
  private _cancelled = false;

  get isCancelled(): boolean { return this._cancelled; }

  /**
   * Launch a fire-and-forget coroutine in this scope.
   */
  launch(fn: () => Promise<void>): Job {
    if (this._cancelled) {
      const j = new Job();
      j.cancel("Scope is cancelled");
      return j;
    }
    const job = new Job();
    this._jobs.add(job);

    fn()
      .then(() => job._complete())
      .catch((e) => {
        if (e instanceof JobCancellationException) {
          job.cancel(e.message);
        } else {
          job._fail(e);
        }
      })
      .finally(() => this._jobs.delete(job));

    return job;
  }

  /**
   * Launch an async coroutine that returns a value.
   */
  async_<T>(fn: () => Promise<T>): Deferred<T> {
    const deferred = new Deferred<T>();
    fn()
      .then((v) => deferred.complete(v))
      .catch((e) => deferred.completeExceptionally(e));
    return deferred;
  }

  /** Cancel all running jobs in this scope */
  cancel(reason?: string): void {
    this._cancelled = true;
    for (const job of this._jobs) {
      job.cancel(reason);
    }
  }

  /** Wait for all running jobs to complete */
  async joinAll(): Promise<void> {
    await Promise.all([...this._jobs].map((j) => j.join().catch(() => void 0)));
  }
}

// ---------------------------------------------------------------------------
// Top-level launch / async helpers (global scope)
// ---------------------------------------------------------------------------

const _globalScope = new CoroutineScope();

/**
 * Fire-and-forget coroutine at global scope.
 *
 *   launch {
 *     val data = Bibi("https://api.example.com").get<User>("/me")
 *     println(data.body())
 *   }
 */
export function launch(fn: () => Promise<void>): Job {
  return _globalScope.launch(fn);
}

/**
 * Async block that returns a Deferred<T>.
 *
 *   val job = async { expensiveCompute() }
 *   val result = job.await()
 */
export function async_<T>(fn: () => Promise<T>): Deferred<T> {
  return _globalScope.async_(fn);
}

// ---------------------------------------------------------------------------
// delay — suspendable sleep
// ---------------------------------------------------------------------------

export function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// ---------------------------------------------------------------------------
// withContext — switch dispatcher context
// In JS all dispatchers are the same event loop; we yield for fairness.
// ---------------------------------------------------------------------------

export async function withContext<T>(
  _dispatcher: Dispatcher,
  fn: () => Promise<T>
): Promise<T> {
  await yield_();
  return fn();
}

// ---------------------------------------------------------------------------
// repeat — repeat a suspend block N times
// ---------------------------------------------------------------------------

export async function repeat(times: number, fn: (index: number) => Promise<void>): Promise<void> {
  for (let i = 0; i < times; i++) {
    await fn(i);
  }
}

// ---------------------------------------------------------------------------
// runBlocking — bridges suspend world into sync (test helper, not for UI)
// ---------------------------------------------------------------------------

export function runBlocking<T>(fn: () => Promise<T>): T {
  let result: T | undefined;
  let error: unknown;
  let done = false;

  fn().then((v) => { result = v; done = true; }).catch((e) => { error = e; done = true; });

  // Spin — only safe in Node.js test environments
  const start = Date.now();
  while (!done) {
    if (Date.now() - start > 10_000) throw new Error("runBlocking timeout");
    // No synchronous spin possible in pure JS — callers should use await
  }

  if (error !== undefined) throw error;
  return result as T;
}

// ---------------------------------------------------------------------------
// withTimeout / withTimeoutOrNull
// ---------------------------------------------------------------------------

export class TimeoutCancellationException extends Error {
  constructor(ms: number) {
    super(`Timed out waiting for ${ms} ms`);
    this.name = "TimeoutCancellationException";
  }
}

/**
 * Run `fn` and throw `TimeoutCancellationException` if it doesn't complete
 * within `timeoutMs` milliseconds.
 */
export async function withTimeout<T>(timeoutMs: number, fn: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutCancellationException(timeoutMs)), timeoutMs);
  });
  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    return result;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/**
 * Like `withTimeout` but returns `null` on timeout instead of throwing.
 */
export async function withTimeoutOrNull<T>(
  timeoutMs: number,
  fn: () => Promise<T>
): Promise<T | null> {
  try {
    return await withTimeout(timeoutMs, fn);
  } catch (e) {
    if (e instanceof TimeoutCancellationException) return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Channel<T>
// A basic rendezvous channel. Senders await receivers and vice versa.
// ---------------------------------------------------------------------------

export class ChannelClosedException extends Error {
  constructor() {
    super("Channel is closed");
    this.name = "ChannelClosedException";
  }
}

/**
 * An unbuffered (rendezvous) channel`.
 *
 * ```
 * val ch = Channel<Int>()
 * launch { ch.send(42) }
 * val v = ch.receive()
 * ```
 */
export class Channel<T> {
  private readonly _buffer: T[] = [];
  private readonly _capacity: number;
  private _closed = false;
  private _sendWaiters: Array<{ value: T; resolve: () => void; reject: (e: unknown) => void }> = [];
  private _recvWaiters: Array<{ resolve: (v: T) => void; reject: (e: unknown) => void }> = [];

  constructor(capacity = 0) {
    this._capacity = capacity;
  }

  /** Send a value to the channel. Suspends if the buffer is full. */
  async send(value: T): Promise<void> {
    if (this._closed) throw new ChannelClosedException();

    // If there's a waiting receiver, hand off directly
    const receiver = this._recvWaiters.shift();
    if (receiver) {
      receiver.resolve(value);
      return;
    }

    // If buffered capacity allows, enqueue
    if (this._buffer.length < this._capacity) {
      this._buffer.push(value);
      return;
    }

    // Otherwise, suspend until a receiver is ready
    return new Promise<void>((resolve, reject) => {
      this._sendWaiters.push({ value, resolve, reject });
    });
  }

  /** Receive a value from the channel. Suspends if no value is available. */
  async receive(): Promise<T> {
    // If there's a buffered value, return it and wake a pending sender
    if (this._buffer.length > 0) {
      const value = this._buffer.shift()!;
      const sender = this._sendWaiters.shift();
      if (sender) {
        this._buffer.push(sender.value);
        sender.resolve();
      }
      return value;
    }

    if (this._closed) throw new ChannelClosedException();

    // If there's a pending sender, receive directly
    const sender = this._sendWaiters.shift();
    if (sender) {
      sender.resolve();
      return sender.value;
    }

    // Suspend until a value arrives
    return new Promise<T>((resolve, reject) => {
      this._recvWaiters.push({ resolve, reject });
    });
  }

  /** Try to receive without suspending. Returns undefined if empty. */
  tryReceive(): T | undefined {
    if (this._buffer.length > 0) return this._buffer.shift();
    const sender = this._sendWaiters.shift();
    if (sender) { sender.resolve(); return sender.value; }
    return undefined;
  }

  /** Close the channel — subsequent sends throw; pending receives get ChannelClosedException. */
  close(): void {
    this._closed = true;
    for (const waiter of this._recvWaiters) {
      waiter.reject(new ChannelClosedException());
    }
    this._recvWaiters = [];
  }

  get isClosed(): boolean { return this._closed; }
  get isEmpty(): boolean { return this._buffer.length === 0 && this._sendWaiters.length === 0; }

  /** Consume all values as an async iterable */
  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    while (!this._closed || !this.isEmpty) {
      try {
        yield await this.receive();
      } catch (e) {
        if (e instanceof ChannelClosedException) return;
        throw e;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Flow<T> — cold asynchronous stream
// ---------------------------------------------------------------------------

export type FlowCollector<T> = (value: T) => Promise<void> | void;

/**
 * A cold asynchronous stream. The producer block only runs when `.collect()`
 * is called — each collector gets its own independent execution.
 *
 * ```jalvin
 * val flow = flow<Int> {
 *     emit(1)
 *     emit(2)
 *     emit(3)
 * }
 * flow.collect { println(it) }
 * ```
 */
export class Flow<T> {
  constructor(private readonly producer: (emit: (value: T) => Promise<void>) => Promise<void>) { }

  async collect(collector: FlowCollector<T>): Promise<void> {
    await this.producer(async (v) => { await collector(v); });
  }

  map<R>(transform: (value: T) => R | Promise<R>): Flow<R> {
    return new Flow<R>(async (emit) => {
      await this.collect(async (v) => emit(await transform(v)));
    });
  }

  filter(predicate: (value: T) => boolean | Promise<boolean>): Flow<T> {
    return new Flow<T>(async (emit) => {
      await this.collect(async (v) => { if (await predicate(v)) await emit(v); });
    });
  }

  take(count: number): Flow<T> {
    return new Flow<T>(async (emit) => {
      let n = 0;
      await this.collect(async (v) => {
        if (n++ < count) await emit(v);
      });
    });
  }

  drop(count: number): Flow<T> {
    return new Flow<T>(async (emit) => {
      let n = 0;
      await this.collect(async (v) => { if (n++ >= count) await emit(v); });
    });
  }

  distinct(): Flow<T> {
    return new Flow<T>(async (emit) => {
      const seen = new Set<T>();
      await this.collect(async (v) => { if (!seen.has(v)) { seen.add(v); await emit(v); } });
    });
  }

  onEach(action: (value: T) => void | Promise<void>): Flow<T> {
    return new Flow<T>(async (emit) => {
      await this.collect(async (v) => { await action(v); await emit(v); });
    });
  }

  async toList(): Promise<T[]> {
    const result: T[] = [];
    await this.collect((v) => { result.push(v); });
    return result;
  }

  async first(): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let found = false;
      this.collect((v) => {
        if (!found) { found = true; resolve(v); }
      }).catch(reject);
    });
  }

  async firstOrNull(): Promise<T | null> {
    return new Promise<T | null>((resolve) => {
      let found = false;
      this.collect((v) => {
        if (!found) { found = true; resolve(v); }
      }).then(() => { if (!found) resolve(null); }).catch(() => resolve(null));
    });
  }

  /** Combine two flows, emitting pairs whenever either emits */
  static combine<A, B>(a: Flow<A>, b: Flow<B>): Flow<[A, B]> {
    return new Flow<[A, B]>(async (emit) => {
      let latestA: A | undefined;
      let latestB: B | undefined;
      let hasA = false;
      let hasB = false;
      const pa = a.collect(async (v) => { latestA = v; hasA = true; if (hasB) await emit([latestA!, latestB!]); });
      const pb = b.collect(async (v) => { latestB = v; hasB = true; if (hasA) await emit([latestA!, latestB!]); });
      await Promise.all([pa, pb]);
    });
  }

  /** Merge multiple flows into one */
  static merge<T>(...flows: Flow<T>[]): Flow<T> {
    return new Flow<T>(async (emit) => {
      await Promise.all(flows.map((f) => f.collect(emit)));
    });
  }
}

/**
 * Build a cold Flow from a producer block.
 *
 * ```jalvin
 * val numbers = flow<Int> {
 *     for (i in 1..5) {
 *         emit(i)
 *         delay(100)
 *     }
 * }
 * ```
 */
export function flow<T>(producer: (emit: (value: T) => Promise<void>) => Promise<void>): Flow<T> {
  return new Flow<T>(producer);
}

/**
 * Build a Flow from a fixed collection.
 */
export function flowOf<T>(...values: T[]): Flow<T> {
  return new Flow<T>(async (emit) => {
    for (const v of values) await emit(v);
  });
}

/**
 * Build a Flow from an async iterable (e.g. a Channel).
 */
export function asFlow<T>(source: AsyncIterable<T>): Flow<T> {
  return new Flow<T>(async (emit) => {
    for await (const v of source) await emit(v);
  });
}

// ---------------------------------------------------------------------------
// Structured-concurrency builders
// ---------------------------------------------------------------------------

/**
 * Creates a new coroutine scope, executes the given block, and returns once
 * all launched child jobs complete.
 */
export async function coroutineScope<T>(fn: (scope: CoroutineScope) => Promise<T> | T): Promise<T> {
  const scope = new CoroutineScope();
  const result = await Promise.resolve(fn(scope));
  await scope.joinAll();
  return result;
}

/**
 * Like `coroutineScope` but child failures do not cancel siblings.
 * In a JS environment all unhandled promise rejections are already independent,
 * so this is equivalent to `coroutineScope`.
 */
export async function supervisorScope<T>(fn: (scope: CoroutineScope) => Promise<T> | T): Promise<T> {
  return coroutineScope(fn);
}


