import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isEntryPoint, openNextDeployArgs, parseDeployArgs } from "./deploy-worker.mjs";

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

// Node keeps process.argv[1] as the symlink it was started with while import.meta.url is the real file, so a plain
// path comparison made a symlinked start exit 0 having done nothing: no refusal and no deploy.
test("started through a symlink to the file, a bare call still exits 2 with the refusal", () => {
  const script = resolve(dirname(fileURLToPath(import.meta.url)), "deploy-worker.mjs");
  const dir = mkdtempSync(join(tmpdir(), "deploy-worker-link-"));
  try {
    const link = join(dir, "deploy.mjs");
    symlinkSync(script, link);
    const r = spawnSync(process.execPath, [link], { encoding: "utf8" });
    assert.equal(r.status, 2, `exit ${r.status}, stderr: ${r.stderr}`);
    assert.match(r.stderr, /deploy: refused/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("started through a symlink to the scripts folder, a bare call still exits 2 with the refusal", () => {
  const scriptsDir = dirname(fileURLToPath(import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "deploy-worker-dirlink-"));
  try {
    const linkDir = join(dir, "scripts-link");
    symlinkSync(scriptsDir, linkDir);
    const r = spawnSync(process.execPath, [join(linkDir, "deploy-worker.mjs")], { encoding: "utf8" });
    assert.equal(r.status, 2, `exit ${r.status}, stderr: ${r.stderr}`);
    assert.match(r.stderr, /deploy: refused/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("isEntryPoint: the real file and a symlink to it count, another file and no argument do not", () => {
  const script = resolve(dirname(fileURLToPath(import.meta.url)), "deploy-worker.mjs");
  const url = pathToFileURL(script).href;
  const dir = mkdtempSync(join(tmpdir(), "deploy-worker-entry-"));
  try {
    const link = join(dir, "deploy.mjs");
    symlinkSync(script, link);
    assert.equal(isEntryPoint(script, url), true);
    assert.equal(isEntryPoint(link, url), true);
    assert.equal(isEntryPoint(fileURLToPath(import.meta.url), url), false);
    assert.equal(isEntryPoint(undefined, url), false);
    assert.equal(isEntryPoint(join(dir, "missing.mjs"), url), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
