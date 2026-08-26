// packages/db/vitest.config.ts
//
// Node-environment unit-test runner for `@vamos/db` (D-13/D-14). Two suites live under
// `test/`: `test/local` runs database-free (this plan's contract test drives `withIdentity`
// through `opts.client`, no Docker required) and `test/deployed` is skipped unless
// `PROBE_BASE_URL` is set (plan 03-04/03-05). This package has no DOM and no Worker runtime
// to simulate — only Node-side SQL wiring — so `environment: "node"` alone covers it; no
// browser-emulation or Worker-emulation test tooling of any kind belongs in this config.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "forks",
    fileParallelism: false,
    testTimeout: 60_000,
    watch: false,
  },
});
