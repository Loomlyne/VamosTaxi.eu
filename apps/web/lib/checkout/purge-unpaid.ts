import type Stripe from "stripe";
import { asSystem } from "../db/identity";
import { allSessionsExpiredUnpaid, retrieveCheckoutSession, stripeFromEnv } from "./stripe";

/**
 * D-25 / D-45: an unpaid web booking is deleted, silently. No customer mail is
 * sent from this module and none may be added. The one rule for both the
 * expired-session webhook and the hourly sweep: a booking goes only when every
 * Stripe Checkout Session it owns is retrieved and is expired and unpaid.
 */
export const PURGE_REASON = "unpaid_expired";
export const PURGE_OLDER_THAN = "35 minutes";

type SessionView = Pick<Stripe.Checkout.Session, "status" | "payment_status" | "metadata">;

export type PurgeSweepRow = {
  booking_id: string;
  reference: string;
  session_ids: string[] | null;
};

export type PurgeSweepDeps = {
  candidates: () => Promise<PurgeSweepRow[]>;
  retrieve: (sessionId: string) => Promise<SessionView>;
  purge: (bookingId: string, reason: string) => Promise<boolean>;
  emit: (message: string, fields: Record<string, string | number>) => void;
};

export type PurgeSweepResult = { purged: number; skipped: number; errors: number };

/**
 * Pure (D-04): purge each candidate whose every Stripe session is expired and
 * unpaid. An empty session list is never enough (nothing proves Stripe agrees).
 * A failing booking is skipped; the rest still run.
 */
export async function purgeExpiredUnpaidWithDeps(deps: PurgeSweepDeps): Promise<PurgeSweepResult> {
  const result: PurgeSweepResult = { purged: 0, skipped: 0, errors: 0 };
  const rows = await deps.candidates();
  for (const row of rows) {
    const ids = (row.session_ids ?? []).filter((id) => Boolean(id));
    try {
      if (ids.length === 0) {
        result.skipped += 1;
        continue;
      }
      const sessions = new Map<string, SessionView>();
      const ok = await allSessionsExpiredUnpaid(ids, async (id) => {
        const s = await deps.retrieve(id);
        sessions.set(id, s);
        return s;
      });
      if (!ok) {
        const paid = [...sessions.values()].some(
          (s) => s.status === "complete" || s.payment_status === "paid",
        );
        if (paid) {
          // Settle owns a paid session; the sweep never deletes around it.
          deps.emit("purge_unpaid_paid_session_seen", { bookingId: row.booking_id });
          result.errors += 1;
        } else {
          result.skipped += 1;
        }
        continue;
      }
      if (await deps.purge(row.booking_id, PURGE_REASON)) result.purged += 1;
      else result.skipped += 1;
    } catch {
      deps.emit("purge_unpaid_failed", { bookingId: row.booking_id });
      result.errors += 1;
    }
  }
  return result;
}

export type PurgeOnExpiredDeps = {
  sessionIdsFor: (bookingId: string) => Promise<string[]>;
  retrieve: (sessionId: string) => Promise<SessionView>;
  purge: (bookingId: string, reason: string) => Promise<boolean>;
};

/**
 * Webhook helper: called after checkout.session.expired for `sessionId` on
 * `bookingId`. Ops extra sessions (metadata.kind "extra") are never purged.
 * Every session of the booking is retrieved; any open, paid, complete or
 * unretrievable one means no purge. Returns true only when the row was deleted.
 */
export async function purgeOnSessionExpired(
  deps: PurgeOnExpiredDeps,
  sessionId: string,
  bookingId: string,
): Promise<boolean> {
  if (!bookingId) return false;
  try {
    const own = await deps.retrieve(sessionId);
    if (own.metadata?.kind === "extra") return false;
    const ids = (await deps.sessionIdsFor(bookingId)).filter((id) => Boolean(id));
    if (ids.length === 0) return false;
    if (!(await allSessionsExpiredUnpaid(ids, deps.retrieve))) return false;
    return await deps.purge(bookingId, PURGE_REASON);
  } catch {
    return false;
  }
}

/** Real dependency set shared by the webhook and the sweep (Stripe retrieve plus asSystem SQL). */
export function purgeDepsFromEnv(env: CloudflareEnv): PurgeOnExpiredDeps {
  const stripe = stripeFromEnv(env);
  return {
    retrieve: (id) => retrieveCheckoutSession(stripe, id),
    sessionIdsFor: (bookingId) =>
      asSystem(env, async (sql) => {
        const rows = await sql<{ ids: string[] | null }[]>`
          select public.checkout_booking_session_ids(${bookingId}::uuid) as ids
        `;
        return rows[0]?.ids ?? [];
      }),
    purge: (bookingId, reason) =>
      asSystem(env, async (sql) => {
        const rows = await sql<{ purged: boolean | null }[]>`
          select public.purge_unpaid_booking(${bookingId}::uuid, ${reason}) as purged
        `;
        return rows[0]?.purged === true;
      }),
  };
}

/** Hourly worker entry: delete eligible unpaid bookings older than 35 minutes that Stripe confirms are expired. */
export async function purgeExpiredUnpaid(env: CloudflareEnv): Promise<PurgeSweepResult> {
  const real = purgeDepsFromEnv(env);
  return purgeExpiredUnpaidWithDeps({
    candidates: () =>
      asSystem(env, async (sql) => {
        return sql<PurgeSweepRow[]>`
          select booking_id, reference, session_ids
            from public.purge_candidates(${PURGE_OLDER_THAN}::interval)
        `;
      }),
    retrieve: real.retrieve,
    purge: real.purge,
    emit: (message, fields) => {
      console.error(message, JSON.stringify(fields));
    },
  });
}
