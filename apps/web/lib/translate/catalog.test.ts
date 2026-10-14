import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  acceptFill,
  applyDict,
  applyEmails,
  applyMessages,
  findGaps,
  isDenied,
  type Catalogs,
  type Deny,
} from "./catalog";

const NO_DENY: Deny = { keys: [], prefixes: ["legal.", "cookies.", "consent."], texts: [] };

function base(): Catalogs {
  return {
    dict: {
      Hello: { de: "Hallo", fr: "Bonjour", ar: "مرحبا" },
      "Pick a seat": { de: "Sitz wählen", ar: "اختر مقعدا" },
      Zurich: { de: "Zurich", fr: "Zurich", ar: "" },
    },
    messages: {
      en: { common: { ok: "OK", save: "Save" }, $meta: { nonTranslatableKeys: [] } },
      de: { common: { ok: "OK", save: "Speichern" } },
      fr: { common: { ok: "OK", save: "Enregistrer" } },
      ar: { common: { ok: "OK" } },
    },
    emails: {
      en: { subject: "Booked", footer: "Vamos Taxi · Zurich" },
      de: { subject: "Gebucht", footer: "Vamos Taxi · Zürich" },
      fr: { subject: "Réservé", footer: "Vamos Taxi · Zurich" },
      ar: { subject: "تم الحجز", footer: "Vamos Taxi · زيورخ" },
    },
  };
}

describe("findGaps", () => {
  it("finds a missing fr in a dict entry, an empty ar, and a missing ar leaf in messages", () => {
    const gaps = findGaps(base(), NO_DENY);
    expect(gaps).toContainEqual({ source: "dict", key: "Pick a seat", en: "Pick a seat", langs: ["fr"] });
    expect(gaps).toContainEqual({ source: "dict", key: "Zurich", en: "Zurich", langs: ["ar"] });
    expect(gaps).toContainEqual({ source: "messages", key: "common.save", en: "Save", langs: ["ar"] });
    expect(gaps.some((g) => g.source === "emails")).toBe(false);
  });

  it("counts a value equal to English as present", () => {
    const gaps = findGaps(base(), NO_DENY);
    expect(gaps.some((g) => g.key === "common.ok")).toBe(false);
    expect(gaps.find((g) => g.key === "Zurich")?.langs).toEqual(["ar"]);
  });

  it("denies $meta lists, decision-cited noParamKeys, prefixes, denylist keys and texts, and patterns", () => {
    const c = base();
    c.messages.en = {
      $meta: {
        pendingValueKeys: ["about.pending"],
        nonTranslatableKeys: ["common.brand"],
        noParamKeys: { "about.cited": "owner text, .planning/decisions/x.md decision", "about.plain": "fixed figure" },
      },
      about: { pending: "TBC thing", cited: "Approved line", plain: "Plain line", free: "Free line" },
      common: { brand: "Vamos Taxi" },
      legal: { terms: "Terms" },
      cookies: { row: "Row" },
      consent: { line: "Line" },
      extra: { listed: "Listed", texty: "Exact approved text" },
    };
    c.messages.de = {};
    c.messages.fr = {};
    c.messages.ar = {};
    c.dict["Dict pattern 42"] = {};
    c.dict["Exact approved text"] = {};
    c.dict["Approved line"] = {};
    c.dictPatterns = [/^Dict pattern \d+$/];
    const deny: Deny = { keys: ["extra.listed"], prefixes: NO_DENY.prefixes, texts: ["Exact  approved\ntext"] };
    const keys = findGaps(c, deny).map((g) => g.key);
    expect(keys).toContain("about.plain");
    expect(keys).toContain("about.free");
    for (const k of [
      "about.pending",
      "about.cited",
      "common.brand",
      "legal.terms",
      "cookies.row",
      "consent.line",
      "extra.listed",
      "extra.texty",
      "Exact approved text",
      "Approved line",
      "Dict pattern 42",
    ]) {
      expect(keys).not.toContain(k);
    }
    expect(keys.some((k) => k.startsWith("$"))).toBe(false);
  });

  it("isDenied applies keys and prefixes to messages only, texts everywhere", () => {
    expect(isDenied({ source: "dict", key: "legal.x", en: "legal.x", langs: ["fr"] }, NO_DENY)).toBe(false);
    expect(isDenied({ source: "emails", key: "cookies.a", en: "A", langs: ["fr"] }, NO_DENY)).toBe(true);
    expect(isDenied({ source: "dict", key: "A b", en: "A b", langs: ["fr"] }, { ...NO_DENY, texts: ["A  b"] })).toBe(true);
  });
});

describe("applyMessages / applyEmails", () => {
  const src = `${JSON.stringify({ common: { ok: "OK", save: "Speichern" }, tail: "x" }, null, 2)}\n`;

  it("adds only the missing leaf and keeps every other byte", () => {
    const out = applyMessages(src, "ar", { "common.extra": "إضافي", "common.ok": "REPLACED" });
    const before = src.trimEnd().split("\n");
    const after = out.trimEnd().split("\n");
    expect(out.endsWith("}\n")).toBe(true);
    expect(JSON.parse(out).common.ok).toBe("OK");
    expect(JSON.parse(out).common.extra).toBe("إضافي");
    expect(after.filter((l) => !before.includes(l))).toEqual(['    "save": "Speichern",', '    "extra": "إضافي"']);
    expect(Object.keys(JSON.parse(out).common)).toEqual(["ok", "save", "extra"]);
  });

  it("fills an empty string and creates a missing parent", () => {
    const out = JSON.parse(applyEmails(`{\n  "a": ""\n}\n`, "fr", { a: "Bonjour", "b.c": "Salut" }));
    expect(out).toEqual({ a: "Bonjour", b: { c: "Salut" } });
  });

  it("returns the input untouched when nothing changes", () => {
    expect(applyMessages(src, "fr", { "common.ok": "x" })).toBe(src);
  });

  it("refuses ß for German and empty text", () => {
    expect(acceptFill("de", "Strasse")).toBe(true);
    expect(acceptFill("de", "Straße")).toBe(false);
    expect(acceptFill("fr", "")).toBe(false);
    expect(applyMessages(src, "de", { "common.new": "Straße" })).toBe(src);
    expect(applyDict("var S = DICT.strings;\n  })();", { A: { de: "Straße" } })).toBe("var S = DICT.strings;\n  })();");
  });
});

describe("applyDict", () => {
  const dictSrc = [
    "(function () {",
    "  var DICT = { strings: { Hello: { de: 'Hallo' } }, patterns: [] };",
    "  (function () {",
    "    var S = DICT.strings, P = DICT.patterns;",
    '    S["Old"] = { de: "Alt" };',
    "  })();",
    "  window.R = DICT;",
    "})();",
    "",
  ].join("\n");

  it("appends Object.assign lines in the last block under one header, and the result loads with merged values", () => {
    const out = applyDict(dictSrc, {
      Hello: { fr: 'Bonjour "tous"', ar: "مرحبا" },
      "Say \\ it": { fr: "Dis" },
    });
    expect(out.match(/Filled automatically/g)?.length).toBe(1);
    const w: { R?: { strings: Record<string, Record<string, string>> } } = {};
    runInNewContext(out, { window: w });
    const S = w.R!.strings;
    expect(S["Hello"]).toEqual({ de: "Hallo", fr: 'Bonjour "tous"', ar: "مرحبا" });
    expect(S["Say \\ it"]).toEqual({ fr: "Dis" });
    expect(S["Old"]).toEqual({ de: "Alt" });
    // Second run adds lines without a second header.
    const again = applyDict(out, { Old: { fr: "Vieux" } });
    expect(again.match(/Filled automatically/g)?.length).toBe(1);
    const w2: typeof w = {};
    runInNewContext(again, { window: w2 });
    expect(w2.R!.strings["Old"]).toEqual({ de: "Alt", fr: "Vieux" });
  });

  it("leaves the source unchanged when there is nothing to add", () => {
    expect(applyDict(dictSrc, {})).toBe(dictSrc);
  });
});
