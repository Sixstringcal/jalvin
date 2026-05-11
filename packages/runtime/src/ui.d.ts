import type { StateFlow } from "./stateflow.js";
export interface MutableState<T> {
    value: T;
}
/**
 * Returns a reactive state holder.
 */
export declare function mutableStateOf<T>(initial: T): MutableState<T>;
/**
 * Compute an expensive value. In vanilla mode, this is currently just a pass-through
 * unless we implement a more complex component lifecycle.
 */
export declare function remember<T>(compute: () => T, _deps?: readonly unknown[]): T;
/**
 * Convenience wrapper.
 */
export declare function rememberMutableStateOf<T>(initial: T): MutableState<T>;
/**
 * Collects a StateFlow into reactive state.
 */
export declare function collectAsState<T>(flow: StateFlow<T>): T;
/**
 * Runs an effect tied to "component" execution.
 */
export declare function LaunchedEffect(_deps: readonly unknown[], fn: () => Promise<void>): void;
export declare function DisposableEffect(_deps: readonly unknown[], fn: () => (() => void)): void;
export declare function SideEffect(fn: () => void): void;
export type WindowSizeClass = "Compact" | "Medium" | "Expanded";
export declare function widthToSizeClass(widthPx: number): WindowSizeClass;
export declare function heightToSizeClass(heightPx: number): WindowSizeClass;
export interface WindowSizeClassState {
    widthSizeClass: WindowSizeClass;
    heightSizeClass: WindowSizeClass;
}
export declare function calculateWindowSizeClass(): WindowSizeClassState;
export declare function WindowSizeClassProvider({ children }: {
    children?: any;
}): any;
/**
 * Mounts a Jalvin component to the DOM and sets up the re-render loop.
 */
export declare function render(rootComponent: () => HTMLElement, container: HTMLElement): void;
//# sourceMappingURL=ui.d.ts.map