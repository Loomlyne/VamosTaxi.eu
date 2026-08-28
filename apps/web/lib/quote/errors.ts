// apps/web/lib/quote/errors.ts
//
// The single error vocabulary for quote / reprice / checkout-intent (D-13,
// 04-API-CONTRACT.md §7). One code, one HTTP status, one i18n key, one suggested
// action — transcribed row-for-row from the contract table.
//
// Negative space: this module contains no English sentence for a customer. The
// response body carries a KEY and the widget renders it (Law 03). An English
// `message` field would ship an untranslated string to an Arabic customer six
// phases from now. LogFields stay scalar — never pass a whole Request here.
//
// Edge managed_challenge (zone WAF Rate Limiting) is NOT in this table and
// cannot be: it returns HTML, not JSON. The widget must treat "the response is
// not the quote shape" as action reload_challenge rather than as a parse error
// (§7's closing note). That is a fact about the edge, not an omission here.

/**
 * Suggested client actions. Closed set — never invent a fifth without updating
 * the contract and the widget switch.
 */
export type QuoteAction =
  | "retry"
  | "requote"
  | "reload_challenge"
  | "enter_time";

export type QuoteErrorEntry = {
  status: number;
  i18n_key: string;
  action: QuoteAction | null;
};

/**
 * Contract table as the single source of truth (currency.ts CURRENCY_MARKS pattern).
 * QuoteErrorCode is derived from the record keys so the union cannot drift.
 */
export const QUOTE_ERRORS = {
  untrusted_input: {
    status: 400,
    i18n_key: "quote.error",
    action: null,
  },
  malformed: {
    status: 400,
    i18n_key: "quote.flight.malformed",
    action: null,
  },
  mode_not_offered: {
    status: 422,
    i18n_key: "quote.error.mode_not_offered",
    action: null,
  },
  place_unresolved: {
    status: 422,
    i18n_key: "quote.geo.no_results",
    action: null,
  },
  same_place: {
    status: 422,
    i18n_key: "quote.error.same_place",
    action: null,
  },
  place_out_of_box: {
    status: 422,
    i18n_key: "quote.error.place_out_of_box",
    action: null,
  },
  out_of_service_area: {
    status: 422,
    i18n_key: "quote.error.out_of_service_area",
    action: null,
  },
  service_area_undefined: {
    status: 422,
    i18n_key: "quote.error.service_area_undefined",
    action: null,
  },
  min_advance: {
    status: 422,
    i18n_key: "quote.error.min_advance",
    action: null,
  },
  route_unavailable: {
    status: 422,
    i18n_key: "quote.error.route_unavailable",
    action: "retry",
  },
  extras_max_stops: {
    status: 422,
    i18n_key: "quote.extras.error.max_stops",
    action: null,
  },
  extras_max_child_seats: {
    status: 422,
    i18n_key: "quote.extras.error.max_child_seats",
    action: null,
  },
  no_settings_version: {
    status: 500,
    i18n_key: "quote.error",
    action: "retry",
  },
  rate_limited: {
    status: 429,
    i18n_key: "quote.error.rate_limited",
    action: "retry",
  },
  turnstile_required: {
    status: 403,
    i18n_key: "quote.error.turnstile_required",
    action: "reload_challenge",
  },
  retrieve_without_suggest: {
    status: 403,
    i18n_key: "quote.error",
    action: null,
  },
  temporarily_unavailable: {
    status: 503,
    i18n_key: "quote.error.temporarily_unavailable",
    action: "retry",
  },
  provider_unavailable: {
    status: 503,
    i18n_key: "quote.flight.unavailable",
    action: "enter_time",
  },
  not_found: {
    status: 404,
    i18n_key: "quote.flight.not_found",
    action: "enter_time",
  },
  // D-28: same i18n_key as quote_expired — oracle-free pairing for the customer.
  quote_not_found: {
    status: 404,
    i18n_key: "quote.error.expired",
    action: "requote",
  },
  quote_expired: {
    status: 409,
    i18n_key: "quote.error.expired",
    action: "requote",
  },
  pricing_not_live: {
    status: 409,
    i18n_key: "quote.error.pricing_not_live",
    action: null,
  },
  price_changed: {
    status: 409,
    i18n_key: "quote.error.price_changed",
    action: "requote",
  },
  engine_changed: {
    status: 409,
    i18n_key: "quote.error.engine_changed",
    action: "requote",
  },
  coupon_no_longer_valid: {
    status: 409,
    i18n_key: "quote.error.coupon_no_longer_valid",
    action: "requote",
  },
  partially_priced_class: {
    status: 500,
    i18n_key: "quote.error",
    action: "retry",
  },
} as const satisfies Record<string, QuoteErrorEntry>;

export type QuoteErrorCode = keyof typeof QUOTE_ERRORS;

const BODY_ALLOW_KEYS = new Set([
  "ok",
  "error",
  "i18n_key",
  "action",
  "params",
]);

export type QuoteErrorResponseOpts = {
  /** ICU params the widget passes through — never interpolated server-side. */
  params?: Record<string, string | number | null>;
};

/**
 * Build the JSON error Response. Body keys are only ok/error/i18n_key/action/params —
 * never message, detail, or description prose.
 */
export function quoteErrorResponse(
  code: QuoteErrorCode,
  opts?: QuoteErrorResponseOpts,
): Response {
  const entry = QUOTE_ERRORS[code];
  const body: Record<string, unknown> = {
    ok: false,
    error: code,
    i18n_key: entry.i18n_key,
  };
  if (entry.action !== null) {
    body.action = entry.action;
  }
  if (opts?.params !== undefined) {
    body.params = opts.params;
  }

  // Guardrail: refuse to serialise unexpected prose keys if a future edit slips.
  for (const key of Object.keys(body)) {
    if (!BODY_ALLOW_KEYS.has(key)) {
      throw new Error(`quoteErrorResponse: disallowed body key ${key}`);
    }
  }

  return new Response(JSON.stringify(body), {
    status: entry.status,
    headers: { "content-type": "application/json" },
  });
}
