import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    environmentMatchGlobs: [
      // DOM-dependent tests (patch, render, nav) require a browser-like environment
      ["src/__tests__/dom.*.test.ts", "jsdom"],
      ["src/__tests__/ui.render.test.ts", "jsdom"],
      ["src/__tests__/nav.test.ts", "jsdom"],
    ],
    include: ["src/__tests__/**/*.test.ts"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**"],
      reporter: ["text", "lcov"],
    },
  },
});
