// Decision 2026-10-13 item 17 (D2, quick 261015-6om; line signed as shown by the owner 2026-10-15):
// under Total and PAY, in the rail and the bar, checkout says how long the price is held, from the
// "Price stays valid for" minutes on the current settings row (priceHoldMinutes). Display only: the
// server clocks decide. ICU plural in all four languages (A1.3): no "1 hours", no "1 Stunden".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import ar from "../../i18n/messages/ar.json";
import de from "../../i18n/messages/de.json";
import en from "../../i18n/messages/en.json";
import fr from "../../i18n/messages/fr.json";
import { checkoutWindowHours } from "@/lib/checkout/steps";

vi.mock("@/components/shell/ContactButton", () => ({
  ContactButton: () => <span data-contact-mock="docked" />,
}));

import { PayBar } from "./PayBar";

const messages = { en, de, fr, ar } as const;
type Lang = keyof typeof messages;
const LANGS: Lang[] = ["en", "de", "fr", "ar"];

/** The signed sentence per language and hour count (Arabic forms per CLDR: one, two, few 3-10, many 11-99, other). */
const EXPECTED: Record<Lang, Record<number, string>> = {
  en: {
    1: "This price is held for 1 hour.",
    2: "This price is held for 2 hours.",
    3: "This price is held for 3 hours.",
    11: "This price is held for 11 hours.",
    48: "This price is held for 48 hours.",
  },
  de: {
    1: "Dieser Preis gilt 1 Stunde.",
    2: "Dieser Preis gilt 2 Stunden.",
    3: "Dieser Preis gilt 3 Stunden.",
    11: "Dieser Preis gilt 11 Stunden.",
    48: "Dieser Preis gilt 48 Stunden.",
  },
  fr: {
    1: "Ce prix est maintenu 1 heure.",
    2: "Ce prix est maintenu 2 heures.",
    3: "Ce prix est maintenu 3 heures.",
    11: "Ce prix est maintenu 11 heures.",
    48: "Ce prix est maintenu 48 heures.",
  },
  ar: {
    1: "يُثبَّت هذا السعر لمدة ساعة واحدة.",
    2: "يُثبَّت هذا السعر لمدة ساعتين.",
    3: "يُثبَّت هذا السعر لمدة 3 ساعات.",
    11: "يُثبَّت هذا السعر لمدة 11 ساعة.",
    48: "يُثبَّت هذا السعر لمدة 48 ساعة.",
  },
};

const base = { totalLabel: "Total", total: "CHF 000", payLabel: "Pay", payAmount: "CHF 000", loadingLabel: "Opening payment" } as const;

function holdNote(lang: Lang, minutes: number | null): string | null {
  const t = createTranslator({ locale: lang, messages: messages[lang], namespace: "checkout" });
  const hours = checkoutWindowHours(minutes);
  return hours == null ? null : t("checkoutWindowHours", { hours });
}

describe("checkout hold note: the hours from priceHoldMinutes, four languages, ICU plural", () => {
  for (const lang of LANGS) {
    for (const hours of [1, 2, 3, 11, 48]) {
      it(`${lang}: ${hours} h (${hours * 60} minutes) reads the right plural form`, () => {
        const note = holdNote(lang, hours * 60);
        expect(note).toBe(EXPECTED[lang][hours]);
        expect(note).not.toMatch(/\b1 hours\b|\b1 Stunden\b|\b1 heures\b/);
      });
    }

    it(`${lang}: the rail and the bar render it inside [data-co-hold-note]`, () => {
      const note = holdNote(lang, 2880)!;
      expect(note).toContain("48");
      for (const variant of ["rail", "bar"] as const) {
        const html = renderToString(<PayBar {...base} variant={variant} holdNote={note} />);
        expect(html).toContain(`<p class="vt-copay__reassure" data-co-hold-note="true">${note}</p>`);
      }
    });

    it(`${lang}: no sentence when the minutes are null or not whole hours (90)`, () => {
      expect(holdNote(lang, null)).toBeNull();
      expect(holdNote(lang, 90)).toBeNull();
    });
  }

  it("checkoutWindowHours: null and 90 give null, 2880 gives 48", () => {
    expect(checkoutWindowHours(null)).toBeNull();
    expect(checkoutWindowHours(90)).toBeNull();
    expect(checkoutWindowHours(2880)).toBe(48);
  });

  for (const variant of ["rail", "bar"] as const) {
    it(`${variant}: absent when holdNote is null or not passed`, () => {
      expect(renderToString(<PayBar {...base} variant={variant} holdNote={null} />)).not.toContain("data-co-hold-note");
      expect(renderToString(<PayBar {...base} variant={variant} />)).not.toContain("data-co-hold-note");
    });

    it(`${variant}: order is PAY, charge note, hold note, reassurance`, () => {
      const html = renderToString(
        <PayBar
          {...base}
          variant={variant}
          total="EUR 92.00"
          payAmount="EUR 92.00"
          chargeNote="You are charged in Swiss francs (CHF)."
          holdNote="This price is held for 24 hours."
          reassurance="No charge until the Stripe page."
        />,
      );
      const pay = html.indexOf("data-co-pay=");
      const charge = html.indexOf("data-co-charge-note");
      const hold = html.indexOf("data-co-hold-note");
      const reassure = html.indexOf("No charge until the Stripe page.");
      expect(pay).toBeGreaterThan(0);
      expect(charge).toBeGreaterThan(pay);
      expect(hold).toBeGreaterThan(charge);
      expect(reassure).toBeGreaterThan(hold);
    });

    it(`${variant}: without a charge note the hold note follows PAY and precedes the reassurance`, () => {
      const html = renderToString(
        <PayBar {...base} variant={variant} holdNote="This price is held for 24 hours." reassurance="No charge until the Stripe page." />,
      );
      expect(html.indexOf("data-co-hold-note")).toBeGreaterThan(html.indexOf("data-co-pay="));
      expect(html.indexOf("data-co-hold-note")).toBeLessThan(html.indexOf("No charge until the Stripe page."));
    });
  }

  it("reuses the existing reassurance style: no new colour, no glow", () => {
    const html = renderToString(<PayBar {...base} variant="rail" holdNote="x" />);
    expect(html).toContain('class="vt-copay__reassure" data-co-hold-note');
  });

  it("SummaryRail's usePay wires holdNote from checkoutWindowHours(settings.priceHoldMinutes), so rail and bar both get it", () => {
    const src = readFileSync(join(__dirname, "../../app/[locale]/checkout/sections/SummaryRail.tsx"), "utf8");
    expect(src).toMatch(/import \{ checkoutWindowHours \} from "@\/lib\/checkout\/steps";/);
    expect(src).toMatch(/const holdHours = checkoutWindowHours\(settings\.priceHoldMinutes\);/);
    expect(src).toMatch(/holdNote: holdHours == null \? null : t\("checkoutWindowHours", \{ hours: holdHours \}\),/);
    const usePay = src.slice(src.indexOf("function usePay("), src.indexOf("export function SummaryRail("));
    expect(usePay).toContain("holdNote:");
  });

  it("the message is an ICU plural in every language (Arabic with all six CLDR forms)", () => {
    for (const lang of LANGS) {
      const msg = (messages[lang] as { checkout: Record<string, string> }).checkout.checkoutWindowHours;
      expect(msg, lang).toMatch(/^\{hours, plural, /);
      expect(msg, lang).toContain(" one {");
      expect(msg, lang).toContain(" other {");
      if (lang === "ar") for (const form of ["zero", "one", "two", "few", "many", "other"]) expect(msg).toContain(` ${form} {`);
      if (lang === "de") expect(msg).not.toContain("ß");
    }
  });
});
