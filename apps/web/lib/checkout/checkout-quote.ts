// apps/web/lib/checkout/checkout-quote.ts
//
// 26.3-15: the one-page checkout quotes the trip it reads from the URL (D-05).
// The page never trusts the URL for money: it sends the places as Search Box
// `retrieve` kinds, so the server resolves them, decides the airport fee and
// applies the guards. `is_airport` is never sent (T-26.3-15-02).
//
// Pure functions plus one fetch wrapper that takes its `fetch`, so the whole
// path is testable without a browser.

import { smallPhotoUrl } from "@/lib/photos/variant";
import { classCardRappen } from "./card-price";
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
  /** CHF rappen, class net before VAT; null while pricing is not live. Compared and sent as-is. */
  totalRappen: number | null;
  /** What the card shows: totalRappen with VAT included (the checkout total before extras/voucher). */
  cardRappen: number | null;
};

export type QuoteOk = {
  kind: "ok";
  quoteId: string;
  lock: string;
  expiresAt: string;
  pricingLive: boolean;
  /** Settings VAT rate (81 = 8.1 %) from the quote answer; null on an answer that predates it. */
  vatRateBps: number | null;
  classes: ClassView[];
  /** No class is eligible for this party (D-11 empty state). */
  noneFit: boolean;
  /**
   * The server's routed distance for the trip in metres (`route.legs[].distance_m`,
   * the same number the fare uses). Display only. `null` when the answer carries no
   * road distance (older answer, or a leg measured without a road).
   */
  distanceM: number | null;
  /**
   * True when any leg has no road line (`route.legs[].road === false`): the fare is a
   * straight-line one, so the page writes "No road route" instead of a figure. Never a partial sum.
   */
  noRoad: boolean;
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

/**
 * A place counts only as the exact place the customer chose (`fid`, `tid`). Words alone are
 * not quotable: the editor opens and asks them to choose, because a text search can land
 * somewhere else and the price and the driver would follow it.
 */
export function tripIsQuotable(trip: Trip): boolean {
  return Boolean(trip.from && trip.fid && trip.to && trip.tid && trip.when && trip.pax != null && trip.bags != null);
}

function newSessionToken(): string {
  return crypto.randomUUID();
}

export function buildQuoteBody(trip: Trip, ctx: QuoteContext): QuoteRequestBody | null {
  if (!tripIsQuotable(trip)) return null;
  const session = trip.gs ?? newSessionToken();
  const pickup: QuotePlace = { kind: "retrieve", mapbox_id: trip.fid as string, session_token: session, text: trip.from as string };
  const dropoff: QuotePlace = { kind: "retrieve", mapbox_id: trip.tid as string, session_token: session, text: trip.to as string };
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

function classView(raw: unknown, vatRateBps: number | null): ClassView | null {
  const c = asRecord(raw);
  if (typeof c.slug !== "string" || c.slug === "") return null;
  const block =
    typeof c.ineligible_reason === "string" && CLASS_BLOCKS.includes(c.ineligible_reason)
      ? (c.ineligible_reason as ClassBlock)
      : null;
  const eligible = c.eligible === true;
  const totalRappen = typeof c.total_rappen === "number" && Number.isFinite(c.total_rappen) ? c.total_rappen : null;
  return {
    slug: c.slug,
    name: typeof c.name === "string" && c.name ? c.name : c.slug,
    // the class cards are at most ~210px wide: the 640 version covers 3x screens
    photo: typeof c.photo_url === "string" ? smallPhotoUrl(c.photo_url, 640) : "",
    eligible,
    block: eligible ? null : (block ?? "unavailable"),
    pax: typeof c.effective_max_pax === "number" ? c.effective_max_pax : 0,
    bags: typeof c.max_bags === "number" ? c.max_bags : 0,
    totalRappen,
    cardRappen: classCardRappen(totalRappen, vatRateBps),
  };
}

/** True when the answer has legs and any one of them has no road line. */
function routeHasNoRoad(raw: unknown): boolean {
  const legs = asRecord(raw).legs;
  return Array.isArray(legs) && legs.some((item) => asRecord(item).road === false);
}

/** Sum of the server's road metres; null when a leg is missing, zero or not a road. */
function routeDistanceM(raw: unknown): number | null {
  const legs = asRecord(raw).legs;
  if (!Array.isArray(legs) || legs.length === 0) return null;
  let sum = 0;
  for (const item of legs) {
    const leg = asRecord(item);
    const m = leg.distance_m;
    if (leg.road === false || typeof m !== "number" || !Number.isFinite(m) || m <= 0) return null;
    sum += m;
  }
  return sum;
}

/** "18.4": the server's metres as kilometres, one decimal, as the design system writes figures. */
export function kmFigure(distanceM: number | null | undefined): string | null {
  if (distanceM == null || !Number.isFinite(distanceM) || distanceM <= 0) return null;
  return (Math.round(distanceM / 100) / 10).toFixed(1);
}

export function parseQuoteJson(status: number, json: unknown): QuoteResult {
  const body = asRecord(json);
  if (body.ok === true && typeof body.quote_id === "string" && typeof body.lock === "string") {
    const vatRateBps = typeof body.vat_rate_bps === "number" ? body.vat_rate_bps : null;
    const classes = (Array.isArray(body.classes) ? body.classes : [])
      .map((raw) => classView(raw, vatRateBps))
      .filter((c): c is ClassView => c !== null);
    return {
      kind: "ok",
      quoteId: body.quote_id,
      lock: body.lock,
      expiresAt: typeof body.expires_at === "string" ? body.expires_at : "",
      pricingLive: body.pricing_live !== false,
      vatRateBps,
      classes,
      noneFit: classes.length === 0 || classes.every((c) => !c.eligible),
      distanceM: routeDistanceM(body.route),
      noRoad: routeHasNoRoad(body.route),
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
 * A shared trip URL can carry a stale or foreign Search Box session, and the server then refuses
 * the place (`place_unresolved`). The page asks once more for the SAME places under a fresh session.
 * It never looks the words up instead: the first hit for "Zug" was a moving company in Zurich, so
 * the customer saw 7.8 km instead of 49. If the places still do not resolve, the refusal stands and
 * the customer chooses again in the editor.
 *
 * Rate limit: on this path one price request spends two /api/quote tokens. The second POST is
 * deliberately counted: the server cannot tell a genuine re-ask from a forged one.
 */
export async function fetchQuote(
  fetchImpl: FetchLike,
  trip: Trip,
  ctx: QuoteContext,
): Promise<QuoteResult> {
  const first = buildQuoteBody(trip, ctx);
  if (!first) {
    return { kind: "error", code: "trip_incomplete", i18nKey: null, params: null, challenge: false, pricingNotLive: false };
  }
  const result = await post(fetchImpl, first);
  if (!(result.kind === "error" && result.code === "place_unresolved")) return result;
  const retry = buildQuoteBody({ ...trip, gs: newSessionToken() }, ctx);
  return retry ? post(fetchImpl, retry) : result;
}
