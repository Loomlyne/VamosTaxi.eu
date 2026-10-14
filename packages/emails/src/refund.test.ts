import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const resendSend = vi.hoisted(() => vi.fn(async () => ({ data: { id: "msg_1" }, error: null })));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

import { renderRefundEmail } from "./refund";
import { sendRefund } from "./lib/send";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const LANGS = ["en", "de", "fr", "ar"] as const;
type Lang = (typeof LANGS)[number];
type Texts = Record<Lang, string>;

// Phase 31 S-06: the owner signed the customer refund mail on 2026-10-13. Every rendered string is pinned to
// the decision file, byte for byte.
const decision = readFileSync(join(root, ".planning/decisions/2026-10-12-refund-mail-copy.md"), "utf8");

/** The four-language table under a "### Mn" heading of the decision file. */
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

const M1 = table("M1");
const M2 = table("M2");
const M3 = table("M3");
const M4 = table("M4");
const M5 = table("M5");
const M6 = table("M6");

const PHONE = "+41 79 626 70 82";
const LRI = "⁦";
const PDI = "⁩";
const LTR_SPAN = (v: string) =>
  `<span dir="ltr" style="unicode-bidi:isolate;direction:ltr;white-space:nowrap">${v}</span>`;
const EXAMPLE = { name: "Nadia", reference: "VT-26-0753", amountRappen: 4000 };

/** The signed template with the example values; in Arabic the amount and the reference sit between LRI and PDI. */
function filled(template: string, lang: Lang, name = EXAMPLE.name): string {
  const iso = (v: string) => (lang === "ar" ? `${LRI}${v}${PDI}` : v);
  return template
    .replace("{name}", name)
    .replace("{reference}", iso(EXAMPLE.reference))
    .replace("{amount}", iso("CHF 40.00"));
}

describe("refund mail, owner-signed copy (Phase 31 S-06, 2026-10-12-refund-mail-copy.md)", () => {
  it("the decision file holds M1..M6, four languages each, and the heading repeats the subject", () => {
    for (const lang of LANGS) {
      expect(M2[lang]).toBe(M1[lang]);
      expect(M4[lang]).toBe(M3[lang].replace(" {name}", ""));
    }
    expect(M4).toEqual({ en: "Hello,", de: "Guten Tag", fr: "Bonjour,", ar: "مرحبًا،" });
  });

  it("subject and text are the signed copy with CHF 40.00 and VT-26-0753, byte for byte, in every language", () => {
    for (const lang of LANGS) {
      const out = renderRefundEmail(lang, "issued", EXAMPLE);
      expect(out.subject, lang).toBe(filled(M1[lang], lang));
      const footer = lang === "ar" ? `${LRI}${PHONE}${PDI}` : PHONE;
      expect(out.text, lang).toBe(
        `Vamos Taxi\n\n${filled(M2[lang], lang)}\n\n${filled(M3[lang], lang)}\n\n${filled(M5[lang], lang)}\n\n${filled(M6[lang], lang)}\n\n${footer}`,
      );
    }
  });

  it("en reads as signed", () => {
    expect(renderRefundEmail("en", "issued", EXAMPLE).text).toContain(
      "Hello Nadia,\n\nWe have sent CHF 40.00 back to the payment method you used for VT-26-0753. Your bank may take a few days to show it.\n\nQuestions? Write to us at info@vamostaxi.site.",
    );
  });

  it("HTML carries the same copy; Arabic keeps the amount and the reference in LTR islands", () => {
    for (const lang of ["en", "de"] as const) {
      const html = renderRefundEmail(lang, "issued", EXAMPLE).html;
      expect(html).toContain(`<h1>${filled(M2[lang], lang)}</h1>`);
      expect(html).toContain(`<p>${filled(M5[lang], lang)}</p>`);
    }
    const fr = renderRefundEmail("fr", "issued", EXAMPLE).html;
    expect(fr).toContain(`<p>${filled(M6.fr, "fr")}</p>`);
    const ar = renderRefundEmail("ar", "issued", EXAMPLE).html;
    expect(ar).toContain(LTR_SPAN("CHF 40.00"));
    expect(ar).toContain(LTR_SPAN("VT-26-0753"));
    expect(ar).toContain('dir="rtl"');
    expect(ar).toContain(`<h1>${M2.ar.replace("{reference}", LTR_SPAN("VT-26-0753"))}</h1>`);
  });

  it("every value in the HTML is escaped", () => {
    const html = renderRefundEmail("en", "issued", { ...EXAMPLE, name: "<b>Ada</b> & Co" }).html;
    expect(html).toContain("Hello &lt;b&gt;Ada&lt;/b&gt; &amp; Co,");
    expect(html).not.toContain("<b>Ada</b>");
  });

  it("a blank name uses the signed greeting without a name; no English fallback word in de/fr/ar", () => {
    for (const lang of LANGS) {
      for (const name of ["", "   "]) {
        const text = renderRefundEmail(lang, "issued", { ...EXAMPLE, name }).text;
        expect(text, lang).toContain(`\n\n${M4[lang]}\n\n${filled(M5[lang], lang)}`);
        expect(text, lang).not.toContain("{");
        if (lang !== "en") expect(text, lang).not.toMatch(/Hello|there|Thank/);
      }
    }
  });

  it("de keeps the Swiss spelling (no sharp s)", () => {
    expect(renderRefundEmail("de", "issued", EXAMPLE).text).not.toContain("ß");
    expect(renderRefundEmail("de", "pending", EXAMPLE).text).not.toContain("ß");
    const src = readFileSync(join(here, "refund.ts"), "utf8");
    expect(src).not.toContain("ß");
  });

  it("the amount appears in every language, with apostrophe grouping, never as a placeholder", () => {
    for (const lang of LANGS) {
      const out = renderRefundEmail(lang, "issued", { ...EXAMPLE, amountRappen: 1234567 });
      expect(out.text, lang).toContain("CHF 12'345.67");
      expect(out.text, lang).not.toContain("{");
    }
  });

  it("no usable amount (absent, null, zero, negative, fractional, NaN): {amount} stays, never CHF 000 or CHF 0.00", () => {
    for (const amountRappen of [undefined, null, 0, -5, 12.5, Number.NaN]) {
      for (const lang of LANGS) {
        const out = renderRefundEmail(lang, "issued", { ...EXAMPLE, amountRappen });
        expect(out.text, `${lang} ${String(amountRappen)}`).toContain("{amount}");
        expect(out.text, `${lang} ${String(amountRappen)}`).not.toMatch(/CHF/);
      }
    }
  });

  it("sendRefund refuses a mail without a usable amount (missing-copy) and never calls Resend", async () => {
    resendSend.mockClear();
    for (const amountRappen of [null, 0, 12.5]) {
      const outcome = await sendRefund(
        { RESEND_API_KEY: "re_test" },
        { locale: "de", kind: "issued", to: "ada@example.test", name: "Ada", reference: "VT-26-0753", amountRappen },
      );
      expect(outcome).toEqual({ ok: false, error: "missing-copy" });
    }
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("sendRefund sends the signed copy when the amount is usable", async () => {
    resendSend.mockClear();
    const outcome = await sendRefund(
      { RESEND_API_KEY: "re_test" },
      { locale: "fr", kind: "issued", to: "ada@example.test", name: "Ada", reference: "VT-26-0753", amountRappen: 4000 },
    );
    expect(outcome).toEqual({ ok: true, providerMessageId: "msg_1" });
    const payload = (resendSend.mock.calls[0] as unknown as [{ subject: string; text: string }])[0];
    expect(payload.subject).toBe(filled(M1.fr, "fr"));
    expect(payload.text).toContain(filled(M5.fr, "fr", "Ada"));
  });

  it("an old builder subject is gone (only the signed copy renders)", () => {
    const src = readFileSync(join(here, "refund.ts"), "utf8");
    expect(src).not.toContain("Refund issued — Vamos Taxi");
    expect(src).toContain("2026-10-12-refund-mail-copy.md");
  });
});

describe("renderRefundEmail fill", () => {
  it("keeps a name with a replacement pattern ($&) as typed", () => {
    const out = renderRefundEmail("en", "issued", { ...EXAMPLE, name: "Ada $& Lovelace" });
    expect(out.text).toContain("Hello Ada $& Lovelace,\n\nWe have sent CHF 40.00 back");
  });

  it("does not fill a placeholder that sits inside the name", () => {
    const out = renderRefundEmail("en", "pending", { name: "{reference}", reference: "VT-26-0042" });
    expect(out.text).toContain("Thank you, {reference}. A refund for VT-26-0042 will be issued");
  });

  it("still fills name and reference for ordinary values in every language", () => {
    for (const locale of LANGS) {
      for (const kind of ["pending", "issued"] as const) {
        const out = renderRefundEmail(locale, kind, { name: "Ada Lovelace", reference: "VT-26-0042", amountRappen: 4000 });
        expect(out.text).toContain("Ada Lovelace");
        expect(out.text).toContain("VT-26-0042");
        expect(out.text).not.toContain("{");
      }
    }
  });
});

describe("renderRefundEmail phone reads left to right (261002 F1)", () => {
  const WRAPPED = LTR_SPAN(PHONE);
  const data = { name: "Ada", reference: "VT-26-0042", amountRappen: 4000 };

  it("wraps every visible phone in the HTML, in every language", () => {
    for (const locale of LANGS) {
      for (const kind of ["pending", "issued"] as const) {
        const html = renderRefundEmail(locale, kind, data).html;
        expect(html).toContain(WRAPPED);
        expect(html.split(PHONE).length).toBe(html.split(WRAPPED).length);
      }
    }
  });

  it("Arabic text: the phone sits between LRI and PDI", () => {
    const text = renderRefundEmail("ar", "pending", data).text;
    expect(text.endsWith(`\n\n⁦${PHONE}⁩`)).toBe(true);
  });

  it("en/de/fr text keeps its layout and carries no direction marks", () => {
    expect(renderRefundEmail("en", "pending", data).text).toBe(
      "Vamos Taxi\n\nA refund is on the way\n\nThank you, Ada. A refund for VT-26-0042 will be issued to the card you paid with.\n\n+41 79 626 70 82",
    );
    for (const locale of ["de", "fr"] as const) {
      const text = renderRefundEmail(locale, "issued", data).text;
      expect(text.endsWith(`\n\n${PHONE}`)).toBe(true);
      expect(text).not.toMatch(/[‎‏‪-‮⁦-⁩]/);
    }
  });
});

describe("renderRefundEmail, pending kind unchanged", () => {
  const data = { name: "Ada", reference: "VT-26-0042" };

  it("the pending mail carries no amount even when one is passed", () => {
    expect(renderRefundEmail("en", "pending", { ...data, amountRappen: 5000 }).text).not.toContain("CHF");
  });

  it("pending subjects and lines are as before in every language", () => {
    expect(renderRefundEmail("en", "pending", data).subject).toBe("Refund in progress — Vamos Taxi");
    expect(renderRefundEmail("de", "pending", data).text).toContain(
      "Danke, Ada. Eine Rückerstattung für VT-26-0042 wird auf die Karte ausgezahlt, mit der Sie bezahlt haben.",
    );
    expect(renderRefundEmail("fr", "pending", { ...data, name: "" }).text).toContain(
      "Merci. Un remboursement pour VT-26-0042 sera versé sur la carte avec laquelle vous avez payé.",
    );
    expect(renderRefundEmail("ar", "pending", data).subject).toBe("جاري استرداد المبلغ — Vamos Taxi");
  });

  it("says card or payment method, never bank account, in all four languages and both kinds", () => {
    for (const locale of LANGS) {
      for (const kind of ["pending", "issued"] as const) {
        const text = renderRefundEmail(locale, kind, { ...data, amountRappen: 5000 }).text;
        expect(text, `${locale} ${kind}`).not.toMatch(/bank account|Bankkonto|compte bancaire|الحساب المصرفي/i);
      }
    }
  });
});
