// apps/web/lib/checkout/price-route.ts
//
// POST /api/checkout/price — pure handler. D-19 / D-35: the page shows the
// total the server computes with the SAME checkoutCharge the intent charges.
// No geocoding or routing work, no database write. The browser sends the lock, a class slug,
// extra codes and an optional voucher; never an amount.

import { z } from "zod";
import { verifyLock, type LockSecrets } from "../quote/lock";
import { percentToHundredths } from "../pricing/round";
import { checkoutCharge, type ChargeLine, type ExtraCatalogRow } from "./checkout-charge";

const CLASS_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const FORBIDDEN = ["total_rappen", "net_rappen", "charged_rappen", "amount_rappen", "lines", "distance_m"] as const;

export const priceBodySchema = z
  .object({
    lock: z.string().min(1),
    vehicle_class: z
      .string()
      .min(1)
      .transform((v) => v.trim().toLowerCase())
      .refine((v) => CLASS_SLUG.test(v), "vehicle_class"),
    extra_codes: z.array(z.string().min(1).max(64)).max(32).optional().default([]),
    coupon: z
      .string()
      .max(64)
      .nullable()
      .optional()
      .transform((v) => {
        const t = v?.trim() ?? "";
        return t.length > 0 ? t : null;
      }),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const field of FORBIDDEN) {
      if (Object.prototype.hasOwnProperty.call(value, field)) {
        ctx.addIssue({ code: "custom", message: `${field} is server-derived`, path: [field] });
      }
    }
  });

export type PriceBody = z.infer<typeof priceBodySchema>;

export type PriceErrorCode =
  | "invalid_request"
  | "quote_expired"
  | "class_unavailable"
  | "price_changed"
  | "coupon_not_found"
  | "coupon_no_longer_valid"
  | "pricing_not_live"
  | "rate_limited";

export type PriceResult =
  | { status: 200; body: { ok: true; lines: ChargeLine[]; net_rappen: number; vat_rappen: number; charged_rappen: number } }
  | { status: number; body: { ok: false; code: PriceErrorCode } };

export type PriceDeps = {
  lockSecrets: LockSecrets;
  /** Postgres now (ISO) — the lock expiry is compared against it. */
  nowIso: string;
  loadCatalog: () => Promise<ExtraCatalogRow[]>;
  loadVatBps: () => Promise<number>;
  evaluateCoupon: (
    code: string,
    ids: { customerId: string | null; contactEmail: string | null },
  ) => Promise<unknown>;
  actorCustomerId: string | null;
  /** Only run when a voucher is looked up (brute-force guard). */
  rateLimit?: () => Promise<{ ok: true } | { ok: false }> | { ok: true } | { ok: false };
};

const STATUS: Record<PriceErrorCode, number> = {
  invalid_request: 400,
  quote_expired: 409,
  class_unavailable: 409,
  price_changed: 409,
  coupon_not_found: 409,
  coupon_no_longer_valid: 409,
  pricing_not_live: 409,
  rate_limited: 429,
};

function fail(code: PriceErrorCode): PriceResult {
  return { status: STATUS[code], body: { ok: false, code } };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

type Evaluated =
  | { ok: true; kind: "percent" | "amount"; percentHundredths: number | null; amountRappen: number | null; code: string }
  | { ok: false; notFound: boolean };

function evaluated(raw: unknown, code: string): Evaluated {
  if (!isRecord(raw) || raw.ok !== true) {
    const key = isRecord(raw) && typeof raw.i18n_key === "string" ? raw.i18n_key : "";
    return { ok: false, notFound: key.endsWith("not_found") };
  }
  if (raw.kind === "percent" && typeof raw.percent === "string" && /^\d{1,3}(?:\.\d{1,2})?$/.test(raw.percent)) {
    return { ok: true, kind: "percent", percentHundredths: percentToHundredths(raw.percent), amountRappen: null, code };
  }
  const amount = typeof raw.amount_rappen === "number" ? raw.amount_rappen : Number(raw.amount_rappen);
  if (raw.kind === "amount" && Number.isFinite(amount) && amount > 0) {
    return { ok: true, kind: "amount", percentHundredths: null, amountRappen: Math.trunc(amount), code };
  }
  return { ok: false, notFound: false };
}

/** Prices class + extras − voucher + VAT exactly as the intent will charge it. */
export async function priceCheckoutWithDeps(body: unknown, deps: PriceDeps): Promise<PriceResult> {
  const parsed = priceBodySchema.safeParse(body);
  if (!parsed.success) return fail("invalid_request");
  const req = parsed.data;

  const verified = await verifyLock(deps.lockSecrets, req.lock, "0001-01-01T00:00:00.000Z");
  if (!verified.ok) return fail("quote_expired");
  const payload = verified.payload;
  if (payload.exp <= deps.nowIso) return fail("quote_expired");

  const row = payload.class_totals.find((r) => r.slug === req.vehicle_class);
  if (!row || row.total_rappen == null) return fail("class_unavailable");
  const netRappen = row.total_rappen;

  // The lock's coupon priced class_totals; a different voucher needs a requote.
  const lockCoupon = payload.coupon?.trim().toUpperCase() || null;
  const bodyCoupon = req.coupon?.toUpperCase() ?? null;
  if (lockCoupon && bodyCoupon && bodyCoupon !== lockCoupon) return fail("coupon_no_longer_valid");
  const couponCode = lockCoupon ?? bodyCoupon;

  let coupon: Extract<Evaluated, { ok: true }> | null = null;
  if (couponCode) {
    if (!lockCoupon && deps.rateLimit) {
      const limited = await deps.rateLimit();
      if (!limited.ok) return fail("rate_limited");
    }
    const ev = evaluated(
      await deps.evaluateCoupon(couponCode, { customerId: deps.actorCustomerId, contactEmail: null }),
      couponCode,
    );
    if (!ev.ok) return fail(ev.notFound ? "coupon_not_found" : "coupon_no_longer_valid");
    coupon = ev;
  }

  // 26.2 audit (U04-1): the lock carries a post-coupon class total when it holds a coupon, plus
  // the pinned pre-coupon one. Read that figure; grossing the coupon back up is wrong for a fixed
  // coupon clamped to the fare and one rappen out for a rounded percent. A lock minted before the
  // field existed cannot be read: the browser asks for a new quote.
  let preCouponRappen: number | null = null;
  if (lockCoupon && coupon) {
    if (typeof row.pre_coupon_rappen !== "number") return fail("price_changed");
    preCouponRappen = row.pre_coupon_rappen;
  }

  let catalog: ExtraCatalogRow[];
  let vatRateBps: number;
  try {
    [catalog, vatRateBps] = await Promise.all([deps.loadCatalog(), deps.loadVatBps()]);
  } catch {
    return fail("pricing_not_live");
  }

  const charge = checkoutCharge({
    classNetRappen: netRappen,
    preCouponRappen,
    extraCodes: req.extra_codes,
    catalog,
    coupon: coupon
      ? {
          code: coupon.code,
          kind: coupon.kind,
          percentHundredths: coupon.percentHundredths,
          amountRappen: coupon.amountRappen,
        }
      : null,
    vatRateBps,
    vehicleClassSlug: req.vehicle_class,
  });
  if (!charge.ok) return fail("price_changed");

  return {
    status: 200,
    body: {
      ok: true,
      lines: charge.lines,
      net_rappen: charge.netRappen,
      vat_rappen: charge.vatRappen,
      charged_rappen: charge.chargedRappen,
    },
  };
}
