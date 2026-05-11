export declare function listOf<T>(...items: T[]): readonly T[];
export declare function mutableListOf<T>(...items: T[]): T[];
export declare function setOf<T>(...items: T[]): ReadonlySet<T>;
export declare function mutableSetOf<T>(...items: T[]): Set<T>;
export declare function mapOf<K, V>(...entries: [K, V][]): ReadonlyMap<K, V>;
export declare function mutableMapOf<K, V>(...entries: [K, V][]): Map<K, V>;
/** Creates a 2-element tuple. Use `Pair` from `conversions.ts` for the class form. */
export declare function pairOf<A, B>(first: A, second: B): [A, B];
/** Creates a 3-element tuple. Use `Triple` from `conversions.ts` for the class form. */
export declare function tripleOf<A, B, C>(first: A, second: B, third: C): [A, B, C];
export declare function map<T, R>(iterable: Iterable<T>, transform: (item: T) => R): R[];
export declare function filter<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): T[];
export declare function filterNotNull<T>(iterable: Iterable<T | null | undefined>): T[];
export declare function forEach<T>(iterable: Iterable<T>, action: (item: T) => void): void;
export declare function fold<T, R>(iterable: Iterable<T>, initial: R, operation: (acc: R, item: T) => R): R;
export declare function reduce<T>(iterable: Iterable<T>, operation: (acc: T, item: T) => T): T;
export declare function flatMap<T, R>(iterable: Iterable<T>, transform: (item: T) => Iterable<R>): R[];
export declare function flatten<T>(iterable: Iterable<Iterable<T>>): T[];
export declare function groupBy<T, K>(iterable: Iterable<T>, keySelector: (item: T) => K): Map<K, T[]>;
export declare function associate<T, K, V>(iterable: Iterable<T>, transform: (item: T) => [K, V]): Map<K, V>;
export declare function zip<A, B>(a: A[], b: B[]): [A, B][];
export declare function sumOf<T>(iterable: Iterable<T>, selector: (item: T) => number): number;
export declare function any<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): boolean;
export declare function all<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): boolean;
export declare function none<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): boolean;
export declare function count<T>(iterable: Iterable<T>, predicate?: (item: T) => boolean): number;
export declare function minOf<T>(iterable: Iterable<T>, selector: (item: T) => number): number;
export declare function maxOf<T>(iterable: Iterable<T>, selector: (item: T) => number): number;
export declare function minOrNull<T>(arr: T[], selector: (item: T) => number): T | null;
export declare function maxOrNull<T>(arr: T[], selector: (item: T) => number): T | null;
export declare function joinToString<T>(iterable: Iterable<T>, separator?: string, prefix?: string, suffix?: string, transform?: (item: T) => string): string;
export declare function first<T>(iterable: Iterable<T>, predicate?: (item: T) => boolean): T;
export declare function firstOrNull<T>(iterable: Iterable<T>, predicate?: (item: T) => boolean): T | null;
export declare function last<T>(arr: T[], predicate?: (item: T) => boolean): T;
export declare function lastOrNull<T>(arr: T[], predicate?: (item: T) => boolean): T | null;
export declare function find<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): T | null;
export declare function findLast<T>(arr: T[], predicate: (item: T) => boolean): T | null;
export declare function distinct<T>(iterable: Iterable<T>): T[];
export declare function distinctBy<T, K>(iterable: Iterable<T>, selector: (item: T) => K): T[];
export declare function sortedBy<T>(arr: T[], selector: (item: T) => number | string): T[];
export declare function sortedByDescending<T>(arr: T[], selector: (item: T) => number | string): T[];
export declare function reversed<T>(arr: T[]): T[];
export declare function take<T>(arr: T[], n: number): T[];
export declare function takeWhile<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): T[];
export declare function drop<T>(arr: T[], n: number): T[];
export declare function dropWhile<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): T[];
export declare function chunked<T>(arr: T[], size: number): T[][];
export declare function windowed<T>(arr: T[], size: number, step?: number): T[][];
export declare function partition<T>(iterable: Iterable<T>, predicate: (item: T) => boolean): [T[], T[]];
export declare function withIndex<T>(iterable: Iterable<T>): Array<{
    index: number;
    value: T;
}>;
interface ListBuilder<T> {
    add(item: T): void;
    addAll(items: Iterable<T>): void;
    readonly size: number;
}
export declare function buildList<T>(fn: (list: ListBuilder<T>) => void): T[];
interface SetBuilder<T> {
    add(item: T): void;
    addAll(items: Iterable<T>): void;
    readonly size: number;
}
export declare function buildSet<T>(fn: (set: SetBuilder<T>) => void): Set<T>;
interface MapBuilder<K, V> {
    put(key: K, value: V): void;
    putAll(entries: Iterable<[K, V]>): void;
    readonly size: number;
}
export declare function buildMap<K, V>(fn: (map: MapBuilder<K, V>) => void): Map<K, V>;
export {};
//# sourceMappingURL=collections.d.ts.map