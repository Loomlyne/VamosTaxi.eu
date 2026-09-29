import { describe, expect, it, vi } from "vitest";
import { mintLock, type QuoteLockPayload } from "../quote/lock";
import { checkoutCharge } from "./checkout-charge";
import { priceCheckoutWithDeps, type PriceDeps } from "./price-route";

const SECRETS = { current: "lock-secret-current" };
const NOW = "2026-09-05T12:00:00.000Z";
const EXP = "2026-09-05T13:00:00.000Z";
const CATALOG = [
  { code: "child_seat", amountRappen: 2000, labels: { en: "Child seat", de: "Kindersitz", fr: "Siege enfant", ar: "x" } },
];

function payload(over: Partial<QuoteLockPayload> = {}): QuoteLockPayload {
  return {
    v: 1,
    quote_id: "00000000-0000-4000-8000-000000000001",
    exp: EXP,
    engine_version: "e",
    rate_version_id: 1,
    settings_version_id: 1,
    computed_at: NOW,
    display_currency: "CHF",
    mode: "one_way",
    pax: 1,
    bags: 0,
    extras: null,
    coupon: null,
    class_totals: [
      { slug: "economy", total_rappen: 10000 },
      { slug: "van-luxury", total_rappen: null },
    ],
    legs: [],
    ...over,
  };
}

function deps(over: Partial<PriceDeps> = {}): PriceDeps {
  return {
    lockSecrets: SECRETS,
    nowIso: NOW,
    loadCatalog: async () => CATALOG,
    loadVatBps: async () => 81,
    evaluateCoupon: async () => ({ ok: false, i18n_key: "quote.coupon.error.not_found" }),
    actorCustomerId: null,
    ...over,
  };
}

async function body(over: Record<string, unknown> = {}, p = payload()) {
  return { lock: await mintLock(SECRETS, p), vehicle_class: "economy", ...over };
}

describe("priceCheckoutWithDeps", () => {
  it("prices class only, equal to checkoutCharge", async () => {
    const r = await priceCheckoutWithDeps(await body(), deps());
    const direct = checkoutCharge({
      classNetRappen: 10000, preCouponRappen: null, extraCodes: [], catalog: CATALOG,
      coupon: null, vatRateBps: 81, vehicleClassSlug: "economy",
    });
    expect(r.status).toBe(200);
    if (!r.body.ok || !direct.ok) throw new Error("expected ok");
    expect(r.body.charged_rappen).toBe(direct.chargedRappen);
    expect(r.body.lines.length).toBe(direct.lines.length);
  });

  it("adds a ticked extra", async () => {
    const r = await priceCheckoutWithDeps(await body({ extra_codes: ["child_seat"] }), deps());
    if (!r.body.ok) throw new Error("expected ok");
    expect(r.body.net_rappen).toBe(12000);
  });

  it("refuses a bad HMAC and an expired lock", async () => {
    const b = await body();
    const bad = await priceCheckoutWithDeps({ ...b, lock: b.lock + "x" }, deps());
    expect(bad.body).toEqual({ ok: false, code: "quote_expired" });
    const old = await priceCheckoutWithDeps(b, deps({ nowIso: "2026-09-05T14:00:00.000Z" }));
    expect(old.body).toEqual({ ok: false, code: "quote_expired" });
  });

  it("refuses a class not in the lock or without a total", async () => {
    for (const cls of ["business", "van-luxury"]) {
      const r = await priceCheckoutWithDeps(await body({ vehicle_class: cls }), deps());
      expect(r.body).toEqual({ ok: false, code: "class_unavailable" });
    }
  });

  it("refuses an unknown extra as price_changed", async () => {
    const r = await priceCheckoutWithDeps(await body({ extra_codes: ["nope"] }), deps());
    expect(r.body).toEqual({ ok: false, code: "price_changed" });
  });

  it("maps coupon failures", async () => {
    const nf = await priceCheckoutWithDeps(await body({ coupon: "zzz" }), deps());
    expect(nf.body).toEqual({ ok: false, code: "coupon_not_found" });
    const gone = await priceCheckoutWithDeps(
      await body({ coupon: "zzz" }),
      deps({ evaluateCoupon: async () => ({ ok: false, i18n_key: "quote.coupon.error.expired" }) }),
    );
    expect(gone.body).toEqual({ ok: false, code: "coupon_no_longer_valid" });
  });

  it("applies a percent voucher before VAT", async () => {
    const r = await priceCheckoutWithDeps(
      await body({ coupon: "ten" }),
      deps({ evaluateCoupon: async () => ({ ok: true, coupon_id: 1, kind: "percent", percent: "10.00" }) }),
    );
    if (!r.body.ok) throw new Error("expected ok");
    expect(r.body.net_rappen).toBe(9000);
  });

  it("does not discount twice when the lock already carries the coupon", async () => {
    const p = payload({ coupon: "TEN", class_totals: [{ slug: "economy", total_rappen: 9000 }] });
    const r = await priceCheckoutWithDeps(
      await body({ coupon: "ten" }, p),
      deps({ evaluateCoupon: async () => ({ ok: true, coupon_id: 1, kind: "percent", percent: "10.00" }) }),
    );
    if (!r.body.ok) throw new Error("expected ok");
    expect(r.body.net_rappen).toBe(9000);
  });

  it("rate limits voucher lookups only", async () => {
    const limited = { rateLimit: vi.fn(async () => ({ ok: false as const })) };
    const r = await priceCheckoutWithDeps(await body({ coupon: "zzz" }), deps(limited));
    expect(r.status).toBe(429);
    expect(r.body).toEqual({ ok: false, code: "rate_limited" });
    const tick = await priceCheckoutWithDeps(await body({ extra_codes: ["child_seat"] }), deps(limited));
    expect(tick.status).toBe(200);
  });

  it("rejects amounts in the body", async () => {
    for (const f of ["total_rappen", "charged_rappen", "lines"]) {
      const r = await priceCheckoutWithDeps(await body({ [f]: 1 }), deps());
      expect(r.body).toEqual({ ok: false, code: "invalid_request" });
    }
  });
});
