# Phase 8: Ops Dispatch — Live Board, Assignment & Account Surfaces - Context

**Gathered:** 2026-08-25
**Status:** Ready for planning
**Source:** Research express path (08-RESEARCH.md, Phase 2/3/5/6/7 CONTEXT, Phase 9 RESEARCH, ADR-006)

<domain>
## Phase Boundary

Staff get their first **write** paths into money- and dispatch-adjacent tables, and a
customer (signed-in or newly claiming a guest booking) gets their first read of their own
trip history. The schema Phase 2 already shipped draws a hard line around what those write
paths may look like: `vamos_staff` holds full CRUD on `bookings`/`booking_legs` directly, but
is `SELECT`-only with `with check (false)` on the entire ledger set (`booking_events`,
`price_snapshots`, `price_snapshot_legs`, `booking_payments`, `booking_refunds`,
`booking_notifications`, `stripe_events` — confirmed directly in the executed
`20260823000023_rls_staff.sql`, lines 76–88, whose own comment names the exact threat: a
stolen dispatcher JWT with ledger `INSERT` "can manufacture a paid booking end to end,
bypassing the Phase 4 engine entirely"). Every OPS-03/04/05 mutation that touches money,
price or the audit trail is therefore a new `SECURITY DEFINER` RPC, mirroring
`manage_booking_cancel`'s already-executed shape — not a raw write under `asStaff`.

Requirements covered: OPS-01, OPS-02, OPS-03, OPS-04, OPS-05, SITE-03, AUTH-06, DATA-08.

**Precondition status (2026-08-25):** Phase 2 is **DONE** — closed and verified 5/5 criteria,
6/6 requirements (`b436f96`, `94cbb18`), all 24 migrations (`20260823000001`–`024`) applied
locally and on the hosted Zurich project (`yaumjzvylngfjhtuffqs`). This supersedes
08-RESEARCH.md's own snapshot ("executed through Wave 5 only") — the money/evidence/RLS/seed
waves it called "planned but not executed" (`02-06`–`02-10`) are now live, including the
`ops:board` Realtime-authorization policy on `realtime.messages` (confirmed directly in
`20260823000023_rls_staff.sql` lines 204–221) and the ledger-grant boundary above. Phase 8's
own hard preconditions remain **Phase 6 and Phase 7, neither planned yet** — the ops shell
(`OpsSidebar`, the `aal2` gate, `asStaff`) and the paid-booking shape
(`checkout_create_booking`, `bookings.status='pending'` at creation) this phase's UI and E2E
proof both need. Phase 3 (`withIdentity`, the five wrappers) and Phase 5 (`@supabase/ssr`
session plumbing) are also planned, not executed.

**What is locally buildable today, against Phase 2's live schema and seeded fixtures, with
zero dependency on Phase 3/5/6/7 executing:** every new migration and its pgTAP proof — the
five ops-mutation RPCs (`ops_assign_leg` + its driver-swap sibling, `ops_create_phone_booking`,
`ops_confirm_booking`/`ops_cancel_booking`/`ops_issue_refund`, `claim_guest_bookings`), the
shared `app.calculate_refund_tier()`, and the `tg_ops_board_broadcast()` trigger. None of that
work is gated on a route, a session, or a UI. Only the route/UI layer (Server Components under
`asStaff`/`asCustomer`, the Realtime client subscription, the five screens) needs Phase 3/5/6/7
to actually render true data end to end.

**In scope:**
- Five to six `SECURITY DEFINER` RPCs, each mirroring `manage_booking_cancel`'s pattern
  (`FOR UPDATE` + state check + write + `booking_events` INSERT, one transaction, granted to
  `vamos_staff` or `authenticated` as appropriate): `ops_assign_leg`, a distinct driver-swap
  RPC, `ops_create_phone_booking`, `ops_confirm_booking`, `ops_cancel_booking`,
  `ops_issue_refund`, `claim_guest_bookings`.
- The shared `app.calculate_refund_tier(policy jsonb, hours_before numeric)` SQL function,
  called by this phase's `ops_issue_refund` — a forward dependency Phase 9 consumes.
- The `tg_ops_board_broadcast()` trigger on `bookings`/`booking_legs` calling
  `realtime.broadcast_changes('ops:board', …)`, authorized by the policy already migrated in
  Phase 2.
- Ops routes: `/ops/bookings` (board), `/ops/bookings/[id]` (detail, Details/History tabs),
  `/ops/bookings/new` (OPS-04 phone booking — no mock, design pass required first).
- Customer account routes: `/account`, `/account/bookings`, `/account/bookings/[ref]`
  (SITE-03), `/account/claim` (AUTH-06 — no mock, design pass required first).
- The curated customer-facing event timeline (allowlisted `booking_events.kind` subset, never
  a raw render of the ops-facing table).
- Four-language copy for every new string this phase introduces, including the two 409
  conflict messages.

**Out of scope:**
- `OpsDash.dc.html` (the KPI dashboard) — no `REQUIREMENTS.md` ID maps to it anywhere; see
  Owner Blocker below. Not built here.
- OPS-06/07/08/09 (fleet, customers read-only, reviews, settings/content) — Phase 6 scope,
  already planned there, despite the mocks living in the same `app/ops/` folder.
- The CHF price matrix. Every price line this phase renders stays `CHF 000` /
  `VamosLocale.money(null)` behind `pricing_live=false`.
- Any change to the `aal2`/staff-session gate — inherited unmodified from Phase 6.
- The `booking_status` roll-up trigger (`app.recompute_booking_status()`) — Phase 9's P1, per
  Phase 2's own U21 comment ("Phase 9 lands the general trigger"). This phase's new lifecycle
  RPCs write `bookings.status` inline, the same way `manage_booking_cancel` does today, on
  purpose; Phase 9 retrofits both once it lands.

</domain>

<decisions>
## Implementation Decisions

Every bullet below cites the originating research decision (`research Dn`) in parentheses for
traceability back to `08-RESEARCH.md`.

### The RPC boundary — why almost every write here is a function, not a table grant
- **D-01:** (research D1) Every OPS-03/04/05 write that touches `booking_events`,
  `price_snapshots`, `booking_payments` or `booking_refunds` is a new `SECURITY DEFINER` RPC
  granted to `vamos_staff`, mirroring `manage_booking_cancel`'s exact shape (`FOR UPDATE` +
  state check + write + event insert, one transaction). `vamos_staff`'s grant on the ledger
  set is `SELECT`-only with `with check (false)`, confirmed live in the executed
  `20260823000023_rls_staff.sql` — no direct-INSERT path exists or should exist. — OPS-03,
  OPS-04, OPS-05, DATA-08.
- **D-02:** (research D17) The `aal2` staff-session gate (middleware redirect + RLS
  `app.is_staff()`) is inherited unmodified from Phase 6. Every new route and RPC this phase
  adds re-checks `(select app.is_staff())` as its first statement; none bypasses it, including
  the phone-booking screen. — AUTH-05 (inherited), OPS-03/04/05.
- **D-03:** (research D15) `next_booking_reference()`'s EXECUTE grant already includes
  `vamos_staff` (confirmed executed in Phase 2 F-16) — OPS-04's phone-booking `bookings`
  INSERT relies on the column DEFAULT firing correctly under a staff session with no
  additional grant work in this phase.

### Assignment — the exclusion-constraint interaction (resolves research's U17)
- **D-04:** (research D2) `ops_assign_leg` catches the exclusion violation with `EXCEPTION
  WHEN exclusion_violation` **inside** the RPC for the ordinary (non-swap) case. The
  `booking_legs_chauffeur_no_overlap`/`booking_legs_vehicle_no_overlap` constraints are
  `DEFERRABLE INITIALLY IMMEDIATE` (confirmed executed, `20260823000011_booking_legs.sql`), so
  the check fires at the `UPDATE` itself, inside the function, with full row context still in
  scope for a same-transaction lookup naming the conflicting leg. — OPS-03.
- **D-05:** (research D3) A **driver-swap** action (two legs trading chauffeurs) is a distinct,
  separate RPC that explicitly runs `SET CONSTRAINTS … DEFERRED` and pre-checks each target
  range with a `scheduled_range &&` SELECT before performing both UPDATEs. A COMMIT-time
  `23P01` carries no recoverable row context — this only applies to the deliberately-deferred
  swap case, not ordinary single-leg assignment. — OPS-03.
- **D-06:** (research D4) `ops_assign_leg` short-circuits to a no-op success when the
  requested `(chauffeur_id, vehicle_id)` pair is `IS NOT DISTINCT FROM` the leg's current
  values, before attempting any UPDATE — a double-clicked Assign button or a slow-network
  retry must not trip the exclusion constraint against the row's own already-committed state.
  — OPS-03.

### Phone booking — duration is copied, never typed (resolves research's U22)
- **D-07:** (research D5) OPS-04's phone-booking flow calls the **same** pricing engine
  Phase 4 builds for the public quote, with `source='ops_phone'` — `price_snapshots.source`
  already has this as a valid CHECK value in the executed schema — never a separate ops-only
  price calculator. — OPS-04.
- **D-08:** `estimated_duration_minutes` is never typed by a dispatcher — it is copied from
  `price_snapshot_legs.duration_min` (the pricing engine already ran Mapbox Directions
  producing it for `source='ops_phone'` and `'web'` alike). A manual-override number input
  exists in the assign dialog only as a rare-NULL fallback. — OPS-04.

### Booking lifecycle and refunds
- **D-09:** (research D8) The refund percent/tier calculation is written ONCE as a shared
  `app.calculate_refund_tier(policy jsonb, hours_before numeric)` SQL function, called by this
  phase's `ops_issue_refund`. `manage_booking_cancel`'s executed body already carries the
  placeholder comment "Phase 9 fills the tier calculation" — Phase 8 is the first phase that
  actually needs this math (OPS-05 ships now; LIFE-02/03's auto-refund is Phase 9). **Forward
  dependency: Phase 9 consumes this function** rather than re-deriving it, per Phase 9's own
  P2 plan note ("mirrors Pattern 2 of 07-RESEARCH.md ... later Phase 8's ops-initiated
  refund/cancel actions ... should call the same pair rather than re-deriving the tier math").
  **Naming note for the planner:** `09-RESEARCH.md`'s own Pattern 2 independently sketches a
  differently-named/-shaped pair (`app.compute_cancellation_refund(p_snapshot_id, p_leg_seq,
  p_now)` + a separate `record_booking_refund()`), written from the opposite direction (Phase 9
  assuming Phase 8 doesn't exist yet). Since Phase 8 executes first per the roadmap, this
  phase's plan is the one that fixes the real name and signature; Phase 9's planner reconciles
  against whatever Phase 8 actually ships, not the other way round. — OPS-05, Phase 9's
  cancellation-refund work.
- **D-10:** (research D9) `ops_issue_refund` is two-phase across the transaction boundary: the
  RPC computes and validates the refund (amount, tier, eligibility) and returns it WITHOUT
  inserting `booking_refunds`; the calling Route Handler then calls `stripe.refunds.create()`
  and performs the actual `booking_refunds` INSERT with `stripe_refund_id` already populated.
  `booking_refunds` has no UPDATE path after INSERT (fully append-only per the executed
  `20260823000019_append_only.sql`) and Postgres cannot call Stripe's API from `plpgsql`. —
  OPS-05.
- **D-11:** `ops_confirm_booking`/`ops_cancel_booking` write `bookings.status` inline, the same
  way `manage_booking_cancel` does today, **on purpose** — the shared roll-up trigger
  (`app.recompute_booking_status()`) is Phase 9's P1, not this phase's. Phase 9's own plan
  expects to retrofit both calls once it lands. Claude's discretion decides the exact
  staff-only state machine (which `bookings`/`booking_legs` statuses each action may transition
  from, including `quote`, which a guest never reaches) — no staff-side cancel/confirm RPC
  exists anywhere yet to copy from. — OPS-05.

### Realtime — the live board
- **D-12:** (research D10, D11) The live board's push mechanism is Supabase Realtime
  Broadcast on a private `ops:board` channel, via a trigger calling
  `realtime.broadcast_changes()`. The authorization policy is **already executed** (confirmed
  directly in `20260823000023_rls_staff.sql` lines 204–221: `realtime.topic() = 'ops:board'
  and (select app.is_staff())`) — Phase 8 lands the trigger and the client subscription only.
  The WebSocket connection is 100% browser-to-Supabase; Cloudflare Workers/OpenNext perform no
  proxying, no Durable Object, no adapter configuration for this feature. — OPS-01.
- **D-13:** (research D12) Every Realtime broadcast payload the board client receives is
  treated as a **refetch cue only**, never authoritative row data to render directly — restated
  from Phase 2's own §14f rationale ("what a dispatcher can see is still decided by RLS and by
  nothing else"), extended to also force a refetch on the browser `visibilitychange`/`online`
  event (laptop-sleep/reconnect staleness is real even with Realtime's own reconnect logic). —
  OPS-01.
- **D-14:** Claude's discretion (research U5, Owner Blocker #5) whether the `booking_legs`
  broadcast trigger (assignment changes visible to OTHER concurrently-logged-in dispatchers)
  ships alongside the `bookings` trigger in the same migration, or is deferred — cheap either
  way at this fleet size (5 chauffeurs / 6 vehicles per seed data); OPS-01's success criterion
  only names payment status. Default to shipping both — it is the same migration, negligible
  extra cost, and avoids a second migration later. — OPS-01.

### Customer timeline — curated, never raw
- **D-15:** (research D13) The customer-facing "What has happened so far" timeline on
  `booking-detail` is a curated, allowlisted subset of `booking_events.kind` values
  (`booking.created`, `booking.status_changed`, `assignment.chauffeur_set`, mapped to the
  mock's four coarse milestones), never a raw render of the ~17-value vocabulary ops sees.
  Internal kinds (`price.repriced`, failed-payment retries, dispatcher free-text notes) must
  never reach a customer. — SITE-03.
- **D-16:** `OpsDetail`'s own timeline, by contrast, renders the FULL unfiltered
  `booking_events.kind` vocabulary — D-15's curation rule is customer-facing only. — OPS-02,
  DATA-08.

### AUTH-06 — the guest-booking claim is real, net-new work
- **D-17:** (research D6) Phase 5's own D-07 ("AUTH-06 is satisfied for free by the
  `customers`-linking signup trigger") is corrected here: that trigger only links a NEW
  `customers` row's `user_id` to a **pre-existing** `customers` row of the same email. A true
  first-time guest checkout never creates a `customers` row at all
  (`checkout_create_booking`'s `bookings.customer_id` is `app.uid()`, NULL for `anon`) — so
  the common case, a genuine first-time guest, produces an orphaned `bookings.customer_id =
  NULL` row that nothing links automatically on signup. A new, explicit
  `claim_guest_bookings(p_customer_id)` `SECURITY DEFINER` RPC is required in this phase. —
  AUTH-06.
- **D-18:** (research D7) `claim_guest_bookings` matches on the currently-authenticated
  session's **verified** email only (`email_confirmed_at is not null` /
  `auth.jwt() ->> 'email_verified'`), never a client-supplied string, and requires explicit
  customer confirmation ("we found N bookings under this email — link them?") before writing —
  never a silent auto-claim on first sign-in. An unverified or spoofed match is an
  account-takeover-adjacent vector (a signed-in attacker could submit a victim's email and pull
  their trip history and manage-link privileges into the attacker's own account). — AUTH-06.
- **D-19:** `claim_guest_bookings` revokes every live `booking_access_tokens` row for each
  claimed booking in the **same transaction** as setting `bookings.customer_id` — the manage
  link stops resolving the moment the booking moves into the signed-in account. Whether an
  explicit `booking_notifications` entry also tells the customer their old link no longer
  works is Claude's discretion (research U10) — not addressed anywhere upstream; the safer
  default is to send one, but silent revocation (the customer now uses their account instead)
  is defensible too. — AUTH-06, DATA-03.

### Design corrections carried from the mocks
- **D-20:** (research D14) `OpsDetail.dc.html`'s history-timeline icon tile
  (`var(--vt-yellow-50)`/`var(--vt-yellow-700)`) and `booking-detail.dc.html`'s `[data-tile]`
  background are Law 02 violations in the mocks themselves and must be corrected (charcoal or
  `tone="inverse"`, never the tint) during the port, not carried forward as "matches the mock."
  — CLAUDE.md Law 02.

### Excluded from this phase (Owner Blocker)
- **D-21:** `OpsDash.dc.html` (the KPI dashboard) is **excluded** from this phase's scope. No
  `REQUIREMENTS.md` ID — not `OPS-0x`, not anything else — references it anywhere in the
  traceability table, `ROADMAP.md`, or `docs/build/GSD-LAUNCH.md`. If the owner later confirms
  it ships in V1, the honestly-derivable Operation section (bookings/pickups-today/unassigned
  counts, chauffeurs-on-shift/vehicles-in-service from Phase 6's fleet tables) becomes a small,
  additive plan reading only this phase's own tables plus Phase 6's; the Money section
  (Income/Expenses/Net/Average fare) has no data source designed in **any** phase — no
  expense-tracking table exists anywhere in the schema — and would render `data-tok` TBC pills
  (Law 04), never `CHF 000`, since `CHF 000` claims a real, known zero where `data-tok` says
  the underlying feature doesn't exist yet. — deferred, see below.

### Claude's Discretion
- The exact staff-only state machine for `ops_confirm_booking`/`ops_cancel_booking` (research
  U-02) — which `bookings.status`/`booking_legs.status` values each action may transition from,
  including whether staff can act on a `quote`-status booking a guest never reaches.
- Whether OPS-04/OPS-05's "modify" verb (research U-03) means trivial field edits
  (pickup/dropoff text, contact details, note) or a full re-price-and-supersede cycle using
  `price_snapshots.supersedes_id`. If scoped to trivial edits only, `ops_modify_booking` may
  not need to exist as its own RPC in this phase at all — confirm with the owner/product before
  freezing the signature; default to trivial-edits-only if no answer lands in time, since the
  schema already supports re-pricing later without a shape change.
- Whether the `booking_legs` Realtime broadcast trigger ships in the same migration as the
  `bookings` one (D-14) or is split into a follow-up.
- Whether `claim_guest_bookings` fires automatically on first verified sign-in versus requiring
  an explicit per-booking customer confirmation click (research U-07) — default to explicit
  confirmation per D-18's reasoning unless UX review says otherwise.
- Whether an explicit `booking_notifications` entry accompanies manage-token revocation on
  claim (D-19, research U-10).
- Whether staff role EXECUTE grants on `ops_assign_leg`/`ops_confirm_booking`/
  `ops_cancel_booking` extend to the dispatcher role broadly or restrict refund issuance to
  `admin` only (research A4) — OPS-03/04/05's requirement text says "a dispatcher" for
  assignment/phone-booking/confirm/cancel, but money leaving the business via refund may
  warrant a narrower grant; not locked by the research.
- Exact migration file naming/numbering beyond the research's illustrative
  `<ts>_ops_assign_leg.sql` etc. — the planner's call as plans interleave.
- Whether a live conflict PREVIEW in the assign dialog (querying `scheduled_range &&` as the
  dispatcher picks a chauffeur, before clicking Assign) ships now or is deferred as UX polish
  (research Open Question 3) — the DB-level guarantee holds either way.

### Proposed plan split `[informational]`
Reproduced verbatim from 08-RESEARCH.md's "Proposed Phase 8 plan split" — a recommendation the
planner may adopt, adapt or replace; not a locked decision. The coverage gate should not treat
this table or the wave diagram as D-NN items.

| # | Plan | Goal (one line) | File scope | Depends on | Parallel with |
|---|---|---|---|---|---|
| **P1** | **Assignment RPC (`ops_assign_leg`)** | `ops_assign_leg` with the idempotent no-op short-circuit (D-06) plus a distinct deferred-constraint driver-swap sibling (D-05); pgTAP proving the named `23P01` conflict (D-04), the idempotent re-assign, and that a cancelled/no-show leg never blocks — resolves U17 for both the immediate and the deferred path | `packages/db/supabase/migrations/<ts>_ops_assign_leg.sql`, `packages/db/supabase/tests/ops_assign_leg.test.sql` | Phase 2 (executed: `booking_legs`, the two exclusion constraints) | P2, P3, P4, P7 |
| **P2** | **Phone/manual booking RPC (`ops_create_phone_booking`)** | `ops_create_phone_booking` binding an existing `source='ops_phone'` `price_snapshots` row and copying `estimated_duration_minutes` straight from `price_snapshot_legs.duration_min` — resolves U22 | `packages/db/supabase/migrations/<ts>_ops_phone_booking.sql`, `packages/db/supabase/tests/ops_phone_booking.test.sql` | Phase 2 (`bookings`, `price_snapshots`); D-03's already-confirmed `vamos_staff` grant on `next_booking_reference()` | P1, P3, P4, P7 |
| **P3** | **Booking-lifecycle RPCs + shared refund-tier function** | `ops_confirm_booking`, `ops_cancel_booking` (D-11's staff-only state machine, including a transition out of `quote`), `ops_issue_refund` (two-phase compute-then-record, D-10); the single shared `app.calculate_refund_tier(policy, hours_before)` (D-09) that Phase 9's own cancellation-refund work is expected to call | `packages/db/supabase/migrations/<ts>_ops_booking_lifecycle.sql`, `packages/db/supabase/tests/ops_booking_lifecycle.test.sql`, `packages/db/supabase/tests/ops_issue_refund.test.sql` | Phase 2 (`booking_payments`, `booking_refunds`, `booking_events` — now executed); mirrors P1's RPC shape as a peer, not a code dependency | P1, P2, P4, P7 |
| **P4** | **Live board Realtime (OPS-01)** | `tg_ops_board_broadcast()` on `bookings`/`booking_legs` (confirmed against live docs); `lib/realtime/ops-board-channel.ts` (`channel('ops:board', {config:{private:true}})`); `OpsBoardClient.tsx` treating every payload as a refetch cue only (D-13), plus the `visibilitychange`/`online` forced-refetch safety net | `packages/db/supabase/migrations/<ts>_ops_board_broadcast.sql`, `apps/web/lib/realtime/ops-board-channel.ts`, `apps/web/app/[locale]/(ops)/ops/bookings/page.tsx`, `apps/web/app/[locale]/(ops)/ops/_components/OpsBoardClient.tsx` | Phase 2's `realtime.messages` RLS policy (now executed, confirmed) for a real subscribe; Phase 6 (ops shell, `aal2` gate) as the hard precondition for the route to render at all — the trigger SQL and channel factory are authorable now | P1, P2, P3, P7 |
| **P5** | **OpsDetail + assignment UI (OPS-02, OPS-03)** | `AssignDialog.tsx` — chauffeur/vehicle pickers filtered by vehicle-class capacity (pax/bags) calling `ops_assign_leg`; the 409 conflict surface parsing `assignment_conflict:<constraint>:<leg_id>` into named-conflict copy (research U-01); `OpsDetail`'s Details/History tabs using the event-kind→timeline mapping against the FULL unfiltered `booking_events` vocabulary (D-16) | `apps/web/app/[locale]/(ops)/ops/bookings/[id]/page.tsx`, `apps/web/app/[locale]/(ops)/ops/_components/AssignDialog.tsx` | P1 (the RPC it calls), P4 (shares `ops-board-channel.ts`; a live push also refetches an open detail view) | P6, P7, P8 |
| **P6** | **Phone-booking screen (OPS-04 UI)** | `/ops/bookings/new` calling `ops_create_phone_booking` — **no-mock**: the requirement text itself demands a reviewed design pass before implementation | `apps/web/app/[locale]/(ops)/ops/bookings/new/page.tsx` | P2 (the RPC); a design pass BEFORE coding; Phase 4's pricing engine as an external hard precondition for a genuinely new pickup/dropoff pair | P5, P7, P8 |
| **P7** | **Customer account surfaces (SITE-03)** | `/account`, `/account/bookings`, `/account/bookings/[ref]` Server Components reading via `asCustomer`/`bookings_select_own`; the curated customer-facing timeline (D-15, allowlisted `kind IN (...)`, never a raw `booking_events` render) | `apps/web/app/[locale]/(account)/account/page.tsx`, `apps/web/app/[locale]/(account)/account/bookings/page.tsx`, `apps/web/app/[locale]/(account)/account/bookings/[ref]/page.tsx` | Phase 5 (session plumbing) as a hard precondition; Phase 2's `bookings_select_own` RLS policy (now executed) | P1, P2, P3, P4 |
| **P8** | **AUTH-06 guest-booking claim** | `claim_guest_bookings(p_customer_id)` — verified-email-only match (D-18), explicit customer confirmation (D-19), same-transaction `booking_access_tokens` revocation; `/account/claim` — **no-mock**, needs a design pass before implementation | `packages/db/supabase/migrations/<ts>_claim_guest_bookings.sql`, `packages/db/supabase/tests/claim_guest_bookings.test.sql`, `apps/web/app/[locale]/(account)/account/claim/page.tsx` | P7 (the account shell it slots into); a design pass BEFORE coding; Phase 5 | P5, P6 |
| **P9** | **E2E proof + phase gate** | The full test list: the two-context Realtime assertion (OPS-01), timeline order/icons (OPS-02), named-409 + idempotent-reassign (OPS-03), account-bookings-RLS with two seeded customers (SITE-03), the AUTH-06 claim flow; `VamosLocale.coverage(root)` empty on every new route; full pgTAP suite green, including Phase 2's own already-executed exclusion-constraint proofs | `apps/web/tests/integration/{ops-board-realtime,ops-detail-timeline,ops-assign-conflict,account-bookings-rls,auth06-claim}.spec.ts`, the full `packages/db/supabase/tests/` suite | P1–P8 | Nothing (phase gate) |

**Notes on scope not captured as its own plan above:**
- **`OpsDash` is deliberately excluded** (D-21) — no `REQUIREMENTS.md` ID maps to it; its Money
  section has no data source in any phase's schema.
- **i18n is not a separate plan.** Each of P4–P8 ships its own en/de/fr/ar strings — including
  the two 409 conflict messages — in the same commit that introduces the surface. P9's
  `VamosLocale.coverage(root)` check is the gate, not the mechanism.
- **`app.calculate_refund_tier()` (P3) is a forward dependency for Phase 9, not the other way
  round** (D-09) — Phase 8 executes first per `ROADMAP.md`.

```
P1 ──┬── P5 ──┐
P4 ──┘        │
P2 ────── P6 ─┼── P9
P3 ────────────┤
P7 ────── P8 ─┘
```

Wave 1: **P1**, **P2**, **P3**, **P4**, **P7** in parallel — five plans, file-disjoint, every
one DB/lib-authorable against Phase 2's own now-executed schema and RLS/Realtime contracts
without Phase 3, 5 or 6 executing.

Wave 2: **P5** (needs P1+P4), **P6** (needs P2, plus a design pass), **P8** (needs P7, plus a
design pass) in parallel — three UI plans, file-disjoint. P6 and P8 are each gated behind an
explicit design review before code is written, not merely behind their RPC dependency landing.

Wave 3: **P9** alone — the phase gate, blocked on every plan above. Must also re-confirm
Phase 2's own already-executed exclusion-constraint proofs stay green.

</decisions>

<specifics>
## Specific Ideas

- The RPCs, by name: `ops_assign_leg(p_leg_id, p_chauffeur_id, p_vehicle_id)`, a distinct
  driver-swap RPC (name TBD by the planner), `ops_create_phone_booking(p_quote_id,
  p_vehicle_class_id, p_contact, p_locale)`, `ops_confirm_booking`, `ops_cancel_booking`,
  `ops_issue_refund`, `claim_guest_bookings(p_customer_id)`.
- The 409 conflict detail format the API route parses:
  `assignment_conflict:<constraint_name>:<conflicting_leg_id>`, using
  `err.code === '23P01'` + `err.constraint_name` — never Postgres's raw `SQLERRM` text (not
  stable, doesn't localize).
- The Realtime channel, by name: private `ops:board`, `channel('ops:board', {config:{private:
  true}})`, subscribed only after the staff session is `aal2`-authenticated (Realtime evaluates
  `realtime.messages`' RLS as the connecting client's verified JWT).
- The event-kind → `OpsDetail` timeline mapping (icon, label key) for the full ~17-value
  vocabulary: `booking.created` → receipt/quoted, `payment.succeeded` → credit-card/paid,
  `booking.status_changed` → refresh-cw/statusChanged, `assignment.chauffeur_set` →
  user/driverAssigned, `assignment.vehicle_set` → car-front/vehicleAssigned, `refund.issued` →
  banknote/refundIssued, `booking.claimed` → user-check/claimed.
- The customer-curated timeline's allowlist: `kind IN ('booking.created',
  'booking.status_changed', 'assignment.chauffeur_set')`, mapped in application code (not SQL)
  to the mock's four coarse milestones (`new`/`confirmed`/`assigned`/`completed`, or a
  `cancelled` branch) — the label text is an i18n key, not a stored string.
- Every ledger table's grant boundary for `vamos_staff`, confirmed executed: `SELECT` only,
  `with check (false)`, on `booking_events`, `price_snapshots`, `price_snapshot_legs`,
  `booking_payments`, `booking_refunds`, `booking_notifications`; `stripe_events` is fenced out
  of the generic loop entirely (its own `stripe_events_staff_gate` policy).
- Both exclusion constraints, confirmed executed in `20260823000011_booking_legs.sql`:
  `booking_legs_chauffeur_no_overlap`, `booking_legs_vehicle_no_overlap`, both
  `DEFERRABLE INITIALLY IMMEDIATE`.
- `manage_booking_cancel`'s own stub comment, read directly from the executed migration:
  "Phase 9 fills the tier calculation" — the exact anchor D-09's forward dependency traces to.
- Fleet size from seed data: 5 chauffeurs / 6 vehicles — small enough that the "more than one
  concurrent dispatcher" question (D-14) is low-stakes either way.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase research (primary source for this CONTEXT)
- `.planning/phases/08-ops-dispatch-live-board-assignment-account-surfaces/08-RESEARCH.md` —
  the full architecture map, D1–D17 decisions, U-01–U-10 uncertainties, the 5 owner blockers,
  the Realtime Broadcast pattern (confirmed against live official docs), the `ops_assign_leg`/
  `ops_create_phone_booking` RPC skeletons, the Security Domain (ASVS V2–V8), and the 9-plan
  split reproduced above. Note its own "Valid until" caveat: several facts were sourced from
  Phase 2's then-**planned** `02-06`–`02-10` migrations, which have since executed — this
  CONTEXT's `<domain>` section reconciles that; the RPC/pattern design itself is unaffected.

### Executed schema this phase's RPCs are written against (read directly, 2026-08-25)
- `packages/db/supabase/migrations/20260823000010_bookings.sql` — `bookings` shape,
  `next_booking_reference()`, the U21 roll-up ownership comment ("Phase 9 lands the general
  trigger").
- `packages/db/supabase/migrations/20260823000011_booking_legs.sql` — `booking_legs`, the two
  exclusion constraints, the `DEFERRABLE INITIALLY IMMEDIATE` clause, the "Two Phase 8/9 paths"
  comment.
- `packages/db/supabase/migrations/20260823000012_booking_access_tokens.sql` —
  `manage_booking_cancel`, the exact RPC pattern this phase's new RPCs mirror.
- `packages/db/supabase/migrations/20260823000013_price_snapshots.sql`,
  `…014_payments_refunds.sql`, `…016_booking_events.sql` — the ledger set's shape.
- `packages/db/supabase/migrations/20260823000019_append_only.sql` — the four-layer append-only
  enforcement `booking_refunds`/`booking_events` inherit.
- `packages/db/supabase/migrations/20260823000023_rls_staff.sql` — **the load-bearing file for
  this phase's whole architecture**: the ledger-set `SELECT`-only/`with check (false)` grant
  loop (lines 76–88, with the forgery-risk comment quoted in D-01), the `ops:board`
  `realtime.messages` broadcast-authorization policy (lines 204–221), `stripe_events`'s
  separate gate.
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-05-SUMMARY.md` — the F-16
  dual-grant finding (D-03).

### Cross-phase contracts this phase binds to
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-CONTEXT.md` — D-13/D-14 (the
  two exclusion constraints, the turnaround buffer), D-17 (`booking_events` vs generic
  `audit_log`), D-18 (append-only's four layers), the `booking_status` roll-up vocabulary
  (U21, deferred to Phase 9 there too).
- `.planning/phases/03-hyperdrive-data-access-wiring/03-CONTEXT.md` — D-08 the frozen
  `withIdentity(cs, kind, claims, fn, opts?)` signature and the named wrappers
  (`asCustomer`/`asStaff`/`asGuest`/`asAnon`/`asQuote`) this phase's routes must import, never
  redefine; D-09 `PG_ROLE` map; D-11 `publicSql` is content-only, never identity data; D-12 the
  quote/ledger path stays on `HYPERDRIVE_NOCACHE`, never the cacheable binding.
- `.planning/phases/05-public-surfaces-customer-accounts/05-CONTEXT.md` — D-01 (explicitly
  scopes `account.dc.html`/`bookings.dc.html`/`booking-detail.dc.html` OUT of Phase 5, into
  Phase 8); D-02/D-03 (`@supabase/ssr` middleware pattern, `getUser()` never `getSession()`)
  this phase's account routes reuse; **D-07 is the assumption D-17 above corrects** — read both
  side by side, the correction is load-bearing for AUTH-06's actual scope.
- `.planning/phases/06-ops-reference-data-content-console/06-CONTEXT.md` — D-01 (`/ops/*`
  nests under `app/[locale]/(ops)/ops/**`, `OpsSidebar` shell), D-02 (every ops write goes
  through `asStaff(env, claims, fn)`), D-04 (`apps/web/lib/supabase/{server,middleware,
  client}.ts` shared with Phase 5), D-05 (the three no-mock AUTH-05 screens — TOTP enrolment,
  MFA challenge, invite-accept — the same "flag before building" category this phase's OPS-04
  and AUTH-06 screens fall into).
- `.planning/phases/07-checkout-payment/07-CONTEXT.md` — D-01/D-02 `checkout_create_booking`'s
  shape (the paid-booking record this phase's board and detail screens read), the `bookings`
  row inserted with `status='pending'` explicitly, the guest manage-token minted inside the
  same RPC (the token `claim_guest_bookings` later revokes).
- `.planning/phases/09-booking-lifecycle-customer-self-service/09-RESEARCH.md` — Pattern 1
  (`app.recompute_booking_status()`, Phase 9's P1, explicitly NOT this phase's job — D-11
  above); Pattern 2 (`app.compute_cancellation_refund()` + `record_booking_refund()` — the
  naming conflict with this phase's `app.calculate_refund_tier()` flagged in D-09, to be
  reconciled by this phase's planner since Phase 8 executes first).
- `.planning/ADR-006-return-trips-booking-legs.md` — one `bookings` row, two `booking_legs`
  rows for a return trip; assignment, status and driver/vehicle all live on the **leg**, never
  the booking — every screen this phase builds (board, detail, assign dialog, account booking
  detail) reads/writes through `booking_legs`, not a single-leg assumption.

### Requirements and roadmap
- `.planning/ROADMAP.md` § Phase 8 — goal, 5 success criteria, requirement list, "Depends on:
  Phase 5, Phase 6, Phase 7."
- `.planning/REQUIREMENTS.md` — OPS-01 through OPS-05, SITE-03, AUTH-06, DATA-08 in full (lines
  48, 57, 98, 108–116), status table (lines 205–255) currently all "Pending."

### Project rules
- `CLAUDE.md` — Law 02 (no tinted yellow — the two mock corrections in D-20), Law 03 (four
  languages, same pass — every new string including the 409 messages), Law 04 (`CHF 000` /
  `data-tok` — governs both the price lines this phase renders and `OpsDash`'s excluded Money
  section), "Ops copy is neutral and literal."
- `.claude/CLAUDE.md` — `asStaff`/`asCustomer`/`asGuest` only, no `postgres`/`@vamos/db`
  internals imported directly; RLS on every table; server-authoritative quotes; audit trail on
  booking/price/payment/assignment changes — this phase is where that audit-trail promise
  becomes real write paths for the first time.

</canonical_refs>

<deferred>
## Deferred Ideas

Owner/design-only questions the research raised that are not trackable engineering decisions —
each needs a person or a design pass, not a migration, to answer. None of these block Phase 8's
planning; they gate specific plans (P6, P8) before coding.

- **`OpsDash.dc.html`'s V1 inclusion and requirement mapping (U-08, Owner Blocker #1).** No
  `REQUIREMENTS.md` ID references it. Excluded from this phase's plan split (D-21). If the
  owner confirms it ships, a small additive plan reading this phase's + Phase 6's tables covers
  the Operation section; the Money section has no data source anywhere and would need
  `data-tok` TBC pills, not an invented number.
- **OPS-04's phone-booking screen design (Owner Blocker #4).** The requirement text itself
  says "on a screen designed and reviewed as a mock first" — not Claude's discretion, a
  `/gsd:ui-phase 8` pass or explicit owner/design review is required before P6 is coded.
- **AUTH-06's claim-confirmation UX design (Owner Blocker #3, research U-06).** No mock exists
  anywhere — a modal on first sign-in, a dedicated `/account/claim` page, or an email deep-link
  are all open; needs the same design-review gate as P6 before P8 is coded.
- **Whether more than one dispatcher uses the board concurrently at launch (research U-05,
  Owner Blocker #5).** Affects only whether the `booking_legs` Realtime trigger is worth
  building now vs. deferring — low cost either way (D-14 defaults to shipping it), worth a
  quick owner confirmation of expected staff headcount.
- **The exact Mapbox Directions call shape for a genuinely new phone-booked pickup/dropoff pair
  with no prior quote to copy `duration_min` from (research U-04).** Owned by Phase 4's
  `/api/quote` contract landing first; confirm the phone-booking flow can call the same
  server function with `source='ops_phone'` without duplicating the Mapbox integration.
- **`app.calculate_refund_tier()`'s exact signature sufficiency for a single-leg vs.
  whole-booking cancellation (research A3)** — may need a `p_leg_id`/`p_snapshot_id` parameter
  if a single-leg basis (`price_snapshot_legs.leg_subtotal_rappen`) needs different tier lookup
  logic than a whole-booking cancel. A function-signature refinement at implementation time,
  not an architecture change.

</deferred>

---

*Phase: 08-ops-dispatch-live-board-assignment-account-surfaces*
*Context gathered: 2026-08-25 via research express path*
