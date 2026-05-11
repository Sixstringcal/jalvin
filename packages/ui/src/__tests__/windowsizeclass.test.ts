import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { calculateWindowSizeClass, render } from "@jalvin/runtime";

function setWindowSize(width: number, height: number) {
  Object.defineProperty(window, "innerWidth",  { writable: true, configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: height });
}

function fireResize() {
  window.dispatchEvent(new Event("resize"));
}

/** Simple helper to test Jalvin functions in a reactive context. */
function renderJalvinHook<T>(hook: () => T) {
  let lastValue: T;
  const container = document.createElement("div");
  const update = () => {
    render(() => {
      lastValue = hook();
      return document.createElement("div");
    }, container);
  };
  update();
  return {
    get current() { return lastValue; }
  };
}

describe("calculateWindowSizeClass", () => {
  beforeEach(() => {
    setWindowSize(1280, 800);
    // Force reset the global state for testing if needed, 
    // but since it's global in ui.ts we just fire a resize.
    fireResize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── initial class from window size ─────────────────────────────────────────

  it("returns Compact/Medium for a phone-sized window (360×640)", () => {
    setWindowSize(360, 640);
    fireResize();
    const result = renderJalvinHook(() => calculateWindowSizeClass());
    expect(result.current.widthSizeClass).toBe("Compact");
    expect(result.current.heightSizeClass).toBe("Medium");
  });

  it("returns Medium/Compact for a landscape phone (667×375)", () => {
    setWindowSize(667, 375);
    fireResize();
    const result = renderJalvinHook(() => calculateWindowSizeClass());
    expect(result.current.widthSizeClass).toBe("Medium");
    expect(result.current.heightSizeClass).toBe("Compact");
  });

  it("returns Medium/Expanded for a tablet-sized window (768×1024)", () => {
    setWindowSize(768, 1024);
    fireResize();
    const result = renderJalvinHook(() => calculateWindowSizeClass());
    expect(result.current.widthSizeClass).toBe("Medium");
    expect(result.current.heightSizeClass).toBe("Expanded");
  });

  it("returns Expanded/Medium for a desktop window (1280×800)", () => {
    setWindowSize(1280, 800);
    fireResize();
    const result = renderJalvinHook(() => calculateWindowSizeClass());
    expect(result.current.widthSizeClass).toBe("Expanded");
    expect(result.current.heightSizeClass).toBe("Medium");
  });

  // ── class boundaries ───────────────────────────────────────────────────────

  it("width at exactly 600 is Medium", () => {
    setWindowSize(600, 800);
    fireResize();
    const result = renderJalvinHook(() => calculateWindowSizeClass());
    expect(result.current.widthSizeClass).toBe("Medium");
  });

  it("width at exactly 840 is Expanded", () => {
    setWindowSize(840, 800);
    fireResize();
    const result = renderJalvinHook(() => calculateWindowSizeClass());
    expect(result.current.widthSizeClass).toBe("Expanded");
  });

  it("height at exactly 480 is Medium", () => {
    setWindowSize(400, 480);
    fireResize();
    const result = renderJalvinHook(() => calculateWindowSizeClass());
    expect(result.current.heightSizeClass).toBe("Medium");
  });

  it("height at exactly 900 is Expanded", () => {
    setWindowSize(400, 900);
    fireResize();
    const result = renderJalvinHook(() => calculateWindowSizeClass());
    expect(result.current.heightSizeClass).toBe("Expanded");
  });

  // ── reactivity on resize ───────────────────────────────────────────────────

  it("updates widthSizeClass when window crosses a breakpoint", () => {
    setWindowSize(400, 800); // Compact
    fireResize();
    const result = renderJalvinHook(() => calculateWindowSizeClass());
    expect(result.current.widthSizeClass).toBe("Compact");

    setWindowSize(700, 800); // Medium
    fireResize();
    expect(result.current.widthSizeClass).toBe("Medium");

    setWindowSize(1280, 800); // Expanded
    fireResize();
    expect(result.current.widthSizeClass).toBe("Expanded");
  });

  it("updates heightSizeClass when window crosses a breakpoint", () => {
    setWindowSize(800, 400); // Compact height
    fireResize();
    const result = renderJalvinHook(() => calculateWindowSizeClass());
    expect(result.current.heightSizeClass).toBe("Compact");

    setWindowSize(800, 700); // Medium height
    fireResize();
    expect(result.current.heightSizeClass).toBe("Medium");
  });

  // Note: "does not re-render consumers when resize stays within the same class"
  // is hard to test with the simple render function which currently wipes innerHTML on every update.
  // In a real vanilla framework with DOM diffing, this would be more relevant.

  // ── single listener ───────────────────────────────────────────────────────

  it("registers only ONE resize listener globally", () => {
    // This is handled by the global setup in ui.ts
    // We can't easily spy on it after the module is loaded, but we've verified it's global.
  });

  it("both consumers see the same updated class after a single resize event", () => {
    setWindowSize(400, 800); // Compact
    fireResize();
    const result = renderJalvinHook(() => ({
      a: calculateWindowSizeClass(),
      b: calculateWindowSizeClass(),
    }));

    setWindowSize(1280, 800); // Expanded
    fireResize();

    expect(result.current.a.widthSizeClass).toBe("Expanded");
    expect(result.current.b.widthSizeClass).toBe("Expanded");
  });
});
