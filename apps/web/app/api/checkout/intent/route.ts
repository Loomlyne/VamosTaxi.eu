// apps/web/app/api/checkout/intent/route.ts
//
// POST /api/checkout/intent. Thin: parse, wire deps, runCheckoutIntent.
// Business rules live in lib/checkout/intent.ts.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asCheckout, asQuote } from "@/lib/db/identity";
import { checkoutIntentSchema } from "@/lib/checkout/intent-schema";
import { refuse } from "@/lib/checkout/errors";
import { runCheckoutIntent } from "@/lib/checkout/intent";
import { mintManageToken } from "@/lib/checkout/manage-token";
import {
  createCheckoutSession,
  expireCheckoutSession,
  stripeFromEnv,
  stripePublishableKey,
} from "@/lib/checkout/stripe";
import { verifyTurnstile } from "@/lib/turnstile";
import type { IntentRecompute } from "@/lib/quote/intent";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

  const postgresNowIso = await asQuote(env, async (sql) => {
    const rows = await sql`select now() as now`;
    const value = rows[0]?.now;
    return value instanceof Date ? value.toISOString() : String(value);
  });

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
      if (!token) return false;
      const result = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, token, {
        action: "checkout",
        idempotencyKey: body.idempotency_key,
        allowedHostnames,
      });
      return result.ok;
    },
    mintManageToken,
    manageLinkMaxAgeSeconds: 30 * 24 * 60 * 60,
    createCheckoutSession: (input) => createCheckoutSession(stripe, input),
    expireCheckoutSession: (id) => expireCheckoutSession(stripe, id).then(() => undefined),
    createBooking: async (args) => {
      const rows = await asCheckout(env, null, async (sql) => {
        return sql`
          select * from public.checkout_create_booking(
            ${args.quoteId}::uuid,
            ${args.idempotencyKey},
            ${JSON.stringify({
              contact_name: args.contact.name,
              contact_email: args.contact.email,
              contact_phone: args.contact.phone,
            })}::jsonb,
            ${args.locale},
            ${args.displayCurrency},
            ${JSON.stringify(args.snapshot)}::jsonb,
            ${JSON.stringify(args.legs)}::jsonb,
            ${args.couponId},
            ${args.couponCode},
            ${args.manageTokenHash},
            ${args.manageTokenExpiresAt.toISOString()}::timestamptz,
            ${args.stripePaymentIntentId},
            ${args.stripeCheckoutSessionId},
            ${args.chargedRappen},
            ${args.actorCustomerId}
          )
        `;
      });
      const row = rows[0] as {
        booking_id: string;
        reference: string;
        snapshot_id: number;
        payment_id: number;
        replayed: boolean;
      };
      return row;
    },
    publishableKey: stripePublishableKey(env),
    returnUrl: `${origin}/${body.locale}/checkout`,
    checkoutWindowMinutes: 30,
    actorCustomerId: null,
  });
}
