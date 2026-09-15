// apps/web/lib/quote/engine.ts
//
// loadAndPrice — the composed read + map + price step every route handler
// calls (D-33, D-34, research §8 layer 2).
//
// Negative space: this function builds no Response, decides no HTTP code,
// and does not call Mapbox — the journey's metres and seconds arrive as
// inputs (plan 04-10 supplies them, plan 04-11 sequences the two).
//
// D-48: the Supabase project is Central Europe (Zurich), ref
// yaumjzvylngfjhtuffqs, and wrangler.jsonc pins aws:eu-central-2 — not the
// Frankfurt region 04-RESEARCH.md and ADR-007 assume. GSD-LAUNCH's
// "< 800 ms warm" is an unmeasured claim; this file asserts no latency
// budget.
//
// The four loaders are injected rather than imported directly so every case
// in engine.test.ts runs without Docker. A pricing composition that can
// only be tested against a live database is a composition that stops being
// tested.

import {
  evaluateCoupon,
  loadLaunchFlags,
  loadRateBook,
  loadSettingsVersion,
  mintLockDeadline,
} from "../db/quote";
import { priceQuote, type PriceQuoteOutput } from "../pricing/priceQuote";
import { decoratePublicClasses } from "../pricing/public-board";
import type { CouponFacts, SettingsVersionRow } from "../pricing/policy";
import * as rateBookMapper from "../pricing/rateBook";
import type { MappedSettingsSnapshot } from "../pricing/rateBook";
import type { QuoteInput } from "../pricing/types";
import type { QuoteErrorCode } from "./errors";
import type { RequestContext } from "../logger";

export type QuoteLoaders = {
  loadRateBook: typeof loadRateBook;
  loadSettingsVersion: typeof loadSettingsVersion;
  mintLockDeadline: typeof mintLockDeadline;
  evaluateCoupon: typeof evaluateCoupon;
  loadLaunchFlags: typeof loadLaunchFlags;
};

const defaultLoaders: QuoteLoaders = {
  loadRateBook,
  loadSettingsVersion,
  mintLockDeadline,
  evaluateCoupon,
  loadLaunchFlags,
};

export type LoadAndPriceCoupon = {
  code: string;
  applied: boolean;
  i18n_key: string;
  kind?: "percent" | "amount";
  percent?: number | string | null;
};

export type LoadAndPriceOk = {
  ok: true;
  quote: PriceQuoteOutput & {
    computed_at: string;
  };
  coupon?: LoadAndPriceCoupon | null;
};

export type LoadAndPriceErr = {
  ok: false;
  code: QuoteErrorCode;
};

export type LoadAndPriceResult = LoadAndPriceOk | LoadAndPriceErr;

function toSettingsRow(
  snap: MappedSettingsSnapshot,
  computedAt: string,
): SettingsVersionRow {
  return {
    id: snap.id,
    slug: snap.slug,
    free_cancel_hours: snap.free_cancel_hours,
    modification_deadline_hours: snap.modification_deadline_hours,
    min_advance_minutes: snap.min_advance_minutes,
    airport_waiting_minutes: snap.airport_waiting_minutes,
    city_waiting_minutes: snap.city_waiting_minutes,
    manage_link_validity_days: snap.manage_link_validity_days,
    round_trip_discount_percent: snap.round_trip_discount_percent,
    night_window_start: snap.night_window_start,
    night_window_end: snap.night_window_end,
    night_window_tz: snap.night_window_tz ?? "",
    quote_lock_minutes: snap.quote_lock_minutes,
    checkout_window_minutes: snap.checkout_window_minutes,
    cancellation_tiers: snap.cancellation_tiers ?? [],
    policy_doc_slug: snap.policy_doc_slug,
    policy_doc_version: snap.policy_doc_version,
    effective_from: snap.effective_from ?? computedAt,
  };
}

function publicRateVersion(
  version: { id: number; slug: string } | null,
): { id: number; slug: string } | null {
  if (version === null) return null;
  return { id: version.id, slug: version.slug };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function couponOnBook(doc: unknown, couponId: number, code: string): boolean {
  if (!isRecord(doc) || !Array.isArray(doc.coupons)) return false;
  const needle = code.trim().toUpperCase();
  return doc.coupons.some((item) => {
    if (!isRecord(item)) return false;
    const id = typeof item.id === "number" ? item.id : Number(item.id);
    const rowCode = typeof item.code === "string" ? item.code.trim().toUpperCase() : "";
    if (Number.isFinite(id) && id === couponId) return true;
    return rowCode !== "" && rowCode === needle;
  });
}

function couponFactsFromEval(typed: string, raw: unknown): {
  coupon: LoadAndPriceCoupon;
  facts: CouponFacts | null;
} {
  if (!isRecord(raw) || raw.ok !== true) {
    const key =
      isRecord(raw) && typeof raw.i18n_key === "string"
        ? raw.i18n_key
        : "quote.coupon.error.not_found";
    return {
      coupon: { code: typed, applied: false, i18n_key: key },
      facts: null,
    };
  }
  const kind = raw.kind === "percent" || raw.kind === "amount" ? raw.kind : null;
  const id = typeof raw.coupon_id === "number" ? raw.coupon_id : Number(raw.coupon_id);
  if (!kind || !Number.isFinite(id)) {
    return {
      coupon: { code: typed, applied: false, i18n_key: "quote.coupon.error.unpriced" },
      facts: null,
    };
  }
  return {
    coupon: {
      code: typed,
      applied: true,
      i18n_key: "quote.coupon.applied",
      kind,
      percent: kind === "percent" ? (raw.percent as number | string | null) : null,
    },
    facts: {
      id,
      code: typed,
      kind,
      percent: raw.percent == null ? null : (raw.percent as number | string),
      amount_rappen:
        raw.amount_rappen == null ? null : Number(raw.amount_rappen),
    },
  };
}

export type LoadAndPriceOpts = {
  /** Named dashboard host only. Omitted/false is public-safe. */
  dashboardHost?: boolean;
};

export async function loadAndPrice(
  env: CloudflareEnv,
  input: QuoteInput,
  deps: QuoteLoaders = defaultLoaders,
  request?: RequestContext,
  opts?: LoadAndPriceOpts,
): Promise<LoadAndPriceResult> {
  // D-18/D-33: draft book only when PRICING_PREVIEW is the string true AND
  // the request Host is a named dashboard host. Public vamostaxi.site is
  // always live book (preferDraft stays false). asQuote reads
  // HYPERDRIVE_NOCACHE so the next quote after Publish is the new book.
  // Omitted dashboardHost defaults false.
  const dashboardHost = opts?.dashboardHost === true;
  const preferDraft = dashboardHost && env.PRICING_PREVIEW === "true";

  const rawBook = await deps.loadRateBook(env, { preferDraft }, request);
  const book = rateBookMapper.mapRateBook(rawBook);
  const flags = await deps.loadLaunchFlags(env, request);

  const rawSettings = await deps.loadSettingsVersion(
    env,
    input.computed_at,
    request,
  );
  const settings = rateBookMapper.mapSettingsSnapshot(rawSettings);
  // Catalogue bug, not a fact about the customer's journey — 500.
  if (settings === null) {
    return { ok: false, code: "no_settings_version" };
  }

  let couponEval: LoadAndPriceCoupon | null = null;
  let couponFacts: CouponFacts | null = null;
  const typed = input.coupon?.trim() ?? "";
  if (typed) {
    const raw = await deps.evaluateCoupon(
      env,
      typed,
      { customerId: null, contactEmail: null },
      request,
    );
    const mapped = couponFactsFromEval(typed, raw);
    couponEval = mapped.coupon;
    couponFacts = mapped.facts;
    if (couponFacts && !couponOnBook(rawBook, couponFacts.id, typed)) {
      couponEval = {
        code: typed,
        applied: false,
        i18n_key: "quote.coupon.error.not_found",
      };
      couponFacts = null;
    }
  }

  const priced = priceQuote(book, [toSettingsRow(settings, input.computed_at)], input, {
    coupon: couponFacts,
  });
  // quote.classes is the eligibility board (mapRateBook already dropped
  // unrated leftovers). Never emit book.classes raw. Name/photo come from
  // the live book so idle and priced cards share one catalog (D-29 D-30).

  // Catalogue / engine bug — 500. Never treat a mixed-null class as zero.
  if (priced.partially_priced_class_slugs.length > 0) {
    return { ok: false, code: "partially_priced_class" };
  }

  return {
    ok: true,
    quote: {
      no_eligible_class: priced.no_eligible_class,
      classes: decoratePublicClasses(book, priced.classes),
      policy: priced.policy,
      rate_version: publicRateVersion(book.rate_version),
      engine_version: priced.engine_version,
      pricing_live:
        rateBookMapper.derivePricingLive(book.rate_version) && flags.public_chf,
      settings_version_id: priced.settings_version_id,
      partially_priced_class_slugs: priced.partially_priced_class_slugs,
      computed_at: input.computed_at,
    },
    coupon: couponEval,
  };
}
