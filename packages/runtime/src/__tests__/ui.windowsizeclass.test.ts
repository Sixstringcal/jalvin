import { describe, it, expect } from "vitest";
import { widthToSizeClass, heightToSizeClass } from "../ui.js";

// ── widthToSizeClass ──────────────────────────────────────────────────────────

describe("widthToSizeClass", () => {
  it("returns Compact for widths below 600", () => {
    expect(widthToSizeClass(0)).toBe("Compact");
    expect(widthToSizeClass(320)).toBe("Compact");
    expect(widthToSizeClass(599)).toBe("Compact");
  });

  it("returns Medium at the 600dp boundary", () => {
    expect(widthToSizeClass(600)).toBe("Medium");
  });

  it("returns Medium for widths 600–839", () => {
    expect(widthToSizeClass(600)).toBe("Medium");
    expect(widthToSizeClass(720)).toBe("Medium");
    expect(widthToSizeClass(839)).toBe("Medium");
  });

  it("returns Expanded at the 840dp boundary", () => {
    expect(widthToSizeClass(840)).toBe("Expanded");
  });

  it("returns Expanded for widths 840 and above", () => {
    expect(widthToSizeClass(840)).toBe("Expanded");
    expect(widthToSizeClass(1280)).toBe("Expanded");
    expect(widthToSizeClass(1920)).toBe("Expanded");
  });
});

// ── heightToSizeClass ─────────────────────────────────────────────────────────

describe("heightToSizeClass", () => {
  it("returns Compact for heights below 480", () => {
    expect(heightToSizeClass(0)).toBe("Compact");
    expect(heightToSizeClass(360)).toBe("Compact");
    expect(heightToSizeClass(479)).toBe("Compact");
  });

  it("returns Medium at the 480dp boundary", () => {
    expect(heightToSizeClass(480)).toBe("Medium");
  });

  it("returns Medium for heights 480–899", () => {
    expect(heightToSizeClass(480)).toBe("Medium");
    expect(heightToSizeClass(667)).toBe("Medium");
    expect(heightToSizeClass(899)).toBe("Medium");
  });

  it("returns Expanded at the 900dp boundary", () => {
    expect(heightToSizeClass(900)).toBe("Expanded");
  });

  it("returns Expanded for heights 900 and above", () => {
    expect(heightToSizeClass(900)).toBe("Expanded");
    expect(heightToSizeClass(1080)).toBe("Expanded");
    expect(heightToSizeClass(1440)).toBe("Expanded");
  });
});
