// scripts/gate-walk.test.mjs
//
// The gate scripts walk apps/web. Extra Next build folders (`.next-<name>`, written by the
// visual specs and git-ignored) are build output, not source: a gate must not read them.
// On 2026-09-30 check:public-env ran for 35 minutes inside such folders.
// Each case drops a fixture that WOULD fail the gate into apps/web/.next-gate-walk-test
// and expects the gate to pass, i.e. to never look there.
//
// Run: node --test scripts/gate-walk.test.mjs

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const fixtureDir = join(repoRoot, "apps/web/.next-gate-walk-test/server");

before(() => {
  mkdirSync(fixtureDir, { recursive: true });
  // public-env: an identifier that is on no allowlist.
  // db fences: a raw postgres import outside the wrappers.
  writeFileSync(
    join(fixtureDir, "bundle.ts"),
    [
      'import postgres from "postgres";',
      "export const leak = process.env.NEXT_PUBLIC_GATE_WALK_FIXTURE;",
      "export const sql = postgres;",
      "",
    ].join("\n"),
  );
  writeFileSync(join(fixtureDir, "cache.pack.gz"), "NEXT_PUBLIC_GATE_WALK_FIXTURE_GZ\n");
});

after(() => {
  rmSync(join(repoRoot, "apps/web/.next-gate-walk-test"), { recursive: true, force: true });
});

function run(script) {
  return spawnSync(process.execPath, [join(repoRoot, "scripts", script)], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 120_000,
  });
}

// check-no-invented-numbers.mjs and check-i18n-coverage.mjs got the same skip; this fixture
// does not make them fail, so they are not listed (their walk was only slow, not wrong).
for (const script of ["check-next-public-allowlist.mjs", "check-db-access-fences.mjs"]) {
  test(`${script} does not read apps/web/.next-* build folders`, () => {
    const out = run(script);
    assert.equal(out.status, 0, `${script} failed:\n${out.stdout}\n${out.stderr}`.slice(0, 1500));
    assert.doesNotMatch(out.stdout + out.stderr, /next-gate-walk-test|GATE_WALK_FIXTURE/);
  });
}
