import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // evals/ = pure-function unit tests; convex/ = convex-test runtime tests.
    include: ["evals/**/*.test.ts", "convex/**/*.test.ts"],
  },
});
