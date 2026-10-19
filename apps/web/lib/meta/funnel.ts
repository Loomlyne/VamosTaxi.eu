// apps/web/lib/meta/funnel.ts
//
// Owner wording 2026-10-09: the booking steps InitiateCheckout (a vehicle is chosen) and AddPaymentInfo (the
// Pay press) go to Meta from our server, never from the browser, so the page address (route, reference)
// never reaches Meta. Same rules as the Purchase: both legal flags, the wider-events flag, a token, a
// consent read right now, a test event code in Stripe test mode, one POST, no retry, never a throw. Logs carry
// the event name, outcome, http and code only: never the token, the ids, the consent subject or a reference.
//
// Once-only: Meta de-duplicates on event name + event id inside 48 hours. AddPaymentInfo uses an id made from
// the booking id, so a second press of Pay for the same booking is one event; InitiateCheckout uses the id the
// browser made for this page load. There is no claim table (no migration).
import { metaClickIdsToSave, type BackgroundContext } from "./click-ids";
import { buildFunnelEvent, metaTestEventToSend, postPurchase, type FunnelEventName } from "./capi";
import { metaEventsAllowed } from "./legal-gate";

export type FunnelSend = {
  name: FunnelEventName;
  eventId: string;
  valueRappen: number;
  orderId: string | null;
  fbp: string | null;
  fbc: string | null;
};

export type FunnelDeps = {
  token: () => string | null;
  /** The pixel id (META_PIXEL_ID). Missing: skipped as no_token. */
  pixelId: () => string | null;
  testEventCode: () => string | null;
  livemode: () => boolean;
  fetch: typeof fetch;
  nowSeconds: () => number;
  log: (fields: Record<string, string | number | null>) => void;
};

/** A UUID derived from the booking id and the step, stable across presses: Meta's de-duplication key. */
export async function funnelEventIdFor(bookingId: string, name: FunnelEventName): Promise<string> {
  const data = new TextEncoder().encode(`vamos-funnel:${name}:${bookingId}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  const hex = Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  // Shaped like a version-4 UUID so it passes the same format check as a browser-made id.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * One event, one POST. Resolves to the outcome word; never rejects.
 * Skips (nothing leaves the site) when the flags are closed, there is no token, a test-mode run has no test
 * event code, or there is no legitimate event to build (no cookie id, bad amount).
 */
export async function sendFunnelEvent(
  send: FunnelSend,
  deps: FunnelDeps,
  allowed: () => boolean = metaEventsAllowed,
): Promise<"sent" | "rejected" | "failed" | "skip"> {
  try {
    if (!allowed()) return "skip";
    const token = deps.token();
    const pixelId = deps.pixelId();
    if (!token || !pixelId) {
      deps.log({ event: send.name, outcome: "skip", reason: "no_token" });
      return "skip";
    }
    const test = metaTestEventToSend(deps.livemode(), deps.testEventCode());
    if (test.skip) {
      deps.log({ event: send.name, outcome: "skip", reason: "no_test_code" });
      return "skip";
    }
    const testCode = test.sendCode;
    const event = buildFunnelEvent({
      name: send.name,
      eventId: send.eventId,
      eventTimeSeconds: deps.nowSeconds(),
      valueRappen: send.valueRappen,
      fbp: send.fbp,
      fbc: send.fbc,
      orderId: send.orderId,
    });
    if (!event) {
      deps.log({ event: send.name, outcome: "skip", reason: "nothing_to_send" });
      return "skip";
    }
    const outcome = await postPurchase(deps.fetch, { event, token, pixelId, testEventCode: testCode });
    deps.log({
      event: send.name,
      outcome: outcome.state,
      http: outcome.http,
      code: outcome.code === null ? null : outcome.subcode === null ? String(outcome.code) : `${outcome.code}.${outcome.subcode}`,
    });
    return outcome.state;
  } catch {
    try {
      deps.log({ event: send.name, outcome: "failed", reason: "unexpected" });
    } catch {
      // logging must never break the caller
    }
    return "failed";
  }
}

export function metaFunnelDepsFromEnv(env: CloudflareEnv): FunnelDeps {
  return {
    token: () => env.META_CAPI_ACCESS_TOKEN || null,
    pixelId: () => env.META_PIXEL_ID || null,
    testEventCode: () => env.META_TEST_EVENT_CODE || null,
    livemode: () => (env.STRIPE_PUBLISHABLE_KEY ?? "").startsWith("pk_live_"),
    fetch: (...a) => fetch(...a),
    nowSeconds: () => Math.floor(Date.now() / 1000),
    log: (fields) => console.info("meta_funnel", JSON.stringify(fields)),
  };
}

type Decide = Parameters<typeof metaClickIdsToSave>[0];

/**
 * Decide (public Origin, consent subject, Marketing on right now, a Meta cookie id) and send, without ever
 * delaying the caller: with an execution context the whole job runs in `ctx.waitUntil`. Never rejects.
 * The decision is the Pay press's own: `metaClickIdsToSave` with the wider-events flag in place of the
 * page-view flag.
 */
export function scheduleFunnelEvent(args: {
  ctx: BackgroundContext | null | undefined;
  decide: Omit<Decide, "measurementAllowed">;
  allowed?: () => boolean;
  event: (ids: { fbp: string | null; fbc: string | null }) => Promise<void>;
}): Promise<void> {
  // Flags closed: nothing is scheduled at all (no background job, no database read).
  if (!(args.allowed ?? metaEventsAllowed)()) return Promise.resolve();
  const job = async (): Promise<void> => {
    try {
      const allowed = (args.allowed ?? metaEventsAllowed)();
      const decision = await metaClickIdsToSave({ ...args.decide, measurementAllowed: allowed });
      if (decision.skip || (decision.fbp === null && decision.fbc === null)) return;
      await args.event({ fbp: decision.fbp, fbc: decision.fbc });
    } catch {
      console.error("meta_funnel_failed", "no-detail");
    }
  };
  const waitUntil = args.ctx?.waitUntil;
  if (typeof waitUntil === "function") {
    waitUntil.call(args.ctx, job());
    return Promise.resolve();
  }
  return job();
}
