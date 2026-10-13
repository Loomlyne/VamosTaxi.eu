// scripts/i18n-fill.test.mjs
//
// Phase 32 (plan 09): `pnpm i18n:fill` on a fixture tree with a stubbed Workers AI binding. No network,
// no billed call. Run: node --test scripts/i18n-fill.test.mjs

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const FILL = join(scriptDir, "i18n-fill.mjs");
const SMOKE = join(scriptDir, "i18n-smoke.mjs");

/** Canned, correct translations the stub answers with (the real guard checks them). */
const CANNED = {
  "Pick a seat": { de: "Wählen Sie einen Sitz", fr: "Choisissez un siège", ar: "اختر مقعدًا" },
  "Save the date": { de: "Datum speichern", fr: "Enregistrer la date", ar: "احفظ التاريخ" },
  "Your driver waits": { de: "Ihr Fahrer wartet", fr: "Votre chauffeur attend", ar: "سائقك ينتظرك" },
  "Open the door": { de: "Öffnen Sie die Tür", fr: "Ouvrez la porte", ar: "افتح الباب" },
  "Close the window": { de: "Schliessen Sie das Fenster", fr: "Fermez la fenêtre", ar: "أغلق النافذة" },
  "Choose a time": { de: "Wählen Sie eine Zeit", fr: "Choisissez une heure", ar: "اختر وقتًا" },
  "Check the flight number": { de: "Prüfen Sie die Flugnummer", fr: "Vérifiez le numéro de vol", ar: "تحقق من رقم الرحلة" },
  "Add a note": { de: "Notiz hinzufügen", fr: "Ajouter une note", ar: "أضف ملاحظة" },
};

const STUB = `
import { appendFileSync } from "node:fs";
const CANNED = ${JSON.stringify(CANNED)};
let inflight = 0;
export const ai = {
  async run(model, input) {
    inflight += 1;
    const user = JSON.parse(input.messages[1].content);
    appendFileSync(process.env.STUB_LOG, JSON.stringify({ model, inflight, keys: Object.keys(user), text: user.text, targets: user.targets }) + "\\n");
    await new Promise((r) => setTimeout(r, 40));
    inflight -= 1;
    const row = CANNED[user.text];
    if (!row) return { choices: [{ message: { content: "{}", refusal: null }, finish_reason: "stop" }] };
    const out = {};
    for (const t of user.targets) out[t] = row[t];
    return { choices: [{ message: { content: JSON.stringify(out), refusal: null }, finish_reason: "stop" }] };
  },
};
`;

const DICT = `/* fixture dictionary */
(function () {
  var DICT = {
    langs: ['en', 'de', 'fr', 'ar'],
    patterns: [ { re: /^Order (\\d+)$/, de: 'Bestellung $1', fr: 'Commande $1', ar: 'طلب $1' } ],
    strings: {
      "Pick a seat": { de: "Sitz wählen", ar: "اختر مقعدا" },
      "Done": { de: "Fertig", fr: "Terminé", ar: "تم" },
      "Same": { de: "Same", fr: "Same", ar: "Same" },
      "Open the door": {},
      "Close the window": {},
      "Choose a time": {},
      "Check the flight number": {},
      "Add a note": {},
      "Reject me please": {},
      "Terms line here": {},
      "policy number": {},
      "Order 12": {}
    }
  };
  (function () {
    var S = DICT.strings, P = DICT.patterns;
    S["Later"] = { de: "Später", fr: "Plus tard", ar: "لاحقًا" };
  })();
  window.VamosI18n = DICT;
})();
`;

function json(o) {
  return `${JSON.stringify(o, null, 2)}\n`;
}

function writeTree(root) {
  const put = (rel, text) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  put("app/vamos-i18n-dict.js", DICT);
  put("app/pages/terms.dc.html", `<main data-vt-legal="en de fr ar"><p>Terms line here</p></main>\n`);
  put("app/pages/plain.dc.html", `<main><p>Welcome</p><span data-tok>policy number</span></main>\n`);
  const msgEn = {
    common: { save: "Save the date", ok: "OK", same: "Same" },
    legal: { terms: "Legal terms text" },
    cookies: { row: "Cookie row text" },
    about: { pending: "Pending thing", cited: "Cited line", free: "Your driver waits" },
    $meta: { pendingValueKeys: ["about.pending"], noParamKeys: { "about.cited": "owner text, see decision file" } },
  };
  put("apps/web/i18n/messages/en.json", json(msgEn));
  put("apps/web/i18n/messages/de.json", json({ common: { save: "Datum sichern", ok: "OK", same: "Same" }, about: { free: "Ihr Fahrer wartet bereits" } }));
  put("apps/web/i18n/messages/fr.json", json({ common: { save: "Garder", ok: "OK", same: "Same" } }));
  put("apps/web/i18n/messages/ar.json", json({ common: { ok: "OK", same: "Same" } }));
  const emEn = { subject: "Booked", note: "Add a note" };
  put("packages/emails/src/messages/en.json", json(emEn));
  put("packages/emails/src/messages/de.json", json({ subject: "Gebucht", note: "Notiz" }));
  put("packages/emails/src/messages/fr.json", json({ subject: "Réservé" }));
  put("packages/emails/src/messages/ar.json", json({ subject: "تم الحجز", note: "ملاحظة" }));
}

function snapshot(root) {
  const out = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, name.name);
      if (name.isDirectory()) walk(p);
      else out[p.slice(root.length)] = readFileSync(p, "utf8");
    }
  };
  walk(root);
  return out;
}

function run(root, args, env = {}) {
  return spawnSync(process.execPath, [FILL, "--root", root, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("i18n:fill", () => {
  let tmp;
  let root;
  let stub;
  let log;

  before(() => {
    tmp = mkdtempSync(join(tmpdir(), "i18n-fill-"));
    root = join(tmp, "tree");
    mkdirSync(root);
    writeTree(root);
    stub = join(tmp, "stub.mjs");
    log = join(tmp, "calls.jsonl");
    writeFileSync(stub, STUB);
    writeFileSync(log, "");
  });
  after(() => rmSync(tmp, { recursive: true, force: true }));

  it("--check (default) lists the gaps, skips every never-translate source, and changes nothing", () => {
    const before = snapshot(root);
    const r = run(root, []);
    assert.equal(r.status, 0, r.stderr);
    const lines = r.stdout.trim().split("\n");
    const keys = lines.filter((l) => !l.startsWith("total:")).map((l) => l.split("\t")[1]);
    for (const k of ["Pick a seat", "Open the door", "Reject me please", "common.save", "about.free", "note"]) {
      assert.ok(keys.includes(k), `gap ${k} listed`);
    }
    assert.ok(lines.some((l) => l === "dict\tPick a seat\tfr"), "only the missing language is listed");
    for (const k of ["Same", "Done", "Terms line here", "policy number", "Order 12", "legal.terms", "cookies.row", "about.pending", "about.cited", "common.ok"]) {
      assert.ok(!keys.includes(k), `denied or complete ${k} not listed`);
    }
    assert.match(lines.at(-1), /^total: \d+ strings, \d+ language gaps/);
    assert.deepEqual(snapshot(root), before);
    assert.equal(run(root, ["--check"]).status, 0);
  });

  it("--write without --yes-billed exits non-zero and changes nothing", () => {
    const before = snapshot(root);
    for (const extra of [[], ["--ai-stub", stub]]) {
      const r = run(root, ["--write", ...extra], { STUB_LOG: log });
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /--yes-billed/);
    }
    assert.deepEqual(snapshot(root), before);
    assert.equal(readFileSync(log, "utf8"), "");
  });

  it("--write fills only gaps through single guarded calls, 2 in flight at most, and leaves rejected gaps", () => {
    const before = snapshot(root);
    const r = run(root, ["--write", "--yes-billed", "--ai-stub", stub], { STUB_LOG: log });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /batch 1\/1/);
    assert.match(r.stdout, /left as gap: dict Reject me please failed/);
    assert.match(r.stdout, /pnpm db:seed:gen/);
    // No string content in the output, only keys and counts.
    for (const row of Object.values(CANNED)) for (const t of Object.values(row)) assert.ok(!r.stdout.includes(t));

    // Dictionary: gaps filled, existing values (even identical to English) untouched.
    const win = {};
    runInNewContext(readFileSync(join(root, "app/vamos-i18n-dict.js"), "utf8"), { window: win });
    const S = JSON.parse(JSON.stringify(win.VamosI18n.strings));
    assert.deepEqual(S["Pick a seat"], { de: "Sitz wählen", ar: "اختر مقعدا", fr: "Choisissez un siège" });
    assert.deepEqual(S["Open the door"], CANNED["Open the door"]);
    assert.deepEqual(S["Same"], { de: "Same", fr: "Same", ar: "Same" });
    assert.deepEqual(S["Later"], { de: "Später", fr: "Plus tard", ar: "لاحقًا" });
    assert.deepEqual(S["Reject me please"], {});
    for (const k of ["Terms line here", "policy number", "Order 12"]) assert.deepEqual(S[k], {}, `${k} untouched`);

    // Messages: only the missing leaves, human values kept, denied keys untouched.
    const m = (l) => JSON.parse(readFileSync(join(root, `apps/web/i18n/messages/${l}.json`), "utf8"));
    assert.equal(m("ar").common.save, "احفظ التاريخ");
    assert.equal(m("de").common.save, "Datum sichern");
    assert.equal(m("fr").common.save, "Garder");
    assert.equal(m("de").about.free, "Ihr Fahrer wartet bereits");
    assert.equal(m("fr").about.free, "Votre chauffeur attend");
    assert.equal(m("ar").about.free, "سائقك ينتظرك");
    for (const l of ["de", "fr", "ar"]) {
      assert.equal(m(l).legal?.terms, undefined);
      assert.equal(m(l).cookies, undefined);
      assert.equal(m(l).about.pending, undefined);
      assert.equal(m(l).about.cited, undefined);
    }
    const e = (l) => JSON.parse(readFileSync(join(root, `packages/emails/src/messages/${l}.json`), "utf8"));
    assert.equal(e("fr").note, "Ajouter une note");
    assert.equal(e("de").note, "Notiz");

    // Untouched files stay byte-identical.
    const after = snapshot(root);
    for (const p of ["/app/pages/terms.dc.html", "/app/pages/plain.dc.html", "/apps/web/i18n/messages/en.json", "/packages/emails/src/messages/en.json", "/packages/emails/src/messages/ar.json", "/packages/emails/src/messages/de.json"]) {
      assert.equal(after[p], before[p], `${p} unchanged`);
    }

    // Every call carries exactly one source text, never a multi-string prompt; at most 2 in flight.
    const calls = readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.ok(calls.length >= 8);
    for (const c of calls) {
      assert.deepEqual(c.keys, ["src", "targets", "text"]);
      assert.equal(typeof c.text, "string");
      assert.ok(!c.text.includes("\n"));
      assert.ok(!/^\s*\d+[.)]\s/.test(c.text));
    }
    const texts = new Set(calls.map((c) => c.text));
    for (const denied of ["Terms line here", "policy number", "Order 12", "Legal terms text", "Cookie row text", "Pending thing", "Cited line", "Same", "Done"]) {
      assert.ok(!texts.has(denied), `${denied} never sent`);
    }
    assert.ok(Math.max(...calls.map((c) => c.inflight)) <= 2);
    assert.equal(Math.max(...calls.map((c) => c.inflight)), 2, "the two-wide pool is used");

    // A second run only has the rejected gap left.
    const again = run(root, []);
    const left = again.stdout.trim().split("\n").filter((l) => !l.startsWith("total:")).map((l) => l.split("\t")[1]);
    assert.deepEqual(left, ["Reject me please"]);
  });

  it("the engine and the runner have no batch entry point; the smoke script needs --yes-billed", () => {
    const web = join(scriptDir, "../apps/web/lib/translate");
    for (const f of [FILL, ...readdirSync(web).filter((n) => n.endsWith(".ts")).map((n) => join(web, n))]) {
      if (f.endsWith(".test.ts")) continue;
      assert.ok(!readFileSync(f, "utf8").includes("translateBatch"), `${f} has no translateBatch`);
    }
    const r = spawnSync(process.execPath, [SMOKE], { encoding: "utf8" });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /--yes-billed/);
  });

  it("the smoke script prints guard verdicts for five strings (stubbed)", () => {
    const smokeStub = join(tmp, "smoke-stub.mjs");
    writeFileSync(
      smokeStub,
      `export const ai = { async run(m, input) {
        const u = JSON.parse(input.messages[1].content);
        return { choices: [{ message: { content: JSON.stringify(Object.fromEntries(u.targets.map((t) => [t, "?"]))), refusal: null }, finish_reason: "stop" }] };
      } };\n`,
    );
    const r = spawnSync(process.execPath, [SMOKE, "--yes-billed", "--ai-stub", smokeStub], { encoding: "utf8" });
    assert.match(r.stdout, /1\. Your Vamos Taxi driver/);
    assert.match(r.stdout, /5\. Please keep to the street/);
    assert.match(r.stdout, /smoke: \d+ of 15 not accepted|smoke: all 15/);
    assert.notEqual(r.status, null);
  });
});
