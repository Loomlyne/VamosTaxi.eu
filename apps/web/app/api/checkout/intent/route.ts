// apps/web/app/api/checkout/intent/route.ts
//
// POST /api/checkout/intent. Thin: parse, wire deps, runCheckoutIntent.
// Business rules live in lib/checkout/intent.ts. The write is createBooking.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asCheckout, asQuote } from "@/lib/db/identity";
import { checkoutIntentSchema } from "@/lib/checkout/intent-schema";
import { refusalForMissingClassId } from "@/lib/checkout/charge-gate";
import { refuse } from "@/lib/checkout/errors";
import { runCheckoutIntent } from "@/lib/checkout/intent";
import { resolveActorCustomerId } from "@/lib/checkout/actor-customer";
import { createBooking, issueManageToken } from "@/lib/checkout/create-booking";
import { attachPayment } from "@/lib/checkout/attach-payment";
import { loadOpenPayment } from "@/lib/checkout/load-open-payment";
import { quoteWasLeft } from "@/lib/checkout/quote-left";
import { mintManageToken } from "@/lib/checkout/manage-token";
import { bookingOwnedByRequest } from "@/lib/checkout/booking-owned";
import { loadCheckoutCatalog } from "@/lib/checkout/checkout-catalog";
import { stripeAccountIsLegacyUaeTest } from "@/lib/checkout/charge-gate";
import {
  WEB_CHECKOUT_MINUTES,
  checkoutPaymentMethodTypes,
  createCheckoutSession,
  expireCheckoutSession,
  retrieveCheckoutSession,
  stripeFromEnv,
  stripePublishableKey,
} from "@/lib/checkout/stripe";
import { evaluateCoupon, loadLaunchFlags, loadSettingsVersion } from "@/lib/db/quote";
import { lookupVehicleClassId, snapshotPolicyFromSettings } from "@/lib/checkout/lock-to-rpc";
import { policyHours } from "@/lib/checkout/policy-settings";
import { loadCheckoutReprice } from "@/lib/checkout/reprice";
import type { IntentRecompute } from "@/lib/quote/intent";
import { publicSiteOrigin, csrfForbidden } from "@/lib/security/origin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    return await postIntent(request);
  } catch (err) {
    console.error("checkout_intent_unhandled", err instanceof Error ? err.message : String(err));
    return new Response(
      JSON.stringify({
        ok: false,
        error: "intent_unhandled",
      }),
      {
        status: 500,
        headers: {
          "content-type": "application/json",
          "cache-control": "private, no-store",
        },
      },
    );
  }
}

async function postIntent(request: Request) {
  const blocked = csrfForbidden(request);
  if (blocked) return blocked;
  const { env } = getCloudflareContext();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return refuse("invalid_request");
  }

  const parsed = checkoutIntentSchema.safeParse(json);
  if (!parsed.success) {
    return refuse("invalid_request");
  }
  const body = parsed.data;

  const { postgresNowIso, vehicleClassId } = await asQuote(env, async (sql) => {
    const rows = await sql`select now() as now`;
    const value = rows[0]?.now;
    return {
      postgresNowIso: value instanceof Date ? value.toISOString() : String(value),
      vehicleClassId: await lookupVehicleClassId(sql, body.vehicle_class),
    };
  });
  if (!vehicleClassId) {
    return refuse(refusalForMissingClassId());
  }

  try {
    const left = await asCheckout(env, null, (sql) => quoteWasLeft(sql, body.quote_id));
    if (left) return refuse("quote_already_booked");
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? (err as { code?: unknown }).code : "";
    if (code !== "42883") throw err;
  }

  // D-20/D-21 (26.1-29): a sent pay link holds the booking for 24 h; the
  // traveller's own lock stays payable until then. Read from the database by
  // quote id — never from the request (T-26.1-90). Null = no link sent.
  const holdUntilIso = await asCheckout(env, null, async (sql) => {
    const rows = await sql<{ hold_until: Date | string | null }[]>`
      select public.checkout_booking_hold_until(${body.quote_id}::uuid) as hold_until
    `;
    const value = rows[0]?.hold_until;
    if (value == null) return null;
    const at = value instanceof Date ? value : new Date(String(value));
    return Number.isFinite(at.getTime()) ? at.toISOString() : null;
  });

  // Built only when a session op runs, after the class-id refusal.
  let stripe: ReturnType<typeof stripeFromEnv> | undefined;
  const stripeClient = () => (stripe ??= stripeFromEnv(env));
  const origin = publicSiteOrigin(new URL(request.url).host);
  const current = env.QUOTE_LOCK_SECRET || "";
  const previous = env.QUOTE_LOCK_SECRET_PREVIOUS;

  const settingsDoc = await loadSettingsVersion(env, postgresNowIso);
  const policy = policyHours(settingsDoc);
  // D-02: web checkout sessions last 31 minutes (Stripe's minimum is 30). The
  // settings window still has to be open; the pay-link hold rules are elsewhere.
  if (policy.checkoutWindowMinutes == null) {
    return refuse("payment_window_closed");
  }
  const snapshotPolicy = snapshotPolicyFromSettings(settingsDoc);
  if (!snapshotPolicy) {
    return refuse("invalid_request");
  }

  // D-12: fail closed when the live book cannot load — never fall back to an
  // empty extras catalog with pricing left on.
  const repriced = await loadCheckoutReprice(env);
  if (!repriced.ok) {
    return refuse("pricing_not_live");
  }

  return runCheckoutIntent(body, {
    mode: "web",
    lockSecrets: previous ? { current, previous } : { current },
    workerNowIso: new Date().toISOString(),
    postgresNowIso,
    holdUntilIso,
    reprice: (payload) => ({
      pricing_live: repriced.pricingLive,
      engine_version: payload.engine_version,
      live_rate_version_id: repriced.liveRateVersionId,
      classes: payload.class_totals.map((row) => ({
        slug: row.slug as IntentRecompute["classes"][number]["slug"],
        total_rappen: row.total_rappen,
        eligible: row.total_rappen != null,
      })),
    }),
    mintManageToken,
    manageLinkMaxAgeSeconds: 30 * 24 * 60 * 60,
    // D-02: always the Stripe-hosted page; no card form on our site.
    createCheckoutSession: (input) =>
      createCheckoutSession(stripeClient(), { ...input, uiMode: "hosted_page" }),
    expireCheckoutSession: (id) => expireCheckoutSession(stripeClient(), id).then(() => undefined),
    retrieveCheckoutSession: (id) => retrieveCheckoutSession(stripeClient(), id),
    createBooking: (args) => asCheckout(env, null, (sql) => createBooking(sql, args)),
    issueManageToken: (args) => asCheckout(env, null, (sql) => issueManageToken(sql, args)),
    attachPayment: (args) => asCheckout(env, null, (sql) => attachPayment(sql, args)),
    loadOpenPayment: (quoteId) => asCheckout(env, null, (sql) => loadOpenPayment(sql, quoteId)),
    origin,
    twint: checkoutPaymentMethodTypes(env).includes("twint"),
    legacyUaeAccount: stripeAccountIsLegacyUaeTest(stripePublishableKey(env)),
    checkoutWindowMinutes: WEB_CHECKOUT_MINUTES,
    loadCatalog: () => loadCheckoutCatalog(env),
    setBookingDetails: (args) =>
      asCheckout(env, null, async (sql) => {
        await sql`
          select public.checkout_set_booking_details(
            ${args.bookingId}::uuid,
            ${args.companyName},
            ${args.companyAddress},
            ${args.companyVat},
            ${args.driverNote},
            ${args.tripQuery}
          )
        `;
      }),
    listSessionIds: (bookingId) =>
      asCheckout(env, null, async (sql) => {
        const rows = await sql<{ ids: string[] | null }[]>`
          select public.checkout_booking_session_ids(${bookingId}::uuid) as ids
        `;
        return rows[0]?.ids ?? [];
      }),
    purgeUnpaid: (bookingId, reason) =>
      asCheckout(env, null, async (sql) => {
        const rows = await sql<{ purged: boolean | null }[]>`
          select public.purge_unpaid_booking(${bookingId}::uuid, ${reason}) as purged
        `;
        return rows[0]?.purged === true;
      }),
    // T-26.3-10-03: a booking may be replaced only by the browser that holds
    // its vt_manage cookie (guest-role RLS shows the row to that hash and no one).
    ownsBooking: (bookingId) => bookingOwnedByRequest(env, request, bookingId),
    actorCustomerId: await resolveActorCustomerId(env, request),
    vehicleClassId,
    snapshotPolicy,
    loadLaunchFlags: () => loadLaunchFlags(env),
    evaluateCoupon: (code, ids) => evaluateCoupon(env, code, ids),
    loadQuotePayGate: async (quoteId) => {
      const rows = await asCheckout(env, null, (sql) => sql<{ is_test: boolean | null }[]>`
        select public.checkout_booking_is_test(${quoteId}::uuid) as is_test
      `);
      const row = rows[0];
      if (!row) return null;
      return { is_test: row.is_test === true };
    },
  });
}
