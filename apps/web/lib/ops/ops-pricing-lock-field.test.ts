// apps/web/lib/ops/ops-pricing-lock-field.test.ts
//
// Quick 261013 (decision 2026-10-13 items 10, 13; pictures signed 2026-10-14, SIGNED.md): Pricing › Distance rules
// shows one field "Price stays valid for [24] hours" that saves the draft's quote_lock_minutes through
// VamosOps.saveDraftQuoteLock → PUT /api/staff/rate-book {kind:"rule", ruleKind:"quote_lock", quoteLockHours}.
// The km-band overlap warning, the band/rule gap kinds and the dead rules/region strings are gone.
// The whole script block of OpsPricing.dc.html runs against a stub DCLogic and a stub VamosOps (as in
// ops-dc-class-lifecycle.test.ts), and vamos-ops-data.js runs in a vm with a recording API client.
// No DOM, no network, no live data.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { stripHtml } from "../../../../scripts/strip-public-comments.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");
const CANONICAL = join(repoRoot, "app/ops/OpsPricing.dc.html");
const PUBLIC_COPY = join(webRoot, "public/app/ops/OpsPricing.dc.html");
const SRC = readFileSync(CANONICAL, "utf8");

type Json = Record<string, any>;
type Lang = "en" | "de" | "fr" | "ar";
const LANGS: Lang[] = ["en", "de", "fr", "ar"];

/** The copy the owner signed (SIGNED.md, render-bands.mjs LOCK), verbatim. */
const SIGNED: Record<Lang, { lockLabel: string; lockSuffix: string; lockHint: string; saveLock: string }> = {
  en: { lockLabel: "Price stays valid for", lockSuffix: "hours", lockHint: "How long a price you show a customer stays the same.", saveLock: "Save" },
  de: { lockLabel: "Preis gilt für", lockSuffix: "Stunden", lockHint: "Wie lange ein Preis, den du einem Kunden zeigst, gleich bleibt.", saveLock: "Speichern" },
  fr: { lockLabel: "Le prix reste valable", lockSuffix: "heures", lockHint: "Combien de temps un prix montré à un client reste le même.", saveLock: "Enregistrer" },
  ar: { lockLabel: "يبقى السعر صالحًا لمدة", lockSuffix: "ساعة", lockHint: "المدة التي يبقى فيها السعر الذي تعرضه على العميل كما هو.", saveLock: "حفظ" },
};

function scriptOf(): string {
  const m = SRC.match(/<script type="text\/x-dc" data-dc-script[^>]*>\n([\s\S]*?)\n<\/script>/);
  if (!m?.[1]) throw new Error("missing script block in OpsPricing.dc.html");
  return m[1];
}
function templateOf(): string {
  const i = SRC.indexOf('<script type="text/x-dc" data-dc-script');
  return i > 0 ? SRC.slice(0, i) : SRC;
}

class StubLogic {
  props: Json = {};
  state: Json = {};
  setState(patch: Json | ((s: Json) => Json), done?: () => void) {
    const next = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    if (done) done();
  }
  forceUpdate() {}
}

const noop = () => undefined;
const coll = (rows: unknown[] = []) => ({
  all: () => rows, get: () => null, blank: () => ({}), onChange: () => noop, upsert: noop, remove: noop, reorder: noop, reset: noop,
});
const flush = () => new Promise((r) => setTimeout(r, 0));

type SaveAnswer = Json | "reject";
function page(opts: { lang?: Lang; book?: Json; saveAnswers?: SaveAnswer[]; noSaveVerb?: boolean } = {}) {
  const saves: unknown[] = [];
  const reads: string[] = [];
  const answers = (opts.saveAnswers ?? []).slice();
  const ops: Json = {
    CLASSES: [], LOCATIONS: [], routes: coll(), rates: coll(), coupons: coll(), surcharges: coll(),
    chauffeurs: { ...coll(), peek: () => [] },
    profile: { get: () => ({ role: "admin" }), onChange: () => noop },
    onAny: () => noop,
    classes: () => Promise.resolve([]),
  };
  if (!opts.noSaveVerb) {
    ops.saveDraftQuoteLock = (hours: unknown) => {
      saves.push(hours);
      const a = answers.shift() ?? { ok: true, data: { quoteLockHours: String(hours) } };
      return a === "reject" ? Promise.reject(new Error("network")) : Promise.resolve(a);
    };
  }
  const win: Json = {
    VamosLocale: { lang: () => opts.lang ?? "en", cur: () => "CHF", money: (v: unknown) => `CHF ${String(v)}`, onChange: () => noop },
    VamosOpsApi: {
      request: (method: string, path: string) => {
        reads.push(`${method} ${path}`);
        if (path === "/api/staff/rate-book") return Promise.resolve({ ok: true, data: opts.book ?? { vatRateBps: 81, quoteLockHours: "24" } });
        if (path === "/api/staff/rate-versions") return Promise.resolve({ ok: true, data: { versions: [{ id: "v-live", status: "live" }] } });
        return Promise.resolve({ ok: true, data: [] });
      },
    },
    VamosOps: ops,
    innerWidth: 1440,
    addEventListener: noop,
    removeEventListener: noop,
  };
  const out = new Function("DCLogic", "window", "document", "React", `${scriptOf()}\nreturn { Component, T };`)(
    StubLogic, win, { addEventListener: noop, removeEventListener: noop }, { createElement: (...args: unknown[]) => ({ args }) },
  ) as { Component: new () => Json; T: Record<Lang, Record<string, string>> };
  const comp = new out.Component();
  comp.state = { ...comp.state, lang: opts.lang ?? "en", classes: [] };
  return { comp, T: out.T, saves, reads, vals: () => comp.renderVals() as Json };
}

describe("Price stays valid for: markup and copy", () => {
  it("both copies exist; the served copy is the source minus its comments", () => {
    expect(existsSync(PUBLIC_COPY)).toBe(true);
    expect(readFileSync(PUBLIC_COPY, "utf8")).toBe(stripHtml(SRC));
  });

  it("sits in the Distance rules pane, above the class table, with the signed kit Input, Save button and hint", () => {
    const tpl = templateOf();
    const pane = tpl.indexOf('<sc-if value="{{ isDistance }}"');
    const field = tpl.indexOf('<div data-lock-field="1"');
    const table = tpl.indexOf('<dc-import name="OpsTable" fill="1" rows="{{ distanceRows }}"');
    expect(pane).toBeGreaterThan(0);
    expect(field).toBeGreaterThan(pane);
    expect(table).toBeGreaterThan(field);
    expect(tpl.slice(pane, field)).toBe('<sc-if value="{{ isDistance }}" hint-placeholder-val="{{ false }}">\n<div data-price-pane="1" data-price-swipe="1" data-scroll-native="1">\n');
    const block = tpl.slice(field, table);
    expect(block).toContain('<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Input" size="md" label="{{ tLockLabel }}" value="{{ lockHours }}" onChange="{{ setLockHours }}" suffix="{{ tLockSuffix }}" inputMode="numeric" error="{{ lockErrorText }}"');
    expect(block).toContain('<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Button" size="md" variant="{{ lockSaveVariant }}" disabled="{{ lockSaveOff }}" onClick="{{ saveLock }}" hint-size="110px,44px">{{ tSaveLock }}</x-import>');
    expect(block).toContain('<p class="vt-field__hint" style="margin:0">{{ tLockHint }}</p>');
    expect(block).toMatch(/<div data-lock-save="1">/);
    // Laws: logical layout only, no glow, no tinted yellow.
    expect(block).not.toMatch(/(margin|padding)-(left|right)|[^-]left:|[^-]right:|shadow|yellow-[1-3]00|yellow-50|yellow-[67]00/);
  });

  it("keeps the no-glow lines in the helmet", () => {
    expect(SRC).toMatch(/--vt-shadow-accent:\s*none/);
    expect(SRC).toMatch(/\.vt-input--focus\{box-shadow:none\}/);
  });

  for (const lang of LANGS) {
    it(`${lang}: signed strings verbatim, error and saved lines present`, () => {
      const { T } = page({ lang });
      for (const [k, v] of Object.entries(SIGNED[lang])) expect(T[lang][k], `${lang}.${k}`).toBe(v);
      for (const k of ["lockError", "lockSaveError", "lockSaved"]) {
        expect(typeof T[lang][k]).toBe("string");
        expect(String(T[lang][k] ?? "").length, `${lang}.${k}`).toBeGreaterThan(3);
      }
      if (lang !== "en") for (const k of ["lockError", "lockSaveError", "lockSaved"]) expect(T[lang][k]).not.toBe(T.en[k]);
      if (lang === "de") for (const k of Object.keys(T.de)) if (typeof T.de[k] === "string") expect(T.de[k], `de.${k}`).not.toContain("ß");
    });
  }
});

describe("Price stays valid for: logic", () => {
  it("shows the book's hours from GET rate-book; Save is ghost and off at rest", async () => {
    const p = page();
    p.comp.loadVat();
    await flush();
    const v = p.vals();
    expect(p.reads).toContain("GET /api/staff/rate-book");
    expect(v.lockHours).toBe("24");
    expect(v.lockSaveVariant).toBe("ghost");
    expect(v.lockSaveOff).toBe(true);
    expect(v.lockErrorText).toBe("");
    expect(v.lockErrFlag).toBe("0");
    expect(v.lockOkDisplay).toBe("none");
    expect(v.tLockLabel).toBe("Price stays valid for");
  });

  it("keeps no literal default when the answer has no hours", async () => {
    const p = page({ book: { vatRateBps: 81 } });
    p.comp.loadVat();
    await flush();
    expect(p.vals().lockHours).toBe("");
    expect(p.vals().lockSaveOff).toBe(true);
  });

  it("typing other whole hours turns Save primary; 0, 1.5, abc show the error and keep Save off; empty only turns Save off", async () => {
    const p = page();
    p.comp.loadVat();
    await flush();
    p.comp.setLockHours({ target: { value: "48" } });
    expect(p.vals().lockSaveVariant).toBe("primary");
    expect(p.vals().lockSaveOff).toBe(false);
    for (const bad of ["0", "1.5", "abc", "-1", "00"]) {
      p.comp.setLockHours(bad);
      const v = p.vals();
      expect(v.lockSaveOff, bad).toBe(true);
      expect(v.lockSaveVariant, bad).toBe("ghost");
      expect(v.lockErrorText, bad).toBe(p.T.en.lockError);
      expect(v.lockErrFlag, bad).toBe("1");
    }
    p.comp.setLockHours("");
    expect(p.vals().lockSaveOff).toBe(true);
    expect(p.vals().lockErrorText).toBe("");
    p.comp.setLockHours("24");
    expect(p.vals().lockSaveOff).toBe(true);
    expect(p.vals().lockErrorText).toBe("");
  });

  it("Save sends 48 once; on ok the saved value becomes the answer's and Save goes back to ghost", async () => {
    const p = page({ saveAnswers: [{ ok: true, data: { quoteLockHours: "48" } }] });
    p.comp.loadVat();
    await flush();
    p.comp.setLockHours("48");
    p.comp.saveLock();
    expect(p.vals().lockSaveOff).toBe(true); // busy: no second PUT
    p.comp.saveLock();
    await flush();
    expect(p.saves).toEqual([48]);
    const v = p.vals();
    expect(v.lockHours).toBe("48");
    expect(p.comp.state.lockSavedHours).toBe("48");
    expect(v.lockSaveVariant).toBe("ghost");
    expect(v.lockSaveOff).toBe(true);
    expect(v.lockOkDisplay).toBe("block");
    expect(v.tLockSaved).toBe(p.T.en.lockSaved);
    expect(v.lockErrorText).toBe("");
    // Typing again hides the saved line.
    p.comp.setLockHours("36");
    expect(p.vals().lockOkDisplay).toBe("none");
  });

  it("the first save on a live book reads the versions again (the server made a draft)", async () => {
    const p = page();
    p.comp.loadVat();
    await flush();
    p.comp.state = { ...p.comp.state, draftId: null };
    const before = p.reads.filter((r) => r === "GET /api/staff/rate-versions").length;
    p.comp.setLockHours("30");
    p.comp.saveLock();
    await flush();
    expect(p.reads.filter((r) => r === "GET /api/staff/rate-versions").length).toBe(before + 1);
  });

  it("does not re-read the versions when a draft already exists", async () => {
    const p = page();
    p.comp.loadVat();
    await flush();
    p.comp.state = { ...p.comp.state, draftId: "v-draft" };
    const before = p.reads.length;
    p.comp.setLockHours("30");
    p.comp.saveLock();
    await flush();
    expect(p.reads.length).toBe(before);
  });

  for (const answer of [{ ok: false, code: "invalid" }, { ok: false, code: "csrf" }, "reject" as const]) {
    it(`a failed save (${typeof answer === "string" ? answer : answer.code}) keeps the typed value, Save primary and says so`, async () => {
      const p = page({ saveAnswers: [answer] });
      p.comp.loadVat();
      await flush();
      p.comp.setLockHours("48");
      p.comp.saveLock();
      await flush();
      const v = p.vals();
      expect(p.saves).toEqual([48]);
      expect(v.lockHours).toBe("48");
      expect(p.comp.state.lockSavedHours).toBe("24");
      expect(v.lockSaveVariant).toBe("primary");
      expect(v.lockSaveOff).toBe(false);
      expect(v.lockErrorText).toBe(p.T.en.lockSaveError);
      expect(v.lockOkDisplay).toBe("none");
    });
  }

  it("an invalid value never reaches the server", async () => {
    const p = page();
    p.comp.loadVat();
    await flush();
    p.comp.setLockHours("0");
    p.comp.saveLock();
    p.comp.setLockHours("24");
    p.comp.saveLock();
    await flush();
    expect(p.saves).toEqual([]);
  });

  for (const lang of LANGS) {
    it(`${lang}: renderVals carries that language's copy`, async () => {
      const p = page({ lang });
      p.comp.loadVat();
      await flush();
      p.comp.setLockHours("1.5");
      const v = p.vals();
      expect(v.tLockLabel).toBe(SIGNED[lang].lockLabel);
      expect(v.tLockSuffix).toBe(SIGNED[lang].lockSuffix);
      expect(v.tLockHint).toBe(SIGNED[lang].lockHint);
      expect(v.tSaveLock).toBe(SIGNED[lang].saveLock);
      expect(v.lockErrorText).toBe(p.T[lang].lockError);
    });
  }
});

describe("km bands, region % and the Rules list are gone from the dashboard", () => {
  it("OpsPricing has no band warning, band/rule gap kinds, recap or dead rules/region strings", () => {
    expect(SRC).not.toContain("data-price-warn");
    expect(SRC).not.toMatch(/bandWarnDisplay|tBandOverlapWarn|bandsOverlap|regionsOverlap|bandRowsRaw|recapLine|state\.recap|recap: null/);
    const dead = ["colRule", "addRule", "editRule", "saveRule", "deleteRuleTitle", "deleteRuleBody", "emptyRulesTitle", "emptyRulesBody",
      "searchRules", "nounRule", "nounRules", "kindWaiting", "kindLock", "kindFreeWait", "kindServiceArea", "fPayload", "hRulePayload",
      "regionPercentWarn", "previewKicker", "recapStart", "recapKm", "recapBands", "recapRegion", "recapExtras", "recapVat", "recapTotal",
      "gapRule", "gapBand", "gapBandOverlap", "bandOverlapWarn"];
    for (const k of dead) expect(SRC, k).not.toMatch(new RegExp(`\\b${k}\\b`));
  });

  it("gap lines label the kinds that remain (distance class, surcharge)", () => {
    const p = page();
    p.comp.state = { ...p.comp.state, gaps: [{ kind: "distance_rate", name: "Economy Sedan", missing: ["photo"] }, { kind: "surcharge", name: "Child seat" }] };
    const labels = (p.vals().gaps as Json[]).map((g) => g.label);
    expect(labels[0]).toBe("Economy Sedan — missing photo.");
    expect(labels[1]).toBe("Surcharge: Child seat.");
  });

  it("vamos-ops-data.js has no bands/regionPremiums/rules collections and saveDraftQuoteLock PUTs the contract body", async () => {
    const src = readFileSync(join(repoRoot, "app/vamos-ops-data.js"), "utf8");
    expect(src).not.toMatch(/regionPremiums|cleanBand|cleanRegion|cleanRule|ruleId|"bands"|"rules"/);
    const calls: Array<[string, string, unknown]> = [];
    const win: Json = {
      dispatchEvent: () => true, addEventListener: () => undefined,
      VamosOpsApi: { request: (m: string, path: string, body: unknown) => { calls.push([m, path, body]); return Promise.resolve({ ok: true, data: { quoteLockHours: "48" } }); } },
    };
    vm.runInContext(src, vm.createContext({ window: win, CustomEvent: class {}, setTimeout: () => 0, clearTimeout: () => undefined, console }));
    const ops = win.VamosOps as Json;
    expect(ops.bands).toBeUndefined();
    expect(ops.regionPremiums).toBeUndefined();
    expect(ops.rules).toBeUndefined();
    const json = await ops.saveDraftQuoteLock(48);
    expect(calls).toEqual([["PUT", "/api/staff/rate-book", { kind: "rule", ruleKind: "quote_lock", quoteLockHours: 48 }]]);
    expect(json).toEqual({ ok: true, data: { quoteLockHours: "48" } });
    expect(() => ops.resetAll()).not.toThrow();
  });

  it("vamos-i18n-dict.js no longer carries the km-band subtitles", () => {
    const dict = readFileSync(join(repoRoot, "app/vamos-i18n-dict.js"), "utf8");
    expect(dict).not.toContain("Class floors, km bands, region %");
    expect(dict).not.toContain("Class floors and km bands");
  });
});
