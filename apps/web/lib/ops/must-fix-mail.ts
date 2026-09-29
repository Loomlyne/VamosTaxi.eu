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
  const key = env.RESEND_API_KEY ?? "";
  if (!key) return;
  const payload: OpsMustFixForEmail = { locale, kind, trips };
  await sendOpsMustFix({ RESEND_API_KEY: key }, payload, SUPPORT_EMAIL);
}

export async function deliverOverlapMustFix(
  env: CloudflareEnv,
  bookingKey: string,
): Promise<void> {
  const key = bookingKey.trim();
  if (!key) return;
  const row = await loadMustFixTrip(env, key);
  if (!row) return;
  await deliverOpsMustFix(env, "overlap", tripsFromRows([row]), emailLocale(row.locale));
}

/**
 * D-06: a Stripe event that exhausted its retries and landed on the DLQ. Sends even when no
 * booking row can be resolved (a `pi_`/`ch_` id, or a `cs_` id with no matching payment row) —
 * deliberately does not route through `deliverOpsMustFix`'s `trips.length === 0` early return,
 * because the DLQ alert's whole purpose is to reach a human when the ordinary trip lookup has
 * nothing to show. Always builds one placeholder trip entry so `sendOpsMustFix`'s own
 * "no must-fix trips" guard never fires either.
 */
export async function deliverStuckPaymentAlert(
  env: CloudflareEnv,
  input: StuckPaymentAlertInput,
): Promise<void> {
  const key = env.RESEND_API_KEY ?? "";
  if (!key) return;
  const trips: OpsMustFixTrip[] = [
    { reference: input.reference ?? "", pickupText: "", dropoffText: "", scheduledLocal: "" },
  ];
  const payload: OpsMustFixForEmail = {
    locale: "en",
    kind: "stuck-payment",
    trips,
    detail: { eventId: input.eventId, eventType: input.type, objectId: input.objectId },
  };
  await sendOpsMustFix({ RESEND_API_KEY: key }, payload, SUPPORT_EMAIL);
}

/** D-22/D-25a: a payment landed on a booking that cannot run; the charge was refunded. */
export async function deliverPaidAfterCancelAlert(
  env: CloudflareEnv,
  bookingKey: string,
): Promise<void> {
  const key = bookingKey.trim();
  if (!key) return;
  const row = await loadMustFixTrip(env, key);
  if (!row) return;
  await deliverOpsMustFix(env, "paid-after-cancel", tripsFromRows([row]), emailLocale(row.locale));
}
