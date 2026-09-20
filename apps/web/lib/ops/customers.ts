// apps/web/lib/ops/customers.ts
//
// Checkout writes contact_* onto bookings and does not insert public.customers.
// The list unions live customer rows with booking emails. Delete is a tombstone
// (erased_at) so the row leaves the list; bookings stay on the board.
// Postgres has no min(uuid) — booking-sourced ids use array_agg.

import { asStaff, type VamosClaims } from "@/lib/db/identity";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function mergeCustomers(fromTable: SqlCustomer[], fromBookings: SqlCustomer[]): CustomerRow[] {
  const seen = new Set(
    fromTable
      .map((row) => row.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email)),
  );
  const extra = fromBookings.filter((row) => {
    const email = row.email?.trim().toLowerCase();
    if (!email) return true;
    if (seen.has(email)) return false;
    seen.add(email);
    return true;
  });
  return [...fromTable, ...extra]
    .map(mapCustomer)
    .sort((a, b) => a.fullName.localeCompare(b.fullName) || b.since.localeCompare(a.since));
}

const ESC = "\\";

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
            where c.erased_at is null
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
            where c.erased_at is null
              and (
                c.full_name ilike ${likePattern(term)} escape ${ESC}
                or c.email::text ilike ${likePattern(term)} escape ${ESC}
              )
            order by c.full_name asc, c.created_at desc
          `;
    const fromBookings =
      term.length === 0
        ? await sql<SqlCustomer[]>`
            select
              (array_agg(b.id order by b.created_at desc))[1] as id,
              (array_agg(b.contact_name order by b.created_at desc))[1] as full_name,
              case
                when (array_agg(b.billing_kind::text order by b.created_at desc))[1] = 'company' then 'corporate'
                else 'private'
              end as type,
              min(b.created_at)::date as since,
              null::timestamptz as erased_at,
              (array_agg(b.contact_email::text order by b.created_at desc))[1] as email,
              (array_agg(b.contact_phone order by b.created_at desc))[1] as phone,
              (array_agg(nullif(b.company_name, '') order by b.created_at desc))[1] as company,
              null::text as note,
              count(*)::int as trip_count
            from public.bookings b
            where b.erased_at is null
              and b.contact_email is not null
              and not exists (
                select 1 from public.customers cx
                where cx.erased_at is not null
                  and lower(cx.email::text) = lower(b.contact_email::text)
              )
            group by lower(b.contact_email::text)
          `
        : await sql<SqlCustomer[]>`
            select
              (array_agg(b.id order by b.created_at desc))[1] as id,
              (array_agg(b.contact_name order by b.created_at desc))[1] as full_name,
              case
                when (array_agg(b.billing_kind::text order by b.created_at desc))[1] = 'company' then 'corporate'
                else 'private'
              end as type,
              min(b.created_at)::date as since,
              null::timestamptz as erased_at,
              (array_agg(b.contact_email::text order by b.created_at desc))[1] as email,
              (array_agg(b.contact_phone order by b.created_at desc))[1] as phone,
              (array_agg(nullif(b.company_name, '') order by b.created_at desc))[1] as company,
              null::text as note,
              count(*)::int as trip_count
            from public.bookings b
            where b.erased_at is null
              and b.contact_email is not null
              and not exists (
                select 1 from public.customers cx
                where cx.erased_at is not null
                  and lower(cx.email::text) = lower(b.contact_email::text)
              )
              and (
                b.contact_name ilike ${likePattern(term)} escape ${ESC}
                or b.contact_email::text ilike ${likePattern(term)} escape ${ESC}
                or coalesce(b.contact_phone, '') ilike ${likePattern(term)} escape ${ESC}
                or coalesce(b.company_name, '') ilike ${likePattern(term)} escape ${ESC}
              )
            group by lower(b.contact_email::text)
          `;
    return mergeCustomers(rows, fromBookings);
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
         or lower(c.email::text) = lower(${customerId})
      limit 1
    `;
    let row = customers[0];
    if (!row) {
      const seeded = await sql<SqlCustomer[]>`
        select
          (array_agg(b.id order by b.created_at desc))[1] as id,
          (array_agg(b.contact_name order by b.created_at desc))[1] as full_name,
          case
            when (array_agg(b.billing_kind::text order by b.created_at desc))[1] = 'company' then 'corporate'
            else 'private'
          end as type,
          min(b.created_at)::date as since,
          null::timestamptz as erased_at,
          (array_agg(b.contact_email::text order by b.created_at desc))[1] as email,
          (array_agg(b.contact_phone order by b.created_at desc))[1] as phone,
          (array_agg(nullif(b.company_name, '') order by b.created_at desc))[1] as company,
          null::text as note,
          count(*)::int as trip_count
        from public.bookings b
        where b.erased_at is null
          and (
            b.id = ${customerId}
            or lower(b.contact_email::text) = lower(${customerId})
            or lower(b.contact_email::text) = (
              select lower(x.contact_email::text) from public.bookings x where x.id = ${customerId}
            )
          )
        group by lower(b.contact_email::text)
      `;
      row = seeded[0];
    }
    if (!row) return null;

    const email = row.email ?? "";
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
         or b.id = ${customerId}
         or (${email} <> '' and lower(b.contact_email::text) = lower(${email}))
      group by b.id
      order by b.created_at desc
    `;

    return {
      customer: mapCustomer(row),
      bookings: bookings.map(mapBooking),
    };
  });
}

export type CustomerWrite = {
  fullName: string;
  email: string;
  phone: string;
};

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseCustomerWrite(body: unknown): CustomerWrite | null {
  if (body == null || typeof body !== "object" || Array.isArray(body)) return null;
  const rec = body as Record<string, unknown>;
  const fullName = asTrimmed(rec.name) || asTrimmed(rec.fullName);
  const email = asTrimmed(rec.email).toLowerCase();
  if (!fullName || !email.includes("@")) return null;
  return {
    fullName,
    email,
    phone: asTrimmed(rec.phone),
  };
}

export async function upsertCustomer(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  input: CustomerWrite,
): Promise<CustomerRow | null> {
  if (!UUID_RE.test(id)) return null;
  return asStaff(env, claims, async (sql) => {
    const seed = await sql<{ email: string | null }[]>`
      select email::text as email from public.customers
      where id = ${id}
      limit 1
    `;
    const fromBooking = seed[0]
      ? []
      : await sql<{ email: string | null }[]>`
          select contact_email::text as email
          from public.bookings
          where id = ${id}
          limit 1
        `;
    const previousEmail = (seed[0]?.email || fromBooking[0]?.email || "").trim().toLowerCase();

    const written = await sql<{ id: string }[]>`
      insert into public.customers (full_name, email, phone, type, company, since, note, erased_at)
      values (
        ${input.fullName},
        ${input.email},
        ${input.phone},
        'private',
        '',
        now()::date,
        '',
        null
      )
      on conflict (email) where erased_at is null do update set
        full_name = excluded.full_name,
        phone = excluded.phone,
        erased_at = null,
        updated_at = now()
      returning id
    `;
    const customerId = written[0]?.id;
    if (!customerId) return null;

    await sql`
      update public.bookings
      set
        customer_id = ${customerId},
        contact_name = ${input.fullName},
        contact_email = ${input.email},
        contact_phone = ${input.phone},
        updated_at = now()
      where erased_at is null
        and (
          customer_id = ${customerId}
          or id = ${id}
          or (${previousEmail} <> '' and lower(contact_email::text) = ${previousEmail})
          or lower(contact_email::text) = ${input.email}
        )
    `;

    const rows = await sql<SqlCustomer[]>`
      select
        c.id,
        c.full_name,
        c.type,
        c.since,
        c.erased_at,
        c.email::text as email,
        c.phone,
        c.company,
        c.note,
        (select count(*)::int from public.bookings b where b.customer_id = c.id and b.erased_at is null) as trip_count
      from public.customers c
      where c.id = ${customerId}
      limit 1
    `;
    return rows[0] ? mapCustomer(rows[0]) : null;
  });
}

export async function eraseCustomer(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  return asStaff(env, claims, async (sql) => {
    const byId = await sql<{ id: string }[]>`
      update public.customers
      set erased_at = now(), updated_at = now()
      where id = ${id} and erased_at is null
      returning id
    `;
    if (byId[0]) return true;

    const fromBooking = await sql<{
      email: string;
      full_name: string;
      phone: string | null;
      company: string | null;
      since: string | Date;
    }[]>`
      select
        b.contact_email::text as email,
        b.contact_name as full_name,
        b.contact_phone as phone,
        b.company_name as company,
        b.created_at::date as since
      from public.bookings b
      where b.erased_at is null
        and (
          b.id = ${id}
          or lower(b.contact_email::text) = (
            select lower(x.contact_email::text) from public.bookings x where x.id = ${id}
          )
        )
      order by b.created_at desc
      limit 1
    `;
    const seed = fromBooking[0];
    if (!seed?.email) return false;

    const byEmail = await sql<{ id: string }[]>`
      update public.customers
      set erased_at = now(), updated_at = now()
      where erased_at is null
        and lower(email::text) = lower(${seed.email})
      returning id
    `;
    if (byEmail[0]) return true;

    await sql`
      insert into public.customers (full_name, email, phone, company, since, note, erased_at)
      values (
        ${seed.full_name || seed.email},
        ${seed.email},
        ${seed.phone ?? ""},
        ${seed.company ?? ""},
        ${dateDay(seed.since)},
        ${""},
        now()
      )
    `;
    return true;
  });
}
