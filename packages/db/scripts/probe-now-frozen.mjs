#!/usr/bin/env node
// packages/db/scripts/probe-now-frozen.mjs
//
// D-49 / U46: prove whether `now()` is frozen at transaction start across
// sequential `sql.begin` awaits. The checkout-intent lock re-check (plan 04-14)
// takes its shape from this result:
//
//   equal instants → step 3 may compare lock.exp against `now()` inside the
//                    write transaction after other awaits
//   unequal        → fallback: read the deadline from a SINGLE select and
//                    pass it forward; that fallback is what ships
//
// Direct Postgres on 127.0.0.1:54322 — never the pooler, never a pinned
// connection (Phase 3: a cold pin hangs; a pinned handle has no `.begin()`).
// One `sql.begin`, three sequential awaits, two printed instants, exit 0
// only when they are equal.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

async function loadPostgres() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    for (const rel of [
      "node_modules/postgres/src/index.js",
      "node_modules/postgres/cjs/src/index.js",
      "packages/db/node_modules/postgres/src/index.js",
    ]) {
      const candidate = join(dir, rel);
      if (existsSync(candidate)) {
        return (await import(pathToFileURL(candidate).href)).default;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("probe-now-frozen: cannot resolve the postgres package");
}

const REQUIRED_PORT = "54322";
const LOCAL_HOST_ALLOWLIST = new Set(["127.0.0.1", "localhost"]);
// Literal local admin URL — same target as local-role-passwords.mjs.
// Never built from argv or an environment variable.
const LOCAL_ADMIN_CONNECTION_STRING =
  "postgres://postgres:postgres@127.0.0.1:54322/postgres";

function assertLocalTarget() {
  const url = new URL(LOCAL_ADMIN_CONNECTION_STRING);
  if (!LOCAL_HOST_ALLOWLIST.has(url.hostname) || url.port !== REQUIRED_PORT) {
    console.error("probe-now-frozen: refusing to run against a non-local database");
    process.exit(1);
  }
}

function asText(value) {
  if (value == null) return String(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

async function main() {
  assertLocalTarget();

  const postgres = await loadPostgres();

  const sql = postgres(LOCAL_ADMIN_CONNECTION_STRING, {
    max: 1,
    fetch_types: false,
    prepare: true,
    connect_timeout: 10,
  });

  let t0;
  let t1;
  try {
    await sql.begin(async (tx) => {
      const first = await tx`select now()::text as t`;
      t0 = asText(first[0]?.t);
      await tx`select pg_sleep(2)`;
      const second = await tx`select now()::text as t`;
      t1 = asText(second[0]?.t);
    });
  } catch (err) {
    console.error(
      `probe-now-frozen: failed — is local Postgres on 127.0.0.1:${REQUIRED_PORT} up? (${err.message})`,
    );
    process.exit(1);
  } finally {
    await sql.end({ timeout: 2 });
  }

  console.log(`probe-now-frozen: t0=${t0}`);
  console.log(`probe-now-frozen: t1=${t1}`);

  if (t0 === t1) {
    console.log("probe-now-frozen: FROZEN=yes (now() equal across sequential awaits)");
    process.exit(0);
  }

  console.error(`probe-now-frozen: FROZEN=no DIFF t0=${t0} t1=${t1}`);
  console.error(
    "probe-now-frozen: fallback — take the deadline from a single select and pass it forward",
  );
  process.exit(1);
}

main();
