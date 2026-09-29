// apps/web/vitest.config.ts
//
// Node-environment unit-test runner for the pricing kernel and any later pure
// lib/** / tests/unit/** suites. Scoped deliberately away from the browser
// screenshot/integration gates (tests/visual/**, tests/integration/**) and
// away from pgTAP (packages/db owns the SQL suite). No DOM emulator, no watch
// default, no Cloudflare Workers pool tooling — Miniflare cannot see a
// Hyperdrive binding and Phase 4 unit tests must not need one.

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Same "@/" alias as tsconfig so lib modules that import "@/…" load under test.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // 26.3-19: component tests render with react-dom/server; tsconfig keeps `jsx: preserve`.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "tests/unit/**/*.test.ts",
      "components/consent/**/*.test.ts",
      "components/checkout/**/*.test.tsx",
    ],
    exclude: [
      "node_modules/**",
      "tests/visual/**",
      "tests/integration/**",
      "**/*.spec.ts",
    ],
    pool: "forks",
    watch: false,
    // Wave 0 may land the runner before any test file exists; empty is green.
    passWithNoTests: true,
  },
});
