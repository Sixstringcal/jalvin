import { describe, it, expect } from "vitest";
import { Random, Default, randomUUID } from "../stdlib/random.js";

// ---------------------------------------------------------------------------
// Random
// ---------------------------------------------------------------------------

describe("Random", () => {
  const rng = new Random();

  describe("nextInt", () => {
    it("no-arg: returns a non-negative integer", () => {
      for (let i = 0; i < 20; i++) {
        const n = rng.nextInt();
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(2_147_483_647);
        expect(Number.isInteger(n)).toBe(true);
      }
    });

    it("until: returns value in [0, until)", () => {
      for (let i = 0; i < 20; i++) {
        const n = rng.nextInt(10);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(10);
      }
    });

    it("from, until: returns value in [from, until)", () => {
      for (let i = 0; i < 20; i++) {
        const n = rng.nextInt(5, 15);
        expect(n).toBeGreaterThanOrEqual(5);
        expect(n).toBeLessThan(15);
      }
    });
  });

  describe("nextDouble / nextFloat", () => {
    it("returns a value in [0, 1)", () => {
      for (let i = 0; i < 10; i++) {
        const d = rng.nextDouble();
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThan(1);
      }
    });
  });

  describe("nextBoolean", () => {
    it("returns only true or false", () => {
      for (let i = 0; i < 20; i++) {
        expect(typeof rng.nextBoolean()).toBe("boolean");
      }
    });
  });

  describe("nextBytes", () => {
    it("returns a Uint8Array of the requested size", () => {
      const bytes = rng.nextBytes(16);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(16);
    });

    it("all byte values are in [0, 255]", () => {
      const bytes = rng.nextBytes(32);
      for (const b of bytes) {
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(255);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Default instance
// ---------------------------------------------------------------------------

describe("Default", () => {
  it("is a shared Random instance", () => {
    expect(Default).toBeInstanceOf(Random);
  });

  it("generates integers", () => {
    expect(Number.isInteger(Default.nextInt(100))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// randomUUID
// ---------------------------------------------------------------------------

describe("randomUUID", () => {
  it("returns a string in UUID v4 format", () => {
    const uuid = randomUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("returns different values on successive calls", () => {
    const a = randomUUID();
    const b = randomUUID();
    expect(a).not.toBe(b);
  });
});
