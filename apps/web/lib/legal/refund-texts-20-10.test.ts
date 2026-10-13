// Customer refund wording, pinned byte for byte against two decision files in every file where it lives:
// - T1 and T3 (cancellation page, tiers line) from .planning/decisions/2026-09-30-refunds-by-hand.md;
// - W1 to W5 from .planning/decisions/2026-10-12-refund-wording-signed.md (Phase 31, S-02): W1 the cancel
//   sheet line, W2 the account Refund row, W3 the dead-card paragraph and the cancellation e-mail line.
// No customer surface may say "Pending Ops", promise an automatic cancellation refund, or carry the retired
// 20-10 promise sentences (full refund sent by our team, refund under review).

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const LANGS = ["en", "de", "fr", "ar"] as const;
type Lang = (typeof LANGS)[number];
type Texts = Record<Lang, string>;

const decision = read(".planning/decisions/2026-09-30-refunds-by-hand.md");
const signed = read(".planning/decisions/2026-10-12-refund-wording-signed.md");

/** The four-language rows under a "### <tag>" heading of a decision file. */
function readTable(src: string, tag: string, stop: string): Texts {
  const start = src.indexOf(`### ${tag} `);
  expect(start, `${tag} heading`).toBeGreaterThan(-1);
  const next = src.indexOf(stop, start + 4);
  const block = src.slice(start, next === -1 ? undefined : next);
  const out: Partial<Texts> = {};
  for (const lang of LANGS) {
    const m = block.match(new RegExp(`^\\| ${lang} \\| (.+) \\|$`, "m"));
    expect(m, `${tag} ${lang}`).not.toBeNull();
    out[lang] = m![1];
  }
  return out as Texts;
}

/** A "### Tn" table of 2026-09-30-refunds-by-hand.md. */
const table = (tag: string) => readTable(decision, tag, "\n### ");
/** A "### Wn" table of 2026-10-12-refund-wording-signed.md (Phase 31, S-02); stops at any next heading. */
const signedTable = (tag: string) => readTable(signed, tag, "\n#");

const T1 = table("T1");
const T2 = table("T2");
const T3 = table("T3");
const W1 = signedTable("W1");
const W2 = signedTable("W2");
const W3 = signedTable("W3");
// The retired 20-10 Refund row label (answers 2/3 in 20-10-BUILD-SPEC section E); banned below.
const OLD_ROW: Texts = {
  en: "Full refund · sent by our team",
  de: "Volle Rückerstattung · wird von unserem Team veranlasst",
  fr: "Remboursement intégral · envoyé par notre équipe",
  ar: "استرداد كامل · يرسله فريقنا",
};
// The retired 20-10 "under review" row value (checkout.refundPendingOps until Phase 31); banned below.
const OLD_REVIEW: Texts = {
  en: "Refund under review",
  de: "Rückerstattung in Prüfung",
  fr: "Remboursement en cours d’examen",
  ar: "الاسترداد قيد المراجعة",
};
// The policy page's own line (cancellation.dc.html); it stays, the new lines point to it.
const POLICY_PAGE_LINE = "Our team decides the refund and tells you by email.";

const dictSrc = read("app/vamos-i18n-dict.js");

/** Every language text of one entry sits in the dict; the entry is keyed by its English text. */
function expectInDict(texts: Texts) {
  expect(dictSrc).toContain(`"${texts.en}"`);
  for (const lang of ["de", "fr", "ar"] as const) expect(dictSrc).toContain(`"${texts[lang]}"`);
}

function expectInJson(dir: string, path: string[], texts: Texts) {
  for (const lang of LANGS) {
    let node: unknown = JSON.parse(read(`${dir}/${lang}.json`));
    for (const key of path) node = (node as Record<string, unknown>)[key];
    expect(node, `${dir}/${lang}.json ${path.join(".")}`).toBe(texts[lang]);
  }
}

describe("the decision file itself", () => {
  it("has the four languages of T1 to T3", () => {
    for (const t of [T1, T2, T3]) for (const lang of LANGS) expect(t[lang].length).toBeGreaterThan(10);
  });

  it("the signed Phase 31 file has the four languages of W1, W2 and W3, sharp-s free", () => {
    for (const t of [W1, W2, W3]) for (const lang of LANGS) expect(t[lang].length).toBeGreaterThan(10);
    expect(signed).not.toContain("ß");
  });
});

describe("T1 cancellation page, section 01", () => {
  it("english in cancellation.dc.html, four languages in the dict and in legal.tier-full-refund-automatic", () => {
    expect(read("app/pages/cancellation.dc.html")).toContain(T1.en);
    expectInDict(T1);
    expectInJson("apps/web/i18n/messages", ["legal", "tier-full-refund-automatic"], T1);
  });
});

describe("W1 cancel sheet, both windows", () => {
  it("manage-booking, booking-detail, dict, checkout.cancelSheetFull and checkout.cancelSheetOps", () => {
    for (const rel of ["app/pages/manage-booking.dc.html", "app/pages/booking-detail.dc.html"]) {
      expect(read(rel).split(`>${W1.en}</p>`).length - 1, rel).toBe(2);
    }
    expectInDict(W1);
    expectInJson("apps/web/i18n/messages", ["checkout", "cancelSheetFull"], W1);
    expectInJson("apps/web/i18n/messages", ["checkout", "cancelSheetOps"], W1);
  });
});

describe("T3 tiers line", () => {
  it("legal.automatic-full-refund-of-the-amount-we in four languages", () => {
    expectInJson("apps/web/i18n/messages", ["legal", "automatic-full-refund-of-the-amount-we"], T3);
  });
});

describe("W3 cancellation e-mail", () => {
  it("cancellation.refundPolicy is W3 in every language; the old two keys are gone", () => {
    expectInJson("packages/emails/src/messages", ["cancellation", "refundPolicy"], W3);
    for (const lang of LANGS) {
      const c = (JSON.parse(read(`packages/emails/src/messages/${lang}.json`)) as { cancellation: Record<string, unknown> })
        .cancellation;
      expect(c.refundPendingOps, `${lang} refundPendingOps`).toBeUndefined();
      expect(c.refundFullCaptured, `${lang} refundFullCaptured`).toBeUndefined();
    }
  });
});

describe("W3 dead card on the booking pages", () => {
  it("manage-booking and booking-detail carry W3 once, the dict in four languages", () => {
    for (const rel of ["app/pages/manage-booking.dc.html", "app/pages/booking-detail.dc.html"]) {
      expect(read(rel).split(`>${W3.en}</p>`).length - 1, rel).toBe(1);
    }
    expectInDict(W3);
  });
});

describe("W2 the customer's Refund row value", () => {
  it("is one dict entry in four languages, used by vamos-manage-ticket.js and checkout.refundPendingOps", () => {
    expect(dictSrc).toContain(`"${W2.en}": { de: "${W2.de}", fr: "${W2.fr}", ar: "${W2.ar}" }`);
    expect(read("app/vamos-manage-ticket.js")).toContain(`t("${W2.en}")`);
    expectInJson("apps/web/i18n/messages", ["checkout", "refundPendingOps"], W2);
  });
});

describe("no customer surface carries the internal or the old words", () => {
  const customerFiles = [
    ...readdirSync(join(root, "app/pages")).filter((f) => f.endsWith(".html")).map((f) => `app/pages/${f}`),
    "app/vamos-manage-ticket.js",
    ...LANGS.map((l) => `apps/web/i18n/messages/${l}.json`),
    ...LANGS.map((l) => `packages/emails/src/messages/${l}.json`),
  ];
  // Phase 31 retired the 20-10 promise sentences. "our team sends" / "Our team decides" are not banned as
  // fragments: cancellation.dc.html and the owner-approved class/trip difference lines keep them.
  const retired = [
    "You get a full refund; our team sends it.",
    "Full refund · sent by our team",
    "Refund · waiting on review",
    "Refund under review",
    "You will get a full refund of the amount you paid",
  ];
  const banned = [
    "Pending Ops",
    "Wartet auf Ops",
    "En attente Ops",
    "بانتظار التشغيل",
    "Refunded automatically",
    "Refunded in full, automatically",
    ...retired,
    ...LANGS.map((l) => T2[l]),
    ...LANGS.map((l) => OLD_ROW[l]),
    ...LANGS.map((l) => OLD_REVIEW[l]),
  ];

  it("Pending Ops, Refunded automatically and the retired promise sentences appear in none of them", () => {
    for (const file of customerFiles) {
      const src = read(file);
      for (const words of banned) expect(src, `${file} contains "${words}"`).not.toContain(words);
    }
  });

  it("the dict does not show 'Pending Ops' or the old T1/T2 sentences either", () => {
    for (const words of ["Pending Ops", "Wartet auf Ops", "En attente Ops", "Refunded automatically", "Refunded in full, automatically", ...retired]) {
      expect(dictSrc, words).not.toContain(words);
    }
  });

  it("the policy page keeps its own line, in the page and in the dict", () => {
    expect(read("app/pages/cancellation.dc.html")).toContain(POLICY_PAGE_LINE);
    expect(dictSrc).toContain(`"${POLICY_PAGE_LINE}": {`);
  });
});
