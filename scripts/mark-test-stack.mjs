#!/usr/bin/env node
// Creates the throwaway-stack marker role on a LOOPBACK database only.
// Usage: node scripts/mark-test-stack.mjs <postgres url>
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.argv[2];
if (!url) {
  console.error("usage: mark-test-stack.mjs <postgres url>");
  process.exit(2);
}
const host = new URL(url).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  console.error(`refusing: ${host} is not loopback`);
  process.exit(1);
}
const require = createRequire(join(root, "packages/db/package.json"));
const postgres = require("postgres");
const sql = postgres(url, { max: 1, connect_timeout: 10 });
try {
  await sql.unsafe(
    "do $$ begin if not exists (select 1 from pg_roles where rolname = 'vamos_throwaway_test_stack') then create role vamos_throwaway_test_stack nologin; end if; end $$",
  );
  await sql.unsafe(
    "comment on role vamos_throwaway_test_stack is 'throwaway test stack marker - never on a hosted project'",
  );
  console.log("marker role present");
} finally {
  await sql.end();
}
