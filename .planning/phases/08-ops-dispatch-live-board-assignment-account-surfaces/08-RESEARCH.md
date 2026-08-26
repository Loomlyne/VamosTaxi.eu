# Phase 8: Ops Dispatch — Live Board, Assignment & Account Surfaces - Research

**Researched:** 2026-08-24
**Domain:** Supabase Realtime (Broadcast authorization), Postgres `SECURITY DEFINER` mutation RPCs over an already-designed exclusion-constrained schema, Next.js/Cloudflare Workers ops + customer-account routing
**Confidence:** HIGH — every schema fact is read directly from executed migrations (Phase 2 Waves 1–5, committed) or the reviewed `02-SCHEMA-DRAFT.md`; Realtime Broadcast Authorization is confirmed against live official docs; the two genuinely new findings this research adds (the ledger-grant gap and the AUTH-06 claim gap) are derived from primary-source grants and RPC bodies already in the repository, not assumed.

## Summary

Phase 8 is not a UI-port phase wearing a dispatch label — it is the phase where staff and
customers get their first **write** paths into money- and dispatch-adjacent tables, and the
schema Phase 2 already shipped draws a hard line around exactly what those write paths are
allowed to look like. As of this research date, Phase 2 has executed through Wave 5 (migrations
`20260823000001`–`012`: extensions through `booking_access_tokens`, committed `691a2d4`); the
money/evidence/RLS/seed waves (`02-06`–`02-10`) are fully **planned** (files exist) but not yet
executed. Phases 3, 5, 6 and 7 — every one of Phase 8's stated dependencies — are researched and
planned but **not executed**. Phase 8 cannot run end-to-end until all four land; what follows
identifies precisely what is buildable and provable against Phase 2's schema alone in the
meantime (see `<domain>`-equivalent notes throughout, and the plan split's wave notes).

The single most consequential fact this research surfaces: `vamos_staff` already holds full
`SELECT, INSERT, UPDATE, DELETE` on `bookings` and `booking_legs` directly (Phase 2's Wave 8 plan,
`02-08-PLAN.md`, working-set array), but is **SELECT-only, `with check (false)`** on the entire
ledger set — `booking_events`, `price_snapshots`, `price_snapshot_legs`, `booking_payments`,
`booking_refunds`, `booking_notifications`, `stripe_events`. A dispatcher's JWT, even at `aal2`
as an admin, cannot `INSERT` a `booking_events` row or bind a `price_snapshots` row by any grant
path. This is deliberate (Phase 2's own comment: a stolen dispatcher JWT with ledger `INSERT`
"can manufacture a paid booking end to end, bypassing the Phase 4 engine entirely"), and it means
**every** OPS-03/OPS-04/OPS-05 mutation that touches money, price, or the audit trail must go
through a new `SECURITY DEFINER` RPC — the same architectural shape Phase 2 already established
for the guest cancel path (`manage_booking_cancel`) and Phase 7 established for checkout
(`checkout_create_booking`). Phase 8's job is to design and land four to five siblings of that
same pattern (`ops_assign_leg`, `ops_create_phone_booking`, `ops_confirm_booking`,
`ops_cancel_booking`, `ops_issue_refund`), not to write ad-hoc mutations under `asStaff`.

The second major finding corrects an assumption load-bearing in Phase 5's own research: Phase 5's
D-07 states AUTH-06 (guest-booking claim) "is satisfied for free" by the `customers`-linking
signup trigger. Reading the actual `checkout_create_booking` RPC shows this is only true in the
narrow case where a `customers` row already existed for that email *before* the guest checked
out. A guest checkout never creates a `customers` row at all (`bookings.customer_id` is simply
`app.uid()`, NULL for `anon`) — so the common case, a true first-time guest, ends up with a
brand-new, disconnected `customers` row on signup and an orphaned `bookings.customer_id = NULL`
row that nothing links automatically. **AUTH-06's claim step is real, net-new work Phase 8 must
build**, not a UI wrapper around already-linked data.

The third finding is that Realtime for the live board is **already fully designed and half-built**
in Phase 2 (`02-SCHEMA-DRAFT.md` §14f, landing in the still-pending `02-08` RLS migration):
Broadcast, not Postgres Changes, over a private channel authorized by a policy on
`realtime.messages`. Phase 8 lands the trigger and the client subscription only. This research
confirms the exact trigger SQL and client subscription shape against Supabase's current official
docs (live-fetched, HIGH confidence) and clarifies that the WebSocket connection is 100%
browser-to-Supabase — Cloudflare Workers/OpenNext play no role in it at all, which resolves the
brief's own "verify what runs where" flag decisively.

**Primary recommendation:** Build a small family of `SECURITY DEFINER` ops-mutation RPCs
(mirroring `manage_booking_cancel`'s exact shape: `FOR UPDATE` + state-machine check + write +
`booking_events` insert, one transaction, one generic error per failure class) for every write
that touches `bookings`/`booking_legs` combined with the ledger set; wire Realtime Broadcast on a
private `ops:board` channel with the board client treating every payload as a refetch cue, never
authoritative data; and build the AUTH-06 claim as an explicit, confirmed, email-matched RPC —
not an assumption that Phase 5 already did it.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Live board data (list, stat cards, filters) | API / Backend (Server Component via `asStaff`) | Database | Server-rendered read through RLS; never a client-side direct-to-Postgres call |
| Live board **push** (new/changed booking cue) | Database (Broadcast trigger) | Browser / Client (Realtime WS) | Postgres emits the cue via `realtime.broadcast_changes()`; the browser's `@supabase/supabase-js` client holds the WebSocket directly — no Worker involvement |
| Board refresh after a push | Browser / Client | API / Backend | The broadcast payload is a cue only; the client re-runs its normal `asStaff` read, never trusts the payload's own fields as the display truth (Phase 2's own §14f rule) |
| Booking detail + event timeline | API / Backend (Server Component) | Database | Reads `bookings`/`booking_legs`/`booking_events` (SELECT-granted to staff) via `asStaff` |
| Chauffeur/vehicle assignment | Database (`SECURITY DEFINER` RPC) | API / Backend (caller) | `booking_legs` UPDATE is staff-grantable directly, but the paired `booking_events` INSERT is not — one transaction, one RPC |
| Phone booking creation (OPS-04) | Database (`SECURITY DEFINER` RPC) | API / Backend | `bookings`/`booking_legs` INSERT is staff-grantable, but binding `price_snapshots.booking_id` is `service_role`-only — must be one RPC, mirroring `checkout_create_booking` |
| Booking confirm / modify / cancel (OPS-05) | Database (`SECURITY DEFINER` RPC) | API / Backend | Every one of these writes `booking_events`; none is staff-grantable as a raw INSERT |
| Refund issuance (OPS-05) | Database (RPC records decision) | API / Backend (Stripe call) | Postgres cannot call Stripe's API; the RPC computes/records the decision, the Route Handler performs the actual `stripe.refunds.create()` and supplies `stripe_refund_id` **before** the append-only `booking_refunds` row is inserted (no UPDATE path exists after insert) |
| Customer account/bookings/booking-detail | API / Backend (Server Component via `asCustomer`) | Database | RLS-scoped read (`bookings_select_own`) — the same pattern Phase 5 established for the customer's own profile |
| Guest-booking claim (AUTH-06) | Database (`SECURITY DEFINER` RPC) | API / Backend | Must run under `authenticated` immediately after a **verified** sign-in; matches on the customer's confirmed email, not a client-supplied one |
| MFA/aal2 staff-session gate | API / Backend (middleware) + Database (RLS) | — | Inherited unmodified from Phase 6 — Phase 8 adds no new bypass path |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPS-01 | Staff see a live board of bookings that updates when a booking is paid, without a refresh | Realtime Broadcast pattern (§14f, confirmed against live docs); board refetch-on-cue architecture; `OpsBoard.dc.html` structure (stat cards double as filters, 5-row pagination) |
| OPS-02 | Staff open a booking and see its full detail and event timeline | `booking_events` schema (DATA-08, already migrated in the plan file); `OpsDetail.dc.html`'s Details/History tabs; event-kind → timeline-row mapping (Code Examples) |
| OPS-03 | A dispatcher assigns a chauffeur and a vehicle; the same driver cannot be double-booked — enforced at the database level | The two executed `EXCLUDE USING gist` constraints (migration `20260823000011`, committed); `ops_assign_leg` RPC pattern; U17 resolved below (immediate-catch vs pre-check) |
| OPS-04 | A dispatcher can take a booking by phone, price it through the same pricing engine as the public quote, and enter it into the system — a screen with no mock | `price_snapshots.source = 'ops_phone'` (already a valid enum value in the executed schema); `ops_create_phone_booking` RPC pattern; U22 resolved below (duration source) |
| OPS-05 | Staff can confirm, modify and cancel a booking, and issue a refund | New `ops_confirm_booking`/`ops_cancel_booking`/`ops_issue_refund` RPCs (none exist yet in any executed or planned migration); the shared refund-tier-math finding (Decisions, D-08) |
| SITE-03 | A customer can see their profile, booking history and any single booking in detail | `account.dc.html`/`bookings.dc.html`/`booking-detail.dc.html` structure; `asCustomer` + `bookings_select_own` RLS (already executed in principle, policy lands in `02-08`) |
| AUTH-06 | A guest who booked without an account can claim that booking into a new account from the emailed link | The claim-gap finding (Summary, Decisions D-06/D-07) — this is net-new work, not inherited free from Phase 5 |
| DATA-08 | Every booking, price, payment and assignment change writes an append-only event that ops can read as a timeline | `booking_events` shape (already executed in principle via `02-05`'s `manage_booking_cancel`'s write pattern, table itself lands in `02-07`); every new RPC in this phase must write one |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Ops copy is neutral and literal** ("Awaiting payment", "Driver assigned", "Refund due") —
  the exclusion-constraint 409 message and every ops-facing error string in this phase follow
  that voice, not the customer-facing reassurance register.
- **`data-lenis-prevent`** on the board's own scroll region if it ever grows an independently
  scrolling panel (the current `OpsBoard.dc.html` has none — a single page scroll — but the Table
  component's future virtualized variant would need it).
- **Four languages, same pass** — every new string this phase introduces (assign-dialog copy, the
  409 conflict messages, the phone-booking screen, the AUTH-06 claim screen, the refund-issue
  dialog) ships in en/de/fr/ar in the same commit, including the two 409 messages from Phase 2's
  own exclusion-constraint research (`.planning/phases/02.../research/exclusion-constraint.md` §6).
- **No glow, no tinted yellow** — `OpsDetail.dc.html`'s history timeline currently uses
  `var(--vt-yellow-50)`/`var(--vt-yellow-700)` for its event-icon tile (lines 88–89 of the mock)
  — this is a Law 02 violation in the *mock itself* and must be corrected during the port, not
  carried forward. Same for `booking-detail.dc.html`'s `[data-tile]` background (`--vt-yellow-50`,
  line 83 of its stylesheet).
- **`CHF 000` until the matrix lands** — the board's Revenue stat card, the fare `PriceSummary`
  on `OpsDetail`, and every price line on the customer `booking-detail` page stay placeholder
  amounts; `pricing_live=false` still gates real numbers everywhere in this phase.
- **A pending value is a labelled gap** — `OpsDash`'s Money section (Income/Expenses/Net/Average
  fare) has no data source in this phase at all (see Open Questions) and must not be filled with
  invented figures if it is built here.
- **`asStaff`/`asCustomer`/`asGuest` only** — per Phase 3's frozen contract, no ops or account
  route in this phase imports `postgres` or `@vamos/db` internals directly; every read/write goes
  through the five named wrappers.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.112.3 (verified live via `npm view`, matches Phase 5's already-audited pin) | Browser-side Realtime client for the ops board's private channel subscription | Already the project's chosen Supabase client, audited `[OK]` by Phase 5's research; Phase 8 adds no new package, only a new usage (`.channel(...).on('broadcast', ...)`) |
| `@supabase/ssr` | 0.12.4 (Phase 5's pin) | Server-side session read for `asCustomer`/`asStaff` claims on the account and ops routes this phase adds | Already installed by Phase 5/6; Phase 8 consumes it, does not introduce it |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | — | Phase 8 introduces **zero** new npm dependencies. The Mapbox Directions lookup OPS-04's duration fallback may call is a plain `fetch()` against Mapbox's REST API — the same pattern Phase 4's research already establishes (no `@mapbox/*` SDK package), cited not repeated. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Realtime Broadcast (chosen) | Realtime Postgres Changes | Already rejected in Phase 2 §14f — Postgres Changes evaluates RLS as the JWT's `authenticated` role, which a dispatcher never is at the SQL layer, producing silent zero-events-forever. Not re-litigated here. |
| A `SECURITY DEFINER` RPC per mutation (chosen) | Extend `vamos_staff`'s grant to include the ledger set directly | Rejected by Phase 2's own comment: any client-facing role with `INSERT` on `booking_events`/`price_snapshots` can forge a settlement or a refund and the append-only triggers then make the forgery permanent. Not Phase 8's call to reopen. |
| Polling the board every N seconds (fallback only) | Realtime Broadcast (primary) | Acceptable as a documented degrade path if Realtime proves unreliable in testing (see Open Questions), never as the primary design — OPS-01's own success criterion is "without a page refresh," which polling technically satisfies but the requirement's spirit (immediate) does not. |

**Installation:**
```bash
# No new packages. Confirm the existing pins are still current before Wave 1:
npm view @supabase/supabase-js version   # expect 2.112.3 or newer
npm view @supabase/ssr version           # expect 0.12.4 or newer
```

**Version verification:** Confirmed live 2026-08-24 via `npm view @supabase/supabase-js version`
→ `2.112.3`, matching Phase 5's already-completed Package Legitimacy Audit exactly. No
re-verification of `[SLOP]`/`[SUS]` status is needed since no new package enters the dependency
tree.

## Package Legitimacy Audit

> Phase 8 installs **no new external packages**. This table is included for completeness, citing
> the two packages this phase's code will `import` at runtime, both already audited by Phase 5's
> research pass and already present in `apps/web/package.json`'s intended dependency set (not yet
> installed in the repo as of this research date — Phase 5 has not executed either).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@supabase/supabase-js` | npm | 5+ yrs | 3M+/wk | github.com/supabase/supabase-js | Not re-run (slopcheck unavailable in this session — no `pip`) — inherits Phase 5's `[OK]` verdict | Approved (reused, not newly installed by this phase) |
| `@supabase/ssr` | npm | 2+ yrs | 700k+/wk | github.com/supabase/ssr | Not re-run — inherits Phase 5's `[OK]` verdict | Approved (reused) |

**Packages removed due to slopcheck `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none.

*slopcheck was unavailable in this research session (`pip` not present in the environment).
Because Phase 8 introduces no packages beyond what Phase 5 already vetted and pinned, this is
not gated behind a fresh `checkpoint:human-verify` — the planner should confirm at Wave 0 that
Phase 5 has actually executed and these packages are physically installed before Phase 8's ops
board or account routes are written against them.

## Architecture Patterns

### System Architecture Diagram

```
Browser (dispatcher, aal2 session)                Browser (customer, or guest w/ manage link)
  │  GET /ops/bookings                               │  GET /account/bookings
  │  @supabase/supabase-js: channel('ops:board',      │
  │    {config:{private:true}}).on('broadcast', ...)  │
  │         │ WebSocket (direct to Supabase —         │
  │         │ Cloudflare Worker plays NO role here)   │
  ▼         ▼                                          ▼
Next.js middleware (aal2 gate, Phase 6)          Next.js middleware (session gate, Phase 5)
  ▼                                                    ▼
Server Component  ──asStaff(env,claims,fn)──►    Server Component ──asCustomer(env,claims,fn)──►
  ▼                                                    ▼
withIdentity (packages/db) — BEGIN; set_config(role, claims) — HYPERDRIVE_NOCACHE
  ▼                                                    ▼
Postgres RLS (vamos_staff, aal2, AS RESTRICTIVE)  Postgres RLS (authenticated, bookings_select_own)
  │
  ├─→ SELECT bookings/booking_legs/booking_events/customers (direct, staff-granted)
  │
  ├─→ Mutations (assign/phone-booking/confirm/cancel/refund/claim)
  │     ──► SECURITY DEFINER RPC (ops_assign_leg, ops_create_phone_booking,
  │          ops_confirm_booking, ops_cancel_booking, ops_issue_refund,
  │          claim_guest_bookings)
  │     ──► ONE transaction: FOR UPDATE row lock → state-machine check →
  │          write (bookings/booking_legs/price_snapshots.booking_id via the
  │          single permitted NULL→non-NULL update) → booking_events INSERT
  │     ──► on EXCLUDE violation (23P01): caught, named, returned as 409
  │
  └─→ AFTER a dispatch-relevant write commits: trigger calls
        realtime.broadcast_changes('ops:board', TG_OP, TG_OP, 'bookings'|'booking_legs', …)
        ──► realtime.messages (private, RLS: app.is_staff())
        ──► WebSocket push to every subscribed dispatcher's browser
        ──► client treats payload as a CUE ONLY, re-runs its normal asStaff read

External call from an ops Route Handler (never from inside plpgsql):
  ops_issue_refund RPC (records decision, amount, tier) ──► Route Handler reads the
  result ──► stripe.refunds.create() ──► Route Handler INSERTs booking_refunds
  with stripe_refund_id already known (append-only — no UPDATE path exists after insert)
```

### Recommended Project Structure

```
apps/web/
├── app/[locale]/(ops)/ops/
│   ├── bookings/
│   │   ├── page.tsx                 # OpsBoard — Server Component, asStaff read + client Realtime subscriber
│   │   ├── [id]/page.tsx            # OpsDetail — Details/History tabs
│   │   └── new/page.tsx             # OPS-04 phone booking — NO MOCK, flag checkpoint:human-verify
│   └── _components/
│       ├── OpsBoardClient.tsx       # 'use client' — holds the Realtime subscription + refetch trigger
│       ├── AssignDialog.tsx         # chauffeur/vehicle pickers, 409 conflict surface
│       └── RefundDialog.tsx         # OPS-05 refund issuance
├── app/[locale]/(account)/account/
│   ├── page.tsx                     # profile — asCustomer
│   ├── bookings/page.tsx            # SITE-03 booking history
│   ├── bookings/[ref]/page.tsx      # SITE-03 booking detail
│   └── claim/page.tsx               # AUTH-06 — NO MOCK, "we found bookings under this email"
├── lib/db/
│   └── (Phase 3's asStaff/asCustomer/asGuest wrappers — imported, not redefined)
└── lib/realtime/
    └── ops-board-channel.ts         # channel('ops:board', {config:{private:true}}) factory, shared by board + detail

packages/db/supabase/
├── migrations/<ts>_ops_assign_leg.sql
├── migrations/<ts>_ops_phone_booking.sql
├── migrations/<ts>_ops_booking_lifecycle.sql   # confirm/cancel/refund RPCs
├── migrations/<ts>_ops_board_broadcast.sql     # the trigger from Pattern 1 below
├── migrations/<ts>_claim_guest_bookings.sql
└── tests/
    ├── ops_assign_leg.test.sql       # 23P01 → named conflict, buffer snapshot, idempotent re-assign
    ├── ops_phone_booking.test.sql    # source='ops_phone', duration copied from snapshot
    ├── ops_booking_lifecycle.test.sql
    └── claim_guest_bookings.test.sql # only matches confirmed email, revokes tokens same-transaction
```

### Pattern 1: The Realtime Broadcast trigger (confirmed against live official docs)

**What:** A `SECURITY DEFINER` trigger function that calls `realtime.broadcast_changes()` on the
private `ops:board` topic whenever a dispatch-relevant row changes.
**When to use:** `AFTER INSERT OR UPDATE` on `bookings` (status changes) and `booking_legs`
(assignment changes).
**Example:**
```sql
-- Source: https://supabase.com/docs/guides/realtime/broadcast (fetched live 2026-08-24, HIGH confidence)
create or replace function public.tg_ops_board_broadcast()
returns trigger
security definer set search_path = '' as $$
begin
  perform realtime.broadcast_changes(
    'ops:board',              -- topic — matches the §14f policy's realtime.topic() check exactly
    tg_op,                    -- event
    tg_op,                    -- operation
    tg_table_name,            -- table
    tg_table_schema,          -- schema
    new,                      -- new record
    old                       -- old record
  );
  return null;                -- AFTER trigger — return value is ignored
end $$;

create trigger bookings_broadcast_board
  after insert or update on public.bookings
  for each row execute function public.tg_ops_board_broadcast();
create trigger booking_legs_broadcast_board
  after insert or update on public.booking_legs
  for each row execute function public.tg_ops_board_broadcast();
```
```ts
// Source: https://supabase.com/docs/guides/realtime/broadcast (fetched live 2026-08-24)
const channel = supabase.channel('ops:board', { config: { private: true } });
channel
  .on('broadcast', { event: '*' }, (payload) => {
    // Never read payload.new/payload.old as display truth — Phase 2's §14f rule.
    // The payload is a cue; re-run the board's normal asStaff-backed read.
    startTransition(() => router.refresh());
  })
  .subscribe();
```
Client must be authenticated (staff session, `aal2`) before `.subscribe()` — Realtime evaluates
the `realtime.messages` RLS policy as the connecting client's verified JWT, which is exactly the
`app.is_staff()` (role claim + `aal2` + active `staff` row) check already migrated in Phase 2's
`02-08` plan.

### Pattern 2: The ops-mutation RPC shape (mirrors `manage_booking_cancel`, already executed)

**What:** One `SECURITY DEFINER` function per staff mutation that touches the ledger set:
`FOR UPDATE` row lock, state-machine CHECK, the write(s), a `booking_events` INSERT, all inside
one transaction; a single generic error code per failure class.
**When to use:** Every OPS-03/04/05 write.
**Example — assignment (resolves U17 below):**
```sql
-- Pattern source: packages/db/supabase/migrations/20260823000012_booking_access_tokens.sql
-- (manage_booking_cancel, already executed) — this is the SAME shape, new function.
create or replace function public.ops_assign_leg(
  p_leg_id uuid, p_chauffeur_id uuid, p_vehicle_id uuid
) returns table (leg_id uuid, chauffeur_id uuid, vehicle_id uuid)
language plpgsql security definer set search_path = '' as $$
declare v_before public.booking_legs%rowtype;
begin
  if not (select app.is_staff()) then
    raise exception 'not_staff' using errcode = '42501';
  end if;

  select * into v_before from public.booking_legs where id = p_leg_id for update;
  if v_before.id is null then raise exception 'leg_not_found' using errcode = 'P0002'; end if;

  -- Idempotent re-assign: same chauffeur+vehicle already set is a no-op success, not an error
  -- (Common Pitfalls, Pitfall 2 — a double-clicked Assign button must not surface a false 409).
  if v_before.assigned_chauffeur_id is not distinct from p_chauffeur_id
     and v_before.assigned_vehicle_id is not distinct from p_vehicle_id then
    return query select v_before.id, v_before.assigned_chauffeur_id, v_before.assigned_vehicle_id;
    return;
  end if;

  begin
    update public.booking_legs
      set assigned_chauffeur_id = p_chauffeur_id, assigned_vehicle_id = p_vehicle_id
      where id = p_leg_id;
    -- DEFERRABLE INITIALLY IMMEDIATE (Phase 2, executed): the check runs at THIS statement,
    -- not at COMMIT, for an ordinary (non-swap) assignment — so a violation is caught HERE,
    -- with full row context still available for the named-conflict lookup below.
  exception when exclusion_violation then
    declare v_conflict record; v_constraint text;
    begin
      get stacked diagnostics v_constraint = constraint_name;
      select id, reference_leg_seq into v_conflict
        from public.booking_legs
        where (case when v_constraint like '%chauffeur%' then assigned_chauffeur_id = p_chauffeur_id
                     else assigned_vehicle_id = p_vehicle_id end)
          and scheduled_range && v_before.scheduled_range
          and status not in ('cancelled','no_show')
        limit 1;
      raise exception 'assignment_conflict:%:%', v_constraint, coalesce(v_conflict.id::text, 'unknown')
        using errcode = '23P01';
    end;
  end;

  insert into public.booking_events (booking_id, booking_leg_id, kind, actor_kind, actor_id,
      actor_label, from_status, to_status, payload)
    values (v_before.booking_id, p_leg_id,
      case when p_chauffeur_id is distinct from v_before.assigned_chauffeur_id
             then 'assignment.chauffeur_set' else 'assignment.vehicle_set' end,
      'staff', app.uid(), coalesce((select full_name from public.staff where user_id = app.uid()), ''),
      v_before.status, v_before.status,
      jsonb_build_object('chauffeur_id', p_chauffeur_id, 'vehicle_id', p_vehicle_id));

  return query select p_leg_id, p_chauffeur_id, p_vehicle_id;
end $$;
revoke all on function public.ops_assign_leg(uuid, uuid, uuid) from public;
grant execute on function public.ops_assign_leg(uuid, uuid, uuid) to vamos_staff;
```
The API route catches the re-raised `23P01` and parses the `assignment_conflict:<constraint>:<leg_id>`
detail to build the exact "This chauffeur/vehicle is already assigned to an overlapping transfer"
message Phase 2's exclusion-constraint research already drafted.

### Pattern 3: The customer-facing timeline is a curated subset of `booking_events`, never a raw render

**What:** `booking-detail.dc.html`'s "What has happened so far" timeline shows four coarse
milestones (`new`/`confirmed`/`assigned`/`completed`, or a `cancelled` branch) — a different,
smaller vocabulary than `booking_events.kind`'s ~17 values (`price.repriced`, `payment.failed`,
`note.added`, etc.).
**When to use:** Building the customer `booking-detail` page's timeline query.
**Example:**
```sql
-- A curated view, not a raw select — internal kinds (price.*, payment.failed retries,
-- note.added) never reach the customer.
select at, kind, from_status, to_status from public.booking_events
 where booking_id = $1
   and kind in ('booking.created', 'booking.status_changed', 'assignment.chauffeur_set')
 order by at asc;
```
Map `kind`/`to_status` to the mock's four milestone labels in application code, not in SQL — the
label text is an i18n key (Law 03), not a stored string.

### Anti-Patterns to Avoid

- **Extending `vamos_staff`'s grant to the ledger set "just for this one screen."** Every ops
  mutation goes through a `SECURITY DEFINER` RPC; a direct `INSERT`/`UPDATE` grant on
  `booking_events`/`price_snapshots`/`booking_payments`/`booking_refunds` for `vamos_staff` is
  the exact hole Phase 2's own review pass closed and must not be reopened here.
- **Treating a Realtime broadcast payload as the source of truth for a row's new state.** The
  payload is a push notification to refetch, never data to render directly — stated explicitly
  in Phase 2's own §14f rationale, restated here because it is the single most common Realtime
  implementation mistake (see Common Pitfalls).
- **Assuming AUTH-06 is already solved by Phase 5's signup trigger.** It links a NEW `customers`
  row's `user_id` to a pre-existing `customers` row of the same email; it does not touch orphaned
  `bookings.customer_id = NULL` rows from a guest checkout at all. Build the claim RPC.
- **Building `ops_issue_refund`'s tier math as a one-off inline calculation.** LIFE-03's exact
  formula (percent from `price_snapshots.policy.cancellation_tiers` keyed on `hours_before`) is
  needed by BOTH Phase 8 (staff-initiated) and Phase 9 (`manage_booking_cancel`'s currently-stubbed
  `return query select v.id, null::numeric; -- Phase 9 fills the tier calculation`). Write it once
  as a shared `app.calculate_refund_tier(...)` SQL function both phases call.
- **Calling Stripe from inside a `plpgsql` function.** Postgres has no outbound HTTP in this
  project's stack; `ops_issue_refund`'s RPC computes and records the decision only — the actual
  `stripe.refunds.create()` call is application code in the Route Handler, which then performs the
  ONE INSERT into `booking_refunds` with `stripe_refund_id` already known (there is no UPDATE path
  after insert — `booking_refunds` is fully append-only per the executed `0016_append_only.sql`
  trigger-attachment list).
- **Porting `OpsDetail.dc.html`'s `var(--vt-yellow-50)` event-icon tile verbatim.** Law 02
  violation in the mock itself (see Project Constraints above) — fix during the port.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Driver/vehicle double-booking prevention | An app-level "check then insert" race-prone guard | The two already-executed `EXCLUDE USING gist` constraints on `booking_legs` | Already designed, migrated, and pgTAP-proven (`exclusion.test.sql`, 12 assertions, PASS) in Phase 2 Wave 5 — Pitfall 10 in the project's own `PITFALLS.md` names exactly this failure mode for a manual, human-paced ops action |
| Live-board push mechanism | A custom polling loop or a hand-rolled SSE endpoint on the Worker | Supabase Realtime Broadcast on a private channel | Already fully designed (§14f) with the authorization policy migrated in the pending `02-08` plan; a custom SSE endpoint would need to run inside the Worker and re-solve the exact RLS-over-a-pooled-role problem Phase 3 exists to prevent |
| Refund tier calculation | Ops-only inline percent math that Phase 9 later duplicates | A single shared `app.calculate_refund_tier()` SQL function, called by both this phase's `ops_issue_refund` and Phase 9's rewrite of `manage_booking_cancel` | LIFE-03's whole design point is one formula reading the booking's own pinned `price_snapshots.policy` — two implementations WILL drift the moment the tier rule changes |
| Guest-booking → account matching | A client-supplied email compared against `bookings.contact_email` | Match against the **server-verified** `auth.users.email` / `customers.email` of the currently authenticated session only | A client-supplied match string is a spoofing vector — a signed-in attacker could submit a victim's email and pull their trip history and manage-link privileges into the attacker's own account if the match isn't anchored to Supabase's own verified session email (Security Domain, below) |
| Exclusion-conflict error UX | Parsing Postgres's raw `SQLERRM` text for the conflict message | `err.code === '23P01'` + `err.constraint_name`, exactly as Phase 2's own exclusion-constraint research already specifies | Message text is not a stable API and does not localize; already the established pattern for this exact error in this project |

**Key insight:** Almost nothing about *dispatch mechanics* is new invention in this phase — the
double-booking prevention, the price/policy snapshot durability, and the Realtime authorization
model are all designed and (mostly) migrated by Phase 2. Phase 8's actual engineering work is
**wrapping that already-correct schema in the write-path RPCs it deliberately withholds from a
direct grant**, plus the two genuinely new pieces of business logic (the refund tier math and the
AUTH-06 claim matcher) that no earlier phase actually built despite Phase 5's assumption.

## Common Pitfalls

### Pitfall 1: Assuming a forgotten `SECURITY DEFINER` RPC will fail loudly
**What goes wrong:** A developer writes a new ops mutation as a raw `UPDATE`/`INSERT` under
`asStaff` against `booking_events`/`price_snapshots`, expecting a clear error during development.
**Why it happens:** `vamos_staff` DOES have grants on `bookings`/`booking_legs` directly, so the
first few ops screens "just work" without an RPC, training the habit; the ledger tables are the
exception, not the rule, and the failure (`42501`) only appears once that specific table is
touched.
**How to avoid:** Treat "does this write touch `booking_events`, `price_snapshots`,
`price_snapshot_legs`, `booking_payments`, `booking_refunds`, `booking_notifications`, or
`stripe_events`?" as the standing question before writing any ops mutation. If yes, it is an RPC.
**Warning signs:** A Server Action or Route Handler that issues more than one SQL statement
against these tables directly under `asStaff`.

### Pitfall 2: A double-clicked "Assign" button surfaces a false 409
**What goes wrong:** A dispatcher double-clicks Assign (slow network, impatient click); the
second call re-attempts the identical `chauffeur_id`/`vehicle_id` and the exclusion constraint
fires against the row the FIRST call already committed, because the leg is now already assigned
to exactly that pair and re-asserting it trips the same-row overlap.
**Why it happens:** The exclusion constraint does not special-case "assigning a leg to the value
it already holds" — from the index's point of view that's still an overlapping range against
itself unless the RPC explicitly short-circuits it.
**How to avoid:** `ops_assign_leg`'s idempotent no-op branch (Pattern 2, above) — compare the
requested pair against the current row's values with `IS NOT DISTINCT FROM` before attempting the
UPDATE at all.
**Warning signs:** Support/dispatch reports of "the driver IS assigned but the board shows an
error."

### Pitfall 3: The board's Realtime subscription silently stops delivering after a laptop sleep/reconnect
**What goes wrong:** A dispatcher's laptop sleeps; the WebSocket drops; on wake, the client
believes it is still subscribed and the board silently stops updating until a manual refresh.
**Why it happens:** `@supabase/supabase-js`'s realtime client does reconnect automatically, but a
gap in delivered messages during the disconnect window is real unless `broadcast.replay` is
configured, and even with replay, silent staleness is possible if the reconnect itself is slow.
**How to avoid:** On the browser `visibilitychange`/`online` event, force one authoritative
refetch regardless of whether any broadcast was missed — never rely on Realtime delivery alone as
the only staleness-recovery mechanism (this is the same "cue, never truth" discipline as Pattern
1, extended to cover the reconnect case explicitly).
**Warning signs:** A board that "looks fine" in a demo but goes stale during a real multi-hour
dispatch shift with laptop sleep cycles.

### Pitfall 4: Building the customer timeline as a literal render of `booking_events`
**What goes wrong:** A customer sees "price.repriced", a failed-then-retried payment attempt, or
an internal dispatcher note leak onto their own booking-detail page.
**Why it happens:** `booking_events` is the one obvious data source once it exists, and reusing
the same query for both ops and customer surfaces looks like less code.
**How to avoid:** Pattern 3, above — a curated `kind IN (...)` allowlist, never a raw select, for
any customer-facing render of this table.
**Warning signs:** A customer support ticket referencing an internal event label they should
never have seen.

### Pitfall 5: AUTH-06's claim matches on a client-supplied or unconfirmed email
**What goes wrong:** A signed-in customer's still-unconfirmed email (Phase 5 AUTH-01's own
"unverified until the confirmation link is completed" state) is used to match and pull in a
stranger's guest bookings before ownership of that inbox is actually proven.
**Why it happens:** The obvious naive implementation reads `auth.users.email` without checking
`email_confirmed_at`, since the column is present either way.
**How to avoid:** `claim_guest_bookings` must gate on the session's email being verified — read
`auth.jwt() ->> 'email_verified'` or check `email_confirmed_at is not null`, not merely that an
email string exists on the session.
**Warning signs:** A claim succeeding for a customer who signed up via OTP/magic-link but never
completed password-based email confirmation on a *different* address they typed at booking time.

## Code Examples

### The phone-booking RPC skeleton (OPS-04, resolves U22)

```sql
-- Mirrors public.checkout_create_booking (Phase 7, planned) exactly, with two differences:
-- (1) granted to vamos_staff, not anon/authenticated; (2) no Stripe PaymentIntent row is
-- created here — payment is recorded via a SEPARATE ops_confirm_booking / cash-recording
-- step once the dispatcher has actually taken payment (card-over-phone link, or cash).
create or replace function public.ops_create_phone_booking(
  p_quote_id uuid, p_vehicle_class_id uuid, p_contact jsonb, p_locale text
) returns table (booking_id uuid, reference text)
language plpgsql security definer set search_path = '' as $$
declare v_booking_id uuid; v_reference text; v_snapshot public.price_snapshots%rowtype;
begin
  if not (select app.is_staff()) then raise exception 'not_staff' using errcode = '42501'; end if;

  -- The snapshot was already produced by the SAME pricing engine the public quote uses,
  -- called with source='ops_phone' -- price_snapshots.source already has this as a valid
  -- enum value in the executed schema (0012_price_snapshots.sql, §9), anticipating exactly
  -- this path.
  select * into v_snapshot from public.price_snapshots
    where quote_id = p_quote_id and vehicle_class_id = p_vehicle_class_id
      and booking_id is null and source = 'ops_phone';
  if not found then raise exception 'quote_not_found' using errcode = 'P0002'; end if;

  insert into public.bookings (customer_id, contact_name, contact_email, contact_phone,
      quote_id, status, locale)
    values (null, p_contact->>'name', p_contact->>'email', p_contact->>'phone',
      p_quote_id, 'pending', p_locale)
    returning id, reference into v_booking_id, v_reference;

  update public.price_snapshots set booking_id = v_booking_id where id = v_snapshot.id;

  -- estimated_duration_minutes is COPIED from the snapshot's own per-leg duration_min --
  -- the pricing engine already ran Mapbox Directions to produce it (source='ops_phone' or
  -- 'web' both go through the same engine). The dispatcher never types a duration; the assign
  -- dialog reads this column and treats it as pre-filled, with a manual-override number input
  -- ONLY as a fallback for the rare NULL case (resolves U22).
  insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
      scheduled_at, scheduled_local, vehicle_class_id, pax, bags, status,
      estimated_duration_minutes)
    select v_booking_id, sl.leg_seq, sl.direction, sl.pickup_text, sl.dropoff_text,
           sl.scheduled_at, sl.scheduled_local, p_vehicle_class_id, sl.pax, sl.bags, 'pending',
           psl.duration_min
      from /* quote-side leg staging, shape TBD by Phase 4's quote contract */ sl
      join public.price_snapshot_legs psl on psl.snapshot_id = v_snapshot.id and psl.leg_seq = sl.leg_seq;

  insert into public.booking_events (booking_id, kind, actor_kind, actor_id, actor_label,
      snapshot_id, payload)
    values (v_booking_id, 'booking.created', 'staff', app.uid(),
      coalesce((select full_name from public.staff where user_id = app.uid()), ''),
      v_snapshot.id, jsonb_build_object('channel', 'phone'));

  return query select v_booking_id, v_reference;
end $$;
revoke all on function public.ops_create_phone_booking(uuid, uuid, jsonb, text) from public;
grant execute on function public.ops_create_phone_booking(uuid, uuid, jsonb, text) to vamos_staff;
```

### Event-kind → `OpsDetail` timeline row mapping (OPS-02, DATA-08)

```ts
// booking_events.kind (schema, executed pattern from manage_booking_cancel's own writes)
//   -> OpsDetail.dc.html's { icon, label, when, who } shape (lines 186-191 of the mock)
const KIND_TO_TIMELINE: Record<string, { icon: string; labelKey: string }> = {
  'booking.created':            { icon: 'receipt',      labelKey: 'ops.timeline.quoted' },
  'payment.succeeded':          { icon: 'credit-card',  labelKey: 'ops.timeline.paid' },
  'booking.status_changed':     { icon: 'refresh-cw',   labelKey: 'ops.timeline.statusChanged' },
  'assignment.chauffeur_set':   { icon: 'user',          labelKey: 'ops.timeline.driverAssigned' },
  'assignment.vehicle_set':     { icon: 'car-front',     labelKey: 'ops.timeline.vehicleAssigned' },
  'refund.issued':              { icon: 'banknote',      labelKey: 'ops.timeline.refundIssued' },
  'booking.claimed':            { icon: 'user-check',    labelKey: 'ops.timeline.claimed' },
  // ops sees the FULL kind vocabulary (17 values) unfiltered; only the customer render (Pattern 3)
  // curates a subset.
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Realtime `postgres_changes` for any RLS-scoped role other than `authenticated` | Realtime Broadcast + Authorization (private channel, `realtime.messages` RLS) | Supabase's own current recommendation for any subscriber whose visibility isn't simply "their own `auth.uid()` row" — already reflected in Phase 2's design, confirmed against live docs this session | The board's authorization is a policy Phase 2 already owns; Phase 8 does not re-derive it |
| Client-supplied `chauffeur_id`/`vehicle_id` trusted at face value | Server-authoritative validation via the `SECURITY DEFINER` RPC's own FK enforcement plus the exclusion constraint | Established project-wide pattern (server-authoritative quotes, idempotent booking/payment creation per `.claude/CLAUDE.md`) | Nothing in this phase should re-litigate client-trust boundaries already settled |

**Deprecated/outdated:** None specific to this phase — no library version in the Standard Stack
changed since Phase 5's audit.

## Decisions taken here

| # | Decision | Rationale | Confidence |
|---|----------|-----------|------------|
| D-01 | Every OPS-03/04/05 write that touches `booking_events`, `price_snapshots`, `booking_payments`, or `booking_refunds` is a new `SECURITY DEFINER` RPC granted to `vamos_staff`, mirroring `manage_booking_cancel`'s exact shape (`FOR UPDATE` + state check + write + event insert, one transaction) | `vamos_staff`'s grant on the ledger set is `SELECT` only with `with check (false)` in the already-planned `02-08` migration; no direct-INSERT path exists or should exist (Phase 2's own stated threat model) | HIGH — read directly from the pending migration's committed plan text |
| D-02 | Assignment (`ops_assign_leg`) catches the exclusion violation with `EXCEPTION WHEN exclusion_violation` **inside** the RPC for the ordinary (non-swap) case — resolves U17 for the common path | `DEFERRABLE INITIALLY IMMEDIATE` checks per-statement by default; the violation fires at the `UPDATE` itself, inside the function, with full row context (the leg being assigned) still in scope for a same-transaction lookup naming the conflicting leg | HIGH — directly derived from the executed migration's own `DEFERRABLE INITIALLY IMMEDIATE` clause and Postgres's documented deferred-constraint semantics |
| D-03 | A **driver-swap** action (two legs trading chauffeurs) is a distinct, separate RPC that explicitly runs `SET CONSTRAINTS booking_legs_chauffeur_no_overlap, booking_legs_vehicle_no_overlap DEFERRED` and **pre-checks** each target range with a `scheduled_range && ...` SELECT before performing both UPDATEs — resolves U17 for the deferred path | A violation surfaced at COMMIT (outside any statement, outside any exception handler reachable in plpgsql) arrives with no row context recoverable after the fact — this is exactly U17's original framing of the risk, and it only applies to the deliberately-deferred swap case, not ordinary single-leg assignment | HIGH — reasoned from Postgres's documented COMMIT-time deferred-check behaviour; the swap RPC itself is new design, not yet built anywhere |
| D-04 | `ops_assign_leg` short-circuits to a no-op success when the requested `(chauffeur_id, vehicle_id)` pair is identical (`IS NOT DISTINCT FROM`) to the leg's current values, before attempting any UPDATE | A double-clicked Assign button or a slow-network retry would otherwise trip the exclusion constraint against the row's own already-committed state (Common Pitfalls, Pitfall 2) | MEDIUM-HIGH — reasoned from the constraint's documented NULL/self-overlap semantics; not yet proven against a real double-click in this project |
| D-05 | OPS-04's phone-booking flow calls the **same** pricing engine Phase 4 builds for the public quote, with `source='ops_phone'` — never a separate ops-only price calculator | `price_snapshots.source` already has `'ops_phone'` as a valid CHECK value in the executed schema (`0012_price_snapshots.sql` per `02-SCHEMA-DRAFT.md` §9) — the schema was forward-designed anticipating exactly this reuse; OPS-04's own requirement text says "price it through the same pricing engine as the public quote" | HIGH — directly cited from the executed enum/CHECK and the requirement text itself |
| D-06 | AUTH-06 correction: `booking_legs`/`bookings.customer_id` linkage for a **true first-time guest** (no pre-existing `customers` row) is NOT satisfied by Phase 5's signup trigger — a new, explicit `claim_guest_bookings(p_customer_id)` `SECURITY DEFINER` RPC is required in this phase | Traced directly through `checkout_create_booking`'s own body (`insert into public.bookings (customer_id, ...) values (app.uid(), ...)`, NULL for a guest) and confirmed no `customers` row is created for a guest checkout anywhere in the executed or planned schema | HIGH — primary-source trace through the actual RPC body Phase 7 designed, not an assumption |
| D-07 | `claim_guest_bookings` matches on the currently-authenticated session's **verified** email only (`email_confirmed_at is not null` / `auth.jwt() ->> 'email_verified'`), never a client-supplied string, and requires explicit customer confirmation before writing ("we found N bookings under this email — link them?") rather than claiming silently on first sign-in | An unverified or client-supplied email match is a spoofing vector that could pull a stranger's trip history and manage-link privileges into an attacker's account (Common Pitfalls, Pitfall 5; Security Domain, below) | HIGH — standard account-takeover-adjacent reasoning, not project-specific |
| D-08 | The refund percent/tier calculation is written ONCE as a shared `app.calculate_refund_tier(policy jsonb, hours_before numeric)` SQL function, called by both this phase's `ops_issue_refund` (staff-initiated) and Phase 9's future rewrite of `manage_booking_cancel` (currently stubbed `null::numeric` pending exactly this) | `manage_booking_cancel`'s executed body already has the placeholder comment `-- Phase 9 fills the tier calculation`; Phase 8 is the FIRST phase that actually needs this math (OPS-05 ships now, LIFE-02/03's auto-refund is Phase 9) — building it twice guarantees drift the moment a tier number changes | HIGH — the stub comment is read directly from the executed migration; the "build once, two callers" recommendation follows from LIFE-03's own stated design intent (one formula, not two) |
| D-09 | `ops_issue_refund` is two-phase across the transaction boundary: the RPC computes and validates the refund (amount, tier, eligibility) and returns it WITHOUT inserting `booking_refunds`; the calling Route Handler then calls `stripe.refunds.create()` and performs the actual `booking_refunds` INSERT with `stripe_refund_id` already populated | `booking_refunds` has no UPDATE path after INSERT (fully append-only, per the executed `0016_append_only.sql` trigger-attachment list) and Postgres cannot make an outbound HTTP call to Stripe from `plpgsql` — the row can only be written once, after the Stripe call already succeeded | HIGH — derived directly from the executed append-only trigger list and the well-established constraint that Postgres has no synchronous outbound network call |
| D-10 | The live board's Realtime mechanism is Broadcast on a private `ops:board` channel, via a trigger calling `realtime.broadcast_changes()` — the exact SQL and JS client shape confirmed against Supabase's current official docs this session | Already decided in principle by Phase 2 §14f; this research fetches and confirms the exact, current syntax rather than trusting training data, per this agent's own verification discipline | HIGH — live-fetched from `supabase.com/docs/guides/realtime/broadcast`, 2026-08-24 |
| D-11 | The WebSocket connection for Realtime is 100% browser-to-Supabase; Cloudflare Workers/OpenNext perform no proxying, no Durable Object, and no special adapter configuration for this feature | Supabase's Realtime client (`@supabase/supabase-js`) connects directly to `wss://<project-ref>.supabase.co/realtime/v1/websocket` from the browser — this is the standard, well-documented architecture and requires no server-side involvement beyond issuing the client its session JWT | HIGH — standard, well-established Supabase architecture; resolves the brief's own "verify what runs where" flag |
| D-12 | Every Realtime broadcast payload the board client receives is treated as a **refetch cue only**, never as authoritative row data to render directly | Stated explicitly by Phase 2's own §14f rationale ("what a dispatcher can see is still decided by §14c and by nothing else") — restated and generalized here to also cover the reconnect-after-sleep case (Common Pitfalls, Pitfall 3) | HIGH — directly cited from the schema draft, extended by standard Realtime-client reliability reasoning |
| D-13 | The customer-facing "What has happened so far" timeline on `booking-detail` is a curated, allowlisted subset of `booking_events.kind` values, never a raw render of the table ops sees | `booking_events` carries internal-only kinds (`price.repriced`, `payment.failed` retries, `note.added` — dispatcher-eyes-only free text) that must not leak to a customer; the mock's own four-milestone vocabulary (`new`/`confirmed`/`assigned`/`completed`/`cancelled`) is already coarser than the schema's ~17 kinds | HIGH — direct read of both the executed `booking_events` CHECK list and the mock's own `STEPS` vocabulary |
| D-14 | `OpsDetail.dc.html`'s history-timeline icon tile (`var(--vt-yellow-50)`/`var(--vt-yellow-700)`) and `booking-detail.dc.html`'s `[data-tile]` background are Law 02 violations in the mocks themselves and must be corrected (charcoal or `tone="inverse"`, never the tint) during the port, not carried forward as "matches the mock" | `CLAUDE.md`'s own Law 02 explicitly forbids `--vt-yellow-50`/`-700` on any surface "including design-system components whose own default is tinted"; the mocks predate strict enforcement of this rule in a few isolated spots | HIGH — direct grep of both mock files against the project's own binding platform law |
| D-15 | `next_booking_reference()`'s EXECUTE grant already includes `vamos_staff` (not `service_role` alone) — confirmed executed in Phase 2's Wave 5 (F-16) — so OPS-04's phone-booking `bookings` INSERT can rely on the column DEFAULT firing correctly under a staff session without any additional grant work in this phase | Read directly from `02-05-SUMMARY.md`'s own recorded finding: "a column DEFAULT evaluates as the INSERTING role and Plan 02-08 grants vamos_staff INSERT on bookings for OPS-04" | HIGH — read from the executed plan summary, not inferred |
| D-16 | OPS-06/07/08 (fleet, customers, reviews management) are Phase 6 scope, already planned there — `OpsCustomers.dc.html` is NOT re-built in Phase 8 despite living in the same `app/ops/` folder as the phase's own mocks | Phase 6's `06-RESEARCH.md` P5 plan explicitly scopes "Customers (read-only) + Reviews" under OPS-07/OPS-08, both Phase 6 requirement IDs, not Phase 8's | HIGH — direct citation of Phase 6's own committed plan split |
| D-17 | The MFA/`aal2` staff-session gate (middleware redirect + RLS `app.is_staff()` check) is inherited unmodified from Phase 6 — Phase 8 adds no new route or RPC that bypasses it, including the phone-booking screen and the ops-mutation RPCs, all of which check `(select app.is_staff())` as their first statement | Phase 6's three-layer AUTH-05 enforcement pattern (RLS is the real boundary, middleware is UX, invite/claim gates enrolment) is the established, tested pattern; re-deriving or weakening it for a "quick" new route is the most common way a role-gate regresses | HIGH — direct citation of Phase 6's own Pattern 1 |

## UNCERTAIN — must be settled before or during execution

| # | Item | Why uncertain | The check that settles it | Blocks |
|---|------|----------------|----------------------------|--------|
| U-01 | Exact `OpsDetail`/board copy for the two 409 conflict messages, in all four languages, matching this project's ops-neutral voice | Phase 2's exclusion-constraint research drafted English-only illustrative copy ("This chauffeur/vehicle is already assigned to an overlapping transfer") — never localized, never reviewed against `CLAUDE.md`'s ops-copy register | Draft the four-language strings during this phase's UI pass; confirm against `CLAUDE.md`'s "Ops copy is neutral and literal" rule before adding to `content_strings`/the i18n dictionary | Assign-dialog conflict UX |
| U-02 | Whether `ops_confirm_booking`/`ops_cancel_booking` need a state-machine as rich as the guest path's (`manage_booking_cancel`'s status list `pending/paid/confirmed/assigned/partially_completed/partially_cancelled`), or a simpler staff-only vocabulary (e.g. staff can force-cancel from any non-terminal state, including `quote`, which a guest never sees) | No staff-side cancel/confirm RPC exists anywhere yet to copy from; OPS-05's requirement text ("staff can confirm, modify and cancel") doesn't specify which states are eligible for which action | Enumerate the exact `bookings.status`/`booking_legs.status` transitions OPS-05 must support against the `booking_status` enum's own comment block (already executed, `20260823000003_types.sql`) during this phase's own plan-writing, before the RPC signatures are frozen | `ops_confirm_booking`/`ops_cancel_booking` design |
| U-03 | Whether OPS-04's "modify" verb (part of OPS-05, "staff can... modify... a booking") means editing `booking_legs` fields directly (pickup/dropoff/time — before assignment) or means a full re-price-and-re-snapshot cycle (a new `price_snapshots` row superseding the old one, matching `price_snapshots.supersedes_id`'s already-designed column) | The schema already has `supersedes_id` for exactly this shape, but no RPC or UI concept for triggering a re-price exists in any phase's plan yet — "modify" could mean either a cosmetic edit or a commercial re-quote | Confirm with the owner/product whether a modification that changes distance/duration must re-price (using `supersedes_id`) or whether Phase 8 only needs trivial field edits (note, contact details) with a full re-price deferred to a later phase | `ops_modify_booking`'s existence and shape at all — may not need to exist in Phase 8 if scoped to trivial edits only |
| U-04 | Exact Mapbox Directions call shape and quota/caching behaviour for OPS-04's duration lookup when a phone-booked route wasn't already quoted through the public widget (i.e., dispatch enters a genuinely new pickup/dropoff pair with no `price_snapshot_legs.duration_min` to copy from) | Phase 4's research (cited, not re-derived here) establishes the public quote's Mapbox call; whether Phase 8's phone-booking screen reuses that exact server function or needs its own thin wrapper is undetermined until Phase 4 executes | Once Phase 4 lands, confirm its `/api/quote` (or the underlying Directions helper) is callable from the ops phone-booking flow with `source='ops_phone'` without duplicating the Mapbox integration | OPS-04's "price it through the same pricing engine" requirement — the mechanism, not just the source column |
| U-05 | Whether the ops board's Realtime subscription should also cover `booking_legs` UPDATE events specifically for assignment changes made by ANOTHER dispatcher (multi-dispatcher concurrent use), or only `bookings` status transitions (payment) | OPS-01's success criterion says "updates when a booking is **paid**" specifically; whether a second dispatcher's assignment also needs to push live to the first dispatcher's board is not stated, though the Realtime design (Pattern 1) already covers both triggers cheaply | Confirm with the owner whether more than one dispatcher will realistically be logged in concurrently at launch (the fleet is 5 chauffeurs / 6 vehicles per the seed data — a very small team); if genuinely single-dispatcher-at-a-time in practice, the `booking_legs` trigger is low-value but still cheap to keep | Whether Pattern 1's second trigger (`booking_legs_broadcast_board`) is worth the extra write-amplification, or can be simplified to `bookings` only |
| U-06 | Exact shape of the "we found N bookings under this email" AUTH-06 claim screen — a modal on first sign-in, a dedicated `/account/claim` page, or an email-driven deep link from a "we noticed you have guest bookings" notification | No mock exists (confirmed — see Summary); this is explicitly named in Phase 6's research as one of the project's established "no mock, flag before building" categories, alongside TOTP enrolment/MFA challenge | `checkpoint:human-verify` on the first draft, per the project's own established pattern for no-mock ops/account screens (Phase 6 `06-RESEARCH.md` "Screens with no mock") | AUTH-06 UI plan, cannot be silently designed without a design pass |
| U-07 | Whether `claim_guest_bookings` runs automatically (fired once, silently, the moment a session's email is first confirmed) or requires an explicit customer click to confirm each claim | D-07 above settles that the MATCH must be verified-email-only and CONFIRMED, but not whether "confirmed" means an automatic silent claim of verified-email matches or a human-in-the-loop review per booking | Resolve during this phase's UX pass — the safer default (confirmed here as a recommendation, not yet a locked decision) is an explicit customer confirmation step, shown as a one-time banner/notice they can dismiss or accept, never a silent background write | The claim RPC's calling convention (auto-invoked vs. explicit action) |
| U-08 | Whether `OpsDash.dc.html` (the KPI dashboard) is in scope for this phase at all | No `OPS-0x` requirement ID or any other REQUIREMENTS.md ID maps to it anywhere in the traceability table, ROADMAP.md, or GSD-LAUNCH.md — confirmed by grep across all three; it exists only as a mock in `app/ops/OpsDash.dc.html` | Flag for the owner rather than silently building or dropping it, matching the project's own established pattern for `coming-soon.dc.html` (Phase 5's research, Open Question 2) | Whether a "Wave X: dashboard" plan belongs in this phase's split at all — recommend NOT including it in the committed plan split below pending an owner answer |
| U-09 | Which `OpsDash` figures are honestly derivable from Phase 8's own schema access (bookings count, pickups-today count, unassigned count, chauffeurs-on-shift/vehicles-in-service from Phase 6's fleet tables) versus which require Phase 9 lifecycle data or a cost sheet that doesn't exist anywhere (Income/Expenses/Net — the mock's own comment says "Every amount is a placeholder until Stripe payouts and the cost sheet are connected") | If U-08 resolves to "build it," the Money section has literally no data source designed in ANY phase — it is not merely `pricing_live=false`-gated, it is architecturally absent (no expense-tracking table exists in the schema at all) | If built: the Operation section (bookings/pickups/unassigned/chauffeurs/vehicles counts) is honestly buildable now; the Money section must render Law-04 `data-tok` TBC pills, not `CHF 000` (which implies "the number exists but is zero," a different and false claim from "this feature doesn't exist yet") | Whatever plan (if any) builds `OpsDash` |
| U-10 | Whether the guest manage-token's `booking_access_tokens` revocation-on-claim (already noted in schema comments: "AUTH-06 (Phase 8) revokes every live token for a booking in the same transaction as setting `bookings.customer_id`") should also fire a `booking_notifications` entry telling the (now-claimed) customer their old manage link no longer works | Not addressed anywhere — Phase 2's comment only describes the DB-side revocation, not whether the customer is told | Confirm during this phase's planning whether silently revoking (the manage link simply stops resolving, with the customer now using their signed-in account instead) is sufficient, or whether an explicit notice is owed | `claim_guest_bookings`'s full side-effect list |

## Owner blockers that touch this phase

### 1. `OpsDash.dc.html` has no requirement mapping (U-08)
The dashboard mock exists and is polished, but zero `REQUIREMENTS.md` IDs — not `OPS-0x`, not
anything else — reference it anywhere in the traceability table, `ROADMAP.md`, or
`docs/build/GSD-LAUNCH.md`. This is not a Phase 8 engineering question; it needs an owner
decision on whether the dashboard ships in V1 at all, and if so, under what requirement. Flag it
rather than building or dropping it silently — the project has an established pattern for exactly
this situation (`coming-soon.dc.html`, flagged the same way in Phase 5's research).

### 2. The CHF price matrix — open, unchanged from every prior phase
Still open. Every price line this phase renders (board Revenue card, `OpsDetail`'s
`PriceSummary`, the customer `booking-detail` page's fare breakdown) stays `CHF 000` /
`VamosLocale.money(null)` behind `pricing_live=false`. Never invent a figure, not even for a
phone-booking test fixture visible during development.

### 3. AUTH-06's claim-confirmation UX has no design pass (U-06)
Genuinely new UI with no mock, matching the project's own established "flag before building"
category (TOTP enrolment, MFA challenge, and now this — three of the project's `no-mock` screens
now sit in Phase 6+8 alone). Needs a `/gsd:ui-phase 8` pass or an explicit owner/design look before
implementation, not a Claude-invented visual idiom.

### 4. OPS-04's phone-booking screen — explicitly named as needing a design pass first
The requirement text itself says "on a screen designed and reviewed as a mock first" — this is
not optional discretion, it is the requirement's own wording. Phase 6's research already flags
this same screen ("ops 'new booking, phone' is flagged the same way for Phase 8"). Do not build
the UI ahead of that review pass.

### 5. Whether more than one dispatcher will use the board concurrently at launch (U-05)
Affects whether the `booking_legs` Realtime trigger (assignment-change pushes to OTHER
dispatchers) is worth building now versus deferring — low cost either way, but worth a quick
owner confirmation of the expected staff headcount using the board simultaneously.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | The exact `.on('broadcast', { event: '*' }, ...)` wildcard-event client subscription syntax is correct for catching both INSERT and UPDATE broadcasts from the trigger (the fetched doc's own example listens for a single named event, `'position'`) | Pattern 1 | LOW — if wrong, the fix is registering two named listeners (`'INSERT'`, `'UPDATE'`) instead of one wildcard, a small implementation-time correction, not a design change |
| A2 | `ops_create_phone_booking`'s leg-staging join (the commented `/* quote-side leg staging, shape TBD by Phase 4's quote contract */ sl`) will have a concrete source once Phase 4's `/api/quote` response contract is finalized | Code Examples | LOW-MEDIUM — the RPC's shape is otherwise correct; only the exact input parameter carrying per-leg pickup/dropoff/time needs to be filled in once Phase 4 executes |
| A3 | `app.calculate_refund_tier()`'s exact signature (`policy jsonb, hours_before numeric`) is sufficient — it may also need `p_leg_id` if a single-leg cancellation's basis (`price_snapshot_legs.leg_subtotal_rappen`) requires a different tier lookup than a whole-booking cancellation | Decisions D-08, Recommended Project Structure | MEDIUM — if the single-leg case needs a different signature, this is a function-signature refinement at implementation time, not a change to the "build once, share across phases" architecture recommendation |
| A4 | Staff (dispatcher role, not just admin) is the correct role for `ops_assign_leg`/`ops_confirm_booking`/`ops_cancel_booking` EXECUTE grants — versus restricting some of these to `admin` only, the way `rate_versions`/`staff` writes already are | Code Examples, Pattern 2 | MEDIUM — OPS-03/04/05's requirement text says "a dispatcher," implying the lower role is correct for assignment/phone-booking/confirm/cancel, but refund issuance specifically may warrant an admin-only restriction (money leaving the business) — worth an explicit decision during planning, not assumed silently |

**If this table is empty:** N/A — see rows above.

## Open Questions

1. **Does `OpsDash.dc.html` belong in this phase's committed plan split at all?**
   - What we know: no requirement ID maps to it (U-08); some of its figures are honestly
     derivable from this phase's own data access, others (Income/Expenses/Net) have no data
     source designed anywhere in the schema.
   - What's unclear: whether the owner wants a minimal, honestly-partial dashboard now (Operation
     section only, Money section as labelled TBC pills) or wants it deferred entirely to a later
     phase once real financial data exists.
   - Recommendation: exclude it from the committed plan split below; flag as Owner Blocker #1.

2. **Is a Cloudflare Regional/edge cache layer needed for the board's `asStaff` read path, given a busy dispatch morning could mean frequent Realtime-triggered refetches?**
   - What we know: `HYPERDRIVE_NOCACHE` (identity-scoped, no caching) is the only binding
     `asStaff` uses, by Phase 3's own design — this is correct for RLS safety but means every
     board refetch is a full round trip.
   - What's unclear: whether this matters at Zurich-single-operator scale (5 chauffeurs, 6
     vehicles per seed data) — almost certainly not a performance concern at this size, but worth
     stating rather than silently assuming.
   - Recommendation: no action needed for launch; note as a non-blocking observation only.

3. **Should the assign dialog show a live conflict PREVIEW (query `scheduled_range && ...` as the
   dispatcher picks a chauffeur, before they click Assign) rather than only surfacing the 409
   after the fact?**
   - What we know: the exclusion constraint is the source of truth regardless; a live preview
     would be a UX courtesy layered on top, mirroring Phase 6's own "completeness checklist
     before the publish button is enabled" pattern for pricing.
   - What's unclear: whether this is worth the extra read query per dropdown selection for a
     small fleet where conflicts are likely rare.
   - Recommendation: `/gsd:ui-phase 8` territory — a UX polish decision, not a correctness gap;
     the DB-level guarantee holds either way.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Phase 2 executed through Wave 10 (money/evidence/RLS/seed) | Every RPC and RLS policy this phase's mutations depend on | ✗ (executed through Wave 5 only, as of this research date) | Wave 5/10 | None — this is a hard precondition; Phase 8 planning can proceed, but no plan can EXECUTE until Waves 6–10 land |
| Phase 3 (`withIdentity`, `asStaff`/`asCustomer`/`asGuest`) | Every read/write in this phase | ✗ (planned, not executed) | — | None — hard precondition |
| Phase 5 (`@supabase/ssr` session plumbing, customer auth) | SITE-03, AUTH-06's authenticated-session requirement | ✗ (planned, not executed) | — | None — hard precondition for the customer-account lane specifically |
| Phase 6 (ops shell, `aal2` gate, `OpsSidebar`) | Every ops route this phase adds | ✗ (planned, not executed) | — | None — hard precondition for the ops lane specifically |
| Phase 7 (`checkout_create_booking`, paid-booking shape, Realtime-worthy status transitions) | The board's actual data (a real paid booking to display) | ✗ (planned, not executed) | — | Locally, the RPC design and pgTAP proofs (Pattern 2, D-01–D-09) can be authored and tested against hand-seeded fixture rows in Phase 2's schema WITHOUT Phase 7 existing — the UI/route layer cannot render real data until Phase 7 lands |
| Mapbox Directions API | OPS-04's duration fallback when no prior quote exists (U-04) | Not probed this session (no credentials in this environment) | — | Phase 4's own Environment Availability audit (cited) already covers this; not re-probed here |
| `supabase start` (local Postgres) | Any pgTAP authoring/testing for the new RPCs this phase adds | Not probed this session (database-modification commands explicitly out of scope for this research per the phase's own constraints) | — | The executor probes this at Wave 0 per standard practice |

**Missing dependencies with no fallback:**
- Phase 2 Waves 6–10, Phase 3, Phase 5, Phase 6, and Phase 7, all unexecuted as of this research
  date — Phase 8 cannot be executed (only planned) until they land. This is stated plainly rather
  than softened: the roadmap's own dependency line ("Depends on: Phase 5, Phase 6, Phase 7") is
  accurate and binding.

**Missing dependencies with fallback:**
- Phase 7 specifically has a partial fallback for the RPC/pgTAP design-and-proof work (see row
  above) — the schema-and-mutation-logic half of this phase is buildable and testable against
  Phase 2 alone; only the UI/route layer needs Phase 7's real checkout flow to render true data.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (`apps/web/playwright.config.ts`, already configured by Phase 1) for route/integration behaviour; `supabase test db` (pgTAP, `packages/db/`) for RLS/RPC/exclusion-constraint assertions — both already established, cited from Phase 2/6/7's own Validation Architecture sections, not re-derived |
| Config file | `apps/web/playwright.config.ts`; `packages/db/supabase/config.toml` |
| Quick run command | `pnpm --filter web exec playwright test tests/integration/ops-<area>.spec.ts` / `pnpm --filter @vamos/db run test:db supabase/tests/<name>.test.sql` |
| Full suite command | `pnpm test:visual` (web) + `pnpm db:test` (pgTAP, from repo root) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPS-01 | The board updates without a page refresh when a seeded booking's status flips to `paid` via a background API/SQL call | integration (Playwright, **two browser contexts**: dispatcher A watches the board, a second context or a direct SQL call flips the row) | `pnpm --filter web exec playwright test tests/integration/ops-board-realtime.spec.ts` | ❌ Wave 0 |
| OPS-02 | Opening a booking shows a `booking_events`-derived timeline in the correct order, correct icons | integration | `pnpm --filter web exec playwright test tests/integration/ops-detail-timeline.spec.ts` | ❌ Wave 0 |
| OPS-03 | Two overlapping assignment attempts on the same chauffeur raise the named 409; a cancelled leg does not block; idempotent re-assign of the same pair succeeds silently | pgTAP + integration | `supabase test db supabase/tests/ops_assign_leg.test.sql`; `playwright test tests/integration/ops-assign-conflict.spec.ts` | ❌ Wave 0 (pgTAP extends Phase 2's already-executed `exclusion.test.sql`) |
| OPS-04 | A phone booking creates `bookings`+`booking_legs`+binds `price_snapshots` with `source='ops_phone'`, `estimated_duration_minutes` copied from the snapshot | pgTAP | `supabase test db supabase/tests/ops_phone_booking.test.sql` | ❌ Wave 0 |
| OPS-05 | A staff-issued refund records the correct tier/amount from `price_snapshots.policy`; a raw `insert into booking_refunds` under `asStaff` still raises `42501` (grant layer proof, mirroring Phase 2's own `ops_write_denied.test.sql`) | pgTAP | `supabase test db supabase/tests/ops_issue_refund.test.sql` | ❌ Wave 0 |
| SITE-03 | A signed-in customer sees only their own bookings; a different customer's session sees zero rows for the same query | integration (Playwright, **a seeded customer plus a second seeded customer**) | `playwright test tests/integration/account-bookings-rls.spec.ts` | ❌ Wave 0 |
| AUTH-06 | A guest booking's `contact_email` matches a newly-signed-up customer's verified email → `claim_guest_bookings` links it and revokes its manage token in one transaction; an UNVERIFIED session cannot claim | pgTAP + integration | `supabase test db supabase/tests/claim_guest_bookings.test.sql`; `playwright test tests/integration/auth06-claim.spec.ts` | ❌ Wave 0 |
| DATA-08 | Every new RPC in this phase writes exactly one `booking_events` row per successful mutation, none on a rolled-back/failed attempt | pgTAP | Covered by each RPC's own test file (assert row count before/after) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the relevant single Playwright spec (`-x` fast-fail) + the relevant single
  pgTAP file.
- **Per wave merge:** `pnpm test:visual` (web) + `pnpm db:test` (pgTAP, full suite).
- **Phase gate:** Full suite green, including Phase 2's own already-executed `exclusion.test.sql`
  (must remain green — nothing in this phase's new RPCs may weaken the existing constraint
  proofs) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `packages/db/supabase/tests/ops_assign_leg.test.sql` — covers OPS-03, the D-02/D-03/D-04
      resolution
- [ ] `packages/db/supabase/tests/ops_phone_booking.test.sql` — covers OPS-04
- [ ] `packages/db/supabase/tests/ops_issue_refund.test.sql` — covers OPS-05
- [ ] `packages/db/supabase/tests/claim_guest_bookings.test.sql` — covers AUTH-06
- [ ] `apps/web/tests/integration/ops-board-realtime.spec.ts` — covers OPS-01, needs **two seeded
      staff users** (one to watch the board, one whose action — or a direct backend call — flips
      the row) per the brief's own verification note
- [ ] `apps/web/tests/integration/account-bookings-rls.spec.ts` — covers SITE-03, needs **a
      seeded customer** plus a second customer fixture
- [ ] Seed fixtures: at minimum one `paid` booking with an unassigned leg, one `pending` phone
      quote (`price_snapshots.source='ops_phone'`), one guest booking with a `contact_email`
      matching a to-be-created test customer signup, for the pgTAP files above to exercise
      against real rows rather than mocks
- [ ] Framework install: none — Playwright and the Supabase CLI/pgTAP toolchain are already
      configured project-wide by Phase 1/2

*(Not "None" — this is Wave 0 work in the fullest sense, since none of Phase 8's own RPCs,
triggers, or test fixtures exist yet in any executed or planned migration.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (inherited) | Phase 5/6's `getUser()`-not-`getSession()` discipline, `aal2` staff gate — Phase 8 adds no new auth mechanism, only consumes these |
| V3 Session Management | yes | Realtime's private-channel authorization re-validates the connecting client's JWT via the `realtime.messages` RLS policy on every subscribe — no separate session concept to manage |
| V4 Access Control | yes — the phase's central concern | Every ledger-touching mutation is a `SECURITY DEFINER` RPC gated on `(select app.is_staff())` as its first statement (D-01, D-17); no new grant widens `vamos_staff`'s reach into the ledger set |
| V5 Input Validation | yes | Chauffeur/vehicle IDs are validated by the RPC's own FK constraints (a bad ID raises a clean `foreign_key_violation`, mapped to a 404, never trusted as-is); refund amounts/percents are computed server-side from `price_snapshots.policy`, never accepted from the client |
| V6 Cryptography | no new surface | Manage-token hashing is unchanged, inherited from Phase 2's already-designed `booking_access_tokens` shape (SHA-256, hashed in the Worker) |
| V8 Data Protection | yes | `booking_events`'s append-only enforcement (four layers, already executed in principle via `manage_booking_cancel`'s pattern) extends unmodified to every new RPC's own event write — no new mutation bypasses it |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A dispatcher (or stolen `aal2` staff JWT) forging a settlement/refund via direct table INSERT | Tampering | Already closed at the grant layer (D-01); this phase must not reopen it for "one quick screen" |
| A signed-in customer claiming a stranger's guest booking via an unverified or spoofed email match | Spoofing / Information Disclosure | `claim_guest_bookings` gates on `email_confirmed_at is not null` and requires explicit customer confirmation, never a silent auto-claim on an unverified address (D-07, Pitfall 5) |
| A double-clicked or retried Assign action producing a false conflict, training dispatchers to distrust the constraint and work around it manually | (not a STRIDE category — an availability/usability-adjacent risk with a security consequence: workaround pressure erodes the DB-level guarantee's practical value) | The idempotent no-op short-circuit (D-04) — a correct system that *feels* broken gets bypassed |
| A dispatcher's session bypassing the `aal2` gate via a newly-added route that forgets the middleware guard or the RPC's own `app.is_staff()` check | Elevation of Privilege | D-17 — every new route/RPC this phase adds re-checks the gate; RLS remains the actual boundary regardless of what the route layer does or forgets |
| Refund amount tampering (a manipulated client request claiming a higher refund than the booking's own snapshot policy allows) | Tampering | `ops_issue_refund`'s computed amount is server-derived from `price_snapshots.policy`/`booking_payments.charged_rappen`, never accepted as a client-supplied number; the `booking_refunds_not_more_than_basis` CHECK (already designed in Phase 2 §9) provides a second, DB-level floor |

## Proposed Phase 8 plan split

| # | Plan | Goal (one line) | File scope | Depends on | Parallel with |
|---|---|---|---|---|---|
| **P1** | **Assignment RPC (`ops_assign_leg`)** | `ops_assign_leg` with the idempotent no-op short-circuit (D-04) plus a distinct deferred-constraint driver-swap sibling (D-03); pgTAP proving the named `23P01` conflict (D-02), the idempotent re-assign, and that a cancelled/no-show leg never blocks — resolves U17 for both the immediate and the deferred path | `packages/db/supabase/migrations/<ts>_ops_assign_leg.sql`, `packages/db/supabase/tests/ops_assign_leg.test.sql` | Phase 2 Wave 5 (executed: `booking_legs`, the two exclusion constraints, migration `20260823000011`); Phase 2 `02-07`'s `booking_events` table landing before the pgTAP file can run for real (authoring proceeds now against the planned shape) | P2, P3, P4, P7 |
| **P2** | **Phone/manual booking RPC (`ops_create_phone_booking`)** | `ops_create_phone_booking` binding an existing `source='ops_phone'` `price_snapshots` row and copying `estimated_duration_minutes` straight from `price_snapshot_legs.duration_min` — resolves U22: the dispatcher never types a duration, a manual-override number input is a fallback only for the rare NULL case | `packages/db/supabase/migrations/<ts>_ops_phone_booking.sql`, `packages/db/supabase/tests/ops_phone_booking.test.sql` | Phase 2 Wave 5 (`bookings`, `price_snapshots`); D-15's already-confirmed `vamos_staff` grant on `next_booking_reference()` | P1, P3, P4, P7 |
| **P3** | **Booking-lifecycle RPCs + shared refund-tier function** | `ops_confirm_booking`, `ops_cancel_booking` (U-02's staff-only state machine, including a transition out of `quote` a guest never reaches), `ops_issue_refund` (two-phase compute-then-record, D-09); the single shared `app.calculate_refund_tier(policy, hours_before)` (D-08) that Phase 9's own `manage_booking_cancel` rewrite is expected to call rather than re-deriving | `packages/db/supabase/migrations/<ts>_ops_booking_lifecycle.sql`, `packages/db/supabase/tests/ops_booking_lifecycle.test.sql`, `packages/db/supabase/tests/ops_issue_refund.test.sql` | Phase 2 Wave 6 landing (`02-06`/`02-07` — `booking_payments`, `booking_refunds`, `booking_events`, not yet executed; the same external-coordination note Phase 9's own P2 carries for the identical tables); mirrors P1's RPC shape as a peer, not a code dependency | P1, P2, P4, P7 |
| **P4** | **Live board Realtime (OPS-01)** | `tg_ops_board_broadcast()` on `bookings`/`booking_legs` (Pattern 1, confirmed against live docs); `lib/realtime/ops-board-channel.ts` (`channel('ops:board', {config:{private:true}})`); `OpsBoardClient.tsx` treating every payload as a refetch cue only (D-12), plus the `visibilitychange`/`online` forced-refetch safety net (Pitfall 3) | `packages/db/supabase/migrations/<ts>_ops_board_broadcast.sql`, `apps/web/lib/realtime/ops-board-channel.ts`, `apps/web/app/[locale]/(ops)/ops/bookings/page.tsx`, `apps/web/app/[locale]/(ops)/ops/_components/OpsBoardClient.tsx` | Phase 2 `02-08`'s `realtime.messages` RLS policy (§14f, planned) for a real subscribe to authorize against; Phase 6 (ops shell, `aal2` gate) as the hard precondition for the route to render at all — the trigger SQL and channel factory are authorable now | P1, P2, P3, P7 |
| **P5** | **OpsDetail + assignment UI (OPS-02, OPS-03)** | `AssignDialog.tsx` — chauffeur/vehicle pickers filtered by vehicle-class capacity (pax/bags) calling `ops_assign_leg`; the 409 conflict surface parsing `assignment_conflict:<constraint>:<leg_id>` into U-01's named-conflict copy; `OpsDetail`'s Details/History tabs using the event-kind→timeline mapping (Code Examples) against the FULL unfiltered `booking_events` vocabulary (ops-only — D-13's customer-curation rule does not apply here) | `apps/web/app/[locale]/(ops)/ops/bookings/[id]/page.tsx`, `apps/web/app/[locale]/(ops)/ops/_components/AssignDialog.tsx` | P1 (the RPC it calls), P4 (shares `ops-board-channel.ts` and sits in the same route tree, so a live push also refetches an open detail view) | P6, P7, P8 |
| **P6** | **Phone-booking screen (OPS-04 UI)** | `/ops/bookings/new` calling `ops_create_phone_booking` — **no-mock, Owner blocker #4**: the requirement text itself demands a reviewed design pass before implementation, not Claude-invented UI | `apps/web/app/[locale]/(ops)/ops/bookings/new/page.tsx` | P2 (the RPC); a `checkpoint:human-verify`/`/gsd:ui-phase 8` design pass (Owner blocker #4) BEFORE coding; Phase 4's pricing engine as an external hard precondition for a genuinely new pickup/dropoff pair (U-04) | P5, P7, P8 |
| **P7** | **Customer account surfaces (SITE-03)** | `/account`, `/account/bookings`, `/account/bookings/[ref]` Server Components reading via `asCustomer`/`bookings_select_own`; the curated customer-facing timeline (Pattern 3, D-13 — allowlisted `kind IN (...)`, never a raw `booking_events` render) | `apps/web/app/[locale]/(account)/account/page.tsx`, `apps/web/app/[locale]/(account)/account/bookings/page.tsx`, `apps/web/app/[locale]/(account)/account/bookings/[ref]/page.tsx` | Phase 5 (session plumbing, `@supabase/ssr`) as a hard precondition; Phase 2 `02-08`'s `bookings_select_own` RLS policy (planned) | P1, P2, P3, P4 |
| **P8** | **AUTH-06 guest-booking claim** | `claim_guest_bookings(p_customer_id)` — verified-email-only match (D-07), explicit customer confirmation rather than a silent auto-claim (U-07's recommended default), same-transaction `booking_access_tokens` revocation; `/account/claim` — **no-mock, Owner blocker #3**, needs a design pass before implementation | `packages/db/supabase/migrations/<ts>_claim_guest_bookings.sql`, `packages/db/supabase/tests/claim_guest_bookings.test.sql`, `apps/web/app/[locale]/(account)/account/claim/page.tsx` | P7 (the account shell it slots into); a design pass (Owner blocker #3) BEFORE coding; Phase 5 | P5, P6 |
| **P9** | **E2E proof + phase gate** | The full Wave 0 test list (Validation Architecture, above): the two-context Realtime assertion (OPS-01), timeline order/icons (OPS-02), named-409 + idempotent-reassign (OPS-03), account-bookings-RLS with two seeded customers (SITE-03), the AUTH-06 claim flow; `VamosLocale.coverage(root)` empty on every new route (Law 03); full pgTAP suite green, including Phase 2's own already-executed `exclusion.test.sql` | `apps/web/tests/integration/{ops-board-realtime,ops-detail-timeline,ops-assign-conflict,account-bookings-rls,auth06-claim}.spec.ts`, the full `packages/db/supabase/tests/` suite | P1–P8 | Nothing (phase gate) |

**Notes on scope not captured as its own plan above:**
- **`OpsDash` (the KPI dashboard) is deliberately excluded from this split**, consistent with Open
  Question 1's recommendation and Owner Blocker #1: no `REQUIREMENTS.md` ID maps to it anywhere,
  and its Money section (Income/Expenses/Net/Average fare) has no data source in any executed or
  planned migration. If the owner later confirms it ships in V1, the honestly-derivable Operation
  section (bookings/pickups-today/unassigned counts, chauffeurs-on-shift/vehicles-in-service from
  Phase 6's fleet tables) would be a small, additive P10 reading only P1–P4/P7's own tables; the
  Money section would render `data-tok` TBC pills (Law 04) rather than `CHF 000` — `CHF 000`
  claims a real, known zero, where `data-tok` says the underlying feature doesn't exist yet (U-09).
- **i18n is not a separate plan.** Per `CLAUDE.md`'s Law 03 ("every page, every section... in the
  same pass"), each of P4–P8 ships its own en/de/fr/ar strings — including U-01's two 409 conflict
  messages — in the same commit that introduces the surface, not as a trailing localisation pass.
  P9's `VamosLocale.coverage(root)` check is the gate that catches anything missed; it is not the
  mechanism that adds the strings.
- **`app.calculate_refund_tier()` (P3) is a forward dependency for Phase 9, not the other way
  round.** `ROADMAP.md` has Phase 9 depend on Phase 8, so Phase 8 executes first; `09-RESEARCH.md`
  Pattern 1 extracts `manage_booking_cancel`'s current inline status-transition case expression
  into a shared `app.recompute_booking_status()` at Phase 9's own P1, not this phase's. P3's
  `ops_confirm_booking`/`ops_cancel_booking` therefore write `bookings.status` inline, the same
  way `manage_booking_cancel` does today, on purpose — Phase 9's roll-up work is expected to
  retrofit both calls once it lands, per its own Pattern 1 ("every place a `booking_legs.status`
  changes"), and that retrofit is Phase 9's job, not something Phase 8 should pre-empt.

```
P1 ──┬── P5 ──┐
P4 ──┘        │
P2 ────── P6 ─┼── P9
P3 ────────────┤
P7 ────── P8 ─┘
```

Wave 1: **P1**, **P2**, **P3**, **P4**, **P7** in parallel — five plans, file-disjoint, every one
of them DB/lib-authorable against Phase 2's own schema and the already-designed §14f/RLS
contracts without Phase 3, 5 or 6 executing (the same "buildable and testable against Phase 2
alone" fallback the Environment Availability table already states for this phase's
schema-and-mutation-logic half). P3 carries the one external coordination flag worth restating
here: its pgTAP cannot run for real until Phase 2's `02-06`/`02-07` money/ledger migrations land —
the identical caveat Phase 9's own P2 states for the same tables.

Wave 2: **P5** (needs P1+P4), **P6** (needs P2, plus Owner Blocker #4's design pass), **P8**
(needs P7, plus Owner Blocker #3's design pass) in parallel — three UI plans, file-disjoint
across the ops board/detail lane, the ops phone-booking lane, and the account-claim lane. P6 and
P8 are each gated behind an explicit design review before code is written, not merely behind
their respective RPC dependency landing.

Wave 3: **P9** alone — the phase gate, blocked on every plan above. Must also re-confirm Phase
2's own already-executed `exclusion.test.sql` stays green, since none of this phase's new RPCs
may weaken the existing constraint proofs it already established.

## Sources

### Primary (HIGH confidence)
- `packages/db/supabase/migrations/20260823000010_bookings.sql`,
  `.../20260823000011_booking_legs.sql`, `.../20260823000012_booking_access_tokens.sql` — the
  actually-executed schema this phase's RPCs must be written against (read directly, 2026-08-24)
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-05-SUMMARY.md` — the F-16 dual
  grant finding, the executed exclusion-constraint proof, the manage-token surface
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-SCHEMA-DRAFT.md` §7, §8, §9,
  §10, §14a–14f — bookings/legs, manage token, price snapshot, booking events, and the full RLS
  policy set including the Realtime authorization design
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-08-PLAN.md` — the still-pending
  RLS migration's own working-set/ledger-set arrays, read directly to establish the exact grant
  boundary this phase's whole architecture depends on
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/research/exclusion-constraint.md`
  — the original exclusion-constraint lane brief (§6 error-surface mapping, §7 RLS interaction)
- `.planning/phases/03-hyperdrive-data-access-wiring/03-CONTEXT.md`,
  `.planning/phases/05-public-surfaces-customer-accounts/05-CONTEXT.md`,
  `.planning/phases/06-ops-reference-data-content-console/06-RESEARCH.md`,
  `.planning/phases/07-checkout-payment/07-RESEARCH.md` — cross-phase contracts this phase
  consumes (`asStaff`/`asCustomer` wrappers, the ops shell/aal2 pattern, `checkout_create_booking`)
- `.planning/ADR-006-return-trips-booking-legs.md` — assignment lives on the leg, not the booking
- https://supabase.com/docs/guides/realtime/broadcast — fetched live 2026-08-24; the exact
  `realtime.broadcast_changes()` trigger SQL and JS client subscription syntax
- `npm view @supabase/supabase-js version` — `2.112.3`, confirmed live 2026-08-24

### Secondary (MEDIUM confidence)
- WebSearch results corroborating the private-channel `config:{private:true}` requirement and the
  Realtime Authorization request-flow description (cross-verified against the official doc fetch
  above, not relied on alone)

### Tertiary (LOW confidence)
- None — every claim in this document traces to an executed migration, a committed plan/summary
  file, or a live-fetched official source.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; the two reused packages inherit Phase 5's completed
  audit exactly.
- Architecture (Realtime, RPC pattern): HIGH — Realtime confirmed against live official docs;
  the RPC pattern is a direct structural mirror of `manage_booking_cancel`, already executed and
  pgTAP-proven in this repository.
- The two corrective findings (ledger-grant gap, AUTH-06 claim gap): HIGH — both are traced
  through primary-source file contents (the actual migration/RPC bodies), not inferred from
  documentation or training data.
- Pitfalls: MEDIUM-HIGH — grounded in the schema's own documented rationale plus standard
  distributed-systems/Realtime reliability reasoning; none yet observed against a real running
  system in this project (Phase 8 has not executed).

**Research date:** 2026-08-24
**Valid until:** Re-verify against Phase 2 Waves 6–10 and Phases 3/5/6/7 the moment any of them
executes — several of this research's decisions (the exact ledger-set table list, the exact
`vamos_staff` grant on `bookings`/`booking_legs`) are read from **planned, not yet executed**
migration files (`02-06` through `02-10`) and could shift if those plans are revised before
execution. Treat the Wave 5-and-earlier facts (exclusion constraints, `booking_access_tokens`,
`manage_booking_cancel`, F-16) as stable (executed, committed); treat everything sourced from
`02-06`–`02-10`'s plan text as MEDIUM confidence pending their own execution.
