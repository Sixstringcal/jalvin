import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    alias: {
      "@jalvin/runtime": path.resolve(__dirname, "../runtime/src/index.ts")
    }
  },
});
