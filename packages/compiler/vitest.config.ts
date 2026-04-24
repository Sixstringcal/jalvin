import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    // Serialise test files to avoid spinning up 5 concurrent workers.
    // With Node 25 + large dist modules, parallel workers cause OOM.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**"],
      reporter: ["text", "lcov"],
    },
  },
});
