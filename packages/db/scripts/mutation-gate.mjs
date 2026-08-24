#!/usr/bin/env node
// packages/db/scripts/mutation-gate.mjs
//
// D-18/D-38: turns "the suite is green" into "the suite is green AND has been shown able to
// fail" -- applies each mutant in `packages/db/mutants/`, asserts the suite named in that
// mutant's own `-- TARGET:` header goes red, then restores with `supabase db reset` -- the
// authoritative restore. A hand-written revert can drift from the mutant; a reset cannot.
// Runtime cost is ~1 reset per mutant, confirmed empirically to also revert cluster-level
// state a mutant might touch (`alter role ... inherit`; local role passwords).
//
// Follows `scripts/migrate-dictionary.mjs`'s conventions: a doc header naming the decision,
// one line per step, a single clear failure message, non-zero exit, no new dependency. Guarded
// the same way `scripts/local-role-passwords.mjs` is guarded: refuses any host that is not
// 127.0.0.1:54322, so a mutant can never reach a hosted project.
//
// Usage:
//   pnpm db:mutation-gate
//
// Sequence:
//   1. Guard: local host/port only; refuse a bare CI run.
//   2. Reset to a clean, password-free baseline; confirm the pgTAP suite is green (a gate run
//      against a red baseline proves nothing).
//   3. Set local role passwords; confirm the local Vitest suite (`test/local`) is green.
//   4. For each `packages/db/mutants/*.sql` file, sorted:
//        a. apply it as the superuser, committed, not inside a transaction (pgTAP opens its
//           own connection and would never see an uncommitted mutant)
//        b. run every target its `-- TARGET:` header names and assert at least one goes red --
//           a mutant whose every listed target stays green prints `MUTANT SURVIVED` and marks
//           the gate failed
//        c. restore via `supabase db reset` (re-setting local role passwords before the next
//           mutant's Vitest target, if any -- a reset clears them along with everything else)
//   5. Final baseline re-check: after the last restore, confirm the pgTAP suite is green again
//      -- proof the restore left the database clean.
//   6. Print one summary line per mutant; exit 0 only if every mutant was killed and the final
//      restore is clean.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "..");
const MUTANTS_DIR = join(PACKAGE_ROOT, "mutants");

const REQUIRED_PORT = "54322";
const LOCAL_HOST_ALLOWLIST = new Set(["127.0.0.1", "localhost"]);
// Literal, hardcoded local connection string -- never built from argv or an environment
// variable, matching `local-role-passwords.mjs`'s own guard so a mutant can never reach
// anything but the local stack.
const LOCAL_ADMIN_CONNECTION_STRING = "postgres://postgres:postgres@127.0.0.1:54322/postgres";

function assertLocalTarget() {
  const url = new URL(LOCAL_ADMIN_CONNECTION_STRING);
  if (!LOCAL_HOST_ALLOWLIST.has(url.hostname) || url.port !== REQUIRED_PORT) {
    console.error("mutation-gate: refusing to run against a non-local database");
    process.exit(1);
  }
}

function assertNotBareCI() {
  if (process.env.CI && !process.env.ALLOW_LOCAL_ROLE_PASSWORDS) {
    console.error(
      "mutation-gate: refusing to run in CI without ALLOW_LOCAL_ROLE_PASSWORDS=1 (set explicitly by plan 03-06's job)",
    );
    process.exit(1);
  }
}

/** Runs a command from `PACKAGE_ROOT`, capturing output, never throwing on a non-zero exit. */
function run(cmd, args) {
  try {
    const stdout = execFileSync(cmd, args, { cwd: PACKAGE_ROOT, encoding: "utf8", stdio: "pipe" });
    return { ok: true, output: stdout };
  } catch (err) {
    return { ok: false, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

function resetDatabase() {
  const result = run("pnpm", ["run", "reset"]);
  if (!result.ok) {
    console.error("mutation-gate: supabase db reset failed");
    console.error(result.output);
    process.exit(1);
  }
}

function setLocalRolePasswords() {
  const result = run("pnpm", ["run", "local-roles"]);
  if (!result.ok) {
    console.error("mutation-gate: local-role-passwords.mjs failed");
    console.error(result.output);
    process.exit(1);
  }
}

function runPgTapSuite(files = []) {
  return run("pnpm", ["run", "test:db", ...files]);
}

function runVitestSuite(files = []) {
  return run("pnpm", ["exec", "vitest", "run", ...files]);
}

/** Parses the `-- TARGET: pgtap:<file> vitest:<file>` header line every mutant file carries. */
function parseTargets(mutantSql, name) {
  const line = mutantSql.split("\n").find((l) => l.trim().startsWith("-- TARGET:"));
  if (!line) {
    console.error(`mutation-gate: ${name} has no "-- TARGET:" header line -- cannot know which suite must go red`);
    process.exit(1);
  }
  const rest = line.replace(/^\s*--\s*TARGET:\s*/, "").trim();
  const pgtap = [];
  const vitest = [];
  for (const token of rest.split(/\s+/).filter(Boolean)) {
    if (token.startsWith("pgtap:")) pgtap.push(token.slice("pgtap:".length));
    else if (token.startsWith("vitest:")) vitest.push(token.slice("vitest:".length));
  }
  return { pgtap, vitest };
}

/** Applies one mutant file's SQL as the superuser -- one autocommitted statement batch, not a transaction. */
async function applyMutant(path) {
  const sql = postgres(LOCAL_ADMIN_CONNECTION_STRING, {
    max: 1,
    fetch_types: false,
    prepare: true,
    connect_timeout: 10,
  });
  try {
    await sql.unsafe(readFileSync(path, "utf8"));
  } finally {
    await sql.end();
  }
}

async function main() {
  assertLocalTarget();
  assertNotBareCI();

  console.log("mutation-gate: resetting to a clean baseline");
  resetDatabase();

  console.log("mutation-gate: baseline pgTAP suite");
  if (!runPgTapSuite().ok) {
    console.error("mutation-gate: baseline is not green (pgTAP) -- fix the suite before running the gate");
    process.exit(1);
  }

  console.log("mutation-gate: setting local role passwords for the Vitest local suite");
  setLocalRolePasswords();

  console.log("mutation-gate: baseline Vitest local suite");
  if (!runVitestSuite(["test/local"]).ok) {
    console.error("mutation-gate: baseline is not green (Vitest test/local) -- fix the suite before running the gate");
    process.exit(1);
  }

  const mutantFiles = readdirSync(MUTANTS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(MUTANTS_DIR, f));

  if (mutantFiles.length === 0) {
    console.error("mutation-gate: no mutant files found in packages/db/mutants/");
    process.exit(1);
  }

  const results = [];

  for (const path of mutantFiles) {
    const name = path.split("/").pop();
    const text = readFileSync(path, "utf8");
    const targets = parseTargets(text, name);

    console.log(`mutation-gate: applying ${name}`);
    await applyMutant(path);

    // Every target a mutant's header names must INDEPENDENTLY go red (AND, not OR) -- a
    // mutant with two listed targets exists because each one is supposed to be a working
    // detector for this exact class of bug on its own. OR semantics would let one target
    // silently regress to always-green as long as the other still caught the mutation,
    // masking exactly the coverage loss this gate exists to catch.
    const redTargets = [];
    const stillGreenTargets = [];
    if (targets.pgtap.length > 0) {
      const label = `pgtap:${targets.pgtap.join(",")}`;
      (runPgTapSuite(targets.pgtap).ok ? stillGreenTargets : redTargets).push(label);
    }
    if (targets.vitest.length > 0) {
      // A restore between mutants wipes local role passwords (ALTER ROLE PASSWORD is a
      // cluster-level statement, cleared along with the rest of the local cluster on
      // `db reset`) -- re-set them before any Vitest target that authenticates as
      // vamos_edge/vamos_public.
      setLocalRolePasswords();
      const label = `vitest:${targets.vitest.join(",")}`;
      (runVitestSuite(targets.vitest).ok ? stillGreenTargets : redTargets).push(label);
    }

    console.log("mutation-gate: restoring via supabase db reset");
    resetDatabase();

    const killed = stillGreenTargets.length === 0 && redTargets.length > 0;
    if (killed) {
      console.log(`mutation-gate: ${name} -- suite went red (${redTargets.join(", ")}) -- control effective`);
    } else {
      console.error(
        `MUTANT SURVIVED: ${name} -- the suite does not detect this bug` +
          (stillGreenTargets.length > 0 ? ` (still green: ${stillGreenTargets.join(", ")})` : ""),
      );
    }
    results.push({ name, killed });
  }

  console.log("mutation-gate: final baseline re-check after the last restore");
  const finalOk = runPgTapSuite().ok;
  if (!finalOk) {
    console.error("mutation-gate: baseline did not restore cleanly after the last mutant");
  }

  const survived = results.filter((r) => !r.killed);
  if (survived.length > 0 || !finalOk) {
    console.error(
      `mutation-gate: FAILED -- ${survived.length} mutant(s) survived` +
        (finalOk ? "" : ", and the final restore was not clean"),
    );
    process.exit(1);
  }

  console.log(`mutation-gate: PASSED -- ${results.length} mutant(s) killed, baseline restored`);
}

main();
