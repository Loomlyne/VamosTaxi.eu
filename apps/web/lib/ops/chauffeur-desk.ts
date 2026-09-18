// apps/web/lib/ops/chauffeur-desk.ts
//
// Shift, leave, and Morning/Night seats. SQL is owner-apply; missing
// tables/columns must not 500 the existing fleet list.

import { dutyStatus, type LeaveRange } from "./chauffeurs-model";
import { assertVehicleSeats, type VehicleSeat } from "./vehicle-seats";

export function isMissingDeskSchema(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("code" in err)) return false;
  const code = (err as { code: unknown }).code;
  return code === "42703" || code === "42P01";
}

export function parseShiftWeekdays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const entry of raw) {
    const value = typeof entry === "number" ? entry : Number(entry);
    if (!Number.isInteger(value) || value < 1 || value > 7) continue;
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

export function parseShiftClock(raw: unknown): string | null {
  const token = String(raw ?? "").trim();
  if (!token) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(token);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseLeaveRanges(raw: unknown): LeaveRange[] {
  if (!Array.isArray(raw)) return [];
  const out: LeaveRange[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const rec = entry as { from?: unknown; until?: unknown };
    const from = String(rec.from ?? "").slice(0, 10);
    const until = String(rec.until ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) continue;
    if (until < from) continue;
    out.push({ from, until });
  }
  return out;
}

export function parseSeatId(raw: unknown): string | null {
  const token = String(raw ?? "").trim();
  if (!token) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    token,
  )
    ? token
    : null;
}

export function derivedDuty(input: {
  shiftWeekdays: readonly number[];
  shiftStart: string | null;
  shiftEnd: string | null;
  leaveRanges: readonly LeaveRange[];
}): "shift" | "off" | "leave" {
  return dutyStatus({
    weekdays: input.shiftWeekdays,
    start: input.shiftStart,
    end: input.shiftEnd,
    leaveRanges: input.leaveRanges,
  });
}

export type DeskShift = {
  weekdays: number[];
  start: string | null;
  end: string | null;
};

export type DeskExtras = {
  ready: boolean;
  shiftByChauffeur: Map<string, DeskShift>;
  leaveByChauffeur: Map<string, LeaveRange[]>;
  seatsByVehicle: Map<string, { morningId: string | null; nightId: string | null }>;
};

export function emptyDeskExtras(): DeskExtras {
  return {
    ready: false,
    shiftByChauffeur: new Map(),
    leaveByChauffeur: new Map(),
    seatsByVehicle: new Map(),
  };
}

function asHm(value: unknown): string | null {
  if (value == null) return null;
  const token = String(value);
  return parseShiftClock(token.slice(0, 5));
}

export async function loadDeskExtras(sql: any): Promise<DeskExtras> {
  try {
    const shifts = await sql<
      { id: string; shift_weekdays: number[] | null; shift_start: string | null; shift_end: string | null }[]
    >`
      select id, shift_weekdays, shift_start::text as shift_start, shift_end::text as shift_end
        from public.chauffeurs
    `;
    const leaves = await sql<
      { chauffeur_id: string; from_date: string; until_date: string }[]
    >`
      select chauffeur_id, from_date::text as from_date, until_date::text as until_date
        from public.chauffeur_leave_ranges
       order by from_date
    `;
    const seats = await sql<
      { vehicle_id: string; seat: string; chauffeur_id: string }[]
    >`
      select vehicle_id, seat, chauffeur_id from public.vehicle_seats
    `;
    const shiftByChauffeur = new Map<string, DeskShift>();
    for (const row of shifts) {
      shiftByChauffeur.set(row.id, {
        weekdays: parseShiftWeekdays(row.shift_weekdays ?? []),
        start: asHm(row.shift_start),
        end: asHm(row.shift_end),
      });
    }
    const leaveByChauffeur = new Map<string, LeaveRange[]>();
    for (const row of leaves) {
      const list = leaveByChauffeur.get(row.chauffeur_id) ?? [];
      list.push({ from: String(row.from_date).slice(0, 10), until: String(row.until_date).slice(0, 10) });
      leaveByChauffeur.set(row.chauffeur_id, list);
    }
    const seatsByVehicle = new Map<string, { morningId: string | null; nightId: string | null }>();
    for (const row of seats) {
      const current = seatsByVehicle.get(row.vehicle_id) ?? { morningId: null, nightId: null };
      if (row.seat === "morning") current.morningId = row.chauffeur_id;
      if (row.seat === "night") current.nightId = row.chauffeur_id;
      seatsByVehicle.set(row.vehicle_id, current);
    }
    return { ready: true, shiftByChauffeur, leaveByChauffeur, seatsByVehicle };
  } catch (err) {
    if (isMissingDeskSchema(err)) return emptyDeskExtras();
    throw err;
  }
}

export async function persistChauffeurDesk(
  sql: any,
  chauffeurId: string,
  input: {
    shiftWeekdays: number[];
    shiftStart: string | null;
    shiftEnd: string | null;
    leaveRanges: LeaveRange[];
  },
): Promise<void> {
  const status = derivedDuty(input);
  try {
    await sql`
      update public.chauffeurs set
        shift_weekdays = ${input.shiftWeekdays}::smallint[],
        shift_start = ${input.shiftStart}::time,
        shift_end = ${input.shiftEnd}::time,
        status = ${status}::chauffeur_status,
        updated_at = now()
      where id = ${chauffeurId}::uuid
    `;
    await sql`delete from public.chauffeur_leave_ranges where chauffeur_id = ${chauffeurId}::uuid`;
    for (const range of input.leaveRanges) {
      await sql`
        insert into public.chauffeur_leave_ranges (chauffeur_id, from_date, until_date)
        values (${chauffeurId}::uuid, ${range.from}::date, ${range.until}::date)
      `;
    }
  } catch (err) {
    if (isMissingDeskSchema(err)) return;
    throw err;
  }
}

export async function persistVehicleSeats(
  sql: any,
  vehicleId: string,
  morningId: string | null,
  nightId: string | null,
): Promise<void> {
  const current = { morningId: null as string | null, nightId: null as string | null };
  try {
    const rows = await sql<{ seat: string; chauffeur_id: string }[]>`
      select seat, chauffeur_id from public.vehicle_seats where vehicle_id = ${vehicleId}::uuid
    `;
    for (const row of rows) {
      if (row.seat === "morning") current.morningId = row.chauffeur_id;
      if (row.seat === "night") current.nightId = row.chauffeur_id;
    }
  } catch (err) {
    if (isMissingDeskSchema(err)) return;
    throw err;
  }

  let next = { morningId: current.morningId, nightId: current.nightId };
  const assign = (seat: VehicleSeat, chauffeurId: string | null) => {
    if (!chauffeurId) {
      if (seat === "morning") next = { ...next, morningId: null };
      else next = { ...next, nightId: null };
      return;
    }
    next = assertVehicleSeats({
      morningId: next.morningId,
      nightId: next.nightId,
      chauffeurId,
      seat,
    });
  };
  assign("morning", morningId);
  assign("night", nightId);

  try {
    await sql`delete from public.vehicle_seats where vehicle_id = ${vehicleId}::uuid`;
    const pairs: { seat: VehicleSeat; chauffeurId: string }[] = [];
    if (next.morningId) pairs.push({ seat: "morning", chauffeurId: next.morningId });
    if (next.nightId) pairs.push({ seat: "night", chauffeurId: next.nightId });
    for (const pair of pairs) {
      await sql`
        insert into public.vehicle_seats (vehicle_id, seat, chauffeur_id)
        values (${vehicleId}::uuid, ${pair.seat}, ${pair.chauffeurId}::uuid)
      `;
      await sql`
        update public.chauffeurs
           set default_vehicle_id = ${vehicleId}::uuid, updated_at = now()
         where id = ${pair.chauffeurId}::uuid
      `;
    }
    const kept = new Set(pairs.map((pair) => pair.chauffeurId));
    for (const previous of [current.morningId, current.nightId]) {
      if (previous && !kept.has(previous)) {
        await sql`
          update public.chauffeurs
             set default_vehicle_id = null, updated_at = now()
           where id = ${previous}::uuid
             and default_vehicle_id = ${vehicleId}::uuid
        `;
      }
    }
  } catch (err) {
    if (isMissingDeskSchema(err)) return;
    throw err;
  }
}
