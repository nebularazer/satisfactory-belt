import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  plugins: [
    mode === "https" && {
      ...basicSsl({ name: "satisfactory-belt" }),
      apply: "serve" as const,
    },
    react(),
    tailwindcss(),
  ],
  // The layout engine loads on the first button click; prebundle it to avoid
  // a development-server reload interrupting that first arrangement.
  optimizeDeps: { include: ["elkjs/lib/elk-api.js"] },
  server: {
    host: "0.0.0.0",
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: "./src/test/setup.ts",
  },
}));
