import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import {
  ConfirmationEmail,
  confirmationPlainText,
  confirmationSubject,
  formatPaidTotal,
} from "./ConfirmationEmail";
import { coverage } from "./lib/t";
import type { BookingForEmail, EmailLocale } from "./lib/types";

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

  it("plain text and subject carry the reference", () => {
    const b = booking("en");
    expect(confirmationSubject(b)).toContain("VT-10001");
    expect(confirmationPlainText(b)).toContain("VT-10001");
    expect(confirmationPlainText(b)).toContain("CHF 000");
  });
});
