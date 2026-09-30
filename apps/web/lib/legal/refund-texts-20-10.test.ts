// 20-10 refunds by hand: the five owner-approved texts and the customer's Refund row label are pinned
// byte for byte against .planning/decisions/2026-09-30-refunds-by-hand.md in every file where they live.
// No customer surface may say "Pending Ops" or promise an automatic cancellation refund.

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

/** The four-language table under a "### Tn" heading of the decision file. */
function table(tag: string): Texts {
  const start = decision.indexOf(`### ${tag} `);
  expect(start, `${tag} heading`).toBeGreaterThan(-1);
  const next = decision.indexOf("\n### ", start + 4);
  const block = decision.slice(start, next === -1 ? undefined : next);
  const out: Partial<Texts> = {};
  for (const lang of LANGS) {
    const m = block.match(new RegExp(`^\\| ${lang} \\| (.+) \\|$`, "m"));
    expect(m, `${tag} ${lang}`).not.toBeNull();
    out[lang] = m![1];
  }
  return out as Texts;
}

const T1 = table("T1");
const T2 = table("T2");
const T3 = table("T3");
const T4 = table("T4");
// T5 is prose in the decision file (the second sentence of cancelSheetOps); its four languages are
// the ones in BUILD-SPEC B.4 and dict line "Our team decides the refund ...".
const T5: Texts = {
  en: "Our team decides the refund and tells you by email.",
  de: "Unser Team entscheidet über die Rückerstattung und teilt sie Ihnen per E-Mail mit.",
  fr: "Notre équipe décide du remboursement et vous en informe par e-mail.",
  ar: "يقرّر فريقنا مبلغ الاسترداد ويُبلغك به عبر البريد الإلكتروني.",
};
// The owner's Refund row label (answers 2/3 in 20-10-BUILD-SPEC section E).
const ROW: Texts = {
  en: "Full refund · sent by our team",
  de: "Volle Rückerstattung · wird von unserem Team veranlasst",
  fr: "Remboursement intégral · envoyé par notre équipe",
  ar: "استرداد كامل · يرسله فريقنا",
};

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
  it("has the four languages of T1 to T4", () => {
    for (const t of [T1, T2, T3, T4]) for (const lang of LANGS) expect(t[lang].length).toBeGreaterThan(10);
  });
});

describe("T1 cancellation page, section 01", () => {
  it("english in cancellation.dc.html, four languages in the dict and in legal.tier-full-refund-automatic", () => {
    expect(read("app/pages/cancellation.dc.html")).toContain(T1.en);
    expectInDict(T1);
    expectInJson("apps/web/i18n/messages", ["legal", "tier-full-refund-automatic"], T1);
  });
});

describe("T2 cancel sheet", () => {
  it("manage-booking, booking-detail, dict, checkout.cancelSheetFull", () => {
    expect(read("app/pages/manage-booking.dc.html")).toContain(T2.en);
    expect(read("app/pages/booking-detail.dc.html")).toContain(T2.en);
    expectInDict(T2);
    expectInJson("apps/web/i18n/messages", ["checkout", "cancelSheetFull"], T2);
  });
});

describe("T3 tiers line", () => {
  it("legal.automatic-full-refund-of-the-amount-we in four languages", () => {
    expectInJson("apps/web/i18n/messages", ["legal", "automatic-full-refund-of-the-amount-we"], T3);
  });
});

describe("T4 and T5 cancellation e-mail", () => {
  it("cancellation.refundFullCaptured is T4, cancellation.refundPendingOps is T5", () => {
    expectInJson("packages/emails/src/messages", ["cancellation", "refundFullCaptured"], T4);
    expectInJson("packages/emails/src/messages", ["cancellation", "refundPendingOps"], T5);
  });

  it("T5 is the second sentence of checkout.cancelSheetOps in every language, and in the dict", () => {
    for (const lang of LANGS) {
      const ops = (JSON.parse(read(`apps/web/i18n/messages/${lang}.json`)) as { checkout: Record<string, string | undefined> }).checkout
        .cancelSheetOps;
      expect(ops?.endsWith(T5[lang]), `${lang} cancelSheetOps`).toBe(true);
    }
    expectInDict(T5);
  });
});

describe("the customer's Refund row label", () => {
  it("is in the dict in four languages and used by vamos-manage-ticket.js", () => {
    expect(dictSrc).toContain(
      `"${ROW.en}": { de: "${ROW.de}", fr: "${ROW.fr}", ar: "${ROW.ar}" }`,
    );
    expect(read("app/vamos-manage-ticket.js")).toContain(`t("${ROW.en}")`);
  });
});

describe("no customer surface carries the internal or the old words", () => {
  const customerFiles = [
    ...readdirSync(join(root, "app/pages")).filter((f) => f.endsWith(".html")).map((f) => `app/pages/${f}`),
    "app/vamos-manage-ticket.js",
    ...LANGS.map((l) => `apps/web/i18n/messages/${l}.json`),
    ...LANGS.map((l) => `packages/emails/src/messages/${l}.json`),
  ];
  const banned = [
    "Pending Ops",
    "Wartet auf Ops",
    "En attente Ops",
    "بانتظار التشغيل",
    "Refunded automatically",
    "Refunded in full, automatically",
  ];

  it("Pending Ops and Refunded automatically appear in none of them", () => {
    for (const file of customerFiles) {
      const src = read(file);
      for (const words of banned) expect(src, `${file} contains "${words}"`).not.toContain(words);
    }
  });

  it("the dict does not show 'Pending Ops' or the old T1/T2 sentences either", () => {
    for (const words of ["Pending Ops", "Wartet auf Ops", "En attente Ops", "Refunded automatically", "Refunded in full, automatically"]) {
      expect(dictSrc, words).not.toContain(words);
    }
  });
});
