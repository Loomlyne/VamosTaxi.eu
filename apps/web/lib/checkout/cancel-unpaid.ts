// apps/web/lib/checkout/cancel-unpaid.ts
//
// Plan 26.1-06 (D-04). A signed-in customer's account cancel of their own
// unpaid pending booking also expires every open Stripe Checkout Session for
// it — closes audit X9 (the DB row cancelled, the Stripe payment tab stayed
// payable). A payment that still lands late anyway is revived to confirmed
// by 26.1-02's settle v2; expiring the session here is the belt, not the
// only latch.

import { asCustomer, type VamosClaims } from "../db/identity";
import { stripeAccountIsLegacyUaeTest } from "./charge-gate";
import { expireCheckoutSession, stripeFromEnv } from "./stripe";

export type CancelUnpaidRow = {
  booking_id: string;
  reference: string;
  stripe_checkout_session_ids: string[] | null;
};

export type ExpireSessionIdsDeps = {
  expireSession: (sessionId: string) => Promise<void>;
  canExpire: boolean;
  emit: (message: string, sessionId: string, err: unknown) => void;
};

/**
 * Shared by every unpaid cancel caller that already has its own list of open
 * Stripe Checkout Session ids (from `checkout_cancel_unpaid` /
 * `ops_cancel_booking`) and just needs to work through them — one failure
 * logged and skipped, never a thrown error, and no-op entirely when
 * `canExpire` is false (the legacy UAE test Stripe account, D-01/D-04).
 */
export async function expireSessionIds(
  deps: ExpireSessionIdsDeps,
  ids: readonly (string | null | undefined)[],
): Promise<void> {
  if (!deps.canExpire) return;
  for (const id of ids) {
    if (!id) continue;
    try {
      await deps.expireSession(id);
    } catch (err) {
      deps.emit("checkout_session_expire_failed", id, err);
    }
  }
}

export type CancelUnpaidDeps = {
  runCancel: (ref: string) => Promise<CancelUnpaidRow[]>;
  expireSession: (sessionId: string) => Promise<void>;
  canExpire: boolean;
  emit: (message: string, sessionId: string, err: unknown) => void;
};

/**
 * Pure: runs `checkout_cancel_unpaid` then expires each session id it
 * returns. A Stripe failure never undoes the DB cancel — 26.1-02's settle v2
 * revives the booking if the payment lands anyway, so failing closed here
 * would be worse than the gap this plan closes.
 */
export async function cancelUnpaidForCustomerWithDeps(
  deps: CancelUnpaidDeps,
  ref: string,
): Promise<{ cancelled: boolean }> {
  const rows = await deps.runCancel(ref);
  if (rows.length === 0) return { cancelled: false };
  for (const row of rows) {
    await expireSessionIds(deps, row.stripe_checkout_session_ids ?? []);
  }
  return { cancelled: true };
}

/**
 * Worker-wired entry for POST /api/account/bookings/cancel. Same legacy UAE
 * test publishable key guard `/api/checkout/abandon` already uses — that
 * retired account's sessions are never touched (D-01).
 */
export async function cancelUnpaidForCustomer(
  env: CloudflareEnv,
  claims: VamosClaims,
  ref: string,
): Promise<{ cancelled: boolean }> {
  const publishable = env.STRIPE_PUBLISHABLE_KEY || "";
  const canExpire = Boolean(publishable) && !stripeAccountIsLegacyUaeTest(publishable);
  const stripe = canExpire ? stripeFromEnv(env) : null;
  return cancelUnpaidForCustomerWithDeps(
    {
      runCancel: (reference) =>
        asCustomer(env, claims, async (sql) => {
          return sql<CancelUnpaidRow[]>`
            select * from public.checkout_cancel_unpaid(${reference})
          `;
        }),
      expireSession: (sessionId) =>
        stripe ? expireCheckoutSession(stripe, sessionId).then(() => undefined) : Promise.resolve(),
      canExpire,
      emit: (message, sessionId, err) => {
        console.error(message, sessionId, err instanceof Error ? err.message : String(err));
      },
    },
    ref,
  );
}
