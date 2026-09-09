import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import { PayLinkEmail, payLinkPlainText, payLinkSubject } from "./PayLinkEmail";
import { coverage } from "./lib/t";
import type { EmailLocale, PayLinkForEmail } from "./lib/types";

const LOCALES: EmailLocale[] = ["en", "de", "fr", "ar"];

function link(locale: EmailLocale, totalRappen: number | null = null): PayLinkForEmail {
  return {
    reference: "VT-10001",
    locale,
    payUrl: "https://vamostaxi.site/checkout/pay/tok",
    totalRappen,
    pickupText: "Zurich Airport (ZRH), Terminal 2",
    dropoffText: "Zurich, Bahnhofstrasse 1",
    scheduledLocal: "2026-09-22T19:55",
    flightNo: "LX123",
    vehicleClass: "business",
    pax: 2,
    bags: 1,
    extras: ["child_seat"],
    coupon: null,
    contactName: "Ada",
    contactPhone: "+41 79 000 00 00",
    companyName: "",
    companyAddress: "",
    companyVat: "",
  };
}

describe("coverage", () => {
  it("is this package's i18n:check — every English key exists in de/fr/ar", () => {
    expect(coverage()).toEqual([]);
  });
});

describe("PayLinkEmail", () => {
  it.each(LOCALES)("renders %s with trip, amount, button, and URL", async (locale) => {
    const html = await render(PayLinkEmail({ link: link(locale) }));
    expect(html).not.toMatch(/\{[a-zA-Z.]+\}/);
    expect(html).toContain("VT-10001");
    expect(html).toContain("CHF 000");
    expect(html).toContain("Zurich Airport (ZRH), Terminal 2");
    expect(html).toContain("Zurich, Bahnhofstrasse 1");
    expect(html).toContain("https://vamostaxi.site/checkout/pay/tok");
    expect(html).toContain("LX123");
    expect(html).toContain("Ada");
  });

  it("plain text and subject carry the pay URL", () => {
    const payload = link("en");
    expect(payLinkSubject(payload)).toContain("VT-10001");
    expect(payLinkPlainText(payload)).toContain("https://vamostaxi.site/checkout/pay/tok");
    expect(payLinkPlainText(payload)).toContain("Zurich Airport (ZRH), Terminal 2");
  });
});
