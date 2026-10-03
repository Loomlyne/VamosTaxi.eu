// packages/db/test/support/worker-client.ts
//
// D-07: a database test that exercises SQL the Worker calls opens its connection with the
// Worker's own postgres.js options. VT-26-0733 passed every test while live failed because the
// test client parsed arrays and the Worker's (`fetch_types: false`) does not.
//
// Why a mirror and not an import: `client()` in src/identity.ts is private and that file (and
// src/public.ts) is frozen for phase 26.0. The drift check below (`readSourceClientOptions`)
// compares this mirror with the source text, so a change there turns the parity test red.
// If the options change, update the mirror in the same change and tell the owner.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import postgres from "postgres";
import { pgArrayTypes } from "../../src/pg-types";

export const WORKER_IDENTITY_CLIENT_OPTIONS = {
  max: 1,
  fetch_types: false,
  types: pgArrayTypes,
  prepare: true,
  connect_timeout: 10,
} as const;

export const WORKER_PUBLIC_CLIENT_OPTIONS = {
  max: 5,
  fetch_types: false,
  types: pgArrayTypes,
  prepare: true,
  connect_timeout: 10,
} as const;

export type WorkerClientKind = "identity" | "public";

/**
 * Opens a client with exactly the Worker's options. `onnotice` only silences logs and is not a
 * parsing option; no other option may be added here.
 */
export function workerSql(url: string, kind: WorkerClientKind = "identity"): postgres.Sql {
  const options = kind === "identity" ? WORKER_IDENTITY_CLIENT_OPTIONS : WORKER_PUBLIC_CLIENT_OPTIONS;
  return postgres(url, { ...options, onnotice: () => undefined });
}

/** Loopback URL for the local test stack. Port comes from VAMOS_TEST_DB_PORT (default: CI stack 54322). */
export function testDbUrl(role: "owner" | "edge" | "public" = "owner"): string {
  const port = process.env.VAMOS_TEST_DB_PORT ?? "54322";
  const cred = role === "owner" ? "postgres:postgres" : role === "edge" ? "vamos_edge:vamos_edge" : "vamos_public:vamos_public";
  return `postgres://${cred}@127.0.0.1:${port}/postgres`;
}

/**
 * Finds packages/db/src/<file> by walking up from the cwd. No import.meta, so the helper also
 * loads under Playwright's CommonJS transform (apps/web specs).
 */
function sourcePath(file: string): string {
  let dir = process.cwd();
  for (;;) {
    const candidate = join(dir, "packages/db/src", file);
    if (existsSync(candidate)) return candidate;
    const local = join(dir, "src", file);
    if (existsSync(local) && existsSync(join(dir, "test/support/worker-client.ts"))) return local;
    const up = dirname(dir);
    if (up === dir) throw new Error(`worker-client: cannot locate packages/db/src/${file}`);
    dir = up;
  }
}

/**
 * Parses the options object literal the source passes to `postgres(connectionString, { ... })`
 * in identity.ts (`function client(`) or public.ts (`export function publicSql(`).
 * Number and boolean values are parsed as values; a bare identifier (e.g. `types: pgArrayTypes`)
 * is returned as its name, so a new or removed option object is caught as drift too.
 */
export function readSourceClientOptions(
  kind: WorkerClientKind,
  sourceText?: string,
): Record<string, number | boolean | string> {
  const text =
    sourceText ??
    readFileSync(sourcePath(kind === "identity" ? "identity.ts" : "public.ts"), "utf8");
  const marker = kind === "identity" ? "function client(" : "export function publicSql(";
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`worker-client: cannot find "${marker}" in the ${kind} source`);
  const match = /postgres\(\s*connectionString\s*,\s*\{([^}]*)\}/.exec(text.slice(start));
  if (!match) throw new Error(`worker-client: cannot find the postgres() options literal in the ${kind} source`);
  const out: Record<string, number | boolean | string> = {};
  for (const pair of match[1]!.matchAll(/(\w+)\s*:\s*([A-Za-z_$][\w$]*|\d+)\s*,?/g)) {
    const raw = pair[2]!;
    out[pair[1]!] =
      raw === "true" ? true : raw === "false" ? false : /^\d+$/.test(raw) ? Number(raw) : raw;
  }
  return out;
}
