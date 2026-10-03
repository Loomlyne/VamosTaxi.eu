// The /confirmation booked page as signed on 2026-10-01
// (.planning/decisions/2026-10-01-confirmation-page.md): two buttons, three steps,
// a help line; time, flight and cancel live on Manage booking only.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import {
  ConfirmationClient,
  type ConfirmationClientProps,
  type ConfirmationFacts,
} from "../../app/[locale]/confirmation/[ref]/ConfirmationClient";
import { confirmationManageHref } from "@/lib/checkout/confirmation-manage-href";

const LOCALES = ["en", "de", "fr", "ar"] as const;
type L = (typeof LOCALES)[number];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(resolve(__dirname, `../../i18n/messages/${l}.json`), "utf8"))]),
) as Record<L, Record<string, unknown>>;

// The owner-approved English, read from the decision file, never retyped.
const decision = readFileSync(
  resolve(__dirname, "../../../../.planning/decisions/2026-10-01-confirmation-page.md"),
  "utf8",
);
const approvedSection = decision.split("## Approved English text")[1]!;
const approvedSteps = [...approvedSection.matchAll(/^\d\. (.+?) \/ (.+)$/gm)].map((m) => [m[1]!, m[2]!]);
const approvedHint = /^Under the two buttons: (.+)$/m.exec(approvedSection)![1]!;
const approvedHelp = /^Help line: (.+)$/m.exec(approvedSection)![1]!;

const decode = (s: string) =>
  s
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<!-- -->/g, "");
const text = (html: string) => decode(html.replace(/<!-- -->/g, "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ");

const booked = {
  visible: true,
  reference: "VT-26-0801",
  status: "confirmed",
  paymentStatus: "succeeded",
  pickupText: "Zurich Airport (ZRH)",
  dropoffText: "Bahnhofstrasse 1, 8001 Zürich",
  scheduledLocal: "2026-10-12T08:15",
  vehicleClassId: "",
  vehicleClassSlug: "business",
  pax: 2,
  bags: 1,
  flightNo: "LX 318",
  extras: [],
  contactName: "Mia Keller",
  contactEmail: "mia@example.com",
  contactPhone: "",
  couponCode: null,
  discountRappen: null,
  subtotalRappen: null,
  priceTotalRappen: null,
  fareLines: [],
  durationMin: 22,
  distanceKm: null,
  paidAt: null,
  refundStatus: null,
  refundOwedRappen: null,
  refundedRappen: null,
  receipt: { rows: [], chargedRappen: null, presentment: null, vehicleClassName: null },
} as unknown as ConfirmationFacts;

function props(over: Partial<ConfirmationClientProps> = {}): ConfirmationClientProps {
  return {
    locale: "en",
    reference: "VT-26-0801",
    initialPhase: "confirmed",
    booking: booked,
    freeCancelHours: 24,
    manageHref: "/en/manage-booking",
    ...over,
  };
}

function render(el: ReactElement, locale: L = "en") {
  return renderToString(
    <NextIntlClientProvider locale={locale} messages={messages[locale]} onError={() => {}}>
      {el}
    </NextIntlClientProvider>,
  );
}

function actionButtons(html: string): string[] {
  const row = /<div[^>]*data-confirmation-actions[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";
  return row.match(/<(a|button)[^>]*class="vt-btn[^"]*"[^>]*>/g) ?? [];
}

describe("/confirmation booked page (signed 2026-10-01)", () => {
  it("has exactly two buttons: MANAGE BOOKING to the server's link, then DOWNLOAD VOUCHER", () => {
    const html = render(<ConfirmationClient {...props({ manageHref: "/en/booking-detail?ref=VT-26-0801" })} />);
    expect(html).toContain('data-confirmation-state="booked"');
    const buttons = actionButtons(html);
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toContain('href="/en/booking-detail?ref=VT-26-0801"');
    expect(buttons[0]).toContain("vt-btn--primary");
    expect(buttons[1]).toContain("vt-btn--secondary");
    const words = text(html);
    expect(words).toContain("Manage booking");
    expect(words).toContain("Download voucher");
  });

  it("has no time, flight or cancel controls and calls no sign-in-only route", () => {
    const html = render(<ConfirmationClient {...props()} />);
    expect(html).not.toContain("data-time-change");
    expect(html).not.toContain("data-flight");
    expect(html).not.toContain("<input");
    expect(html).not.toContain('role="dialog"');
    const words = text(html);
    expect(words).not.toContain("Cancel booking");
    expect(words).not.toContain("Request time change");
    expect(words).not.toContain("By continuing you accept");
    const src = readFileSync(resolve(__dirname, "../../app/[locale]/confirmation/[ref]/ConfirmationClient.tsx"), "utf8");
    expect(src).not.toContain("/api/account/bookings");
  });

  it("shows the approved English word for word: three steps, the hint and the help line", () => {
    expect(approvedSteps).toHaveLength(3);
    const html = render(<ConfirmationClient {...props()} />);
    const words = text(html);
    expect(html.match(/data-confirmation-step=/g)).toHaveLength(3);
    for (const [title, body] of approvedSteps) {
      expect(words).toContain(title);
      expect(words).toContain(body);
    }
    expect(words).toContain(approvedHint);
    const help = /<p[^>]*data-confirmation-help[^>]*>([\s\S]*?)<\/p>/.exec(html)![1]!;
    expect(decode(help.replace(/<[^>]*>/g, ""))).toBe(approvedHelp);
    expect(html).toContain('href="tel:+41796267082"');
    expect(html).toContain("wa.me/41796267082");
  });

  it("takes the free-cancel hours from settings, and shows a TBC gap when they are unknown", () => {
    const known = render(<ConfirmationClient {...props({ freeCancelHours: 48 })} />);
    expect(text(known)).toContain("Free cancellation up to 48 hours before pickup.");
    expect(known).not.toContain("data-tok");
    const unknown = render(<ConfirmationClient {...props({ freeCancelHours: null })} />);
    expect(unknown).toMatch(/<span data-tok="true">free cancel window<\/span>/);
    expect(text(unknown)).not.toMatch(/up to \d+ hours/);
  });

  it("is translated in de, fr and ar: no message key left on the page", () => {
    for (const l of ["de", "fr", "ar"] as const) {
      const html = render(<ConfirmationClient {...props({ locale: l })} />, l);
      const words = text(html);
      expect(words).not.toMatch(/checkout\.[a-zA-Z]/);
      for (const [title] of approvedSteps) expect(words).not.toContain(title);
      expect(words).not.toContain(approvedHint);
      expect(html.match(/data-confirmation-step=/g)).toHaveLength(3);
    }
  });

  it("an unpaid booking shows FINISH PAYMENT alone and no next steps", () => {
    const unpaid = { ...booked, status: "pending", paymentStatus: null } as unknown as ConfirmationFacts;
    const html = render(<ConfirmationClient {...props({ booking: unpaid })} />);
    const buttons = actionButtons(html);
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toContain('href="/en/checkout"');
    expect(html).not.toContain("data-confirmation-next");
  });

  it("a cancelled booking keeps its heading and the two buttons, without next steps", () => {
    const cancelled = { ...booked, status: "cancelled" } as unknown as ConfirmationFacts;
    const html = render(<ConfirmationClient {...props({ booking: cancelled })} />);
    expect(html).toContain('data-confirmation-state="cancelled"');
    expect(actionButtons(html)).toHaveLength(2);
    expect(html).not.toContain("data-confirmation-next");
    expect(text(html)).not.toContain("Cancel booking");
  });
});

describe("confirmationManageHref", () => {
  it("guest read through the manage cookie opens /manage-booking (the cookie loads it)", () => {
    expect(confirmationManageHref("en", "VT-26-0801", "cookie")).toBe("/en/manage-booking");
  });
  it("session-only read opens the account's booking by reference", () => {
    expect(confirmationManageHref("de", "VT-26-0801", "account")).toBe("/de/booking-detail?ref=VT-26-0801");
  });
  it("nothing read yet falls back to /manage-booking", () => {
    expect(confirmationManageHref("fr", "VT-26-0801", null)).toBe("/fr/manage-booking");
  });
});
