// apps/web/lib/quote/respond.ts
//
// errorResponse / quoteResponse — the only two places a status code is
// chosen. A status code chosen in more than one place is a status code
// that will disagree with itself, and 04-API-CONTRACT.md §7's table is
// the contract Phase 5's widget switches on.
//
// Duplicating that table here is the failure this module is preventing.
// Every status, i18n_key and action is looked up in plan 04-08's
// QUOTE_ERRORS; an unlisted code is a type error rather than a silent 500.
//
// There is no pricing_live branch anywhere in the rendering path and none
// may be added here. The response carries integer rappen or null; the
// widget renders through formatAmount (D-46).
//
// Cache-Control: no-store is not decorative: a quote body carries a signed
// lock scoped to one visitor, and any shared cache holding it hands a
// second visitor a price they did not ask for.

import {
  QUOTE_ERRORS,
  type QuoteErrorCode,
} from "./errors";
import type { QuotePipelineOk } from "./pipeline";
import { sealClassPhotoUrls } from "../photos/sealed-url";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

type ErrorParamsByCode = {
  min_advance: { minutes: number };
};

export type ErrorResponseBody = {
  ok: false;
  error: QuoteErrorCode;
  i18n_key: string;
  action?: string | null;
  params?: Record<string, string | number | null>;
  lock?: never;
};

/** A route leg as the browser gets it: no zone row ids. */
export type PublicQuoteRouteLeg = Omit<QuotePipelineOk["route"]["legs"][number], "origin_zone_id" | "dest_zone_id">;

/**
 * Security S10 (2026-10-05): what POST /api/quote and /api/quote/reprice send. No internal row
 * ids: not the price book row (`rate_version`), not the settings row (`settings_version_id`, at
 * the top and inside `policy`), not a line's source row, not a leg's zone rows. No page reads any
 * of them (checked: the mocks, the React checkout and the dashboard New trip); the server keeps
 * them in the signed lock, which is where the intent reads them.
 */
export type QuoteResponseBody = {
  ok: true;
  quote_id: string;
  lock: string;
  expires_at: string;
  engine_version: string;
  pricing_live: boolean;
  /** Settings VAT rate, tenths of a percent. Display only (cards show class net + VAT). */
  vat_rate_bps: number;
  display_currency: string;
  route: { legs: PublicQuoteRouteLeg[] };
  no_eligible_class: boolean;
  /** Each line goes out without its optional `source_row` (table name and row id). */
  classes: QuotePipelineOk["classes"];
  policy: Omit<NonNullable<QuotePipelineOk["policy"]>, "settings_version_id"> | null;
  coupon?: QuotePipelineOk["coupon"];
  error?: never;
};

export function errorResponse(
  code: "min_advance",
  params: ErrorParamsByCode["min_advance"],
): Response;
export function errorResponse<C extends Exclude<QuoteErrorCode, "min_advance">>(
  code: C,
): Response;
export function errorResponse(
  code: QuoteErrorCode,
  params?: ErrorParamsByCode["min_advance"],
): Response {
  const entry = QUOTE_ERRORS[code];
  const body: ErrorResponseBody = {
    ok: false,
    error: code,
    i18n_key: entry.i18n_key,
  };
  if (entry.action !== null) {
    body.action = entry.action;
  }
  if (params !== undefined) {
    body.params = params;
  }
  // An ICU `{minutes}` rendered against an absent param prints an empty
  // gap in four languages, and a customer reads "book at least  ahead".
  return Response.json(body, {
    status: entry.status,
    headers: NO_STORE,
  });
}

/** The public reply body for one priced quote (S10: no internal row ids). */
export function publicQuoteBody(quote: QuotePipelineOk): QuoteResponseBody {
  const body: QuoteResponseBody = {
    ok: true,
    quote_id: quote.quote_id,
    lock: quote.lock,
    expires_at: quote.expires_at,
    engine_version: quote.engine_version,
    pricing_live: quote.pricing_live,
    vat_rate_bps: quote.vat_rate_bps,
    display_currency: quote.display_currency,
    route: {
      legs: quote.route.legs.map(({ origin_zone_id: _o, dest_zone_id: _d, ...leg }) => leg),
    },
    no_eligible_class: quote.no_eligible_class,
    classes: quote.classes.map((entry) => ({
      ...entry,
      lines: entry.lines.map(({ source_row: _row, ...line }) => line),
    })),
    policy: quote.policy
      ? (({ settings_version_id: _s, ...rest }) => rest)(quote.policy)
      : null,
  };
  if (quote.coupon !== undefined) {
    body.coupon = quote.coupon;
  }
  return body;
}

export function quoteResponse(quote: QuotePipelineOk): Response {
  return Response.json(publicQuoteBody(quote), { headers: NO_STORE });
}

/**
 * quoteResponse with the class photos sealed (S10): `/photos/classes/<class id>/…` becomes
 * `/photos/c/<token>.<ext>`. `secret` is QUOTE_LOCK_SECRET; without it the photos are left out.
 */
export async function sealedQuoteResponse(quote: QuotePipelineOk, secret: string | undefined): Promise<Response> {
  return quoteResponse({ ...quote, classes: await sealClassPhotoUrls(secret, quote.classes) });
}
