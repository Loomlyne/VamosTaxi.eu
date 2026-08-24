#!/usr/bin/env node
// packages/db/scripts/local-role-passwords.mjs
//
// D-04's local-only credential bootstrap. Migration 20260823000002_roles_and_helpers.sql
// creates `vamos_edge` and `vamos_public` as LOGIN NOINHERIT with NO password clause — the
// Supabase CLI does not expand psql `:'var'` substitution inside a migration file, so a
// literal password there would either commit a secret or fail to resolve at apply time (see
// packages/db/README.md "Role-password procedure"). Until this script runs against the local
// stack, NEITHER role can authenticate at all, which blocks every Phase 3 local test that
// logs in as an identity role.
//
// The two passwords set below (`vamos_edge` / `vamos_public`) are fixed, committed, LOCAL
// development credentials — they match the `localConnectionString` values plan 03-03 writes
// into `apps/web/wrangler.jsonc`
// (`postgres://vamos_edge:vamos_edge@127.0.0.1:54322/postgres` and the `vamos_public`
// equivalent) and only ever reach a Docker container bound to 127.0.0.1. This is not a leaked
// secret; hosted passwords stay owner-held and out-of-band (plan 03-07), and the guard below
// refuses to run against anything but the local stack on port 54322.
//
// Usage:
//   pnpm db:local-roles                                     # after every fresh `pnpm db:start`
//   node packages/db/scripts/local-role-passwords.mjs --help
//
// `pnpm db:reset` alone does NOT need this re-run: Postgres roles are cluster-level objects
// that survive `supabase db reset` (which only drops and recreates the DATABASE), so the
// password set here survives a reset. It does NOT survive a `db:stop` / `db:start` cycle,
// which tears down the Postgres container itself — run this again after every restart.

import postgres from "postgres";

const HELP = process.argv.includes("--help") || process.argv.includes("-h");

const REQUIRED_PORT = "54322";
const LOCAL_HOST_ALLOWLIST = new Set(["127.0.0.1", "localhost"]);
// Literal, hardcoded local connection string — never built from argv or an environment
// variable, so there is no way to point this script at anything but the local stack.
const LOCAL_ADMIN_CONNECTION_STRING = "postgres://postgres:postgres@127.0.0.1:54322/postgres";

function printHelp() {
  console.log(`local-role-passwords.mjs — set local dev passwords for vamos_edge / vamos_public

Usage: node packages/db/scripts/local-role-passwords.mjs

Runs two literal "alter role ... password ..." statements against the local Docker Postgres
(127.0.0.1:${REQUIRED_PORT}) started by \`pnpm db:start\`. Refuses to run against anything else
(non-local host/port, or CI without ALLOW_LOCAL_ROLE_PASSWORDS=1). No password is ever read
from an argument or an environment variable — both are fixed local development credentials.`);
}

function assertLocalTarget() {
  const url = new URL(LOCAL_ADMIN_CONNECTION_STRING);
  if (!LOCAL_HOST_ALLOWLIST.has(url.hostname) || url.port !== REQUIRED_PORT) {
    console.error("refusing to run against a non-local database");
    process.exit(1);
  }
}

function assertNotBareCI() {
  // CI wires ALLOW_LOCAL_ROLE_PASSWORDS explicitly (plan 03-06) — a bare `CI=true` run never
  // gets here by accident.
  if (process.env.CI && !process.env.ALLOW_LOCAL_ROLE_PASSWORDS) {
    console.error(
      "refusing to run in CI without ALLOW_LOCAL_ROLE_PASSWORDS=1 (set explicitly by plan 03-06's job)",
    );
    process.exit(1);
  }
}

async function main() {
  if (HELP) {
    printHelp();
    return;
  }

  assertLocalTarget();
  assertNotBareCI();

  const sql = postgres(LOCAL_ADMIN_CONNECTION_STRING, {
    max: 1,
    fetch_types: false,
    prepare: true,
    connect_timeout: 10,
  });

  try {
    // Two literal, non-interpolated statement strings — never built from an argument or an
    // environment variable, so there is no injection surface and no secret ever flows through
    // argv or the environment.
    await sql.unsafe("alter role vamos_edge password 'vamos_edge'");
    console.log("local-role-passwords: set password for vamos_edge");

    await sql.unsafe("alter role vamos_public password 'vamos_public'");
    console.log("local-role-passwords: set password for vamos_public");
  } catch (err) {
    console.error(
      `local-role-passwords: failed to set local role passwords — is \`pnpm db:start\` running? (${err.message})`,
    );
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
