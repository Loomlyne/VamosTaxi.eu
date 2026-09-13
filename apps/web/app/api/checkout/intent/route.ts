// apps/web/app/api/checkout/intent/route.ts
//
// POST /api/checkout/intent. Thin: parse, wire deps, runCheckoutIntent.
// Business rules live in lib/checkout/intent.ts. The write is createBooking.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asCheckout, asQuote } from "@/lib/db/identity";
import { checkoutIntentSchema } from "@/lib/checkout/intent-schema";
import { refuse } from "@/lib/checkout/errors";
import { runCheckoutIntent } from "@/lib/checkout/intent";
import { createBooking } from "@/lib/checkout/create-booking";
import { attachPayment } from "@/lib/checkout/attach-payment";
import { loadOpenPayment } from "@/lib/checkout/load-open-payment";
import { mintManageToken } from "@/lib/checkout/manage-token";
import {
  createCheckoutSession,
  expireCheckoutSession,
  retrieveCheckoutSession,
  stripeFromEnv,
  stripePublishableKey,
} from "@/lib/checkout/stripe";
import { loadLaunchFlags, loadRateBook, loadSettingsVersion } from "@/lib/db/quote";
import { catalogFromSurcharges } from "@/lib/checkout/extras-catalog";
import { lookupVehicleClassId, snapshotPolicyFromSettings } from "@/lib/checkout/lock-to-rpc";
import { policyHours } from "@/lib/checkout/policy-settings";
import { mapRateBook } from "@/lib/pricing/rateBook";
import type { IntentRecompute } from "@/lib/quote/intent";

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
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}

async function postIntent(request: Request) {
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

  const stripe = stripeFromEnv(env);
  const origin = new URL(request.url).origin;
  const current = env.QUOTE_LOCK_SECRET || "";
  const previous = env.QUOTE_LOCK_SECRET_PREVIOUS;

  const { postgresNowIso, vehicleClassId } = await asQuote(env, async (sql) => {
    const rows = await sql`select now() as now`;
    const value = rows[0]?.now;
    return {
      postgresNowIso: value instanceof Date ? value.toISOString() : String(value),
      vehicleClassId: await lookupVehicleClassId(sql, body.vehicle_class),
    };
  });
  if (!vehicleClassId) {
    return refuse("invalid_request");
  }

  const settingsDoc = await loadSettingsVersion(env, postgresNowIso);
  const policy = policyHours(settingsDoc);
  if (policy.checkoutWindowMinutes == null) {
    return refuse("payment_window_closed");
  }
  const snapshotPolicy = snapshotPolicyFromSettings(settingsDoc);
  if (!snapshotPolicy) {
    return refuse("invalid_request");
  }

  let extrasCatalog: ReturnType<typeof catalogFromSurcharges> = [];
  try {
    extrasCatalog = catalogFromSurcharges(
      mapRateBook(await loadRateBook(env, { preferDraft: false })).surcharges,
    );
  } catch {
    extrasCatalog = [];
  }

  return runCheckoutIntent(body, {
    lockSecrets: previous ? { current, previous } : { current },
    workerNowIso: new Date().toISOString(),
    postgresNowIso,
    reprice: (payload) => ({
      pricing_live: true,
      engine_version: payload.engine_version,
      classes: payload.class_totals.map((row) => ({
        slug: row.slug as IntentRecompute["classes"][number]["slug"],
        total_rappen: row.total_rappen,
        eligible: row.total_rappen != null,
      })),
    }),
    mintManageToken,
    manageLinkMaxAgeSeconds: 30 * 24 * 60 * 60,
    createCheckoutSession: (input) => createCheckoutSession(stripe, input),
    expireCheckoutSession: (id) => expireCheckoutSession(stripe, id).then(() => undefined),
    retrieveCheckoutSession: (id) => retrieveCheckoutSession(stripe, id),
    createBooking: (args) => asCheckout(env, null, (sql) => createBooking(sql, args)),
    attachPayment: (args) => asCheckout(env, null, (sql) => attachPayment(sql, args)),
    loadOpenPayment: (quoteId) => asCheckout(env, null, (sql) => loadOpenPayment(sql, quoteId)),
    publishableKey: stripePublishableKey(env),
    returnUrl: `${origin}${body.locale === "en" ? "" : `/${body.locale}`}/checkout/payment`,
    checkoutWindowMinutes: policy.checkoutWindowMinutes,
    actorCustomerId: null,
    vehicleClassId,
    snapshotPolicy,
    extrasCatalog,
    loadLaunchFlags: () => loadLaunchFlags(env),
    loadQuotePayGate: async (quoteId) => {
      const rows = await asCheckout(env, null, (sql) => sql<{ is_test: boolean | null }[]>`
        select is_test from public.bookings
         where quote_id = ${quoteId}::uuid
         limit 1
      `);
      const row = rows[0];
      if (!row) return null;
      return { is_test: row.is_test === true };
    },
  });
}
