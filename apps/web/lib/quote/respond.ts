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

export type QuoteResponseBody = {
  ok: true;
  quote_id: string;
  lock: string;
  expires_at: string;
  engine_version: string;
  pricing_live: boolean;
  rate_version: { id: number; slug: string } | null;
  settings_version_id: number;
  display_currency: string;
  route: QuotePipelineOk["route"];
  no_eligible_class: boolean;
  classes: QuotePipelineOk["classes"];
  policy: QuotePipelineOk["policy"];
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

export function quoteResponse(quote: QuotePipelineOk): Response {
  const body: QuoteResponseBody = {
    ok: true,
    quote_id: quote.quote_id,
    lock: quote.lock,
    expires_at: quote.expires_at,
    engine_version: quote.engine_version,
    pricing_live: quote.pricing_live,
    rate_version: quote.rate_version,
    settings_version_id: quote.settings_version_id,
    display_currency: quote.display_currency,
    route: quote.route,
    no_eligible_class: quote.no_eligible_class,
    classes: quote.classes,
    policy: quote.policy,
  };
  if (quote.coupon !== undefined) {
    body.coupon = quote.coupon;
  }
  return Response.json(body, { headers: NO_STORE });
}
