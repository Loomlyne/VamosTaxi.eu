// apps/web/tests/support/checkout-fixtures.ts
//
// Typed response fixtures for the hosted-Stripe funnel (26.3 D-38). Amounts are integers
// used only for arithmetic assertions; specs must never assert them as visible book prices
// (public amounts stay CHF 000 until the owner goes live).

import type { Page, Route } from "@playwright/test";

export type FixtureClass = {
  vehicle_class: "economy" | "business" | "van_luxury";
  name: "Economy" | "Business" | "Van luxury";
  max_pax: number;
  fits: boolean;
  /** Arithmetic-only rappen value. */
  amount_rappen: number;
};

export const QUOTE_CLASSES: FixtureClass[] = [
  { vehicle_class: "economy", name: "Economy", max_pax: 4, fits: true, amount_rappen: 100 },
  { vehicle_class: "business", name: "Business", max_pax: 4, fits: true, amount_rappen: 200 },
  // Van luxury seats more; Economy and Business are "too small" for pax 5.
  { vehicle_class: "van_luxury", name: "Van luxury", max_pax: 7, fits: true, amount_rappen: 300 },
];

/** Classes with `fits` recomputed for a party size (pax 5 leaves only the van). */
export function classesFor(pax: number): FixtureClass[] {
  return QUOTE_CLASSES.map((c) => ({ ...c, fits: c.max_pax >= pax }));
}

export const quoteOk = (pax = 2) => ({
  ok: true as const,
  quote_id: "00000000-0000-4000-8000-0000000000q1",
  expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
  distance_km: 18.4,
  classes: classesFor(pax),
});

export const quoteError = (code = "no_route") => ({
  ok: false as const,
  error: { code, message: code },
});

export const quotePricingNotLive = () => ({
  ok: false as const,
  error: { code: "pricing_not_live", message: "pricing_not_live" },
});

export type FixtureExtra = {
  code: string;
  labels: { en: string; de: string; fr: string; ar: string };
  amount_rappen: number | null;
};

export const EXTRAS_TWO: FixtureExtra[] = [
  {
    code: "child_seat",
    labels: { en: "Child seat", de: "Kindersitz", fr: "Siège enfant", ar: "مقعد أطفال" },
    amount_rappen: 100,
  },
  {
    code: "extra_luggage",
    labels: { en: "Extra luggage", de: "Zusatzgepäck", fr: "Bagage supplémentaire", ar: "أمتعة إضافية" },
    amount_rappen: 100,
  },
];

export const extrasList = (extras: FixtureExtra[] = EXTRAS_TWO) => ({
  ok: true as const,
  extras,
  vat_rate_bps: 0,
});
export const extrasEmpty = () => extrasList([]);

export const priceOk = () => ({
  ok: true as const,
  total_rappen: 0,
  vat_rappen: 0,
  lines: [] as Array<{ code: string; rappen: number }>,
});

export type ResumeState = "open" | "expired" | "purged" | "paid";
export const resume = (state: ResumeState) => {
  switch (state) {
    case "open":
      return {
        ok: true as const,
        state,
        reference: "VT-00-0000",
        trip: { from: "ZRH", to: "Zurich HB", pax: 2 },
      };
    case "paid":
      return { ok: true as const, state, reference: "VT-00-0000" };
    default:
      return { ok: false as const, state };
  }
};

export const meGuest = () => ({ ok: true as const, signed_in: false });
export const meSignedIn = () => ({
  ok: true as const,
  signed_in: true,
  email: "guest@example.com",
  name: "Test Traveller",
});

export type CheckoutFixtureSet = {
  quote?: unknown;
  extras?: unknown;
  price?: unknown;
  resume?: unknown;
  me?: unknown;
};

function fulfillJson(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store" },
    body: JSON.stringify(body),
  });
}

/** Route the read endpoints to fixtures; omitted keys fall through to the real server. */
export async function installCheckoutFixtures(page: Page, set: CheckoutFixtureSet): Promise<void> {
  const map: Array<[string, unknown | undefined]> = [
    ["**/api/quote", set.quote],
    ["**/api/checkout/extras", set.extras],
    ["**/api/checkout/price", set.price],
    ["**/api/checkout/resume**", set.resume],
    ["**/api/checkout/me", set.me],
  ];
  for (const [glob, body] of map) {
    if (body === undefined) continue;
    await page.route(glob, (route) => fulfillJson(route, body));
  }
}
