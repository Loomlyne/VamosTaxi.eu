import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import {
  ConfirmationEmail,
  confirmationPlainText,
  confirmationSubject,
  formatPaidTotal,
} from "./ConfirmationEmail";
import { coverage } from "./lib/t";
import type { BookingForEmail, EmailLocale, EmailMoney } from "./lib/types";

const LOCALES: EmailLocale[] = ["en", "de", "fr", "ar"];

function booking(locale: EmailLocale, totalRappen: number | null = null): BookingForEmail {
  return {
    reference: "VT-10001",
    contactName: "Ada",
    contactEmail: "ada@example.test",
    locale,
    displayCurrency: "CHF",
    totalRappen,
    manageUrl: "https://vamostaxi.site/en/manage?token=raw-token",
    legs: [
      {
        legSeq: 1,
        direction: "outbound",
        pickupText: "Zurich Airport (ZRH), Terminal 2",
        dropoffText: "Zurich, Bahnhofstrasse 1",
        scheduledLocal: "2026-09-06T10:00",
        scheduledAt: "2026-09-06T08:00:00.000Z",
        flightNo: "LX123",
        vehicleClassLabel: "Economy",
        pax: 2,
        bags: 1,
        estimatedDurationMinutes: 25,
      },
    ],
  };
}

describe("coverage", () => {
  it("is this package's i18n:check — every English key exists in de/fr/ar", () => {
    expect(coverage()).toEqual([]);
  });
});

describe("formatPaidTotal", () => {
  it("renders the placeholder when the total is null", () => {
    expect(formatPaidTotal(null)).toBe("CHF 000");
  });

  it("groups francs with an apostrophe", () => {
    expect(formatPaidTotal(123450)).toBe(["CHF ", "1'234.50"].join(""));
  });
});

describe("ConfirmationEmail", () => {
  it.each(LOCALES)("renders %s without fallback markers", async (locale) => {
    const html = await render(ConfirmationEmail({ booking: booking(locale) }));
    expect(html).not.toMatch(/\{[a-zA-Z.]+\}/);
    expect(html).toContain("VT-10001");
    expect(html).toContain("CHF 000");
    expect(html).toContain("wordmark-email.png");
    expect(html).toContain("#FDC20B");
    expect(html).toContain('width="216"');
    expect(html).toContain('height="30"');
    expect(html).not.toMatch(/yellow-50/);
    expect(html).not.toMatch(/#FFF8|#FEF3|#FFFBEB/);
    expect(html).toMatchSnapshot();
  });

  it("sets dir=rtl on the Arabic root", async () => {
    const html = await render(ConfirmationEmail({ booking: booking("ar") }));
    expect(html).toMatch(/dir="rtl"/);
  });

  it("keeps the reference LTR inside Arabic", async () => {
    const html = await render(ConfirmationEmail({ booking: booking("ar") }));
    expect(html).toContain("VT-10001");
    expect(html).toContain("direction:ltr");
  });

  it("puts the dispatch phone in a left-to-right island, message text unchanged (261002 F1)", async () => {
    const island = '<span style="unicode-bidi:isolate;direction:ltr;white-space:nowrap">+41 79 626 70 82</span>';
    const ar = await render(ConfirmationEmail({ booking: booking("ar") }));
    expect(ar).toContain(`التشغيل ${island}`);
    for (const locale of ["en", "de", "fr"] as const) {
      const html = await render(ConfirmationEmail({ booking: booking(locale) }));
      expect(html).toContain(`Dispatch ${island}`);
    }
    for (const locale of LOCALES) {
      const html = await render(ConfirmationEmail({ booking: booking(locale) }));
      expect(html.split("+41 79 626 70 82").length).toBe(html.split(island).length);
    }
  });

  it("plain text: Arabic dispatch phone in LRI…PDI; en/de/fr line byte for byte as before", () => {
    const lines = (locale: EmailLocale) => confirmationPlainText(booking(locale)).split("\n");
    expect(lines("ar")).toContain("التشغيل ⁦+41 79 626 70 82⁩");
    for (const locale of ["en", "de", "fr"] as const) {
      expect(lines(locale)).toContain("Dispatch +41 79 626 70 82");
      expect(confirmationPlainText(booking(locale))).not.toMatch(/[‎‏‪-‮⁦-⁩]/);
    }
  });

  it("plain text and subject carry the reference", () => {
    const b = booking("en");
    expect(confirmationSubject(b)).toContain("VT-10001");
    expect(confirmationPlainText(b)).toContain("VT-10001");
    expect(confirmationPlainText(b)).toContain("CHF 000");
  });

  it("does not claim a driver is booked before assignment", async () => {
    const html = await render(ConfirmationEmail({ booking: booking("en") }));
    const text = confirmationPlainText(booking("en"));
    expect(html).toContain("Booked");
    expect(html).not.toMatch(/driver is booked/i);
    expect(text).toContain("Booked");
    expect(text).not.toMatch(/driver is booked/i);
    expect(confirmationSubject(booking("en"))).toMatch(/^Booked/);
  });

  it("lists extras on the voucher when they were booked", async () => {
    const withExtras = { ...booking("en"), extras: [{ name: "Child seat", amountRappen: null }] };
    const html = await render(ConfirmationEmail({ booking: withExtras }));
    const text = confirmationPlainText(withExtras);
    expect(html).toContain("Child seat");
    expect(html).toContain("Extras");
    expect(text).toContain("Child seat");
    expect(text).toContain("Extras");
  });

  it("has no Confirmed / Booking confirmed status text in any language", async () => {
    for (const locale of LOCALES) {
      const html = await render(ConfirmationEmail({ booking: booking(locale) }));
      expect(html).not.toMatch(/Booking confirmed|is confirmed|Confirmed/);
    }
    expect(confirmationSubject(booking("de"))).toMatch(/^Gebucht/);
    expect(confirmationSubject(booking("fr"))).toMatch(/^Réservé/);
    expect(confirmationSubject(booking("ar"))).toContain("تم الحجز");
  });

  it("uses plural forms for travellers and bags", () => {
    const one = booking("en");
    one.legs = one.legs.map((l) => ({ ...l, pax: 1, bags: 1 }));
    expect(confirmationPlainText(one)).toContain("1 passenger · 1 bag");
    expect(confirmationPlainText(booking("en"))).toContain("2 passengers · 1 bag");
    expect(confirmationPlainText(booking("de"))).toContain("2 Passagiere");
    const arOne = booking("ar");
    arOne.legs = arOne.legs.map((l) => ({ ...l, pax: 1 }));
    expect(confirmationPlainText(arOne)).toContain("راكب واحد");
    const arFew = booking("ar");
    arFew.legs = arFew.legs.map((l) => ({ ...l, pax: 3 }));
    expect(confirmationPlainText(arFew)).toContain("3 ركاب");
  });

  it("renders the class name as given, not a slug", async () => {
    const b = booking("en");
    b.legs = b.legs.map((l) => ({ ...l, vehicleClassLabel: "Business" }));
    const html = await render(ConfirmationEmail({ booking: b }));
    expect(html).toContain("Business");
    expect(html).not.toMatch(/saden/i);
  });

  it("shows the extra name in the booking language, falling back to English", async () => {
    const b = {
      ...booking("de"),
      extras: [
        { name: "Child seat", names: { en: "Child seat", de: "Kindersitz" }, amountRappen: null },
        { name: "Skis", names: { en: "Skis" }, amountRappen: null },
      ],
    };
    const html = await render(ConfirmationEmail({ booking: b }));
    expect(html).toContain("Kindersitz");
    expect(html).toContain("Skis");
  });

  it("escapes markup in extra and contact names", async () => {
    const b = {
      ...booking("en"),
      contactName: "<b>Ada</b>",
      extras: [{ name: "<b>x</b>", amountRappen: null }],
    };
    const html = await render(ConfirmationEmail({ booking: b }));
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("money block (S6)", () => {
  const money: EmailMoney = {
    lines: [
      { kind: "fare", label: "Business", amountRappen: 10000 },
      { kind: "surcharge", label: "Child seat", amountRappen: 1500 },
      { kind: "surcharge", label: "Skis", amountRappen: 2000 },
      { kind: "coupon", label: "WELCOME", amountRappen: -1000 },
      { kind: "vat", label: "", amountRappen: 950 },
    ],
    vatRateBps: 81,
    chargedRappen: 12500,
    presentment: null,
  };

  it("lists rows in order and the total equals chargedRappen", async () => {
    const b = { ...booking("en", 99999), money };
    const html = await render(ConfirmationEmail({ booking: b }));
    const order = ["Fare · Business", "Child seat", "Skis", "Voucher WELCOME", "VAT 8.1 %", "Total paid"];
    let at = -1;
    for (const label of order) {
      const idx = html.indexOf(label, at + 1);
      expect(idx, label).toBeGreaterThan(at);
      at = idx;
    }
    expect(html).toContain("CHF 125.00");
    expect(html).toContain("\u2212CHF 10.00");
    expect(html).not.toContain("999.99");
    expect(html).not.toMatch(/You paid/);
    expect(html).not.toMatch(/\{[a-zA-Z.]+\}/);
  });

  it("adds the muted presentment line only when the currency is not CHF", async () => {
    const b = { ...booking("en"), money: { ...money, presentment: { amountMinor: 13400, currency: "EUR" } } };
    const html = await render(ConfirmationEmail({ booking: b }));
    expect(html).toContain("You paid EUR 134.00 in EUR. Vamos received CHF 125.00.");
    const chf = { ...booking("en"), money: { ...money, presentment: { amountMinor: 12500, currency: "CHF" } } };
    expect(await render(ConfirmationEmail({ booking: chf }))).not.toMatch(/You paid/);
  });

  it.each(LOCALES)("renders %s money block with no placeholder left", async (locale) => {
    const b = { ...booking(locale), money: { ...money, presentment: { amountMinor: 13400, currency: "EUR" } } };
    const html = await render(ConfirmationEmail({ booking: b }));
    expect(html).not.toMatch(/\{[a-zA-Z.]+\}/);
    expect(confirmationPlainText(b)).not.toMatch(/\{[a-zA-Z.]+\}/);
    expect(html).toContain("8.1");
  });
});
