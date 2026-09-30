// apps/web/lib/lifecycle/reminder.ts
//
// 09-07 D-29: hourly 24h reminder vs original pickup (Europe/Zurich).
// Cloudflare cron has no IANA TZ — same Instant approach as digest.ts.
// Select original_scheduled_at in [now+24h, now+25h). Skip cancelled /
// completed / no_show. Claim-then-send via notifyReminder24h.
// No no-show sweep.

export const dynamic = "force-dynamic";

import { asSystem } from "../db/identity";
import { notifyReminder24h, type Reminder24hNotify } from "./notify-lifecycle";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type Reminder24hWindow = {
  fromIso: string;
  toIso: string;
};

export type Reminder24hResult = {
  selected: number;
};

type ReminderRow = {
  booking_id: string;
  booking_leg_id: string;
  reference: string;
  locale: string | null;
  contact_email: string | null;
  pickup_text: string | null;
  dropoff_text: string | null;
  scheduled_local: string | null;
  assigned_chauffeur_id: string | null;
  chauffeur_name: string | null;
  vehicle: string | null;
  plate: string | null;
};

function asEmailLocale(locale: string): Reminder24hNotify["locale"] {
  if (locale === "de" || locale === "fr" || locale === "ar") return locale;
  return "en";
}

/** 1-hour window around now+24h. Instant arithmetic — not Cloudflare cron TZ. */
export function reminder24hWindow(scheduledAt: Date): Reminder24hWindow {
  const from = new Date(scheduledAt.getTime() + DAY_MS);
  const to = new Date(from.getTime() + HOUR_MS);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

function tripFromRow(row: ReminderRow): Reminder24hNotify | null {
  const customerEmail = String(row.contact_email ?? "").trim();
  if (!customerEmail) return null;
  const unassigned = row.assigned_chauffeur_id == null;
  return {
    bookingId: String(row.booking_id),
    bookingLegId: String(row.booking_leg_id),
    reference: String(row.reference),
    locale: asEmailLocale(String(row.locale ?? "en")),
    customerEmail,
    pickupText: String(row.pickup_text ?? ""),
    dropoffText: String(row.dropoff_text ?? ""),
    scheduledLocal: String(row.scheduled_local ?? ""),
    ...(unassigned
      ? { opsUnassigned: true }
      : {
          chauffeurName: row.chauffeur_name,
          vehicle: row.vehicle,
          plate: row.plate,
        }),
  };
}

export async function runReminder24h(
  env: CloudflareEnv,
  scheduledAt: Date,
): Promise<Reminder24hResult> {
  const { fromIso, toIso } = reminder24hWindow(scheduledAt);
  const rows = await asSystem(env, async (sql) => {
    // vamos_system has no table SELECT; the read is the definer function
    // public.reminder_24h_candidates (20260930200000; status filter replaced by 20261001120000):
    // original pickup in [from, to), not erased, paid bookings only (confirmed or assigned), never
    // pending, cancelled, completed or no_show.
    return sql<ReminderRow[]>`
      select * from public.reminder_24h_candidates(${fromIso}::timestamptz, ${toIso}::timestamptz)
    `;
  });

  for (const row of rows) {
    const trip = tripFromRow(row);
    if (!trip) continue;
    try {
      await notifyReminder24h(env, trip);
    } catch {
      // Cron logs aggregate outcome only. Claim-then-send owns dedupe.
    }
  }

  return { selected: rows.length };
}
