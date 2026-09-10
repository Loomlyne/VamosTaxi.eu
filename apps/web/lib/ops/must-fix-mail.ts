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
import { asSystem } from "@/lib/db/identity";
import { SUPPORT_EMAIL } from "@/lib/contact-channels";

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
  const row = await asSystem(env, async (sql) => {
    const rows = await sql<TripRow[]>`
      select
        b.reference,
        b.locale,
        l.pickup_text,
        l.dropoff_text,
        l.scheduled_local
        from public.bookings as b
        join public.booking_legs as l on l.booking_id = b.id
       where b.erased_at is null
         and (b.id::text = ${key} or b.reference = ${key})
       order by l.leg_seq
       limit 1
    `;
    return rows[0] ?? null;
  });
  if (!row) return;
  await deliverOpsMustFix(env, "overlap", tripsFromRows([row]), emailLocale(row.locale));
}
