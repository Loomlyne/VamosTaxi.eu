I have enough to produce the brief.

---

# Research Brief — Driver/Vehicle Double-Booking Exclusion Constraint

**Lane:** exclusion-constraint · **Phase:** 2 (schema foundation) · **Consumed by:** Phase 8 (ops dispatch, OPS-03) · **Prepared:** 2026-08-21

## RECOMMENDATION

Enforce chauffeur non-overlap **and** vehicle non-overlap with two Postgres `EXCLUDE USING gist` constraints on `booking_legs` (per ADR-006 — assignment lives on the leg, not on `bookings`), driven by a `tstzrange` **generated column** computed from `scheduled_at` + a **snapshotted** duration/buffer pair, restricted to active legs by a partial `WHERE` predicate, requiring only the `btree_gist` extension (confirmed available and demonstrated on Supabase's own managed Postgres). The application layer catches SQLSTATE `23P01` and turns it into a 409 with a plain-language message; nothing here depends on RLS, and RLS does not weaken it.

---

## 1. Extension: `btree_gist` on Supabase — verified available

`btree_gist` adds B-tree equality operator classes to GiST, which is what lets a GiST index mix a scalar equality column (`chauffeur_id`) with a range-overlap column (`tstzrange`) in one exclusion constraint. It ships with core Postgres (`contrib`), is listed among Supabase's 50+ pre-bundled extensions, and Supabase's own engineering blog demonstrates it directly against a managed Supabase database:

```sql
create extension btree_gist;

alter table reservations
  add constraint exclude_duration
  exclude using gist (table_id WITH =, duration WITH &&);
```
— [Supabase blog: "Simplifying Time-Based Queries with Range Columns"](https://supabase.com/blog/range-columns)

Cost: zero — it's a small, dependency-free contrib extension; enabling it does not require superuser on Supabase (Supabase grants `postgres` role the needed privilege for its pre-approved extension list) and it doesn't touch billing. Confirmed present in the general list at [Supabase Postgres Extensions Overview](https://supabase.com/docs/guides/database/extensions), though that overview page itself doesn't itemize it — the blog post is the stronger, load-bearing citation since it shows it running.

**DDL (put in the same migration that creates `booking_legs`, or a dedicated `0001_extensions.sql` migration that every later migration can assume):**

```sql
create extension if not exists btree_gist with schema extensions;
```

Supabase convention is to install contrib extensions into the `extensions` schema, not `public` — do that here to stay consistent with how Supabase's own bootstrapped extensions (`pgcrypto`, `pg_stat_statements`, etc.) are placed.

---

## 2. Where the constraint lives: `booking_legs`, not `bookings`

ADR-006 (`.planning/ADR-006-return-trips-booking-legs.md`) already settled this shape: assignment (`assigned_chauffeur_id`, `assigned_vehicle_id`), `scheduled_at`, and `status` all live per-leg, because an outbound and return leg can have different drivers, different vehicles, and independent cancellation. **The exclusion constraint therefore belongs on `booking_legs`.** Putting it on `bookings` (as GSD-LAUNCH.md's earlier `assigned_chauffeur_id`/`assigned_vehicle_id` sketch implies) would be wrong post-ADR-006 and is superseded by it — flag this explicitly so Phase 8's implementer doesn't resurrect the pre-ADR shape.

```sql
create table booking_legs (
  id                    uuid primary key default gen_random_uuid(),
  booking_id            uuid not null references bookings(id),
  direction             text not null check (direction in ('outbound','return')),
  pickup_text           text not null,
  dropoff_text          text not null,
  scheduled_at          timestamptz not null,          -- Europe/Zurich wall-clock, stored as timestamptz
  flight_no             text,
  vehicle_class         text not null references vehicle_classes(id),
  status                text not null default 'pending'
                          check (status in ('quote','pending','paid','confirmed',
                                             'assigned','completed','cancelled',
                                             'refunded','no_show')),
  assigned_chauffeur_id uuid references chauffeurs(id),
  assigned_vehicle_id   uuid references vehicles(id),

  -- duration + buffer are SNAPSHOTTED at assignment time (see §3) — never a live join
  estimated_duration_minutes integer,   -- from Mapbox Directions at quote/assignment time
  turnaround_buffer_minutes  integer,   -- snapshot of settings.chauffeur_turnaround_minutes

  scheduled_range tstzrange generated always as (
    tstzrange(
      scheduled_at,
      scheduled_at + (coalesce(estimated_duration_minutes, 0)
                       + coalesce(turnaround_buffer_minutes, 0)) * interval '1 minute',
      '[)'
    )
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

## 3. Deriving the range: duration is estimated, buffer is a settings-driven snapshot

A booking has a `scheduled_at` point, not a range — the trip's actual duration depends on the route (Mapbox Directions estimate, computed in Phase 4's quote engine) and there's no telemetry to shrink it once the driver is moving (this product has no live GPS, per the project's own constraints). Two numbers compose the range:

- **`estimated_duration_minutes`** — the Mapbox-derived point-to-point drive time for that leg's `pickup_text` → `dropoff_text`, computed once at quote/assignment time. This is the same number Phase 4's pricing engine already needs for `distance_rates` lookups, so it is not new plumbing — it's a value Phase 4 computes anyway and Phase 2 just gives it a column to land in.
- **`turnaround_buffer_minutes`** — the padding a chauffeur needs between drop-off and being available for the next pickup (parking, next passenger walk-out, traffic slack). This is an **internal dispatch parameter**, not a customer-facing promise, so ADR-002's "seed NULL, render a TBC pill" rule does **not** apply to it — ADR-002 governs consumer-facing waiting-allowance copy (`settings.airportWait`/`cityWait`, Law 04), and this buffer never renders on a public surface. Recommend a new `settings.chauffeur_turnaround_minutes` field, **seeded with a real bootstrap default (30)**, editable later from ops Settings once real dispatch data says otherwise.

**Why both values are snapshotted onto the row instead of read live from `settings` at query time:** a `GENERATED ALWAYS AS` column can only reference columns on the same row — it cannot subquery `settings`, so the buffer must be materialized locally regardless. But there's a second, better reason to do it this way even if a trigger *could* reach across tables: it matches the project's own established pattern. QUOTE-05 already requires "each booking stores the price breakdown and the rate version it was calculated from, so later pricing changes never alter a historical booking" — apply the identical logic here. If `settings.chauffeur_turnaround_minutes` changes next month, a leg scheduled and assigned last month must not have its exclusion range silently recompute; that would let dispatch history use a different rule than the one that was live when the booking was actually assigned.

**How the snapshot gets set:** a `BEFORE INSERT OR UPDATE OF assigned_chauffeur_id` trigger on `booking_legs` populates `turnaround_buffer_minutes` from `settings` the first time a chauffeur is assigned (if still null), and the quote engine sets `estimated_duration_minutes` at quote time. This keeps the generated column pure/immutable (arithmetic only, no subqueries — required, since generated column expressions must be immutable and cannot contain subqueries or reference other tables per Postgres's `CREATE TABLE` rules).

```sql
create or replace function booking_legs_snapshot_buffer()
returns trigger language plpgsql as $$
begin
  if new.assigned_chauffeur_id is not null and new.turnaround_buffer_minutes is null then
    select chauffeur_turnaround_minutes into new.turnaround_buffer_minutes
    from settings where id = 1;
  end if;
  return new;
end;
$$;

create trigger trg_booking_legs_snapshot_buffer
  before insert or update of assigned_chauffeur_id on booking_legs
  for each row execute function booking_legs_snapshot_buffer();
```

**UNCERTAIN — flag for owner/dispatch confirmation, not a blocking gap:** 30 minutes is a reasonable placeholder turnaround (drop-off wind-down + drive to next pickup zone within Zurich), but it is not a number the dispatch team has validated against real trip patterns. Settles when: the owner/ops lead reviews the first weeks of live dispatch data in Phase 8 and either confirms 30 or tunes it. Unlike ADR-002's waiting allowances, getting this wrong before launch is low-risk — it's a safety margin, not a customer promise, and erring toward more buffer (over-blocking a double-book attempt dispatch can still see and override manually) is the safe failure direction, not the dangerous one.

---

## 4. Cancelled/no-show bookings: partial exclusion index

A cancelled or no-show leg must stop blocking new assignments to the same chauffeur in that window. This is a **partial exclusion constraint** — Postgres's `EXCLUDE` supports a `WHERE (predicate)` clause exactly like a partial index (confirmed: [PostgreSQL `CREATE TABLE` docs](https://www.postgresql.org/docs/current/sql-createtable.html), "the predicate allows you to specify an exclusion constraint on a subset of the table; internally this creates a partial index").

```sql
alter table booking_legs
  add constraint booking_legs_chauffeur_no_overlap
  exclude using gist (
    assigned_chauffeur_id with =,
    scheduled_range with &&
  )
  where (
    assigned_chauffeur_id is not null
    and status not in ('cancelled', 'no_show')
  );
```

Note: exclusion constraints already treat `NULL` as never-equal (same semantics as a unique index — two rows both `NULL` in the equality column never conflict), so `assigned_chauffeur_id is not null` in the predicate isn't strictly load-bearing for correctness, but keep it — it shrinks the partial index to only assignment-relevant rows, which is the whole point of a partial index.

---

## 5. Vehicle double-booking: same shape, separate constraint

Yes, the identical pattern applies to vehicles, and it should — a vehicle physically cannot be in two places any more than a driver can, and GSD-LAUNCH.md's Phase 2 sketch already names `assigned_vehicle_id` alongside `assigned_chauffeur_id` for exactly this reason. Do **not** try to fold both into one constraint (e.g. `(chauffeur_id, vehicle_id) WITH =`) — that would only block the exact *pair* recurring, not either resource individually double-booked with a different partner. Two independent constraints:

```sql
alter table booking_legs
  add constraint booking_legs_vehicle_no_overlap
  exclude using gist (
    assigned_vehicle_id with =,
    scheduled_range with &&
  )
  where (
    assigned_vehicle_id is not null
    and status not in ('cancelled', 'no_show')
  );
```

A dispatcher assigning a chauffeur+vehicle pair to a leg therefore gets two independent guarantees in the same `UPDATE` transaction, and either one firing rolls back the whole assignment atomically (no half-assigned state where the driver is booked but the vehicle write silently failed, or vice versa).

---

## 6. Error surface: 23P01 → a usable ops message, not a 500

Postgres raises SQLSTATE `23P01`, condition name `exclusion_violation`, class 23 (Integrity Constraint Violation) — confirmed at [PostgreSQL Error Codes Appendix](https://www.postgresql.org/docs/current/errcodes-appendix.html). `postgres.js` (the project's chosen driver, run through Hyperdrive) surfaces this as a `PostgresError` instance whose `.code` property is the SQLSTATE string; check `err instanceof postgres.PostgresError && err.code === '23P01'`, not the message text (message text isn't a stable API and doesn't localize) — [porsager/postgres error-handling discussion, confirming `.code`/`instanceof postgres.PostgresError` pattern](https://github.com/drizzle-team/drizzle-orm/discussions/916).

The assignment mutation (Phase 8's ops assignment API route/server action) wraps the `UPDATE booking_legs SET assigned_chauffeur_id = …` in a try/catch:

```ts
try {
  await sql`
    update booking_legs
    set assigned_chauffeur_id = ${chauffeurId}, assigned_vehicle_id = ${vehicleId}
    where id = ${legId}
  `;
  // ...write the matching booking_events row in the SAME transaction (see §7)
} catch (err) {
  if (err instanceof postgres.PostgresError && err.code === '23P01') {
    const resource = err.constraint_name?.includes('vehicle') ? 'vehicle' : 'chauffeur';
    return NextResponse.json(
      {
        error: resource === 'vehicle'
          ? 'This vehicle is already assigned to an overlapping transfer.'
          : 'This chauffeur is already assigned to an overlapping transfer.',
      },
      { status: 409 }
    );
  }
  throw err; // genuinely unexpected — let it 500
}
```

`err.constraint_name` (a `PostgresError` field porsager's driver exposes from the backend's `ErrorResponse` message) is how the handler distinguishes the chauffeur constraint from the vehicle constraint without a second query, since both raise the identical SQLSTATE. Copy for the two messages goes into `content_strings`/`vamos-i18n-dict.js` in the same pass ops assignment ships (Law 03 — this is ops-facing but ops UI still needs French/German coverage for bilingual dispatch staff per the existing i18n dictionary, unless Phase 6 explicitly scopes ops as English-only, which is outside this lane's remit to decide).

---

## 7. Interaction with RLS and the audit trail

**RLS:** Exclusion-constraint enforcement happens at the storage/index layer during `INSERT`/`UPDATE`, independent of the RLS policy the querying role is subject to — RLS's `USING`/`WITH CHECK` clauses filter which rows a role can see or write, but the constraint check runs against the constraint's full underlying index regardless of row visibility. This is a well-known general Postgres subtlety (a session can sometimes infer the existence of a row it can't `SELECT` by getting a unique/exclusion violation on an insert it can't otherwise see) — but it doesn't create a real leak here: assignment writes to `booking_legs` only ever come from the `dispatcher`/`admin` role path (DATA-04), and that role's RLS policy already grants full read access to all ops tables, so there's no narrower-visibility session that could probe for hidden bookings via this side channel. Stated explicitly so Phase 8 doesn't have to rediscover it.

**Audit trail (DATA-08 / `booking_events`):** when the constraint fires, the entire transaction rolls back — including any `booking_events` insert the same handler would have written for a successful assignment. That's correct, not a gap: nothing happened, so nothing should be recorded as having happened. Structure the assignment endpoint so the `booking_events` row (`event_type = 'chauffeur_assigned'` / `'vehicle_assigned'`) is written in the **same transaction** as the `UPDATE booking_legs`, not a separate follow-up write — that way a constraint violation atomically prevents both the bad assignment and the false audit entry. Logging *rejected* assignment attempts (for dispatcher UX analytics, e.g. "how often does dispatch try to double-book") is a legitimate but separate concern — route it to Cloudflare Logpush/structured logging, not `booking_events`, since `booking_events` is specified as a record of actual state changes, not attempted ones.

---

## Summary of what Phase 2 ships vs. what Phase 8 consumes

| Ships in Phase 2 (this schema pass) | Consumed in Phase 8 (ops dispatch) |
|---|---|
| `extensions.btree_gist` enabled | Assignment UI catches `23P01`, shows the 409 message |
| `booking_legs` table with `scheduled_range` generated column | Dispatcher assign action writes `assigned_chauffeur_id`/`assigned_vehicle_id` inside the constrained transaction |
| Two partial `EXCLUDE USING gist` constraints (chauffeur, vehicle) | `booking_events` row written same-transaction on success |
| `settings.chauffeur_turnaround_minutes` seeded 30 (bootstrap, not a Law-04 TBC pill) | Owner/dispatch may retune the buffer after real trip data (no migration needed — it's a settings value) |
| Snapshot trigger for `turnaround_buffer_minutes` | — |

**Open item carried forward, not blocking Phase 2:** the 30-minute turnaround default is a placeholder pending real dispatch data, per §3.

Sources: [Supabase Postgres Extensions Overview](https://supabase.com/docs/guides/database/extensions) · [Supabase blog — Range Columns](https://supabase.com/blog/range-columns) · [PostgreSQL `CREATE TABLE` docs — EXCLUDE syntax and partial predicate](https://www.postgresql.org/docs/current/sql-createtable.html) · [PostgreSQL Error Codes Appendix — `23P01 exclusion_violation`](https://www.postgresql.org/docs/current/errcodes-appendix.html) · [porsager/postgres error-handling pattern (`.code`, `instanceof postgres.PostgresError`)](https://github.com/drizzle-team/drizzle-orm/discussions/916) · `.planning/ADR-006-return-trips-booking-legs.md` · `.planning/ADR-002-waiting-allowances-null.md` · `.planning/REQUIREMENTS.md` (OPS-03, DATA-08) · `.planning/ROADMAP.md` (Phase 8 acceptance criteria).