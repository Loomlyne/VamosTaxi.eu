// apps/web/lib/meta/capi.ts
//
// Phase 29, META-10..12/14. The Meta Conversions API events: the Purchase, and (owner wording
// 2026-10-09) InitiateCheckout and AddPaymentInfo.
// The payload is locked by the owner's privacy lines: the amount, the two Meta cookie identifiers if they
// exist, and, once a booking exists, its booking reference as order_id. Do not widen it: if Graph rejects
// it, stop and ask.
// Pure module: no database, no env, no logging. The caller injects fetch and the token.

/** Graph API version for the events endpoint. */
export const GRAPH_VERSION = "v26.0";
/** The only page address Meta is told about. */
export const PURCHASE_EVENT_SOURCE_URL = "https://vamostaxi.site";

const PIXEL_ID = "1595596972063765";
const GRAPH_HOST = "https://graph.facebook.com";

export type PurchaseEventInput = {
  eventId: string;
  eventTimeSeconds: number;
  chargedRappen: number;
  fbp: string | null;
  fbc: string | null;
  /** The booking reference (owner decision 2026-10-09, D4). Omitted or null: no order_id. */
  orderId?: string | null;
};

/** The booking steps sent from our server. The browser never sends these (the page address would carry the route). */
export type FunnelEventName = "InitiateCheckout" | "AddPaymentInfo";

export type FunnelEventInput = {
  name: FunnelEventName;
  eventId: string;
  eventTimeSeconds: number;
  valueRappen: number;
  fbp: string | null;
  fbc: string | null;
  orderId?: string | null;
};

export type ServerEvent = {
  event_name: "Purchase" | FunnelEventName;
  event_time: number;
  action_source: "website";
  event_source_url: string;
  event_id: string;
  user_data: { fbp?: string; fbc?: string };
  custom_data: { currency: "CHF"; value: number; order_id?: string };
};

export type PurchaseEvent = ServerEvent & { event_name: "Purchase" };

const ORDER_ID_RE = /^VT-[0-9]{2}-[0-9]{4,5}$/;

function customData(valueRappen: number, orderId: string | null | undefined): ServerEvent["custom_data"] {
  const data: ServerEvent["custom_data"] = { currency: "CHF", value: valueRappen / 100 };
  if (orderId && ORDER_ID_RE.test(orderId)) data.order_id = orderId;
  return data;
}

export type PostOutcome = {
  state: "sent" | "rejected" | "failed";
  http: number | null;
  code: number | null;
  subcode: number | null;
};

/**
 * Builds the Purchase event, or null when there is nothing legitimate to send.
 * @param input event id, time in seconds, francs charged in rappen, saved Meta cookie ids
 * @returns the locked event, or null (non-positive or non-integer amount, or no ids)
 */
export function buildPurchaseEvent(input: PurchaseEventInput): PurchaseEvent | null {
  const { chargedRappen, fbp, fbc } = input;
  if (!Number.isInteger(chargedRappen) || chargedRappen <= 0) return null;
  if (!fbp && !fbc) return null;
  const user_data: { fbp?: string; fbc?: string } = {};
  if (fbp) user_data.fbp = fbp;
  if (fbc) user_data.fbc = fbc;
  return {
    event_name: "Purchase",
    event_time: input.eventTimeSeconds,
    action_source: "website",
    event_source_url: PURCHASE_EVENT_SOURCE_URL,
    event_id: input.eventId,
    user_data,
    custom_data: customData(chargedRappen, input.orderId),
  };
}

/**
 * Builds an InitiateCheckout or AddPaymentInfo event, or null when there is nothing legitimate to send.
 * @param input step, event id, time, the amount in rappen, saved Meta cookie ids, reference once a booking exists
 * @returns the locked event, or null (bad amount, no ids, id not a UUID)
 */
export function buildFunnelEvent(input: FunnelEventInput): ServerEvent | null {
  const { valueRappen, fbp, fbc } = input;
  if (!Number.isInteger(valueRappen) || valueRappen <= 0 || valueRappen > 5_000_000) return null;
  if (!fbp && !fbc) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.eventId)) return null;
  const user_data: { fbp?: string; fbc?: string } = {};
  if (fbp) user_data.fbp = fbp;
  if (fbc) user_data.fbc = fbc;
  return {
    event_name: input.name,
    event_time: input.eventTimeSeconds,
    action_source: "website",
    event_source_url: PURCHASE_EVENT_SOURCE_URL,
    event_id: input.eventId,
    user_data,
    custom_data: customData(valueRappen, input.orderId),
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Sends one event (any ServerEvent; the name is kept for the Purchase callers). No retry. Never throws. The token goes in the body, never in the address.
 * Keeps only the HTTP status and the Graph error code and subcode of the answer.
 */
export async function postPurchase(
  fetchFn: typeof fetch,
  args: { event: ServerEvent; token: string; testEventCode: string | null },
): Promise<PostOutcome> {
  const body = new URLSearchParams();
  body.set("data", JSON.stringify([args.event]));
  body.set("access_token", args.token);
  if (args.testEventCode) body.set("test_event_code", args.testEventCode);

  let res: Response;
  try {
    res = await fetchFn(`${GRAPH_HOST}/${GRAPH_VERSION}/${PIXEL_ID}/events`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return { state: "failed", http: null, code: null, subcode: null };
  }

  const http = res.status;
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  const obj = json && typeof json === "object" ? (json as Record<string, unknown>) : null;

  if (http >= 200 && http < 300) {
    if (obj && obj.events_received === 1) return { state: "sent", http, code: null, subcode: null };
    return { state: "failed", http, code: null, subcode: null };
  }
  const err = obj && obj.error && typeof obj.error === "object" ? (obj.error as Record<string, unknown>) : null;
  if (http >= 400 && http < 500 && err) {
    return { state: "rejected", http, code: num(err.code), subcode: num(err.error_subcode) };
  }
  return { state: "failed", http, code: null, subcode: null };
}
