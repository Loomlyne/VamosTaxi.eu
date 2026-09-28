import { asSystem } from "../db/identity";
import { notifyExpiredForBookings } from "./lock-mail";
import { expireCheckoutSession, stripeFromEnv } from "./stripe";

export type ExpireUnpaidRow = {
  booking_id: string;
  reference: string;
  stripe_checkout_session_ids: string[] | null;
};

export type ExpireUnpaidDeps = {
  runExpire: () => Promise<ExpireUnpaidRow[]>;
  expireSession: (sessionId: string) => Promise<void>;
  notifyExpired: (bookingIds: string[]) => Promise<number>;
  emit: (message: string, sessionId: string, err: unknown) => void;
};

/**
 * Pure (D-04): for each booking the RPC just cancelled, expire every open
 * Stripe Checkout Session it lists — a failing id is logged and does not
 * stop the sweep or the rest of that booking's own ids. Then skip-send the
 * expired mail (D-24) and return the cancelled count.
 */
export async function expireUnpaidBookingsWithDeps(deps: ExpireUnpaidDeps): Promise<number> {
  const rows = await deps.runExpire();
  for (const row of rows) {
    const ids = row.stripe_checkout_session_ids ?? [];
    for (const id of ids) {
      if (!id) continue;
      try {
        await deps.expireSession(id);
      } catch (err) {
        deps.emit("expire_unpaid_session_failed", id, err);
      }
    }
  }
  const bookingIds = rows
    .map((row) => String(row.booking_id ?? ""))
    .filter((id) => id.length > 0);
  await deps.notifyExpired(bookingIds);
  return rows.length;
}

/**
 * Hourly worker entry. The RPC (18-02 / D-22 / 26.1-06 D-04) cancels unpaid
 * pending rows whose price_snapshots.quote_lock_expires_at is past — not
 * created_at + 24h and not the live book's current lock hours — and now
 * also returns each cancelled booking's open Stripe Checkout Session ids so
 * the customer's stale payment tab is actually expired, not just the DB row
 * (closes audit X9). Paid trips are out of scope (status = pending only).
 */
export async function expireUnpaidBookings(env: CloudflareEnv): Promise<number> {
  const stripe = stripeFromEnv(env);
  return expireUnpaidBookingsWithDeps({
    runExpire: () =>
      asSystem(env, async (sql) => {
        return sql<ExpireUnpaidRow[]>`
          select booking_id, reference, stripe_checkout_session_ids
            from public.checkout_expire_unpaid()
        `;
      }),
    expireSession: (sessionId) => expireCheckoutSession(stripe, sessionId).then(() => undefined),
    notifyExpired: (ids) => notifyExpiredForBookings(env, ids),
    emit: (message, sessionId, err) => {
      console.error(message, sessionId, err instanceof Error ? err.message : String(err));
    },
  });
}
