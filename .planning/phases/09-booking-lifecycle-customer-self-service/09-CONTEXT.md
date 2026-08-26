# Phase 9: Booking Lifecycle & Customer Self-Service - Context

**Gathered:** 2026-08-25
**Status:** Ready for planning
**Source:** Research express path (09-RESEARCH.md, cross-checked against the applied Phase 2
migrations, 07-CONTEXT.md, 08-RESEARCH.md, ADR-002/005/006/014)

<domain>
## Phase Boundary

A booking that has already been paid for (Phase 7) and dispatched (Phase 8) now lives out its
remaining lifecycle without staff intervention for the common cases: reminders fire, a delayed
flight shifts the pickup, a customer cancels and is refunded against the policy they were sold
under, a no-show is swept off the board on schedule, and a completed ride prompts a review.
**U21 — the `booking_status` roll-up trigger — is this phase's to land.** Phase 2 shipped only
the vocabulary (the `booking_status` enum, its comment block stating the roll-up rule verbatim)
and one inline case expression scoped to `manage_booking_cancel` alone; every other path that
terminates a leg (Phase 8's ops-cancel, this phase's no-show sweep, a completion mark) has never
rolled `bookings.status` up from its legs until this phase writes the shared trigger. **LIFE-03
reads the PINNED `price_snapshots.policy`, never live `settings_versions`** — a booking is
refunded under the policy it was made under, not whatever the policy says today; this is the
one rule every refund-computing function in this phase must not violate, however it is written.
`manage_booking_cancel` already ships a past-pickup `P0001` guard and currently returns
`null::numeric` for `refund_percent`, with a comment reading "Phase 9 fills the tier
calculation" — this phase fills it.

Requirements covered: LIFE-01, LIFE-02, LIFE-03, LIFE-04, LIFE-05, LIFE-06, LIFE-07, LIFE-08.
Also honours PAY-05's double-send clause ("a repeated or out-of-order webhook cannot
double-charge, double-confirm or double-send an email") for every new notification kind this
phase's sweep and consumer send, using the same `booking_notifications.dedupe_key` discipline
Phase 7 established for `confirmation`.

**Hard preconditions:** Phase 7 (checkout/payment) and Phase 8 (ops dispatch) executed — per
`ROADMAP.md`'s progress table both currently sit at 0/TBD, neither planned nor executed as of
this research. Phase 2 is **DONE** (`docs(02): close phase 2 — passed`): every migration through
`20260823000024_rls_public.sql` is applied locally and on the hosted Zurich Supabase project
(`yaumjzvylngfjhtuffqs`), including the full money/ledger set (`price_snapshots`,
`booking_payments`, `booking_refunds`, `stripe_events`, `booking_notifications`,
`booking_events`, `consent_log`, `append_only`) that 09-RESEARCH.md's research date (2026-08-24)
still described as partially unexecuted — that description is now stale; this schema is ground
truth, not a draft.

**Locally buildable regardless of Phase 7/8 executing:** the roll-up trigger and its full pgTAP
matrix (needs only `booking_legs`/`bookings`, already live); the refund-computation SQL
(`price_snapshots`/`booking_refunds`/`settings_versions` are already live — only the Stripe
network call itself needs a real account); the no-show grace column and sweep query (gated
inert regardless); email template scaffolding; cron/Queue sweep logic tested against seeded
data with an injected clock (`createScheduledController`, never `sleep`). **Not** locally
buildable until Phase 8 lands: `app.calculate_refund_tier()` itself (Phase 8's own P3
deliverable — see D-06 below) and the ops-side UI Phase 8 builds for delay-shift/assignment
that this phase's notifications react to.

**In scope:**
- `app.recompute_booking_status()` + its `AFTER UPDATE OF status` trigger on `booking_legs`,
  replacing `manage_booking_cancel`'s inline case expression (not duplicating it).
- The refund orchestration wrapper around Phase 8's `app.calculate_refund_tier()`, widening
  `manage_booking_cancel`'s return signature, and `record_booking_refund()` — the one
  append-only `booking_refunds` INSERT, written after Stripe confirms.
- `settings_versions.no_show_grace_minutes` (nullable), the reminder/no-show sweep queries, the
  `LIFECYCLE_SWEEP` Queue, the reconfigured Cron Trigger, and `worker.ts`'s real `scheduled()`/
  `queue()` cases.
- `shift_leg_time()` — the flight-delay pickup shift RPC, aligned with Phase 8's own U17
  resolution (D-14 below).
- `reviews.booking_id`, `submit_review()`, the new `/review/[token]` public page, and the two
  additive `booking_events.kind` values it needs.
- Five new email templates (`reminder_24h`, `assignment`, `cancellation`, `refund`,
  `review_request`) in `packages/emails`, and the `manage-booking.dc.html` port.

**Out of scope:**
- The CHF price matrix and any real refund percentage tied to a still-open owner blocker
  (driver-no-show refund share) — see `<deferred>`.
- AeroDataBox live flight-tracking automation — explicitly deferred by ADR-014; this phase
  builds the manual, ops-triggered shift only.
- Phase 8's dispatch-swap RPC and its own use of the exclusion constraints — this phase aligns
  with Phase 8's resolution, it does not re-litigate it.
- The ops-side delay-shift trigger UI — Phase 8 territory; this phase can stub a manual dispatcher
  action if Phase 8 has not landed a UI by the time this phase executes.

</domain>

<decisions>
## Implementation Decisions

Every bullet cites the originating research decision (`research D-NN`) or uncertainty
(`research U-X`) in parentheses for traceability back to `09-RESEARCH.md`, or cites the ground
truth it was checked against (an applied migration, or a sibling phase's own research/context).

### Booking status roll-up (U21)
- **D-01:** (research D-01) `app.recompute_booking_status(p_booking_id uuid)` is one shared
  `SECURITY DEFINER` SQL function, attached as an `AFTER UPDATE OF status` trigger on
  `booking_legs`, that **replaces** (not duplicates) `manage_booking_cancel`'s current inline
  case expression. Every later path that flips a leg's status — the no-show sweep in this phase,
  Phase 8's `ops_confirm_booking`/`ops_cancel_booking` (which write `bookings.status` inline on
  purpose, expecting this phase's retrofit per `08-RESEARCH.md`'s own closing note) — must call
  through it, not re-derive the rule.
- **D-02:** (research Pitfall 1) The trigger is scoped narrowly (`OF status`, not a broader
  column set) and the function itself keeps a no-op guard until at least one leg has reached a
  terminal state — an ordinary Phase 8 assignment write must never downgrade
  `bookings.status` from `'assigned'` back through the case expression's `else` branch.
- **D-03:** (research U-A/U-B; ground truth: `manage_booking_cancel`'s shipped case in
  `20260823000012_booking_access_tokens.sql`) `no_show` legs already bucket into the "done" side
  of the live/done split in the currently-shipped inline code (`count(*) filter (where status in
  ('completed','no_show'))`) — the shared trigger keeps this, it is not a new design choice.
  What remains genuinely open, because the shipped code never reaches this case (it only ever
  cancels), is whether a booking whose **every** leg is `no_show` rolls up to a distinct
  top-level `'no_show'` (symmetric with all-cancelled/all-completed) or falls into `'completed'`.
  **Check:** write the full leg-status-combination pgTAP matrix (1-leg and 2-leg bookings) as the
  first task of the roll-up plan — enumerating every combination and deciding what
  `bookings.status` should read for each one is the check that settles this, not a separate
  research step. **Fallback if genuinely undecidable from the enum comment alone:** a distinct
  `'no_show'` top-level status, since the enum already carries the value and Postgres and the ops
  board can distinguish it either way.
- **D-04:** (research U-C) Whether `bookings.status = 'refunded'` is ever set by the roll-up
  trigger, or stays vestigial with `booking_refunds` rows as the sole "was this refunded" signal,
  is cross-phase — owned by whichever phase's status display (Phase 8's ops board / account
  bookings list) actually needs it to render distinctly. **This phase does not set it** unless
  Phase 8's UI, once built, demonstrably needs to distinguish a refunded booking from a cancelled
  one in its own list rendering; default to leaving it unset.

### Refund computation and evidence (LIFE-02, LIFE-03)
- **D-05:** (research D-02; ground truth: `booking_refunds` in `20260823000014_payments_refunds.sql`
  has no UPDATE-whitelist trigger, only the four append-only layers) The refund path is
  compute-then-call-then-record, never one transaction. `manage_booking_cancel`'s widened return
  table carries `refund_rappen`, `basis_rappen`, `tier_applied`, `hours_before`, and the succeeded
  `stripe_payment_intent_id` — it writes nothing to `booking_refunds`. A separate,
  service-role-gated `record_booking_refund()` performs the one permitted INSERT, called only
  after `stripe.refunds.create()` has actually returned a `stripe_refund_id`. Because Postgres
  cannot `CREATE OR REPLACE` a function whose OUT-parameter list changes, widening
  `manage_booking_cancel`'s current `returns table (booking_id uuid, refund_percent numeric)`
  signature needs an explicit `DROP FUNCTION` before the new `CREATE` — a migration-ordering fact
  the plan should state, not discover at apply time.
- **D-06:** (research Pattern 2, reconciled against `08-CONTEXT.md` D-09) **Named conflict,
  flagged not silently resolved:** this phase's own research (Pattern 2, written before Phase 8
  was researched) independently sketches `app.compute_cancellation_refund(p_snapshot_id,
  p_leg_seq, p_now)` + a separate `record_booking_refund()`. Phase 8's own research and
  `08-CONTEXT.md` D-09 instead name and commit to building **`app.calculate_refund_tier(policy
  jsonb, hours_before numeric)`** as a Phase 8 P3 deliverable, explicitly as "a forward dependency
  for Phase 9, not the other way round" — Phase 8 executes first per `ROADMAP.md`, so its version
  lands in the schema first. **This is a planner reconciliation point, not a free choice left to
  either executor:** whichever planner runs second (this phase's, per the roadmap's dependency
  order) must read what Phase 8 actually shipped — not just its research/context prose — and
  either adopt `app.calculate_refund_tier()`'s real, applied signature verbatim, or the two
  planners must agree a single signature before either phase executes. An executor discovering
  two differently-named functions attempting the same job at runtime is the failure mode this
  decision exists to prevent. **The contract that must hold regardless of the final name:** the
  refund percentage is computed from the **pinned `price_snapshots.policy`** on the booking
  (LIFE-03, Phase 2 D-10) — never from live `settings`/`settings_versions` — a booking is
  refunded under the policy it was made under. This phase's own orchestration work (resolving the
  snapshot, picking the leg-vs-whole-booking basis amount per ADR-006, computing `hours_before`
  from the earliest targeted leg's `scheduled_at`) wraps whichever shared function is the final
  one, rather than re-deriving the tier walk itself. **The integration point already exists in
  executed SQL:** `manage_booking_cancel` (Phase 2, migration `…012_booking_access_tokens.sql`)
  already carries the past-pickup `P0001` guard and deliberately returns `null::numeric` for
  `refund_percent` with the comment "Phase 9 fills the tier calculation" — this is where either
  function's result plugs in.
- **D-07:** (research D-04/LIFE-03; Phase 2 D-10) The refund-tier lookup reads
  **`price_snapshots.policy->'cancellation_tiers'`**, the pinned jsonb copied at snapshot time —
  never `settings_versions.cancellation_tiers` directly, even though that column also exists and
  also holds a live copy. Reading the wrong (live) one is the literal failure LIFE-03 exists to
  prevent, cited directly from `PITFALLS.md`'s Pitfall 7.
- **D-08:** (research Owner blocker 2) The `booking_refunds.reason = 'no_driver'` path has no
  automatic percentage and is not covered by `app.calculate_refund_tier()`'s ordinary tier walk —
  it routes through an ops-manual path only (Phase 8 territory) until the "driver-no-show refund
  share" owner blocker (ADR-014 "Still open") resolves. Never a guessed 100%.

### Quote expiry and the no-show sweep (LIFE-07)
- **D-09:** (research D-04, citing Phase 4 D-29) LIFE-07's quote-expiry half needs **no cron** —
  `price_snapshots.expires_at <= now() AND booking_id IS NULL` already *is* the expired state.
  Only the no-show half is this phase's cron work.
- **D-10:** (research D-05) The no-show sweep ships **inert by default**: an additive nullable
  `settings_versions.no_show_grace_minutes`, seeded NULL, with the sweep's candidate query gated
  `WHERE no_show_grace_minutes IS NOT NULL` — mirrors Phase 2's own precedent for
  `manage_link_validity_days` ("issuance refuses rather than inventing the window"). Neither of
  the two owner blockers this decision depends on (see `<deferred>`) may be answered by inventing
  a number.
- **D-11:** (research D-06; ground truth: `apps/web/wrangler.jsonc` currently declares
  `"crons": ["0 3 * * *"]` under both `env.staging`/`env.production`) The reminder and no-show
  sweeps reuse this **existing single Cron Trigger slot**, reconfigured to a higher frequency
  (e.g. `*/15 * * * *`) — Cloudflare allows multiple cron expressions to share one `scheduled()`
  handler, branching on `controller.cron`; the CPU-time budget for a sub-1-hour interval is 30s
  per invocation (official docs).
- **D-12:** (research D-07; ground truth: `wrangler.jsonc`'s existing `STRIPE_EVENTS`
  producer/consumer block, Phase 7's pattern to mirror) All sweep work is SELECT-and-enqueue
  inside `scheduled()`; the actual status write and email send happen in a new
  `LIFECYCLE_SWEEP` Cloudflare Queue consumer — never inline work inside the 30s-budgeted
  handler.
- **D-13:** (research U-D) Whether the no-show grace period is one global setting or needs to
  vary by scenario (airport vs. city pickup, matching the existing waiting-allowance split) stays
  open until the owner actually answers "call attempts before a no-show"
  (`docs/build/OWNER-ANSWERS.md`) — **build the single global column now** (D-10); re-check the
  exact wording of the owner's answer once it lands, since it may itself imply a split the way
  waiting time already does. Not a blocker to building or testing this phase's code.

### Flight delay shift (LIFE-06) — aligned with Phase 8's own U17 resolution
- **D-14:** (research D-08, superseded by `08-RESEARCH.md` D-02/D-03; resolves this phase's own
  research U-E) `shift_leg_time()` changes exactly one leg's `scheduled_at` in a single `UPDATE`
  statement — the same shape as Phase 8's *ordinary* (non-swap) assignment case, not its
  driver-swap case. Phase 8 has since settled U17 for both shapes: an ordinary single-statement
  UPDATE is caught with `EXCEPTION WHEN exclusion_violation` **inside** the function (the
  `DEFERRABLE INITIALLY IMMEDIATE` constraint checks per-statement by default, so the violation
  fires at the UPDATE itself, with full row context still in scope for a same-transaction
  conflict lookup); only Phase 8's *driver-swap* RPC — which changes two legs' assignments at
  once — needs `SET CONSTRAINTS ... DEFERRED` plus an explicit pre-check. `shift_leg_time()`
  follows the **immediate-catch** shape, not the pre-check-then-defer pattern this phase's own
  research proposed before Phase 8's research existed. Both RPCs should parse the conflict the
  same way (`err.code === '23P01'` + a same-transaction lookup naming the conflicting leg), so a
  future shared helper is a reasonable refactor, not a requirement of this phase.
- **D-15:** (research Security Domain, Known Threat Patterns) The `UPDATE booking_legs SET
  scheduled_at = ...` and the `booking_events` INSERT (`kind = 'flight.delayed'`) happen in the
  same transaction as the exclusion check — never split across two round trips, or a rolled-back
  shift can leave a leg's time changed with no timeline row explaining why.
- **D-16:** (ADR-014, research Architecture Patterns) `shift_leg_time()` is triggered by a human
  dispatcher action this phase, stubbed manually if Phase 8 has not yet shipped a UI for it —
  AeroDataBox background polling that calls the same RPC automatically is an explicitly deferred,
  additive later step, never built in this pass.

### Notifications (PAY-05's no-double-send clause, LIFE-05)
- **D-17:** (research D-07/Don't-Hand-Roll; ground truth: `booking_notifications.dedupe_key` in
  `20260823000014_payments_refunds.sql` is already `booking_id || ':' || kind || ':' ||
  coalesce(booking_leg_id::text,'')`, unique, and `kind`'s CHECK already lists all seven values
  this phase needs — `reminder_24h`, `assignment`, `cancellation`, `refund`, `review_request` are
  already schema-present, no migration required for them) Every send this phase's sweep/consumer
  performs claims a row via this existing dedupe_key **before** sending, exactly the
  claim-then-send pattern Phase 7 established for `confirmation` — satisfies PAY-05's
  no-double-send clause for the five new kinds without any new plumbing.
- **D-18:** (research D-12/U-F) `template_version` follows the format `<kind>@v1` (e.g.
  `reminder_24h@v1`) — this phase's own proposal, genuinely unsettled by Phase 2 or Phase 7.
  **Check at Wave 0:** if Phase 7 has executed and shipped a `confirmation` template with a
  different actual format by the time this phase starts, match that format instead of introducing
  a second convention.
- **D-19:** (research D-11; ground truth: `booking_events.kind`'s CHECK list in
  `20260823000016_booking_events.sql` has 17 values, none of them review-related) `kind`'s CHECK
  gains two additive values, `review.requested` and `review.submitted` — a genuine gap, not a
  research assumption; `note.added` would technically work but loses the ops timeline's
  queryability for review-related entries.

### Review capture (LIFE-08 — zero mock precedent)
- **D-20:** (research D-10; ground truth: `reviews` in `20260823000007_content_and_reviews.sql`
  has no `booking_id` column, no client-writable RLS/RPC path, and `review_source` is
  `('google','tripadvisor','trustpilot','manual')` — no value means "the traveller submitted
  this") `reviews` gains a nullable `booking_id uuid references bookings(id)`; a new
  `SECURITY DEFINER` `submit_review()` RPC is the only writer. Phase 6's existing OpsReviews
  publish/hide/reorder screen needs no changes — it already operates on rows regardless of how
  they arrived.
- **D-21:** (research D-09) The review-submission link reuses the **existing** manage token
  (`booking_access_tokens`), not a dedicated `purpose='review'` token type — its 30-day validity
  (ADR-014 §5) comfortably covers a post-completion review-ask window and nothing in the
  requirements demands a shorter one.
- **D-22:** (research Security Domain, Known Threat Patterns) `submit_review()` gates on **both**
  `app.booking_has_manage_token()` (token validity, the existing helper, reused unchanged) **and**
  `bookings.status IN ('completed','partially_completed')` (business-state gate) — a
  valid-but-premature token must not submit a review for a booking still in progress.
- **D-23:** (research D-10; ground truth: `reviews.locked` is `generated always as (source <>
  'manual') stored`) Submitted rows insert with `published=false`, `verified=true`,
  `source='manual'` — `source='manual'` keeps `locked=false`, so the row stays ops-editable in
  Phase 6's existing moderation screen exactly like a hand-entered review.

### Testing discipline (never `sleep`, never a real CHF figure)
- **D-24:** (research Validation Architecture, Code Examples) Every clock-dependent path
  (reminder window, no-show sweep, delay shift) is tested with `createScheduledController`
  (`cloudflare:test`) or an injected clock — never `sleep`.
- **D-25:** (research Common Constraints, Law 04) Every pgTAP refund fixture uses synthetic
  integer-rappen amounts, matching Phase 2's own `charge_gate.test.sql` precedent ("rolled back,
  never a real CHF amount") — never a real matrix figure, even in a test.
- **D-26:** (research Pitfall 2/Pitfall 5) DST-boundary fixtures (a spring-forward 02:15 leg,
  both fall-back-hour occurrences) are reused across the reminder-window, no-show-window and
  delay-shift tests, all three derived from one shared `date-fns-tz`-based clock helper — never
  two independently hand-written boundary expressions.

### Claude's Discretion
- Exact migration file numbering and naming beyond the research's illustrative
  `<ts>_booking_status_rollup.sql` etc. — the plan's call as work interleaves.
- The orchestration wrapper function's exact name (D-06 uses `app.compute_cancellation_refund` as
  an example only).
- Whether the review-request email fires immediately on completion or after a delay — research's
  own recommendation (a 2–4 hour delayed send, reusing the same sweep architecture as reminders)
  is a defensible default, not a locked number.
- pgTAP test file granularity beyond "one file per capability" — splitting or combining within a
  plan is fine.
- File/module granularity inside `apps/web/lib/lifecycle/` and `packages/emails/src/` beyond what
  the research's Recommended Project Structure names.
- The exact stuck-row sweep threshold reused from Phase 7's pattern (research suggests "e.g., 5
  minutes" — illustrative, not a locked number).
- The `/review/[token]` page's actual design — flagged `UI hint: yes` by the roadmap and by this
  research; genuinely no mock precedent exists, so this is `/gsd:ui-phase 9` territory, not an
  engineering decision to make silently here.

### Proposed plan split `[informational]`
Reproduced verbatim from 09-RESEARCH.md's "Proposed Phase 9 plan split" — a recommendation the
planner may adopt, adapt or replace; not a locked decision. The coverage gate should not treat
this table or the wave diagram as D-NN items.

| # | Plan | Goal (one line) | File scope | Depends on | Parallel with |
|---|---|---|---|---|---|
| **P1** | **Booking status roll-up (U21)** | `app.recompute_booking_status()` + the `AFTER UPDATE OF status` trigger on `booking_legs`; `manage_booking_cancel`'s inline case expression replaced by a call to it; the full leg-status-combination pgTAP matrix that settles U-A/U-B | `packages/db/supabase/migrations/<ts>_booking_status_rollup.sql`, `tests/booking_status_rollup.test.sql` | Phase 2 Wave 5 (`booking_legs`, `manage_booking_cancel` — already landed through migration `…011`) | Nothing (foundation for every later plan) — **locally buildable today, no gate on Phase 7/8 executing** |
| **P2** | **Cancellation refund-tier calculation** | `app.compute_cancellation_refund()`; widen `manage_booking_cancel`'s return signature to carry the full refund payload without writing `booking_refunds`; `record_booking_refund()` (service-role-gated, the one append-only INSERT); pgTAP proving LIFE-03 (mutate live settings after snapshot creation, assert refund unchanged) | `packages/db/supabase/migrations/<ts>_cancellation_refund.sql`, `<ts>_record_booking_refund.sql`, `tests/cancellation_refund.test.sql` | P1; **Phase 2 Wave 6 landing** (money tables `013`–`016` — now executed, ground truth confirms) | Nothing (needs P1's roll-up call inside the extended function) |
| **P3** | **Guest cancel + refund Worker route** | `POST /api/manage/[token]/cancel` — calls the extended `manage_booking_cancel`, then `stripe.refunds.create()` outside any DB transaction, then `record_booking_refund()`; `lib/lifecycle/refund.ts` | `apps/web/app/api/manage/[token]/cancel/route.ts`, `apps/web/lib/lifecycle/refund.ts` | P2; **Phase 3** (Hyperdrive wiring) and **Phase 7** (Stripe client construction pattern, `stripe.ts`) for real execution, though the RPC/SQL side (P1/P2) needs neither | Nothing |
| **P4** | **`manage-booking.dc.html` port** | Next.js port of the guest self-service page, wired to P3's cancel route and the existing token-gated read path (§14b RLS, already built) | `apps/web/app/(public)/manage-booking/page.tsx`, i18n additions | P3; reuses **Phase 5**'s public-page-porting pattern (peer track, not a hard code dependency) | P5–P9 |
| **P5** | **No-show grace setting + sweep query** | Additive nullable `settings_versions.no_show_grace_minutes`; `lib/lifecycle/sweep.ts`'s no-show candidate SELECT, gated inert on the NULL setting (D-10); reminder-window candidate SELECT sharing the same `date-fns-tz` clock helper (Pitfall 2) | `packages/db/supabase/migrations/<ts>_no_show_grace.sql`, `apps/web/lib/lifecycle/sweep.ts`, `apps/web/lib/lifecycle/clock.ts` | P1 (no-show write needs the roll-up trigger to exist) | P2–P4 (file-disjoint) |
| **P6** | **Cron + Queue wiring** | `wrangler.jsonc` cron-frequency change + new `LIFECYCLE_SWEEP` queue (producer+consumer, both environments); `worker.ts`'s `scheduled()` gains the real reminder/no-show cases (SELECT + enqueue only); `queue()` gains the `LIFECYCLE_SWEEP` consumer case (claim-then-send reminders, atomic no-show status write) | `apps/web/wrangler.jsonc`, `apps/web/worker.ts` | P5 | P7 |
| **P7** | **Assignment + lifecycle email templates** | `packages/emails`'s five new templates (`reminder_24h`, `assignment`, `cancellation`, `refund`, `review_request`); the `booking_events`-reactive trigger for assignment notifications (Pattern 3) | `packages/emails/src/{Reminder,Assignment,Cancellation,Refund,ReviewRequest}Email.tsx`, a small migration for the trigger | P6 (needs the claim-then-send consumer to call into it); reuses Phase 7's `packages/emails` scaffold | P8 |
| **P8** | **Flight-delay shift (LIFE-06, U17)** | `shift_leg_time()` RPC — immediate-catch pattern aligned with Phase 8's own resolution (D-14); `flight.delayed` `booking_events` write; ops-broadcast reuse (§14f's `ops:board` topic, no new channel); DST-boundary pgTAP fixtures | `packages/db/supabase/migrations/<ts>_leg_time_shift.sql`, `tests/leg_time_shift.test.sql` | P1 (roll-up must not misfire on a mid-flight time change) | P7 |
| **P9** | **Review capture (LIFE-08)** | Additive `reviews.booking_id`; `submit_review()` RPC (guest-token-gated, booking-status-gated); the new public `/review/[token]` page (Turnstile-protected, four languages, no mock precedent — flag for `/gsd:ui-phase 9`); `review.requested`/`review.submitted` `booking_events` kinds | `packages/db/supabase/migrations/<ts>_review_submission.sql`, `<ts>_lifecycle_notification_kinds.sql`, `apps/web/app/(public)/review/[token]/page.tsx`, `apps/web/app/api/reviews/submit/route.ts` | P1 (completion detection reuses the roll-up); Phase 6's OpsReviews screen (peer, unmodified) | P6–P8 |
| **P10** | **E2E proof + phase gate** | `createScheduledController`-based Vitest suite for reminder/no-show (time-travel, never `sleep`); a real test-mode Stripe refund E2E; DST-boundary fixture pass across sweep + delay-shift; the full pgTAP suite green | Test harness scripts, staging seed fixtures | P1–P9 | Nothing (phase gate) |

```
P1 ──┬── P2 ── P3 ── P4
     ├── P5 ── P6 ── P7 ──┐
     ├── P8 ──────────────┼── P10
     └── P9 ──────────────┘
```
Wave 1: **P1** alone (foundation, no gate on Phase 7/8 executing — buildable and testable today).
Wave 2: **P2**, **P5**, **P8**, **P9** in parallel — all four depend only on P1, and touch
disjoint files (money/refund, cron/settings, delay-shift RPC, review schema respectively). Wave
3: **P3** (needs P2) and **P6** (needs P5) in parallel. Wave 4: **P4** (needs P3) and **P7**
(needs P6) in parallel. Wave 5: **P10**, the phase gate, blocked on everything above.

</decisions>

<specifics>
## Specific Ideas

- `booking_status` enum, verbatim, and its binding comment (both already applied,
  `20260823000003_types.sql`):
  `'quote','pending','paid','confirmed','assigned','completed','cancelled',
  'partially_cancelled','partially_completed','refunded','no_show'`. The comment's rule: every
  leg cancelled → `'cancelled'`; every leg completed → `'completed'`; ≥1 cancelled and ≥1
  completed → `'partially_completed'`; ≥1 cancelled and ≥1 still live (not terminal) →
  `'partially_cancelled'`; otherwise the booking keeps its own commercial status. The comment is
  silent on `no_show` — D-03 above is where this phase closes that silence.
- `manage_booking_cancel(p_token_hash bytea, p_leg_seq smallint default null)` — current shipped
  signature `returns table (booking_id uuid, refund_percent numeric)`; guard list
  `status not in ('pending','paid','confirmed','assigned','partially_completed',
  'partially_cancelled')` raises `not_cancellable` (`P0001`) — leave this list untouched while
  widening the return shape (research Pitfall 3).
- `booking_refunds` shape (already applied, `20260823000014_payments_refunds.sql`): `reason`
  CHECK `('customer_cancel','ops_cancel','no_driver','modification_credit','no_show')`,
  `booking_leg_id` nullable (null = whole booking), `tier_applied jsonb not null`,
  `hours_before numeric(8,2) not null`, `refund_rappen <= basis_rappen` CHECK, `stripe_refund_id
  text unique`. No UPDATE-whitelist trigger exists for this table — append-only, full stop.
- `settings_versions.cancellation_tiers` shape (already seeded per ADR-014 §5): `[{"from_hours_
  before":24,"refund_percent":100},{"from_hours_before":0,"refund_percent":75},{"no_show":true,
  "refund_percent":0}]` — `price_snapshots.policy->'cancellation_tiers'` is a pinned copy of
  whichever version was current when the snapshot was written.
- `booking_notifications.dedupe_key` formula (already applied): `booking_id || ':' || kind ||
  ':' || coalesce(booking_leg_id::text,'')` — insertion IS the claim; a retried send is a no-op
  by unique-constraint violation, not application logic.
- `reviews` shape (already applied, `20260823000007_content_and_reviews.sql`): no `booking_id`
  column exists yet; `locked boolean generated always as (source <> 'manual') stored`;
  `rating smallint check (rating between 0 and 5)`.
- Cron/Queue ground truth (`apps/web/wrangler.jsonc`, both environments): `"crons": ["0 3 * * *"]`
  and one `STRIPE_EVENTS` producer/consumer pair — the pattern this phase's `LIFECYCLE_SWEEP`
  queue and cron-frequency change must mirror exactly.
- Test commands: `pnpm --filter @vamos/db run test:db supabase/tests/<file>.test.sql` (pgTAP);
  `pnpm --filter web exec vitest run lib/lifecycle` (Vitest, time-travel); `pnpm test:visual --
  manage-booking.spec.ts` / `review-submission.spec.ts` (Playwright, 4 breakpoints × en/de
  minimum).
- No new runtime packages — `stripe`, `resend`, `@react-email/*`, `date-fns-tz`,
  `@marsidev/react-turnstile` are all already recommended/installed by earlier phases; confirm at
  Wave 0 rather than assume, since Phase 4/7 (which install `date-fns-tz`) have not executed as
  of this research.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase research (primary source for this CONTEXT)
- `.planning/phases/09-booking-lifecycle-customer-self-service/09-RESEARCH.md` — the full
  synthesis: Architectural Responsibility Map, Standard Stack, Architecture Patterns 1–3 (the
  roll-up trigger, the compute-then-call-then-record refund path, the `booking_events`-reactive
  notification pattern), Common Pitfalls 1–5, the Decisions table D-01…D-12, the UNCERTAIN table
  U-A…U-F, Owner blockers 1–4, Validation Architecture, Security Domain, the P1–P10 plan split.

### Ground truth this phase writes against (read the actual SQL, not just its research description)
- `packages/db/supabase/migrations/20260823000003_types.sql` — the `booking_status` enum and its
  binding roll-up-rule comment.
- `packages/db/supabase/migrations/20260823000004_settings.sql` — `settings_versions`, including
  the already-seeded `cancellation_tiers` shape and every ADR-014 §5 policy number.
- `packages/db/supabase/migrations/20260823000007_content_and_reviews.sql` — `reviews`, confirming
  no `booking_id` column and the `locked` generated column's exact predicate.
- `packages/db/supabase/migrations/20260823000012_booking_access_tokens.sql` —
  `booking_access_tokens`, `app.booking_has_manage_token()`, and `manage_booking_cancel`'s full
  current implementation (the guard list, the P0001 refusal, the inline roll-up case, the
  `null::numeric` refund_percent this phase fills).
- `packages/db/supabase/migrations/20260823000013_price_snapshots.sql` — `price_snapshots`'s
  `policy` jsonb shape and its `price_snapshots_policy_shape` CHECK.
- `packages/db/supabase/migrations/20260823000014_payments_refunds.sql` — `booking_payments`,
  `booking_refunds`, `stripe_events`, `booking_notifications` — the exact shapes and CHECKs D-05,
  D-08, D-17 depend on.
- `packages/db/supabase/migrations/20260823000016_booking_events.sql` — the full 17-value `kind`
  CHECK D-19 extends, and the append-only design comment explaining why `booking_events` is
  app-written, never trigger-written.
- `packages/db/supabase/migrations/20260823000018_consent_log.sql`,
  `…019_append_only.sql` — the four append-only layers and which tables carry them (confirms
  `booking_notifications` is NOT append-only-for-UPDATE, only no-delete/no-truncate — the
  claim-then-send `sent_at` UPDATE this phase relies on is legal).
- `apps/web/wrangler.jsonc` — the current single `"0 3 * * *"` cron and `STRIPE_EVENTS` queue
  block D-11/D-12 must mirror and reconfigure.

### Phase 2 artifacts this phase binds to
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-CONTEXT.md` — D-06 (rappen
  domain), D-07 (three-object snapshot shape), D-09 (`pricing_live` as a row with no off switch),
  D-10 (the `settings`/`settings_versions` split — **the exact D-10 wording binding this phase:
  policy durability splits immutable `settings_versions` from mutable `settings`, feeding LIFE-03
  and Phase 9**), D-11 (one shared snapshot per booking, per-leg subtotals — ADR-006, feeding the
  basis-amount choice in D-06 above), D-13 (the two `booking_legs` exclusion constraints), D-15/
  D-16 (the manage token's reusable-not-single-use design and the RLS-read/definer-RPC-write
  split D-14/D-21/D-22 above reuse unchanged), D-17/D-18 (the `booking_events`/`audit_log` split
  and the four append-only layers), D-35 (ADR-014's confirmed policy numbers, including the
  100/75/0 cancellation tiers and `free_cancel_hours=24`).
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-SCHEMA-DRAFT.md` §7 (bookings/
  legs/exclusion constraints), §8 (the manage token), §9 (the price/policy snapshot, payments/
  refunds/charge gate, the notification ledger), §10 (booking events and append-only
  enforcement), §12 (content and reviews), §14b (guest RLS), §14f (Realtime authorization, the
  `ops:board` topic D-15 reuses).

### Phase 7 artifacts this phase binds to
- `.planning/phases/07-checkout-payment/07-CONTEXT.md` — D-13/D-14 (webhook fast-ack, Queue-owned
  state machine — the pattern D-12 mirrors), D-17 (the `booking_notifications` stuck-row sweep,
  explicitly written to be reused by this phase), D-19 (confirms `booking_notifications` is not
  append-only-enforced, so claim-then-send is legal), the `Checkout Session` lifecycle (context
  for why a booking already carries a succeeded `stripe_payment_intent_id` by the time this
  phase's refund path runs), and the still-open `template_version` question D-18 above answers
  provisionally.

### Phase 8 artifacts this phase binds to
- `.planning/phases/08-ops-dispatch-live-board-assignment-account-surfaces/08-RESEARCH.md` — D-02/
  D-03 (U17's actual resolution — immediate-catch for a single-statement UPDATE, pre-check+defer
  only for a genuine two-row swap — D-14 above aligns with this), the P3 plan entry naming
  `app.calculate_refund_tier(policy, hours_before)` as a Phase 8 deliverable Phase 9 consumes
  (D-06 above), and the explicit closing note that Phase 8's `ops_confirm_booking`/
  `ops_cancel_booking` write `bookings.status` inline on purpose, expecting this phase's roll-up
  retrofit (D-01 above).
- `.planning/phases/08-ops-dispatch-live-board-assignment-account-surfaces/08-CONTEXT.md` D-09 —
  the authoritative statement of the `app.calculate_refund_tier()` vs.
  `app.compute_cancellation_refund()`/`record_booking_refund()` naming conflict D-06 above
  reconciles; read this before freezing this phase's refund-function signatures, not just
  `08-RESEARCH.md`'s prose.

### Architecture decisions that bind this phase
- `.planning/ADR-002-waiting-allowances-null.md` — superseded by ADR-014 §5 for the waiting
  minutes themselves, but its NULL-discipline argument is the direct precedent D-10's
  `no_show_grace_minutes` follows.
- `.planning/ADR-005-cancellation-copy-settings-driven.md` — "one key, one fact": the same
  argument D-06's shared refund-tier function generalises from policy copy to policy logic.
- `.planning/ADR-006-return-trips-booking-legs.md` — one booking, two legs, each independently
  cancellable/refundable — the basis for D-06's leg-vs-whole-booking refund basis choice and
  D-14's single-leg delay shift.
- `.planning/ADR-014-owner-sitting-2026-08-22.md` §5 (the confirmed cancellation tiers, 30-day
  manage-link validity, 24h `free_cancel_hours`) and its "Still open" list (driver-no-show refund
  share, feeding D-08 and the deferred owner blocker below).

### Requirements and roadmap
- `.planning/ROADMAP.md` § Phase 9 — goal, five success criteria, `LIFE-01…08`, `UI hint: yes`,
  "Depends on: Phase 7, Phase 8".
- `.planning/REQUIREMENTS.md` — LIFE-01…LIFE-08 in full (lines 85–92, status table 230–237);
  PAY-05 (line 79) — the double-send clause this phase's five new notification kinds must also
  satisfy.

### Project rules
- `CLAUDE.md` — Law 04 (a pending value is a labelled gap — governs D-10/D-13's inert no-show
  sweep and D-08's manual-only `no_driver` refund path); Law 03 (four languages, same pass —
  applies to the five new email templates and the new review-submission page).
- `.claude/CLAUDE.md` — the audit-trail requirement ("audit trail on booking/price/payment/
  assignment changes") extending to every automatic no-show sweep write and refund decision this
  phase adds.

</canonical_refs>

<deferred>
## Deferred Ideas

Owner/counsel-only questions this research raised that are not trackable engineering decisions —
each needs a person, not a migration, to answer. None of these block this phase's build or test
work; they gate only the automated firing of the affected paths against real bookings.

- **"Call attempts before a no-show"** — still a live blank in `docs/build/OWNER-ANSWERS.md`.
  Blocks the no-show sweep from ever firing automatically against real bookings until answered;
  does not block building or testing it (D-10's inert-by-default design). Ask when needed
  (ADR-014 §4's established pattern).
- **"Driver-no-show refund share"** — listed under ADR-014's "Still open (not this sitting)."
  Blocks the `booking_refunds.reason = 'no_driver'` path from having an automatic percentage
  (D-08); route it through an ops-manual path only until answered.
- **U-D, the exact shape of the no-show grace answer** — once the owner answers, re-check whether
  it implies a per-scenario split (airport vs. city) the way waiting time already has one, rather
  than the single global column this phase builds by default (D-10/D-13).
- **U-C, whether `bookings.status = 'refunded'` is ever set** — cross-phase, owned by whichever
  phase's status display (Phase 8's ops board or account bookings list) actually needs the
  distinction; not resolved by this phase (D-04).
- **Stripe and Resend accounts do not exist yet** — the same blocker Phase 7 already named;
  test-mode/sandbox de-risks this phase's build and most of its testing exactly as it does
  Phase 7's. Not a design blocker.
- **The CHF price matrix is still open.** Every pgTAP fixture this phase writes for the
  refund-tier calculation must use synthetic rappen amounts, never a real figure (D-25).

</deferred>

---

*Phase: 09-booking-lifecycle-customer-self-service*
*Context gathered: 2026-08-25 via research express path*
