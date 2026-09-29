// Fixture runs for the gate scripts: each test copies a gate into a scratch repo root
// (the gates resolve the repo from their own folder) and proves a known-bad tree fails.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Builds a scratch repo root holding `gate` plus the given files; returns the gate's result. */
function runGate(gate, files, args = []) {
  const root = mkdtempSync(join(tmpdir(), "vamos-gate-"));
  mkdirSync(join(root, "scripts"), { recursive: true });
  cpSync(join(here, gate), join(root, "scripts", gate));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  const r = spawnSync("node", [join(root, "scripts", gate), ...args], { encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
}

test("numbers gate: allowing 60 in quote/intent.ts does not allow other policy literals", () => {
  const r = runGate("check-no-invented-numbers.mjs", {
    "apps/web/lib/quote/intent.ts": "export const a = seconds / 60;\nexport const grace = 180;\n",
  });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /intent\.ts:2: policy literal 180/);
  assert.doesNotMatch(r.out, /intent\.ts:1:/);
});

test("numbers gate: the allowed 60 alone still passes", () => {
  const r = runGate("check-no-invented-numbers.mjs", {
    "apps/web/lib/quote/intent.ts": "export const a = seconds / 60;\n",
  });
  assert.equal(r.code, 0, r.out);
});

test("numbers gate: a CHF figure in a message file, a DC mock or a root entry file fails", () => {
  for (const [path, body] of [
    ["apps/web/i18n/messages/en.json", '{ "a": { "fare": "From CHF 45" } }\n'],
    ["app/home/home.dc.html", "<p>CHF&nbsp;45</p>\n"],
    ["packages/emails/src/x.tsx", "export const a = 'CHF45';\n"],
    ["apps/web/worker.ts", "const fare = 'CHF 45';\n"],
  ]) {
    const r = runGate("check-no-invented-numbers.mjs", { [path]: body });
    assert.equal(r.code, 1, `${path}: ${r.out}`);
    assert.match(r.out, /invented CHF figure/);
  }
});

test("numbers gate: CHF 000 placeholders pass everywhere", () => {
  const r = runGate("check-no-invented-numbers.mjs", {
    "apps/web/i18n/messages/en.json": '{ "a": "CHF 000" }\n',
    "app/home/home.dc.html": "<p>CHF 000</p>\n",
  });
  assert.equal(r.code, 0, r.out);
});
