// apps/web/lib/meta/capi.ts
//
// Phase 29, META-10..12/14. The one Meta Conversions API Purchase.
// The payload is locked by the owner's privacy line: "one message with the amount paid and the two
// Meta cookie identifiers, if they exist". Do not widen it: if Graph rejects it, stop and ask.
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
};

export type PurchaseEvent = {
  event_name: "Purchase";
  event_time: number;
  action_source: "website";
  event_source_url: string;
  event_id: string;
  user_data: { fbp?: string; fbc?: string };
  custom_data: { currency: "CHF"; value: number };
};

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
    custom_data: { currency: "CHF", value: chargedRappen / 100 },
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Sends the event once. No retry. Never throws. The token goes in the body, never in the address.
 * Keeps only the HTTP status and the Graph error code and subcode of the answer.
 */
export async function postPurchase(
  fetchFn: typeof fetch,
  args: { event: PurchaseEvent; token: string; testEventCode: string | null },
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
