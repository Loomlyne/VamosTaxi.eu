// apps/web/tests/support/test-stack.ts
//
// Single source for the throwaway test stack's URLs, keys and next-dev env (D-03).
// Why: other sessions run stacks on 543xx/553xx/563xx on this Mac, and a Linux runner has no
// developer home directory, so specs must never assume 54322 or load packages from another checkout.
//
// Env contract (exported by `scripts/local-test-stack.sh env|exec|e2e`):
//   VAMOS_TEST_DB_PORT, VAMOS_TEST_DB_URL / OPS_FIXTURE_DB_URL, SUPABASE_URL, SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY, VAMOS_TEST_MAIL_URL, VAMOS_SUPABASE_WORKDIR, REQUIRE_DB=1.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { WEB_ROOT } from "./server-harness";
import { assertThrowawayTestStack } from "../../../../packages/db/test/support/test-stack-guard";

export const REPO_ROOT = join(WEB_ROOT, "..", "..");

/** Resolves a package from this worktree, never from another checkout. */
export function requireFromWorktree(name: "postgres" | "@supabase/supabase-js"): unknown {
  const anchor =
    name === "postgres"
      ? join(REPO_ROOT, "packages/db/package.json")
      : join(WEB_ROOT, "package.json");
  return createRequire(anchor)(name);
}

function loopback(url: string, label: string): string {
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`${label} must be loopback (127.0.0.1/localhost), got ${host}`);
  }
  return url;
}

export function testDbPort(defaultPort = "54322"): string {
  return process.env.VAMOS_TEST_DB_PORT ?? defaultPort;
}

export function explicitDbUrl(): string | null {
  return process.env.VAMOS_TEST_DB_URL ?? process.env.OPS_FIXTURE_DB_URL ?? null;
}

function roleUrl(user: string): string {
  return loopback(`postgres://${user}:${user}@127.0.0.1:${testDbPort()}/postgres`, `${user} db url`);
}

export function ownerDbUrl(): string {
  const explicit = explicitDbUrl();
  return loopback(explicit ?? roleUrl("postgres"), "owner db url");
}

export function edgeDbUrl(): string {
  return roleUrl("vamos_edge");
}

export function publicDbUrl(): string {
  return roleUrl("vamos_public");
}

export function supabaseApiUrl(): string {
  return loopback(
    process.env.SUPABASE_URL ?? `http://127.0.0.1:${Number(testDbPort()) - 1}`,
    "SUPABASE_URL",
  );
}

export function mailUrl(): string {
  return loopback(
    process.env.VAMOS_TEST_MAIL_URL ?? `http://127.0.0.1:${Number(testDbPort()) + 2}`,
    "VAMOS_TEST_MAIL_URL",
  );
}

export function stackKeys(): { apiUrl: string; anonKey: string; serviceRoleKey: string } {
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (anon && service) return { apiUrl: supabaseApiUrl(), anonKey: anon, serviceRoleKey: service };
  const workdir = process.env.VAMOS_SUPABASE_WORKDIR ?? join(REPO_ROOT, "packages/db");
  let out: string;
  try {
    out = execFileSync(
      join(REPO_ROOT, "node_modules/.bin/supabase"),
      ["status", "-o", "env", "--workdir", workdir],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch {
    throw new Error("test stack is not running: start it with scripts/local-test-stack.sh");
  }
  const get = (k: string) => new RegExp(`^${k}="?([^"\\n]*)"?$`, "m").exec(out)?.[1];
  const anonKey = anon ?? get("ANON_KEY");
  const serviceRoleKey = service ?? get("SERVICE_ROLE_KEY");
  if (!anonKey || !serviceRoleKey) throw new Error("test stack is not running: no API keys found");
  return { apiUrl: get("API_URL") ?? supabaseApiUrl(), anonKey, serviceRoleKey };
}

export function hyperdriveEnv(): Record<string, string> {
  return {
    WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: publicDbUrl(),
    WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_NOCACHE: edgeDbUrl(),
  };
}

export function nextDevEnv(
  extra: Record<string, string> = {},
  opts: { gallery?: boolean } = {},
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...hyperdriveEnv(),
    SUPABASE_URL: supabaseApiUrl(),
    ...(opts.gallery ? { VAMOS_DEV_GALLERY: "1" } : {}),
    ...extra,
  };
}

/** True when a missing database must fail the run instead of skipping it. */
export function dbRequired(): boolean {
  return !!process.env.CI || process.env.REQUIRE_DB === "1";
}

/** Loopback + expected port + throwaway marker role, before any read. */
export async function requireTestStack(
  url: string = ownerDbUrl(),
  expectedPort: string = testDbPort(),
): Promise<void> {
  await assertThrowawayTestStack(url, expectedPort);
}
