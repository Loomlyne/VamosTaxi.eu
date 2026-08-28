// packages/db/vitest.config.ts
//
// Node-environment unit-test runner for `@vamos/db` (D-13/D-14). Two suites live under
// `test/`: `test/local` runs database-free (this plan's contract test drives `withIdentity`
// through `opts.client`, no Docker required) and `test/deployed` is skipped unless
// `PROBE_BASE_URL` is set (plan 03-04/03-05). This package has no DOM and no Worker runtime
// to simulate — only Node-side SQL wiring — so `environment: "node"` alone covers it; no
// browser-emulation or Worker-emulation test tooling of any kind belongs in this config.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Gitignored local 03-07 credentials. Present on this laptop; absent in CI (which
// injects the same names). Load before config so deployed-test skip guards see them.
try {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env.03-07.local");
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx);
    if (process.env[key]) continue;
    let value = trimmed.slice(idx + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
} catch {
  // no local env file — skip guards stay skipped
}

const deployedEnv = {
  PROBE_BASE_URL: process.env["PROBE_BASE_URL"] ?? "",
  PROBE_SECRET: process.env["PROBE_SECRET"] ?? "",
  PROBE_MIN_ADJACENCY: process.env["PROBE_MIN_ADJACENCY"] ?? "",
  PROBE_REQUESTS: process.env["PROBE_REQUESTS"] ?? "",
  PROBE_CONCURRENCY: process.env["PROBE_CONCURRENCY"] ?? "",
  PROBE_HYPERDRIVE_CONFIG_ID: process.env["PROBE_HYPERDRIVE_CONFIG_ID"] ?? "",
  SUPABASE_URL: process.env["SUPABASE_URL"] ?? "",
  SUPABASE_STAGING_REF: process.env["SUPABASE_STAGING_REF"] ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",
  SUPABASE_ANON_KEY: process.env["SUPABASE_ANON_KEY"] ?? "",
  VAMOS_OWNER_URL: process.env["VAMOS_OWNER_URL"] ?? "",
  CF_ACCOUNT_ID: process.env["CF_ACCOUNT_ID"] ?? "",
  CF_ANALYTICS_TOKEN: process.env["CF_ANALYTICS_TOKEN"] ?? "",
  CLOUDFLARE_API_TOKEN: process.env["CLOUDFLARE_API_TOKEN"] ?? "",
  CLOUDFLARE_ACCOUNT_ID: process.env["CLOUDFLARE_ACCOUNT_ID"] ?? "",
};

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "forks",
    fileParallelism: false,
    testTimeout: 360_000,
    watch: false,
    env: Object.fromEntries(Object.entries(deployedEnv).filter(([, v]) => v !== "")),
  },
});
