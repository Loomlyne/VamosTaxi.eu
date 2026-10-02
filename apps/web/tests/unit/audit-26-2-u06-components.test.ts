// 26.2 audit unit 06: a11y / correctness fixes in apps/web/components (customer-reachable ones).
// Rendered with react-dom/server (no DOM emulator in this repo), real message files.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { nextTrapTarget } from "@/lib/a11y/focus-trap";
import { Input } from "@/components/forms/Input";
import { Select } from "@/components/forms/Select";
import { Textarea } from "@/components/forms/Textarea";
import { PhoneField } from "@/components/forms/PhoneField";
import { VehicleCard } from "@/components/transfer/VehicleCard";
import { PriceSummary } from "@/components/transfer/PriceSummary";
import { BookingVoucher } from "@/components/booking/BookingVoucher";
import { FlightField } from "@/components/booking/FlightField";

const LOCALES = ["en", "de", "fr", "ar"] as const;
type L = (typeof LOCALES)[number];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(resolve(__dirname, `../../i18n/messages/${l}.json`), "utf8"))]),
) as Record<L, Record<string, any>>;

function render(el: ReactElement, locale: L = "en") {
  return renderToString(createElement(NextIntlClientProvider, { locale, messages: messages[locale], children: el }));
}

describe("U06-5 / U06-6: Tab trap target", () => {
  const items = ["a", "b", "c"];
  it("wraps Tab from the last item to the first and Shift+Tab from the first to the last", () => {
    expect(nextTrapTarget(items, "c", false)).toBe("a");
    expect(nextTrapTarget(items, "a", true)).toBe("c");
  });
  it("leaves the middle alone, and pulls focus in when it sits outside the dialog", () => {
    expect(nextTrapTarget(items, "b", false)).toBeNull();
    expect(nextTrapTarget(items, "b", true)).toBeNull();
    expect(nextTrapTarget(items, null, false)).toBe("a");
    expect(nextTrapTarget(items, "outside", true)).toBe("c");
  });
  it("does nothing for an empty dialog", () => {
    expect(nextTrapTarget([], null, false)).toBeNull();
  });
});

describe("U06-7: error and hint text is tied to the control", () => {
  it("Input: describedby points at the error span; required reaches the input; star is hidden", () => {
    const html = render(createElement(Input, { id: "em", label: "Email", error: "Check the email address", required: true }));
    expect(html).toMatch(/<input[^>]*aria-describedby="em-msg"/);
    expect(html).toMatch(/<input[^>]*aria-required="true"/);
    expect(html).toMatch(/<span class="vt-field__err" id="em-msg">/);
    expect(html).toContain('class="vt-field__req" aria-hidden="true"');
  });
  it("Input: a hint is described too, and a caller's own describedby is kept", () => {
    const html = render(createElement(Input, { id: "h", label: "Name", hint: "As on your passport", "aria-describedby": "extra" }));
    expect(html).toMatch(/<input[^>]*aria-describedby="extra h-msg"/);
    expect(html).toContain('class="vt-field__hint" id="h-msg"');
    expect(html).not.toContain("aria-required");
  });
  it("Input: no message, no describedby", () => {
    expect(render(createElement(Input, { id: "n", label: "Name" }))).not.toContain("aria-describedby");
  });
  it("Select and Textarea carry the same describedby", () => {
    const sel = render(createElement(Select, { id: "s", label: "Class", options: ["a"], error: "Pick one" }));
    expect(sel).toMatch(/<select[^>]*aria-describedby="s-msg"/);
    expect(sel).toContain('id="s-msg"');
    const area = render(createElement(Textarea, { id: "t", label: "Note", hint: "Optional" }));
    expect(area).toMatch(/<textarea[^>]*aria-describedby="t-msg"/);
  });
  it("PhoneField: describedby, aria-required", () => {
    const html = render(
      createElement(PhoneField, { id: "p", label: "Phone", value: "", onChange: () => {}, error: "Check the number", required: true }),
    );
    expect(html).toMatch(/<input[^>]*aria-describedby="p-msg"/);
    expect(html).toMatch(/<input[^>]*aria-required="true"/);
    expect(html).toContain('role="alert" id="p-msg"');
  });
});

describe("U06-8 / U06-2: flight field", () => {
  it("every language has the day-group name, and it is not the word for today", () => {
    for (const l of LOCALES) {
      const q = messages[l].quote.flight;
      expect(typeof q.dayGroup).toBe("string");
      expect(q.dayGroup.length).toBeGreaterThan(3);
      expect(q.dayGroup).not.toBe(q.today);
    }
  });
  it("renders idle (no card) and keeps its source wired to the trip date and a live region", () => {
    const html = render(createElement(FlightField, { value: "", date: "2031-05-02", onChange: () => {} }));
    expect(html).toContain("data-checkout-flight");
    const src = readFileSync(resolve(__dirname, "../../components/booking/FlightField.tsx"), "utf8");
    expect(src).toContain('aria-live="polite"');
    expect(src).toContain('aria-label={t("dayGroup")}');
    expect(src).toMatch(/useEffect\(\(\) => \{\s*setChoice\(dayOf\(tripDate\)\);[\s\S]*?\[tripDate\]/);
  });
});

describe("U06-11: footer social names are translated", () => {
  it("YouTube and TikTok exist in all four languages and are not the English copy outside en", () => {
    for (const l of LOCALES) {
      const f = messages[l].footer;
      expect(f["vamos-taxi-on-youtube"]).toMatch(/YouTube|يوتيوب/);
      expect(f["vamos-taxi-on-tiktok"]).toMatch(/TikTok|تيك توك/);
      if (l !== "en") {
        expect(f["vamos-taxi-on-youtube"]).not.toBe(messages.en.footer["vamos-taxi-on-youtube"]);
        expect(f["vamos-taxi-on-tiktok"]).not.toBe(messages.en.footer["vamos-taxi-on-tiktok"]);
      }
    }
    const src = readFileSync(resolve(__dirname, "../../components/shell/SiteFooter.tsx"), "utf8");
    expect(src).not.toContain('aria-label="Vamos Taxi on');
    expect(src).toContain('tFooter("vamos-taxi-on-youtube")');
    expect(src).toContain('tFooter("vamos-taxi-on-tiktok")');
  });
});

describe("U06-17 / U06-18: transfer components", () => {
  it("VehicleCard: no heading or paragraph inside the button", () => {
    const html = renderToString(createElement(VehicleCard, { name: "Economy", examples: "Skoda Superb", price: "CHF 000" }));
    expect(html).not.toMatch(/<h4/);
    expect(html).not.toMatch(/<p[ >]/);
    expect(html).toContain('<span class="vt-veh__name">Economy</span>');
    expect(html).toContain('<span class="vt-veh__examples">Skoda Superb</span>');
  });
  it("list keys are position plus label, never the bare label (equal labels used to collide)", () => {
    // renderToString does not report duplicate keys, so the contract is pinned on the source.
    for (const f of ["PriceSummary", "RouteSummary", "VehicleCard"]) {
      const src = readFileSync(resolve(__dirname, `../../components/transfer/${f}.tsx`), "utf8");
      expect(src).not.toMatch(/key=\{typeof \w+\.label === "string" \? \w+\.label : i\}/);
      expect(src).toMatch(/key=\{`\$\{i\}-/);
    }
    // And two equal labels still render both rows.
    const html = renderToString(
      createElement(PriceSummary, {
        lines: [
          { label: "Transfer", amount: 10 },
          { label: "Transfer", amount: 20 },
        ],
        total: 30,
        totalLabel: "Total",
      }),
    );
    expect(html.match(/Transfer/g)).toHaveLength(2);
  });
});

describe("U06-1 / U06-19: booking voucher", () => {
  const booking = {
    pickupText: "Zurich Airport",
    dropoffText: "Bahnhofstrasse 1",
    scheduledLocal: "2031-05-02T09:30:00",
    pax: 2,
    status: "completed",
    paymentStatus: "captured",
    vehicleClassSlug: "economy",
    priceTotalRappen: 12000,
    extras: ["meet_greet"] as any,
    fareLines: [
      { code: "distance_fare", vehicleClass: "economy", amountRappen: 9000, kind: "fare" },
      { code: "meet_greet", vehicleClass: "", amountRappen: 2000, kind: "surcharge", i18nKey: "price.surcharge.custom", params: { names: { en: "Meet and greet" } } },
      { code: "vat", vehicleClass: "", amountRappen: 900, kind: "vat", params: { vatRateBps: 81 } },
    ],
    receipt: {
      vehicleClassName: "Economy",
      rows: [
        { kind: "fare", label: "Fare", amountRappen: 9000 },
        { kind: "extra", label: "Meet and greet", amountRappen: 2000 },
        { kind: "vat", label: "VAT 8.1 %", labelKey: "price.line.vat", amountRappen: 900 },
        { kind: "total", label: "Total paid", amountRappen: 12000 },
      ],
    },
  };
  const voucher = (b: any, locale: L = "en") =>
    render(createElement(BookingVoucher, { locale, reference: "VT-4821", booking: b }), locale);

  it("an owner-added extra shows by its own name as its own money line, once", () => {
    const html = voucher(booking);
    expect(html).toContain("Meet and greet");
    expect(html.match(/Meet and greet/g)).toHaveLength(1);
    expect(html).toContain("Fare · Economy");
    expect(html).not.toMatch(/Transfer · Economy/);
  });

  it("refund line: payout date is localised, isolated for Arabic, and no literal '. ' joiner", () => {
    const refunded = { ...booking, status: "refunded", refundStatus: "refunded", payoutCountry: "CH", availableOn: "2031-10-05T00:00:00Z" };
    const en = voucher(refunded, "en");
    expect(en).not.toContain("2031-10-05");
    expect(en).toContain("5 October 2031");
    expect(en).toContain("data-confirmation-refund-copy");
    expect(en).not.toMatch(/\. Refunded to your/);
    const de = voucher(refunded, "de");
    expect(de).toContain("5. Oktober 2031");
    const ar = voucher(refunded, "ar");
    expect(ar).not.toContain("2031-10-05");
    expect(ar).toContain("⁦");
    expect(ar).toContain("⁩");
  });
});
