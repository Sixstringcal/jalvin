import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { calculateWindowSizeClass } from "@jalvin/runtime";

function setWindowSize(width: number, height: number) {
  Object.defineProperty(window, "innerWidth",  { writable: true, configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: height });
}

function fireResize() {
  window.dispatchEvent(new Event("resize"));
}

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
    const { result } = renderHook(() => calculateWindowSizeClass());
    expect(result.current.widthSizeClass).toBe("Compact");
    expect(result.current.heightSizeClass).toBe("Medium");
  });

  it("returns Compact/Compact for a landscape phone (667×375)", () => {
    setWindowSize(667, 375);
    const { result } = renderHook(() => calculateWindowSizeClass());
    expect(result.current.widthSizeClass).toBe("Medium");
    expect(result.current.heightSizeClass).toBe("Compact");
  });

  it("returns Medium/Medium for a tablet-sized window (768×1024)", () => {
    setWindowSize(768, 1024);
    const { result } = renderHook(() => calculateWindowSizeClass());
    expect(result.current.widthSizeClass).toBe("Medium");
    expect(result.current.heightSizeClass).toBe("Expanded");
  });

  it("returns Expanded/Expanded for a desktop window (1280×800)", () => {
    setWindowSize(1280, 800);
    const { result } = renderHook(() => calculateWindowSizeClass());
    expect(result.current.widthSizeClass).toBe("Expanded");
    expect(result.current.heightSizeClass).toBe("Medium");
  });

  // ── class boundaries ───────────────────────────────────────────────────────

  it("width at exactly 600 is Medium", () => {
    setWindowSize(600, 800);
    const { result } = renderHook(() => calculateWindowSizeClass());
    expect(result.current.widthSizeClass).toBe("Medium");
  });

  it("width at exactly 840 is Expanded", () => {
    setWindowSize(840, 800);
    const { result } = renderHook(() => calculateWindowSizeClass());
    expect(result.current.widthSizeClass).toBe("Expanded");
  });

  it("height at exactly 480 is Medium", () => {
    setWindowSize(400, 480);
    const { result } = renderHook(() => calculateWindowSizeClass());
    expect(result.current.heightSizeClass).toBe("Medium");
  });

  it("height at exactly 900 is Expanded", () => {
    setWindowSize(400, 900);
    const { result } = renderHook(() => calculateWindowSizeClass());
    expect(result.current.heightSizeClass).toBe("Expanded");
  });

  // ── reactivity on resize ───────────────────────────────────────────────────

  it("updates widthSizeClass when window crosses a breakpoint", () => {
    setWindowSize(400, 800); // Compact
    const { result } = renderHook(() => calculateWindowSizeClass());
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
    const { result } = renderHook(() => calculateWindowSizeClass());
    expect(result.current.heightSizeClass).toBe("Compact");

    act(() => {
      setWindowSize(800, 700); // Medium height
      fireResize();
    });
    expect(result.current.heightSizeClass).toBe("Medium");
  });

  it("does not re-render when resize stays within the same class", () => {
    setWindowSize(400, 800);
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount++;
      return calculateWindowSizeClass();
    });
    const baseRenders = renderCount;

    act(() => {
      setWindowSize(450, 800); // still Compact
      fireResize();
    });
    expect(result.current.widthSizeClass).toBe("Compact");
    expect(renderCount).toBe(baseRenders); // no extra render
  });

  // ── cleanup ────────────────────────────────────────────────────────────────

  it("removes the resize listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => calculateWindowSizeClass());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
  });
});
