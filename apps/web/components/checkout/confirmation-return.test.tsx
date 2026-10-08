// J5: the confirmation page on the return path from Stripe (W3-01, W3-03, W3-04, W3-06, W3-15).
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";

const search = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(search.value),
}));

import {
  ConfirmationClient,
  type ConfirmationClientProps,
  type ConfirmationFacts,
} from "../../app/[locale]/confirmation/[ref]/ConfirmationClient";

const LOCALES = ["en", "de", "fr", "ar"] as const;
type L = (typeof LOCALES)[number];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(resolve(__dirname, `../../i18n/messages/${l}.json`), "utf8"))]),
) as Record<L, Record<string, unknown>>;

const pending = {
  visible: true,
  reference: "VT-26-0801",
  status: "pending",
  paymentStatus: null,
  pickupText: "",
  dropoffText: "",
  scheduledLocal: "",
  vehicleClassId: "",
  vehicleClassSlug: "",
  pax: 0,
  bags: 0,
  flightNo: "",
  extras: [],
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  couponCode: null,
  discountRappen: null,
  subtotalRappen: null,
  priceTotalRappen: null,
  fareLines: [],
  durationMin: null,
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
    initialPhase: "processing",
    booking: pending,
    freeCancelHours: 24,
    manageHref: "/en/manage-booking",
    ...over,
  };
}

function render(query: string, el: ReactElement, locale: L = "en") {
  search.value = query;
  return renderToString(
    <NextIntlClientProvider locale={locale} messages={messages[locale]} onError={() => {}}>
      {el}
    </NextIntlClientProvider>,
  );
}

const words = (html: string) =>
  html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

describe("return from Stripe, Stripe unreadable (check=1)", () => {
  it("says it is checking, never that the payment went through", () => {
    const html = render("check=1", <ConfirmationClient {...props()} />);
    expect(html).toContain('data-confirmation-state="checking"');
    const text = words(html);
    expect(text).toContain("We are checking your payment");
    expect(text).not.toContain("Your payment went through");
    expect(text).not.toContain("Payment received");
    expect(text).toContain("VT-26-0801");
  });

  it("without the flag the normal confirming copy is unchanged", () => {
    const html = render("", <ConfirmationClient {...props()} />);
    expect(html).toContain('data-confirmation-state="confirming"');
    expect(words(html)).toContain("Your payment went through");
  });
});

describe("refunded duplicate payer with no booking readable (W3-03)", () => {
  it("shows the refunded card, not the confirming screen, in all four languages", () => {
    for (const locale of LOCALES) {
      const html = render("charge=refunded", <ConfirmationClient {...props({ locale })} />, locale);
      expect(html, locale).toContain('data-confirmation-state="refunded-duplicate"');
      expect(html, locale).toContain("data-confirmation-charge-refunded");
      expect(html, locale).not.toContain("data-confirmation-phase");
      const text = words(html);
      const m = messages[locale] as { checkout: Record<string, string> };
      expect(text, locale).toContain(m.checkout.payLinkRaceRefundedTitle);
      expect(text, locale).not.toContain(m.checkout.confirmingTitle!);
      expect(text, locale).not.toContain(m.checkout.receivedTitle!);
    }
  });

  it("a payer who can read the confirmed booking keeps the booking page with the notice", () => {
    const html = render("charge=refunded", <ConfirmationClient {...props({ initialPhase: "confirmed", booking: { ...pending, status: "confirmed", paymentStatus: "succeeded" } as ConfirmationFacts })} />);
    expect(html).not.toContain('data-confirmation-state="refunded-duplicate"');
    expect(html).toContain("data-confirmation-charge-refunded");
  });
});

describe("FINISH PAYMENT on an unpaid booking (W3-06)", () => {
  const unpaid = { ...pending, status: "pending", paymentStatus: null } as ConfirmationFacts;
  it("links to the booking's checkout resume", () => {
    const html = render("", <ConfirmationClient {...props({ initialPhase: "confirmed", booking: unpaid, finishHref: "/checkout?resume=11111111-2222-4333-8444-555555555555" })} />);
    const btn = /<a[^>]*data-confirmation-finish[^>]*>/.exec(html)?.[0] ?? "";
    expect(btn).toContain('href="/checkout?resume=11111111-2222-4333-8444-555555555555"');
    expect(html).not.toMatch(/href="\/en\/checkout"/);
  });
  it("shows no finish button when the server cannot name the booking's checkout", () => {
    const html = render("", <ConfirmationClient {...props({ initialPhase: "confirmed", booking: unpaid })} />);
    expect(html).not.toContain("data-confirmation-finish");
    expect(words(html)).not.toContain("Finish payment");
  });
});

describe("poll budget (W3-04), source-level", () => {
  const src = readFileSync(resolve(__dirname, "../../app/[locale]/confirmation/[ref]/ConfirmationClient.tsx"), "utf8");
  it("the stalled phase stops the poll and offers Check again", () => {
    expect(src).toContain('returnPhase === "stalled"');
    expect(src).toContain("data-confirmation-check-again");
    // polling is armed only while waiting, and waiting excludes stalled
    expect(src).toMatch(/const waiting = !refundedOnly && \(returnPhase === "confirming" \|\| returnPhase === "received"\)/);
  });
});
