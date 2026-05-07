// ─────────────────────────────────────────────────────────────────────────────
// Interaction — general-purpose interaction state tracking
//
// A single MutableInteractionSource aggregates hover, focus, and press state
// for one component. Multiple modifiers (hoverable, focusable, pressable) all
// emit into the same source, so you can derive any combination of states:
//
//   const source = useMutableInteractionSource();
//   const isHovered = useIsHovered(source);
//   const isPressed = useIsPressed(source);
//
//   Box({ modifier: Modifier.hoverable(source).pressable(source) }) { ... }
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";

// ── Interaction types ────────────────────────────────────────────────────────

/** Interactions emitted when the pointer enters or leaves a component. */
export namespace HoverInteraction {
  export interface Enter { readonly type: "hover.enter" }
  export interface Exit  { readonly type: "hover.exit";  readonly enter: Enter }
}

/** Interactions emitted on pointer press, release, or cancel. */
export namespace PressInteraction {
  export interface Press   { readonly type: "press.press";   readonly x: number; readonly y: number }
  export interface Release { readonly type: "press.release"; readonly press: Press }
  export interface Cancel  { readonly type: "press.cancel";  readonly press: Press }
}

/** Interactions emitted when the component gains or loses keyboard focus. */
export namespace FocusInteraction {
  export interface Focus   { readonly type: "focus.focus" }
  export interface Unfocus { readonly type: "focus.unfocus"; readonly focus: Focus }
}

/** Union of all interaction types. */
export type Interaction =
  | HoverInteraction.Enter
  | HoverInteraction.Exit
  | PressInteraction.Press
  | PressInteraction.Release
  | PressInteraction.Cancel
  | FocusInteraction.Focus
  | FocusInteraction.Unfocus;

// ── InteractionSource ────────────────────────────────────────────────────────

/**
 * Read-only view of the currently active (unresolved) interactions on a
 * component. Subscribe to be notified whenever the set changes.
 */
export interface InteractionSource {
  /** All interactions that have been emitted but not yet resolved. */
  getInteractions(): ReadonlyArray<Interaction>;
  /**
   * Register a listener invoked after every state change.
   * Returns an unsubscribe function.
   */
  subscribe(listener: () => void): () => void;
}

// ── MutableInteractionSource ─────────────────────────────────────────────────

/**
 * Mutable implementation of {@link InteractionSource}.
 *
 * Create one with {@link useMutableInteractionSource} and attach it to a
 * component via {@link Modifier.hoverable}, {@link Modifier.focusable}, or
 * {@link Modifier.pressable}. All three modifiers write into the same source,
 * so a single source describes the full interaction state of the element.
 */
export class MutableInteractionSource implements InteractionSource {
  private _interactions: ReadonlyArray<Interaction> = [];
  private readonly _listeners = new Set<() => void>();

  // ── active interaction tracking ─────────────────────────────────────────
  private _currentHover: HoverInteraction.Enter | null = null;
  private _currentFocus: FocusInteraction.Focus | null = null;
  private _currentPress: PressInteraction.Press | null = null;

  // ── InteractionSource ────────────────────────────────────────────────────

  getInteractions(): ReadonlyArray<Interaction> {
    return this._interactions;
  }

  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  // ── Internal DOM event handlers (called by Modifier) ─────────────────────

  /** @internal */
  _handleMouseEnter(): void {
    const enter: HoverInteraction.Enter = { type: "hover.enter" };
    this._currentHover = enter;
    this._emit(enter);
  }

  /** @internal */
  _handleMouseLeave(): void {
    if (this._currentHover) {
      this._emit({ type: "hover.exit", enter: this._currentHover });
      this._currentHover = null;
    }
  }

  /** @internal */
  _handleFocus(): void {
    const focus: FocusInteraction.Focus = { type: "focus.focus" };
    this._currentFocus = focus;
    this._emit(focus);
  }

  /** @internal */
  _handleBlur(): void {
    if (this._currentFocus) {
      this._emit({ type: "focus.unfocus", focus: this._currentFocus });
      this._currentFocus = null;
    }
  }

  /** @internal */
  _handleMouseDown(x: number, y: number): void {
    const press: PressInteraction.Press = { type: "press.press", x, y };
    this._currentPress = press;
    this._emit(press);
  }

  /** @internal */
  _handleMouseUp(): void {
    if (this._currentPress) {
      this._emit({ type: "press.release", press: this._currentPress });
      this._currentPress = null;
    }
  }

  /** @internal */
  _handlePressCancel(): void {
    if (this._currentPress) {
      this._emit({ type: "press.cancel", press: this._currentPress });
      this._currentPress = null;
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _emit(interaction: Interaction): void {
    // "exit" interactions remove their paired "enter" from the active set.
    if (
      interaction.type === "hover.exit" ||
      interaction.type === "press.release" ||
      interaction.type === "press.cancel" ||
      interaction.type === "focus.unfocus"
    ) {
      const paired: Interaction =
        interaction.type === "hover.exit"    ? interaction.enter :
        interaction.type === "focus.unfocus" ? interaction.focus :
                                               interaction.press;
      this._interactions = this._interactions.filter(i => i !== paired);
    } else {
      this._interactions = [...this._interactions, interaction];
    }
    this._listeners.forEach(l => l());
  }
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Creates and remembers a {@link MutableInteractionSource} for the lifetime
 * of the component. Equivalent to `remember { MutableInteractionSource() }`.
 */
export function useMutableInteractionSource(): MutableInteractionSource {
  const ref = useRef<MutableInteractionSource | null>(null);
  if (ref.current === null) ref.current = new MutableInteractionSource();
  return ref.current;
}

/**
 * Returns `true` while the pointer is inside the bounds of the component
 * attached to `source` via `Modifier.hoverable(source)`.
 */
export function useIsHovered(source: InteractionSource): boolean {
  const [val, setVal] = useState(() =>
    source.getInteractions().some(i => i.type === "hover.enter")
  );
  useEffect(() => {
    setVal(source.getInteractions().some(i => i.type === "hover.enter"));
    return source.subscribe(() =>
      setVal(source.getInteractions().some(i => i.type === "hover.enter"))
    );
  }, [source]);
  return val;
}

/**
 * Returns `true` while the component attached to `source` has keyboard focus.
 */
export function useIsFocused(source: InteractionSource): boolean {
  const [val, setVal] = useState(() =>
    source.getInteractions().some(i => i.type === "focus.focus")
  );
  useEffect(() => {
    setVal(source.getInteractions().some(i => i.type === "focus.focus"));
    return source.subscribe(() =>
      setVal(source.getInteractions().some(i => i.type === "focus.focus"))
    );
  }, [source]);
  return val;
}

/**
 * Returns `true` while the user is pressing down on the component attached to
 * `source` via `Modifier.pressable(source)`.
 */
export function useIsPressed(source: InteractionSource): boolean {
  const [val, setVal] = useState(() =>
    source.getInteractions().some(i => i.type === "press.press")
  );
  useEffect(() => {
    setVal(source.getInteractions().some(i => i.type === "press.press"));
    return source.subscribe(() =>
      setVal(source.getInteractions().some(i => i.type === "press.press"))
    );
  }, [source]);
  return val;
}
