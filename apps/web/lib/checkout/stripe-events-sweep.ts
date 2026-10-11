// apps/web/lib/checkout/stripe-events-sweep.ts
//
// J2 (W4-01): the unprocessed-event sweep the stripe_events index and RPC comments always promised.
//
// An event that is recorded but never settled (the enqueue failing for the whole Stripe retry window, a
// message that used up its eight retries, a message lost, a refund Stripe kept refusing) used to stay
// that way until someone read the table. The hourly cron now claims those events with
// `stripe_events_sweep_claim` (not processed, idle for 10 minutes, oldest first, a bounded batch) and puts
// them on the Stripe-events queue again. The consumer is idempotent (begin / already_processed, settle's
// already-settled branch, the stable refund idempotency key), so a re-enqueue is always safe.
//
// Bounded: an event is re-enqueued at most SWEEP_MAX_SWEEPS times. One that is still open after that is
// returned once as `abandon`: ops is mailed (info@, the stuck-payment mail, ids only, no PII) and only
// when that mail left is the event marked reported (`stripe_events_sweep_abandoned`). A mail that fails
// is an error-level log and is tried again at the next hourly run; a permanently failing event never
// loops, and is never reported silently.
//
// The sweep touches only stripe_events (and the queue). It never reads or writes a booking or payment.

import { asSystem } from "../db/identity";
import { withRequestContext, type ScalarValue } from "../logger";
import { deliverStuckPaymentAlert, type StuckPaymentAlertInput } from "../ops/must-fix-mail";
import type { StripeQueueMessage } from "./webhook";
import { sqlStateOf } from "./settle-errors";
import { pgTextArrayLiteral } from "./settle";

/** Events idle at least this long are swept (the SQL default, kept in step with the queue's retry spread). */
export const SWEEP_IDLE_MINUTES = 10;
/** An event is re-enqueued at most this many times before it is reported as abandoned. */
export const SWEEP_MAX_SWEEPS = 6;
/** Events handled per hourly run. */
export const SWEEP_BATCH = 20;

export type SweepRow = {
  eventId: string;
  type: string;
  objectId: string;
  /** Stripe's `created`, in seconds (the queue message's `stripeCreated`). */
  stripeCreated: number;
  attempts: number;
  lastError: string | null;
  action: "requeue" | "abandon";
};

export type SweepDeps = {
  claim: () => Promise<SweepRow[]>;
  enqueue: (message: StripeQueueMessage) => Promise<void>;
  /** Rejects when the mail did not go out. */
  alertAbandoned: (input: StuckPaymentAlertInput) => Promise<void>;
  markAbandoned: (eventIds: string[]) => Promise<number>;
  emit: (level: "debug" | "info" | "warn" | "error", type: string, fields?: Record<string, ScalarValue>) => void;
};

export type SweepResult = {
  requeued: number;
  enqueueFailed: number;
  abandoned: number;
  alertFailed: number;
};

export async function sweepUnprocessedEventsWithDeps(deps: SweepDeps): Promise<SweepResult> {
  const result: SweepResult = { requeued: 0, enqueueFailed: 0, abandoned: 0, alertFailed: 0 };
  const rows = await deps.claim();
  const reported: string[] = [];

  for (const row of rows) {
    if (row.action === "requeue") {
      try {
        await deps.enqueue({
          eventId: row.eventId,
          type: row.type,
          objectId: row.objectId,
          stripeCreated: row.stripeCreated,
        });
        result.requeued += 1;
        deps.emit("warn", "stripe_event_requeued", {
          eventId: row.eventId,
          eventType: row.type,
          attempts: row.attempts,
          lastError: row.lastError ?? "",
        });
      } catch {
        // The claim already counted this sweep; the next hour tries again (bounded by SWEEP_MAX_SWEEPS).
        result.enqueueFailed += 1;
        deps.emit("error", "stripe_event_requeue_failed", { eventId: row.eventId, eventType: row.type });
      }
      continue;
    }

    // abandon: still open after every sweep. Ops must be told; only a mail that left marks it reported.
    deps.emit("error", "stripe_event_abandoned", {
      eventId: row.eventId,
      eventType: row.type,
      attempts: row.attempts,
      lastError: row.lastError ?? "",
    });
    try {
      await deps.alertAbandoned({
        eventId: row.eventId,
        type: row.type,
        objectId: row.objectId,
        reference: null,
      });
      reported.push(row.eventId);
    } catch {
      result.alertFailed += 1;
      deps.emit("error", "stripe_event_abandon_alert_failed", { eventId: row.eventId });
    }
  }

  if (reported.length > 0) {
    try {
      await deps.markAbandoned(reported);
      result.abandoned = reported.length;
    } catch (err) {
      // The mail went out; an unmarked event is mailed again next hour (a duplicate mail, not a lost one).
      deps.emit("error", "stripe_event_abandon_mark_failed", { count: reported.length, sqlstate: sqlStateOf(err) ?? "" });
    }
  }
  return result;
}

type ClaimDbRow = {
  event_id: string;
  event_type: string;
  object_id: string | null;
  stripe_created: Date | string;
  attempts: number | string;
  last_error: string | null;
  action: string;
};

export async function sweepUnprocessedEvents(env: CloudflareEnv): Promise<SweepResult> {
  const emit = withRequestContext({
    requestId: crypto.randomUUID(),
    route: "scheduled:stripe-events-sweep",
    locale: null,
  });
  return sweepUnprocessedEventsWithDeps({
    claim: async () => {
      const rows = await asSystem(env, (sql) =>
        sql<ClaimDbRow[]>`
          select * from public.stripe_events_sweep_claim(
            ${`${SWEEP_IDLE_MINUTES} minutes`}::interval,
            ${SWEEP_MAX_SWEEPS}::int4,
            ${SWEEP_BATCH}::int4
          )
        `,
      );
      return rows.map((row) => ({
        eventId: String(row.event_id),
        type: String(row.event_type),
        objectId: row.object_id == null ? "" : String(row.object_id),
        stripeCreated: Math.floor(new Date(row.stripe_created).getTime() / 1000),
        attempts: Number(row.attempts),
        lastError: row.last_error == null ? null : String(row.last_error),
        action: row.action === "abandon" ? ("abandon" as const) : ("requeue" as const),
      }));
    },
    enqueue: (message) => env.STRIPE_EVENTS.send(message).then(() => undefined),
    alertAbandoned: (input) => deliverStuckPaymentAlert(env, input),
    markAbandoned: async (eventIds) => {
      const rows = await asSystem(env, (sql) =>
        sql<{ n: number | string }[]>`
          select public.stripe_events_sweep_abandoned(${pgTextArrayLiteral(eventIds)}::text[]) as n
        `,
      );
      return Number(rows[0]?.n ?? 0);
    },
    emit,
  });
}
