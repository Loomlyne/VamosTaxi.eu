// apps/web/lib/checkout/checkout-quote.ts
//
// 26.3-15: the one-page checkout quotes the trip it reads from the URL (D-05).
// The page never trusts the URL for money: it sends the places as Search Box
// `retrieve` kinds, so the server resolves them, decides the airport fee and
// applies the guards. `is_airport` is never sent (T-26.3-15-02).
//
// Pure functions plus one fetch wrapper that takes its `fetch`, so the whole
// path is testable without a browser.

import type { Trip } from "./trip-url";

export type DisplayCurrency = "CHF" | "EUR" | "USD" | "AED";
export type GeoLocale = "en" | "de" | "fr" | "ar";

export type QuoteContext = {
  locale: GeoLocale;
  currency: DisplayCurrency;
  turnstileToken?: string | null;
};

export type QuotePlace = { kind: "retrieve"; mapbox_id: string; session_token: string; text: string };

export type QuoteRequestBody = {
  locale: GeoLocale;
  display_currency: DisplayCurrency;
  mode: "one_way";
  pickup: QuotePlace;
  dropoff: QuotePlace;
  legs: { leg_seq: 1; scheduled_local: string; flight_no: string | null }[];
  pax: number;
  bags: number;
  preferred_class?: string;
  turnstile_token?: string;
};

/** Why a class cannot be chosen. `pax` and `bags` name the limit; the rest are fare-table facts. */
export type ClassBlock = "pax" | "bags" | "unavailable" | "no_rate" | "route_off";

export type ClassView = {
  slug: string;
  name: string;
  photo: string;
  eligible: boolean;
  block: ClassBlock | null;
  /** Seats the class takes (effective_max_pax). */
  pax: number;
  /** Bags the class takes. */
  bags: number;
  /** CHF rappen; null while pricing is not live (shown as `CHF 000`). */
  totalRappen: number | null;
};

export type QuoteOk = {
  kind: "ok";
  quoteId: string;
  lock: string;
  expiresAt: string;
  pricingLive: boolean;
  classes: ClassView[];
  /** No class is eligible for this party (D-11 empty state). */
  noneFit: boolean;
};

export type QuoteRefusal = {
  kind: "error";
  code: string;
  i18nKey: string | null;
  params: Record<string, string | number> | null;
  /** The server wants a Turnstile token before it will price. */
  challenge: boolean;
  /** Pricing is closed (Alert tone info, PAY disabled). */
  pricingNotLive: boolean;
};

export type QuoteResult = QuoteOk | QuoteRefusal;

const CLASS_BLOCKS: readonly string[] = ["pax", "bags", "unavailable", "no_rate", "route_off"];

/** `null` when a field the server needs is missing — the editor opens instead. */
export function tripIsQuotable(trip: Trip): boolean {
  return Boolean(trip.from && trip.to && trip.when && trip.pax != null && trip.bags != null);
}

function newSessionToken(): string {
  return crypto.randomUUID();
}

export function buildQuoteBody(
  trip: Trip,
  ctx: QuoteContext,
  places?: { pickup: QuotePlace; dropoff: QuotePlace },
): QuoteRequestBody | null {
  if (!tripIsQuotable(trip)) return null;
  const session = trip.gs ?? newSessionToken();
  const pickup: QuotePlace =
    places?.pickup ??
    { kind: "retrieve", mapbox_id: trip.fid ?? "", session_token: session, text: trip.from as string };
  const dropoff: QuotePlace =
    places?.dropoff ??
    { kind: "retrieve", mapbox_id: trip.tid ?? "", session_token: session, text: trip.to as string };
  if (!pickup.mapbox_id || !dropoff.mapbox_id) return null;
  const body: QuoteRequestBody = {
    locale: ctx.locale,
    display_currency: ctx.currency,
    mode: "one_way",
    pickup,
    dropoff,
    legs: [{ leg_seq: 1, scheduled_local: trip.when as string, flight_no: trip.flight }],
    pax: trip.pax as number,
    bags: trip.bags as number,
  };
  if (trip.class) body.preferred_class = trip.class;
  if (ctx.turnstileToken) body.turnstile_token = ctx.turnstileToken;
  return body;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function classView(raw: unknown): ClassView | null {
  const c = asRecord(raw);
  if (typeof c.slug !== "string" || c.slug === "") return null;
  const block =
    typeof c.ineligible_reason === "string" && CLASS_BLOCKS.includes(c.ineligible_reason)
      ? (c.ineligible_reason as ClassBlock)
      : null;
  const eligible = c.eligible === true;
  return {
    slug: c.slug,
    name: typeof c.name === "string" && c.name ? c.name : c.slug,
    photo: typeof c.photo_url === "string" ? c.photo_url : "",
    eligible,
    block: eligible ? null : (block ?? "unavailable"),
    pax: typeof c.effective_max_pax === "number" ? c.effective_max_pax : 0,
    bags: typeof c.max_bags === "number" ? c.max_bags : 0,
    totalRappen: typeof c.total_rappen === "number" && Number.isFinite(c.total_rappen) ? c.total_rappen : null,
  };
}

export function parseQuoteJson(status: number, json: unknown): QuoteResult {
  const body = asRecord(json);
  if (body.ok === true && typeof body.quote_id === "string" && typeof body.lock === "string") {
    const classes = (Array.isArray(body.classes) ? body.classes : [])
      .map(classView)
      .filter((c): c is ClassView => c !== null);
    return {
      kind: "ok",
      quoteId: body.quote_id,
      lock: body.lock,
      expiresAt: typeof body.expires_at === "string" ? body.expires_at : "",
      pricingLive: body.pricing_live !== false,
      classes,
      noneFit: classes.length === 0 || classes.every((c) => !c.eligible),
    };
  }
  const code = typeof body.error === "string" ? body.error : status >= 500 ? "unavailable" : "unknown";
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(asRecord(body.params))) {
    if (typeof v === "string" || typeof v === "number") params[k] = v;
  }
  return {
    kind: "error",
    code,
    i18nKey: typeof body.i18n_key === "string" ? body.i18n_key : null,
    params: Object.keys(params).length ? params : null,
    challenge: code === "turnstile_required",
    pricingNotLive: code === "pricing_not_live",
  };
}

/** Class the selection may keep after a re-quote: it must still be eligible. */
export function keepSelection(selected: string | null, classes: readonly ClassView[]): string | null {
  if (!selected) return null;
  const row = classes.find((c) => c.slug === selected);
  return row && row.eligible ? selected : null;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function post(fetchImpl: FetchLike, body: QuoteRequestBody): Promise<QuoteResult> {
  try {
    const res = await fetchImpl("/api/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return parseQuoteJson(res.status, await res.json().catch(() => null));
  } catch {
    return { kind: "error", code: "network", i18nKey: null, params: null, challenge: false, pricingNotLive: false };
  }
}

/**
 * Research assumption A3: a shared trip URL can carry a stale or foreign Search Box
 * session. The server refuses the place (`place_unresolved`); the page then looks the
 * address text up again under a fresh session (suggest, then retrieve) and asks once more.
 */
async function resolveByText(
  fetchImpl: FetchLike,
  text: string,
  locale: GeoLocale,
  session: string,
): Promise<QuotePlace | null> {
  try {
    const res = await fetchImpl(
      `/api/geo/suggest?q=${encodeURIComponent(text)}&session_token=${encodeURIComponent(session)}&locale=${locale}`,
      { credentials: "same-origin" },
    );
    const json = asRecord(await res.json().catch(() => null));
    const first = asRecord(Array.isArray(json.suggestions) ? json.suggestions[0] : null);
    if (typeof first.mapbox_id !== "string" || first.mapbox_id === "") return null;
    return { kind: "retrieve", mapbox_id: first.mapbox_id, session_token: session, text: text.slice(0, 200) };
  } catch {
    return null;
  }
}

export async function fetchQuote(
  fetchImpl: FetchLike,
  trip: Trip,
  ctx: QuoteContext,
): Promise<QuoteResult> {
  const first = buildQuoteBody(trip, ctx);
  if (first) {
    const result = await post(fetchImpl, first);
    if (!(result.kind === "error" && result.code === "place_unresolved")) return result;
  }
  if (!tripIsQuotable(trip)) {
    return { kind: "error", code: "trip_incomplete", i18nKey: null, params: null, challenge: false, pricingNotLive: false };
  }
  const session = newSessionToken();
  const [pickup, dropoff] = await Promise.all([
    resolveByText(fetchImpl, trip.from as string, ctx.locale, session),
    resolveByText(fetchImpl, trip.to as string, ctx.locale, session),
  ]);
  if (!pickup || !dropoff) {
    return { kind: "error", code: "place_unresolved", i18nKey: "quote.geo.no_results", params: null, challenge: false, pricingNotLive: false };
  }
  const retry = buildQuoteBody(trip, ctx, { pickup, dropoff });
  return retry ? post(fetchImpl, retry) : { kind: "error", code: "place_unresolved", i18nKey: "quote.geo.no_results", params: null, challenge: false, pricingNotLive: false };
}
