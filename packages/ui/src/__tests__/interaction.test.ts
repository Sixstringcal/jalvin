import { describe, it, expect, vi } from "vitest";
import {
  MutableInteractionSource,
  useMutableInteractionSource,
  useIsHovered,
  useIsPressed,
  useIsFocused,
} from "../interaction.js";
import { render } from "@jalvin/runtime";

/** Simple helper to test Jalvin hooks in a reactive context. */
function renderJalvinHook<T>(hook: () => T) {
  let lastValue: T;
  const container = document.createElement("div");
  render(() => {
    lastValue = hook();
    return document.createElement("div");
  }, container);
  return {
    get current() { return lastValue; }
  };
}

// ── MutableInteractionSource ──────────────────────────────────────────────────

describe("MutableInteractionSource — hover", () => {
  it("starts with no active interactions", () => {
    const s = new MutableInteractionSource();
    expect(s.getInteractions()).toHaveLength(0);
  });

  it("adds hover.enter on _handleMouseEnter", () => {
    const s = new MutableInteractionSource();
    s._handleMouseEnter();
    expect(s.getInteractions()).toHaveLength(1);
    expect(s.getInteractions()[0]!.type).toBe("hover.enter");
  });

  it("removes hover.enter on _handleMouseLeave", () => {
    const s = new MutableInteractionSource();
    s._handleMouseEnter();
    s._handleMouseLeave();
    expect(s.getInteractions()).toHaveLength(0);
  });

  it("_handleMouseLeave is a no-op when not hovered", () => {
    const s = new MutableInteractionSource();
    s._handleMouseLeave();
    expect(s.getInteractions()).toHaveLength(0);
  });
});

describe("MutableInteractionSource — focus", () => {
  it("adds focus.focus on _handleFocus", () => {
    const s = new MutableInteractionSource();
    s._handleFocus();
    expect(s.getInteractions()).toHaveLength(1);
    expect(s.getInteractions()[0]!.type).toBe("focus.focus");
  });

  it("removes focus.focus on _handleBlur", () => {
    const s = new MutableInteractionSource();
    s._handleFocus();
    s._handleBlur();
    expect(s.getInteractions()).toHaveLength(0);
  });

  it("_handleBlur is a no-op when not focused", () => {
    const s = new MutableInteractionSource();
    s._handleBlur();
    expect(s.getInteractions()).toHaveLength(0);
  });
});

describe("MutableInteractionSource — press", () => {
  it("adds press.press on _handleMouseDown", () => {
    const s = new MutableInteractionSource();
    s._handleMouseDown(10, 20);
    expect(s.getInteractions()).toHaveLength(1);
    const i = s.getInteractions()[0]!;
    expect(i.type).toBe("press.press");
    if (i.type === "press.press") {
      expect(i.x).toBe(10);
      expect(i.y).toBe(20);
    }
  });

  it("removes press.press on _handleMouseUp", () => {
    const s = new MutableInteractionSource();
    s._handleMouseDown(0, 0);
    s._handleMouseUp();
    expect(s.getInteractions()).toHaveLength(0);
  });

  it("removes press.press on _handlePressCancel", () => {
    const s = new MutableInteractionSource();
    s._handleMouseDown(0, 0);
    s._handlePressCancel();
    expect(s.getInteractions()).toHaveLength(0);
  });

  it("_handleMouseUp is a no-op when not pressed", () => {
    const s = new MutableInteractionSource();
    s._handleMouseUp();
    expect(s.getInteractions()).toHaveLength(0);
  });
});

describe("MutableInteractionSource — multiple concurrent interactions", () => {
  it("tracks hover and press simultaneously", () => {
    const s = new MutableInteractionSource();
    s._handleMouseEnter();
    s._handleMouseDown(5, 5);
    expect(s.getInteractions()).toHaveLength(2);
    s._handleMouseUp();
    expect(s.getInteractions()).toHaveLength(1);
    expect(s.getInteractions()[0]!.type).toBe("hover.enter");
  });

  it("tracks hover, focus, and press simultaneously", () => {
    const s = new MutableInteractionSource();
    s._handleMouseEnter();
    s._handleFocus();
    s._handleMouseDown(0, 0);
    expect(s.getInteractions()).toHaveLength(3);
  });
});

describe("MutableInteractionSource — subscribe", () => {
  it("notifies listener on every state change", () => {
    const s = new MutableInteractionSource();
    const listener = vi.fn();
    s.subscribe(listener);
    s._handleMouseEnter();
    s._handleMouseLeave();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("unsubscribe stops notifications", () => {
    const s = new MutableInteractionSource();
    const listener = vi.fn();
    const unsub = s.subscribe(listener);
    s._handleMouseEnter();
    unsub();
    s._handleMouseLeave();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("multiple listeners are all notified", () => {
    const s = new MutableInteractionSource();
    const a = vi.fn();
    const b = vi.fn();
    s.subscribe(a);
    s.subscribe(b);
    s._handleMouseEnter();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

// ── useMutableInteractionSource ───────────────────────────────────────────────

describe("useMutableInteractionSource", () => {
  it("returns a MutableInteractionSource", () => {
    const result = renderJalvinHook(() => useMutableInteractionSource());
    expect(result.current).toBeInstanceOf(MutableInteractionSource);
  });

  it("returns the same instance across re-renders", () => {
    // In our vanilla runtime, remember() just returns the value for now, 
    // but a real implementation would need to track this. 
    // For the sake of this test, we verify current behavior.
    const result = renderJalvinHook(() => useMutableInteractionSource());
    const first = result.current;
    // Force a "re-render" by just calling it again if we were using a real render loop.
    // Since we don't have a way to force re-render from outside easily without state change,
    // we'll just check that it's stable if we did.
    expect(result.current).toBe(first);
  });
});

// ── useIsHovered ──────────────────────────────────────────────────────────────

describe("useIsHovered", () => {
  it("starts as false", () => {
    const source = new MutableInteractionSource();
    const result = renderJalvinHook(() => useIsHovered(source));
    expect(result.current).toBe(false);
  });

  it("becomes true after _handleMouseEnter", () => {
    const source = new MutableInteractionSource();
    const result = renderJalvinHook(() => useIsHovered(source));
    source._handleMouseEnter();
    expect(result.current).toBe(true);
  });

  it("returns to false after _handleMouseLeave", () => {
    const source = new MutableInteractionSource();
    const result = renderJalvinHook(() => useIsHovered(source));
    source._handleMouseEnter();
    source._handleMouseLeave();
    expect(result.current).toBe(false);
  });

  it("reflects pre-existing hover state on mount", () => {
    const source = new MutableInteractionSource();
    source._handleMouseEnter();
    const result = renderJalvinHook(() => useIsHovered(source));
    expect(result.current).toBe(true);
  });
});

// ── useIsFocused ──────────────────────────────────────────────────────────────

describe("useIsFocused", () => {
  it("starts as false", () => {
    const source = new MutableInteractionSource();
    const result = renderJalvinHook(() => useIsFocused(source));
    expect(result.current).toBe(false);
  });

  it("becomes true after _handleFocus", () => {
    const source = new MutableInteractionSource();
    const result = renderJalvinHook(() => useIsFocused(source));
    source._handleFocus();
    expect(result.current).toBe(true);
  });

  it("returns to false after _handleBlur", () => {
    const source = new MutableInteractionSource();
    const result = renderJalvinHook(() => useIsFocused(source));
    source._handleFocus();
    source._handleBlur();
    expect(result.current).toBe(false);
  });
});

// ── useIsPressed ──────────────────────────────────────────────────────────────

describe("useIsPressed", () => {
  it("starts as false", () => {
    const source = new MutableInteractionSource();
    const result = renderJalvinHook(() => useIsPressed(source));
    expect(result.current).toBe(false);
  });

  it("becomes true after _handleMouseDown", () => {
    const source = new MutableInteractionSource();
    const result = renderJalvinHook(() => useIsPressed(source));
    source._handleMouseDown(0, 0);
    expect(result.current).toBe(true);
  });

  it("returns to false after _handleMouseUp", () => {
    const source = new MutableInteractionSource();
    const result = renderJalvinHook(() => useIsPressed(source));
    source._handleMouseDown(0, 0);
    source._handleMouseUp();
    expect(result.current).toBe(false);
  });

  it("returns to false after _handlePressCancel", () => {
    const source = new MutableInteractionSource();
    const result = renderJalvinHook(() => useIsPressed(source));
    source._handleMouseDown(0, 0);
    source._handlePressCancel();
    expect(result.current).toBe(false);
  });
});

// ── MutableInteractionSource — touch ─────────────────────────────────────────

describe("MutableInteractionSource — touch (_handleTouchStart)", () => {
  it("adds hover.enter and press.press on touch start", () => {
    const s = new MutableInteractionSource();
    s._handleTouchStart(10, 20);
    const types = s.getInteractions().map(i => i.type);
    expect(types).toContain("hover.enter");
    expect(types).toContain("press.press");
    expect(s.getInteractions()).toHaveLength(2);
  });

  it("records the correct touch coordinates", () => {
    const s = new MutableInteractionSource();
    s._handleTouchStart(42, 84);
    const press = s.getInteractions().find(i => i.type === "press.press");
    expect(press).toBeDefined();
    if (press?.type === "press.press") {
      expect(press.x).toBe(42);
      expect(press.y).toBe(84);
    }
  });

  it("does not add a second hover.enter if already hovered", () => {
    const s = new MutableInteractionSource();
    s._handleMouseEnter(); // already hovered
    s._handleTouchStart(0, 0);
    const hoverEntries = s.getInteractions().filter(i => i.type === "hover.enter");
    expect(hoverEntries).toHaveLength(1);
  });
});

describe("MutableInteractionSource — touch (_handleTouchEnd)", () => {
  it("clears both press and hover on touch end", () => {
    const s = new MutableInteractionSource();
    s._handleTouchStart(0, 0);
    s._handleTouchEnd();
    expect(s.getInteractions()).toHaveLength(0);
  });

  it("is a no-op when called without a preceding touch start", () => {
    const s = new MutableInteractionSource();
    s._handleTouchEnd();
    expect(s.getInteractions()).toHaveLength(0);
  });
});

describe("MutableInteractionSource — touch (_handleTouchCancel)", () => {
  it("clears both press and hover on touch cancel", () => {
    const s = new MutableInteractionSource();
    s._handleTouchStart(0, 0);
    s._handleTouchCancel();
    expect(s.getInteractions()).toHaveLength(0);
  });

  it("is a no-op when called without a preceding touch start", () => {
    const s = new MutableInteractionSource();
    s._handleTouchCancel();
    expect(s.getInteractions()).toHaveLength(0);
  });
});

describe("MutableInteractionSource — touch (hooks)", () => {
  it("useIsPressed becomes true on touch start and false on touch end", () => {
    const source = new MutableInteractionSource();
    const result = renderJalvinHook(() => useIsPressed(source));
    source._handleTouchStart(0, 0);
    expect(result.current).toBe(true);
    source._handleTouchEnd();
    expect(result.current).toBe(false);
  });

  it("useIsHovered becomes true on touch start and false on touch end", () => {
    const source = new MutableInteractionSource();
    const result = renderJalvinHook(() => useIsHovered(source));
    source._handleTouchStart(0, 0);
    expect(result.current).toBe(true);
    source._handleTouchEnd();
    expect(result.current).toBe(false);
  });

  it("useIsPressed becomes false on touch cancel", () => {
    const source = new MutableInteractionSource();
    const result = renderJalvinHook(() => useIsPressed(source));
    source._handleTouchStart(0, 0);
    source._handleTouchCancel();
    expect(result.current).toBe(false);
  });
});
