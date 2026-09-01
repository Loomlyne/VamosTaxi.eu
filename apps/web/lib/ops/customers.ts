// apps/web/lib/ops/customers.ts
//
// OPS-07 / D-26: this module is read-only by design. Staff already hold INSERT/
// UPDATE/DELETE on customers, bookings and booking_legs at the database layer;
// this screen uses none of it. Adding a write here is Phase 8 (OPS-01…05), not
// a convenience.

import { asStaff, type VamosClaims } from "@/lib/db/identity";

export const dynamic = "force-dynamic";

export type CustomerType = "private" | "corporate";

export type CustomerRow = {
  id: string;
  fullName: string;
  type: CustomerType;
  since: string;
  tripCount: number;
  redacted: boolean;
  email?: string;
  phone?: string;
  company?: string;
  note?: string;
};

export type BookingLegRow = {
  legSeq: number;
  direction: string;
  pickupText: string;
  dropoffText: string;
  scheduledAt: string;
  scheduledLocal: string;
  flightNo: string | null;
  status: string;
};

export type BookingHistoryRow = {
  id: string;
  reference: string;
  status: string;
  createdAt: string;
  priceTotalRappen: number | null;
  legs: BookingLegRow[];
};

export type CustomerHistory = {
  customer: CustomerRow;
  bookings: BookingHistoryRow[];
};

type SqlCustomer = {
  id: string;
  full_name: string;
  type: CustomerType;
  since: string | Date;
  erased_at: string | Date | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  note: string | null;
  trip_count: number;
};

type SqlBooking = {
  id: string;
  reference: string;
  status: string;
  created_at: string | Date;
  price_total_rappen: number | null;
  legs: unknown;
};

function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, "\\$&")}%`;
}

function dateDay(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function instant(value: string | Date): string {
  if (typeof value === "string") return value;
  return value.toISOString();
}

function mapCustomer(row: SqlCustomer): CustomerRow {
  const redacted = row.erased_at != null;
  const mapped: CustomerRow = {
    id: row.id,
    fullName: row.full_name,
    type: row.type,
    since: dateDay(row.since),
    tripCount: row.trip_count,
    redacted,
  };
  if (!redacted) {
    if (row.email != null) mapped.email = row.email;
    if (row.phone != null) mapped.phone = row.phone;
    if (row.company != null) mapped.company = row.company;
    if (row.note != null) mapped.note = row.note;
  }
  return mapped;
}

function mapLeg(raw: Record<string, unknown>): BookingLegRow {
  const flight = raw.flightNo;
  return {
    legSeq: Number(raw.legSeq),
    direction: String(raw.direction ?? ""),
    pickupText: String(raw.pickupText ?? ""),
    dropoffText: String(raw.dropoffText ?? ""),
    scheduledAt: instant((raw.scheduledAt as string | Date | undefined) ?? ""),
    scheduledLocal: String(raw.scheduledLocal ?? ""),
    flightNo: typeof flight === "string" && flight.length > 0 ? flight : null,
    status: String(raw.status ?? ""),
  };
}

function mapLegs(value: unknown): BookingLegRow[] {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .filter((row): row is Record<string, unknown> => row != null && typeof row === "object")
    .map(mapLeg)
    .sort((a, b) => a.legSeq - b.legSeq);
}

function mapBooking(row: SqlBooking): BookingHistoryRow {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    createdAt: instant(row.created_at),
    priceTotalRappen: row.price_total_rappen,
    legs: mapLegs(row.legs),
  };
}

export async function loadCustomers(
  env: CloudflareEnv,
  claims: VamosClaims,
  search?: string,
): Promise<CustomerRow[]> {
  const term = search?.trim() ?? "";
  return asStaff(env, claims, async (sql) => {
    const rows =
      term.length === 0
        ? await sql<SqlCustomer[]>`
            select
              c.id,
              c.full_name,
              c.type,
              c.since,
              c.erased_at,
              case when c.erased_at is null then c.email::text end as email,
              case when c.erased_at is null then c.phone end as phone,
              case when c.erased_at is null then c.company end as company,
              case when c.erased_at is null then c.note end as note,
              (select count(*)::int from public.bookings b where b.customer_id = c.id) as trip_count
            from public.customers c
            order by c.full_name asc, c.created_at desc
          `
        : await sql<SqlCustomer[]>`
            select
              c.id,
              c.full_name,
              c.type,
              c.since,
              c.erased_at,
              case when c.erased_at is null then c.email::text end as email,
              case when c.erased_at is null then c.phone end as phone,
              case when c.erased_at is null then c.company end as company,
              case when c.erased_at is null then c.note end as note,
              (select count(*)::int from public.bookings b where b.customer_id = c.id) as trip_count
            from public.customers c
            where c.full_name ilike ${likePattern(term)} escape ${"\\"}
               or c.email::text ilike ${likePattern(term)} escape ${"\\"}
            order by c.full_name asc, c.created_at desc
          `;
    return rows.map(mapCustomer);
  });
}

export async function loadCustomerHistory(
  env: CloudflareEnv,
  claims: VamosClaims,
  customerId: string,
): Promise<CustomerHistory | null> {
  return asStaff(env, claims, async (sql) => {
    const customers = await sql<SqlCustomer[]>`
      select
        c.id,
        c.full_name,
        c.type,
        c.since,
        c.erased_at,
        case when c.erased_at is null then c.email::text end as email,
        case when c.erased_at is null then c.phone end as phone,
        case when c.erased_at is null then c.company end as company,
        case when c.erased_at is null then c.note end as note,
        (select count(*)::int from public.bookings b where b.customer_id = c.id) as trip_count
      from public.customers c
      where c.id = ${customerId}
      limit 1
    `;
    const row = customers[0];
    if (!row) return null;

    const bookings = await sql<SqlBooking[]>`
      select
        b.id,
        b.reference,
        b.status,
        b.created_at,
        b.price_total_rappen,
        coalesce(
          json_agg(
            json_build_object(
              'legSeq', l.leg_seq,
              'direction', l.direction,
              'pickupText', l.pickup_text,
              'dropoffText', l.dropoff_text,
              'scheduledAt', l.scheduled_at,
              'scheduledLocal', l.scheduled_local,
              'flightNo', l.flight_no,
              'status', l.status
            )
            order by l.leg_seq
          ) filter (where l.id is not null),
          '[]'::json
        ) as legs
      from public.bookings b
      left join public.booking_legs l on l.booking_id = b.id
      where b.customer_id = ${customerId}
      group by b.id
      order by b.created_at desc
    `;

    return {
      customer: mapCustomer(row),
      bookings: bookings.map(mapBooking),
    };
  });
}
