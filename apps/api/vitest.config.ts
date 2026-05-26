import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/__tests__/setup.ts"],
    coverage: {
      reporter: ["text", "html"],
      exclude: ["**/*.test.ts", "**/__tests__/**", "dist/**"]
    }
  }
});
