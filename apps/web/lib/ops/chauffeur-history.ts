// apps/web/lib/ops/chauffeur-history.ts
//
// Quick 261001-chauffeur-car. Owner, 2026-10-01: "keep a history on each chauffeur of his bookings
// logs". Every booking this chauffeur was ever assigned to — the trips he has now (booking_legs)
// and the ones an assignment event names him on (booking_events, kind assignment.chauffeur_set,
// payload chauffeur_id) — newest first. A booking whose leg no longer has him was taken off him.
// Read-only, asStaff (staff hold SELECT on both tables). Erased bookings stay out.

import { asStaff, type VamosClaims } from "../db/identity";

export type ChauffeurHistoryRow = {
  bookingId: string;
  reference: string;
  status: string;
  pickup: string;
  dropoff: string;
  date: string;
  time: string;
  /** He was assigned once and is not the driver of this trip any more. */
  takenOff: boolean;
};

type HistorySqlRow = {
  booking_id: string;
  reference: string;
  status: string;
  pickup_text: string | null;
  dropoff_text: string | null;
  scheduled_local: string | null;
  scheduled_at: string | Date | null;
  is_current: boolean | null;
};

function ms(value: string | Date | null): number {
  if (value == null) return Number.NEGATIVE_INFINITY;
  const n = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
}

/** "2026-10-05T14:30" → date "2026-10-05", time "14:30" (the trip's Zurich wall clock). */
function localParts(raw: string | null): { date: string; time: string } {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(String(raw ?? "").trim());
  if (!m) return { date: "", time: "" };
  return { date: m[1] ?? "", time: m[2] ?? "" };
}

export function mapChauffeurHistory(rows: HistorySqlRow[]): ChauffeurHistoryRow[] {
  return rows
    .slice()
    .sort((a, b) => ms(b.scheduled_at) - ms(a.scheduled_at))
    .map((row) => {
      const when = localParts(row.scheduled_local);
      return {
        bookingId: String(row.booking_id),
        reference: String(row.reference ?? ""),
        status: String(row.status ?? ""),
        pickup: String(row.pickup_text ?? ""),
        dropoff: String(row.dropoff_text ?? ""),
        date: when.date,
        time: when.time,
        takenOff: row.is_current !== true,
      };
    });
}

export async function loadChauffeurHistory(
  env: CloudflareEnv,
  claims: VamosClaims,
  chauffeurId: string,
): Promise<ChauffeurHistoryRow[]> {
  const rows = await asStaff(env, claims, async (sql) => {
    return sql<HistorySqlRow[]>`
      with his as (
        select l.booking_id
          from public.booking_legs as l
         where l.assigned_chauffeur_id = ${chauffeurId}::uuid
        union
        select e.booking_id
          from public.booking_events as e
         where e.kind = 'assignment.chauffeur_set'
           and e.payload ->> 'chauffeur_id' = ${chauffeurId}
      )
      select
        b.id as booking_id,
        b.reference,
        b.status::text as status,
        first_leg.pickup_text,
        first_leg.dropoff_text,
        first_leg.scheduled_local,
        first_leg.scheduled_at,
        exists (
          select 1 from public.booking_legs as cur
           where cur.booking_id = b.id
             and cur.assigned_chauffeur_id = ${chauffeurId}::uuid
        ) as is_current
        from his
        join public.bookings as b on b.id = his.booking_id
        left join lateral (
          select leg.pickup_text, leg.dropoff_text, leg.scheduled_local, leg.scheduled_at
            from public.booking_legs as leg
           where leg.booking_id = b.id
           order by leg.leg_seq
           limit 1
        ) as first_leg on true
       where b.erased_at is null
       order by first_leg.scheduled_at desc nulls last
       limit 200
    `;
  });
  return mapChauffeurHistory(rows);
}
