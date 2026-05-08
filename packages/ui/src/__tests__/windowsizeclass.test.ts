import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { calculateWindowSizeClass, WindowSizeClassProvider } from "@jalvin/runtime";

function setWindowSize(width: number, height: number) {
  Object.defineProperty(window, "innerWidth",  { writable: true, configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: height });
}

function fireResize() {
  window.dispatchEvent(new Event("resize"));
}

/** Wraps the hook under test with WindowSizeClassProvider. */
const wrapper = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(WindowSizeClassProvider, null, children);

describe("calculateWindowSizeClass", () => {
  beforeEach(() => {
    setWindowSize(1280, 800);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── initial class from window size ─────────────────────────────────────────

  it("returns Compact/Medium for a phone-sized window (360×640)", () => {
    setWindowSize(360, 640);
    const { result } = renderHook(() => calculateWindowSizeClass(), { wrapper });
    expect(result.current.widthSizeClass).toBe("Compact");
    expect(result.current.heightSizeClass).toBe("Medium");
  });

  it("returns Medium/Compact for a landscape phone (667×375)", () => {
    setWindowSize(667, 375);
    const { result } = renderHook(() => calculateWindowSizeClass(), { wrapper });
    expect(result.current.widthSizeClass).toBe("Medium");
    expect(result.current.heightSizeClass).toBe("Compact");
  });

  it("returns Medium/Expanded for a tablet-sized window (768×1024)", () => {
    setWindowSize(768, 1024);
    const { result } = renderHook(() => calculateWindowSizeClass(), { wrapper });
    expect(result.current.widthSizeClass).toBe("Medium");
    expect(result.current.heightSizeClass).toBe("Expanded");
  });

  it("returns Expanded/Medium for a desktop window (1280×800)", () => {
    setWindowSize(1280, 800);
    const { result } = renderHook(() => calculateWindowSizeClass(), { wrapper });
    expect(result.current.widthSizeClass).toBe("Expanded");
    expect(result.current.heightSizeClass).toBe("Medium");
  });

  // ── class boundaries ───────────────────────────────────────────────────────

  it("width at exactly 600 is Medium", () => {
    setWindowSize(600, 800);
    const { result } = renderHook(() => calculateWindowSizeClass(), { wrapper });
    expect(result.current.widthSizeClass).toBe("Medium");
  });

  it("width at exactly 840 is Expanded", () => {
    setWindowSize(840, 800);
    const { result } = renderHook(() => calculateWindowSizeClass(), { wrapper });
    expect(result.current.widthSizeClass).toBe("Expanded");
  });

  it("height at exactly 480 is Medium", () => {
    setWindowSize(400, 480);
    const { result } = renderHook(() => calculateWindowSizeClass(), { wrapper });
    expect(result.current.heightSizeClass).toBe("Medium");
  });

  it("height at exactly 900 is Expanded", () => {
    setWindowSize(400, 900);
    const { result } = renderHook(() => calculateWindowSizeClass(), { wrapper });
    expect(result.current.heightSizeClass).toBe("Expanded");
  });

  // ── reactivity on resize ───────────────────────────────────────────────────

  it("updates widthSizeClass when window crosses a breakpoint", () => {
    setWindowSize(400, 800); // Compact
    const { result } = renderHook(() => calculateWindowSizeClass(), { wrapper });
    expect(result.current.widthSizeClass).toBe("Compact");

    act(() => {
      setWindowSize(700, 800); // Medium
      fireResize();
    });
    expect(result.current.widthSizeClass).toBe("Medium");

    act(() => {
      setWindowSize(1280, 800); // Expanded
      fireResize();
    });
    expect(result.current.widthSizeClass).toBe("Expanded");
  });

  it("updates heightSizeClass when window crosses a breakpoint", () => {
    setWindowSize(800, 400); // Compact height
    const { result } = renderHook(() => calculateWindowSizeClass(), { wrapper });
    expect(result.current.heightSizeClass).toBe("Compact");

    act(() => {
      setWindowSize(800, 700); // Medium height
      fireResize();
    });
    expect(result.current.heightSizeClass).toBe("Medium");
  });

  it("does not re-render consumers when resize stays within the same class", () => {
    setWindowSize(400, 800);
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount++;
      return calculateWindowSizeClass();
    }, { wrapper });
    const baseRenders = renderCount;

    act(() => {
      setWindowSize(450, 800); // still Compact — no class change
      fireResize();
    });
    expect(result.current.widthSizeClass).toBe("Compact");
    expect(renderCount).toBe(baseRenders);
  });

  // ── single listener (regression for multi-consumer crash) ─────────────────

  it("registers only ONE resize listener even when multiple consumers call the hook", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    setWindowSize(1280, 800);

    // Two independent hooks, both under the same provider.
    renderHook(
      () => {
        calculateWindowSizeClass(); // consumer 1
        calculateWindowSizeClass(); // consumer 2
      },
      { wrapper },
    );

    const resizeListenerCount = addSpy.mock.calls.filter(([event]) => event === "resize").length;
    expect(resizeListenerCount).toBe(1);
  });

  it("both consumers see the same updated class after a single resize event", () => {
    setWindowSize(400, 800); // Compact
    const { result } = renderHook(
      () => ({
        a: calculateWindowSizeClass(),
        b: calculateWindowSizeClass(),
      }),
      { wrapper },
    );

    act(() => {
      setWindowSize(1280, 800); // Expanded
      fireResize();
    });

    expect(result.current.a.widthSizeClass).toBe("Expanded");
    expect(result.current.b.widthSizeClass).toBe("Expanded");
  });

  // ── cleanup ────────────────────────────────────────────────────────────────

  it("removes the resize listener when the provider unmounts", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => calculateWindowSizeClass(), { wrapper });
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
  });
});
