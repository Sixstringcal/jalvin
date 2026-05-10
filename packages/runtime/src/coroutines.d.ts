export type JobState = "active" | "cancelling" | "cancelled" | "completed";
export declare class Job {
    private _state;
    private _children;
    private readonly _promise;
    private _resolve;
    private _reject;
    constructor();
    get isActive(): boolean;
    get isCancelled(): boolean;
    get isCompleted(): boolean;
    join(): Promise<void>;
    cancel(reason?: string): void;
    /** @internal */
    _complete(): void;
    /** @internal */
    _fail(reason: unknown): void;
    /** @internal */
    _addChild(job: Job): void;
}
export declare class JobCancellationException extends Error {
    constructor(message: string);
}
export declare class Deferred<T> {
    private readonly _promise;
    private _resolve;
    private _reject;
    private _completed;
    constructor();
    complete(value: T): void;
    completeExceptionally(reason: unknown): void;
    await(): Promise<T>;
    /** @internal */
    toPromise(): Promise<T>;
}
export type Dispatcher = "Main" | "IO" | "Default";
/** Yield to the next microtask */
export declare function yield_(): Promise<void>;
export declare class CoroutineScope {
    private readonly _jobs;
    private _cancelled;
    get isCancelled(): boolean;
    /**
     * Launch a fire-and-forget coroutine in this scope.
     */
    launch(fn: () => Promise<void>): Job;
    /**
     * Launch an async coroutine that returns a value.
     */
    async_<T>(fn: () => Promise<T>): Deferred<T>;
    /** Cancel all running jobs in this scope */
    cancel(reason?: string): void;
    /** Wait for all running jobs to complete */
    joinAll(): Promise<void>;
}
/**
 * Fire-and-forget coroutine at global scope.
 *
 *   launch {
 *     val data = Bibi("https://api.example.com").get<User>("/me")
 *     println(data.body())
 *   }
 */
export declare function launch(fn: () => Promise<void>): Job;
/**
 * Async block that returns a Deferred<T>.
 *
 *   val job = async { expensiveCompute() }
 *   val result = job.await()
 */
export declare function async_<T>(fn: () => Promise<T>): Deferred<T>;
export declare function delay(ms: number): Promise<void>;
export declare function withContext<T>(_dispatcher: Dispatcher, fn: () => Promise<T>): Promise<T>;
export declare function repeat(times: number, fn: (index: number) => Promise<void>): Promise<void>;
export declare function runBlocking<T>(fn: () => Promise<T>): T;
export declare class TimeoutCancellationException extends Error {
    constructor(ms: number);
}
/**
 * Run `fn` and throw `TimeoutCancellationException` if it doesn't complete
 * within `timeoutMs` milliseconds.
 */
export declare function withTimeout<T>(timeoutMs: number, fn: () => Promise<T>): Promise<T>;
/**
 * Like `withTimeout` but returns `null` on timeout instead of throwing.
 */
export declare function withTimeoutOrNull<T>(timeoutMs: number, fn: () => Promise<T>): Promise<T | null>;
export declare class ChannelClosedException extends Error {
    constructor();
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
export declare class Channel<T> {
    private readonly _buffer;
    private readonly _capacity;
    private _closed;
    private _sendWaiters;
    private _recvWaiters;
    constructor(capacity?: number);
    /** Send a value to the channel. Suspends if the buffer is full. */
    send(value: T): Promise<void>;
    /** Receive a value from the channel. Suspends if no value is available. */
    receive(): Promise<T>;
    /** Try to receive without suspending. Returns undefined if empty. */
    tryReceive(): T | undefined;
    /** Close the channel — subsequent sends throw; pending receives get ChannelClosedException. */
    close(): void;
    get isClosed(): boolean;
    get isEmpty(): boolean;
    /** Consume all values as an async iterable */
    [Symbol.asyncIterator](): AsyncGenerator<T>;
}
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
export declare class Flow<T> {
    private readonly producer;
    constructor(producer: (emit: (value: T) => Promise<void>) => Promise<void>);
    collect(collector: FlowCollector<T>): Promise<void>;
    map<R>(transform: (value: T) => R | Promise<R>): Flow<R>;
    filter(predicate: (value: T) => boolean | Promise<boolean>): Flow<T>;
    take(count: number): Flow<T>;
    drop(count: number): Flow<T>;
    distinct(): Flow<T>;
    onEach(action: (value: T) => void | Promise<void>): Flow<T>;
    toList(): Promise<T[]>;
    first(): Promise<T>;
    firstOrNull(): Promise<T | null>;
    /** Combine two flows, emitting pairs whenever either emits */
    static combine<A, B>(a: Flow<A>, b: Flow<B>): Flow<[A, B]>;
    /** Merge multiple flows into one */
    static merge<T>(...flows: Flow<T>[]): Flow<T>;
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
export declare function flow<T>(producer: (emit: (value: T) => Promise<void>) => Promise<void>): Flow<T>;
/**
 * Build a Flow from a fixed collection.
 */
export declare function flowOf<T>(...values: T[]): Flow<T>;
/**
 * Build a Flow from an async iterable (e.g. a Channel).
 */
export declare function asFlow<T>(source: AsyncIterable<T>): Flow<T>;
/**
 * Creates a new coroutine scope, executes the given block, and returns once
 * all launched child jobs complete.
 */
export declare function coroutineScope<T>(fn: (scope: CoroutineScope) => Promise<T> | T): Promise<T>;
/**
 * Like `coroutineScope` but child failures do not cancel siblings.
 * In a JS environment all unhandled promise rejections are already independent,
 * so this is equivalent to `coroutineScope`.
 */
export declare function supervisorScope<T>(fn: (scope: CoroutineScope) => Promise<T> | T): Promise<T>;
//# sourceMappingURL=coroutines.d.ts.map