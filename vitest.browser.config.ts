import { defineConfig } from "vitest/config";

// Real browsers through Playwright: one file at a time, each launches its own.
export default defineConfig({
  test: {
    include: ["tests/browser/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
