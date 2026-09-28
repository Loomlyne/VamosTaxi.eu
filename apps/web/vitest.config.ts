// apps/web/vitest.config.ts
//
// Node-environment unit-test runner for the pricing kernel and any later pure
// lib/** / tests/unit/** suites. Scoped deliberately away from the browser
// screenshot/integration gates (tests/visual/**, tests/integration/**) and
// away from pgTAP (packages/db owns the SQL suite). No DOM emulator, no watch
// default, no Cloudflare Workers pool tooling — Miniflare cannot see a
// Hyperdrive binding and Phase 4 unit tests must not need one.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "tests/unit/**/*.test.ts",
      "components/consent/**/*.test.ts",
    ],
    exclude: [
      "node_modules/**",
      "tests/visual/**",
      "tests/integration/**",
      "**/*.spec.ts",
    ],
    globalSetup: ["tests/support/sync-public.global-setup.ts"],
    pool: "forks",
    watch: false,
    // Wave 0 may land the runner before any test file exists; empty is green.
    passWithNoTests: true,
  },
});
