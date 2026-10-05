import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openNextDeployArgs, parseDeployArgs } from "./deploy-worker.mjs";

test("a bare deploy is refused (the 2026-10-01 stray Worker vamos-web)", () => {
  const r = parseDeployArgs([]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /No environment named/);
});

test("--env staging is accepted in every spelling and passed on to wrangler", () => {
  assert.deepEqual(parseDeployArgs(["--env", "staging"]), { ok: true, env: "staging", args: ["--env", "staging"] });
  assert.deepEqual(parseDeployArgs(["--", "--env", "staging"]), { ok: true, env: "staging", args: ["--env", "staging"] });
  assert.equal(parseDeployArgs(["--env=staging"]).ok, true);
  assert.equal(parseDeployArgs(["-e", "staging"]).ok, true);
});

test("the upload keeps the form every deploy of Worker vamos has used", () => {
  const r = parseDeployArgs(["--", "--env", "staging"]);
  assert.equal(r.ok, true);
  assert.deepEqual(openNextDeployArgs(r.args), ["deploy", "--", "--env", "staging"]);
});

test("a flag in place of the environment name is refused", () => {
  assert.equal(parseDeployArgs(["--env"]).ok, false);
  assert.equal(parseDeployArgs(["--env", "--dry-run"]).ok, false);
  assert.equal(parseDeployArgs(["--env="]).ok, false);
});

test("production, front and ops-changes are not deployable", () => {
  for (const env of ["production", "front", "ops-changes", "vamos"]) {
    const r = parseDeployArgs(["--env", env]);
    assert.equal(r.ok, false, env);
    assert.match(r.reason, /not deployable/);
  }
});

test("two --env flags are refused", () => {
  assert.equal(parseDeployArgs(["--env", "staging", "--env", "production"]).ok, false);
});

test("run as a command, a bare call exits 2 before any build starts", () => {
  const script = resolve(dirname(fileURLToPath(import.meta.url)), "deploy-worker.mjs");
  const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /deploy: refused/);
});
