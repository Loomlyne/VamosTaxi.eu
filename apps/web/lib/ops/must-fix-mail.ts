// apps/web/lib/ops/must-fix-mail.ts
//
// 08-09: ops must-fix mail (D-55 / D-75). Server-side only. Recipient is the
// existing SUPPORT_EMAIL inbox. Do not cancel the trip. Do not send from
// OpsFleet browser JS.

import {
  sendOpsMustFix,
  type EmailLocale,
  type OpsMustFixForEmail,
  type OpsMustFixKind,
  type OpsMustFixTrip,
} from "@vamos/emails/confirmation";
import { loadMustFixTrip } from "../db/system-reads";
import { SUPPORT_EMAIL } from "../contact-channels";

export type StuckPaymentAlertInput = {
  eventId: string;
  type: string;
  objectId: string;
  reference: string | null;
};

export type { OpsMustFixKind, OpsMustFixTrip };

/**
 * J2 (W4-02): an ops must-fix mail that did not go out. `sendOpsMustFix` never throws; it answers
 * `{ ok: false }` for every failure (no key, rejected by Resend, rate limit). Every deliver* function
 * in this file turns that answer into this error, so no caller can read "resolved" as "sent". `code`
 * is a fixed word, never provider text: it is safe to log. The error message carries no address or name.
 */
export class MustFixMailError extends Error {
  readonly code: "no_api_key" | "send_failed" | "trip_not_found";
  constructor(code: MustFixMailError["code"]) {
    super(`ops must-fix mail not sent: ${code}`);
    this.name = "MustFixMailError";
    this.code = code;
  }
}

/** The one place the result of `sendOpsMustFix` is read. Throws MustFixMailError when it is not ok. */
async function sendMustFixOrThrow(
  env: CloudflareEnv,
  payload: OpsMustFixForEmail,
): Promise<void> {
  const key = env.RESEND_API_KEY ?? "";
  if (!key) throw new MustFixMailError("no_api_key");
  const outcome = await sendOpsMustFix({ RESEND_API_KEY: key }, payload, SUPPORT_EMAIL);
  if (!outcome.ok) throw new MustFixMailError("send_failed");
}

type TripRow = {
  reference: string;
  locale: string | null;
  pickup_text: string | null;
  dropoff_text: string | null;
  scheduled_local: string | null;
};

export function emailLocale(raw: string | null | undefined): EmailLocale {
  if (raw === "de" || raw === "fr" || raw === "ar") return raw;
  return "en";
}

export function tripsFromRows(rows: TripRow[]): OpsMustFixTrip[] {
  return rows.map((row) => ({
    reference: String(row.reference),
    pickupText: String(row.pickup_text ?? ""),
    dropoffText: String(row.dropoff_text ?? ""),
    scheduledLocal: String(row.scheduled_local ?? ""),
  }));
}

export async function deliverOpsMustFix(
  env: CloudflareEnv,
  kind: OpsMustFixKind,
  trips: OpsMustFixTrip[],
  locale: EmailLocale = "en",
): Promise<void> {
  if (trips.length === 0) return;
  const payload: OpsMustFixForEmail = { locale, kind, trips };
  await sendMustFixOrThrow(env, payload);
}

export async function deliverOverlapMustFix(
  env: CloudflareEnv,
  bookingKey: string,
): Promise<void> {
  const key = bookingKey.trim();
  if (!key) return;
  const row = await loadMustFixTrip(env, key);
  if (!row) throw new MustFixMailError("trip_not_found");
  await deliverOpsMustFix(env, "overlap", tripsFromRows([row]), emailLocale(row.locale));
}

/**
 * D-06: a Stripe event that exhausted its retries and landed on the DLQ. Sends even when no
 * booking row can be resolved (a `pi_`/`ch_` id, or a `cs_` id with no matching payment row) —
 * deliberately does not route through `deliverOpsMustFix`'s `trips.length === 0` early return,
 * because the DLQ alert's whole purpose is to reach a human when the ordinary trip lookup has
 * nothing to show. Always builds one placeholder trip entry so `sendOpsMustFix`'s own
 * "no must-fix trips" guard never fires either.
 *
 * J2 (W4-02): throws MustFixMailError when the mail did not go out (no key, Resend refused it); the
 * caller must treat that as "nobody was told".
 */
export async function deliverStuckPaymentAlert(
  env: CloudflareEnv,
  input: StuckPaymentAlertInput,
): Promise<void> {
  const trips: OpsMustFixTrip[] = [
    { reference: input.reference ?? "", pickupText: "", dropoffText: "", scheduledLocal: "" },
  ];
  const payload: OpsMustFixForEmail = {
    locale: "en",
    kind: "stuck-payment",
    trips,
    detail: { eventId: input.eventId, eventType: input.type, objectId: input.objectId },
  };
  await sendMustFixOrThrow(env, payload);
}

/**
 * J3 (W4-07, W5-02): Stripe collected a payment that does not match what the checkout expected (amount,
 * currency or booking). The capture is recorded, the booking is NOT confirmed and nothing is refunded; ops
 * decides. Ids only: the Stripe event, the booking reference, no amount, name or address. Throws
 * MustFixMailError when the mail did not go out (the caller keeps the event open and retries).
 */
export async function deliverAmountMismatchAlert(
  env: CloudflareEnv,
  input: StuckPaymentAlertInput,
): Promise<void> {
  const payload: OpsMustFixForEmail = {
    locale: "en",
    kind: "amount-mismatch",
    trips: [{ reference: input.reference ?? "", pickupText: "", dropoffText: "", scheduledLocal: "" }],
    detail: { eventId: input.eventId, eventType: input.type, objectId: input.objectId },
  };
  await sendMustFixOrThrow(env, payload);
}

/** D-22/D-25a: a payment landed on a booking that cannot run; the charge was refunded. */
export async function deliverPaidAfterCancelAlert(
  env: CloudflareEnv,
  bookingKey: string,
): Promise<void> {
  const key = bookingKey.trim();
  if (!key) return;
  const row = await loadMustFixTrip(env, key);
  if (!row) throw new MustFixMailError("trip_not_found");
  await deliverOpsMustFix(env, "paid-after-cancel", tripsFromRows([row]), emailLocale(row.locale));
}

/**
 * 261002 settle safety (T1): a customer paid the difference for a change, the payment is recorded
 * (it shows as Refund due) but the change was not applied: the trip was cancelled, a newer change
 * replaced it, or it no longer fits. Mails info@ in the booking's language; the caller treats a
 * failure as best effort and never retries because of it.
 */
export async function deliverDifferenceNotAppliedAlert(
  env: CloudflareEnv,
  bookingKey: string,
): Promise<void> {
  const key = bookingKey.trim();
  if (!key) return;
  const row = await loadMustFixTrip(env, key);
  if (!row) throw new MustFixMailError("trip_not_found");
  await deliverOpsMustFix(env, "difference-not-applied", tripsFromRows([row]), emailLocale(row.locale));
}
