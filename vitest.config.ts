import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/index.ts",
        "src/container.ts",
        "src/transport/**",
        // Presentation / wiring exercised at runtime, not in unit tests:
        "src/resources/**",
        "src/prompts/**",
        "src/observability/logger.ts",
        "src/types.ts",
      ],
      thresholds: {
        lines: 75,
        functions: 70,
        branches: 60,
        statements: 75,
      },
    },
  },
});
