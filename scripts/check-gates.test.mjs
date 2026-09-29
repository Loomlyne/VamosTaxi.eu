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

const ALLOWLIST = JSON.stringify({
  allowed_postgres_importers: [], allowed_reserve: [], allowed_end: [], allowed_unsafe: [],
  allowed_session_set: [], force_dynamic_exempt: [], isolate_memoisation_exempt: [],
});

test("fences gate: a value import of postgres fails however it is written", () => {
  for (const body of [
    'import postgres from "postgres";\n',
    'import postgres, {\n  type Sql,\n} from "postgres";\n',
    'export { default as pg } from "postgres";\n',
    'const pg = require("postgres");\n',
    'const pg = await import("postgres");\n',
  ]) {
    const r = runGate("check-db-access-fences.mjs", {
      "scripts/db-access-fence-allowlist.json": ALLOWLIST,
      "apps/web/lib/x.ts": body,
    });
    assert.equal(r.code, 1, `${body}\n${r.out}`);
    assert.match(r.out, /raw `postgres` import[^\n]*FAIL/);
  }
});

test("fences gate: type-only postgres imports pass", () => {
  const r = runGate("check-db-access-fences.mjs", {
    "scripts/db-access-fence-allowlist.json": ALLOWLIST,
    "apps/web/lib/x.ts": 'import type postgres from "postgres";\nimport type {\n  Sql,\n} from "postgres";\nimport a from "a"\nimport type b from "postgres"\n',
  });
  assert.equal(r.code, 0, r.out);
});

const MSG = (extra = {}) => ({
  "apps/web/i18n/messages/en.json": JSON.stringify({ a: { one: "One" }, b: { shared: "S" }, ...extra }),
  "apps/web/i18n/messages/de.json": JSON.stringify({ a: { one: "Eins" }, b: { shared: "S" }, ...extra }),
  "apps/web/i18n/messages/fr.json": JSON.stringify({ a: { one: "Un" }, b: { shared: "S" }, ...extra }),
  "apps/web/i18n/messages/ar.json": JSON.stringify({ a: { one: "واحد" }, b: { shared: "S" }, ...extra }),
});

test("i18n gate: a missing key is caught in object-form getTranslations, t.rich and a second scope", () => {
  for (const [name, body, miss] of [
    [
      "object form",
      'export async function P({ locale }) {\n  const t = await getTranslations({ locale, namespace: "a" });\n  return t("nope");\n}\n',
      "a.nope",
    ],
    [
      "t.rich",
      'export function C() {\n  const t = useTranslations("a");\n  return t.rich("nope", {});\n}\n',
      "a.nope",
    ],
    [
      "second scope, same variable name",
      'function A() {\n  const t = useTranslations("a");\n  return t("shared");\n}\nfunction B() {\n  const t = useTranslations("b");\n  return t("shared");\n}\n',
      "a.shared",
    ],
  ]) {
    const r = runGate("check-i18n-coverage.mjs", { ...MSG(), "apps/web/app/x.tsx": body });
    assert.equal(r.code, 1, `${name}: ${r.out}`);
    assert.ok(r.out.includes(`"${miss}"`), `${name}: ${r.out}`);
  }
});

test("i18n gate: correct calls in two scopes and t.has pass", () => {
  const r = runGate("check-i18n-coverage.mjs", {
    ...MSG(),
    "apps/web/app/x.tsx":
      'function A() {\n  const t = useTranslations("a");\n  return t("one");\n}\nfunction B() {\n  const t = useTranslations("b");\n  return t.has("whatever") ? t("shared") : null;\n}\n',
  });
  assert.equal(r.code, 0, r.out);
});

test("i18n gate: an empty translation counts as missing", () => {
  const files = MSG();
  files["apps/web/i18n/messages/de.json"] = JSON.stringify({ a: { one: "  " }, b: { shared: "S" } });
  const r = runGate("check-i18n-coverage.mjs", files);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /"a\.one"[^\n]*empty[^\n]*de\.json/);
});
