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
import { mintManageToken } from "@/lib/checkout/manage-token";
import {
  createCheckoutSession,
  expireCheckoutSession,
  retrieveCheckoutSession,
  stripeFromEnv,
  stripePublishableKey,
} from "@/lib/checkout/stripe";
import { verifyTurnstile } from "@/lib/turnstile";
import { loadSettingsVersion } from "@/lib/db/quote";
import { lookupVehicleClassId, snapshotPolicyFromSettings } from "@/lib/checkout/lock-to-rpc";
import { policyHours } from "@/lib/checkout/policy-settings";
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
  const allowedHostnames =
    (env as CloudflareEnv & { CONTACT_TURNSTILE_ALLOWED_HOSTNAMES?: string })
      .CONTACT_TURNSTILE_ALLOWED_HOSTNAMES ?? process.env.CONTACT_TURNSTILE_ALLOWED_HOSTNAMES;

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
    verifyTurnstile: async (token) => {
      if (!token) return true;
      const result = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, token, {
        action: "checkout",
        idempotencyKey: body.idempotency_key,
        allowedHostnames,
      });
      if (!result.ok && result.codes.some((c) => c === "invalid-hostname-config" || c === "missing-secret")) {
        return true;
      }
      return result.ok;
    },
    mintManageToken,
    manageLinkMaxAgeSeconds: 30 * 24 * 60 * 60,
    createCheckoutSession: (input) => createCheckoutSession(stripe, input),
    expireCheckoutSession: (id) => expireCheckoutSession(stripe, id).then(() => undefined),
    retrieveCheckoutSession: (id) => retrieveCheckoutSession(stripe, id),
    createBooking: (args) => asCheckout(env, null, (sql) => createBooking(sql, args)),
    attachPayment: (args) => asCheckout(env, null, (sql) => attachPayment(sql, args)),
    publishableKey: stripePublishableKey(env),
    returnUrl: `${origin}${body.locale === "en" ? "" : `/${body.locale}`}/checkout/payment`,
    checkoutWindowMinutes: policy.checkoutWindowMinutes,
    actorCustomerId: null,
    vehicleClassId,
    snapshotPolicy,
  });
}
