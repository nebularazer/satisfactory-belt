import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: [
            "packages/**/*.test.ts",
            "scripts/**/*.test.ts",
            "apps/web/src/lib/**/*.test.ts",
          ],
        },
      },
      "apps/web/vitest.config.ts",
    ],
  },
});
