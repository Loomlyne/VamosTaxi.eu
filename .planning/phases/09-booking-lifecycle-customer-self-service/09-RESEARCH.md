# Phase 9: Booking Lifecycle & Customer Self-Service - Research

**Researched:** 2026-08-24
**Domain:** Postgres state-machine roll-up triggers, Cloudflare Cron Triggers + Queues sweep architecture, Stripe refunds, transactional lifecycle email, guest-token-gated review capture — all on the schema Phase 2 designed and left half-built for this phase
**Confidence:** MEDIUM-HIGH — the schema this phase writes against is fully read and directly cited (not paraphrased); the Cron/Queues/Stripe-refund/testing mechanics are HIGH confidence (official docs fetched live this session); the two genuinely new inventions this research makes (the shared roll-up trigger's no-show bucketing, the review-submission schema gap) are flagged UNCERTAIN because no existing source settles them, not asserted as fact.

## Summary

Phase 9 closes three deliberate holes Phase 2 left open by name: **U21** (the `booking_status`
roll-up trigger — Phase 2 shipped only the vocabulary, the rule in the enum's own comment, and
one inline case inside `manage_booking_cancel`), **U17** (what a deferred exclusion-constraint
violation looks like to a dispatcher/cron, shared with Phase 8), and the second half of
`manage_booking_cancel` itself, which today returns `null::numeric` for `refund_percent` with a
comment reading `-- Phase 9 fills the tier calculation`. Nothing in Phase 2 or Phase 7 computes a
refund amount, sweeps a no-show, sends a reminder, or shifts a delayed pickup — all four are
genuinely new SQL and Worker code, not integration of an already-designed shape (unlike Phase 7,
which was almost entirely wiring Stripe's and Postgres's already-correct primitives together).

The single most important structural finding is that **the refund path must repeat Phase 7's
two-phase "compute → call Stripe → record" pattern**, because `booking_refunds` is one of the
six fully append-only tables (`0016_append_only.sql`, no UPDATE whitelist the way
`booking_payments` gets) — a `stripe_refund_id` cannot be written after the fact, so it must be
known at INSERT time. `manage_booking_cancel` therefore cannot write the `booking_refunds` row
itself while also being the thing that decides the refund amount before Stripe is called; its
signature must widen to return everything the Worker needs (`refund_rappen`, `basis_rappen`,
`tier_applied`, `hours_before`, the succeeded `stripe_payment_intent_id` to refund against) so a
second, separate call can record the finished Stripe refund. This mirrors Pattern 2/D-06 in
`07-RESEARCH.md` exactly — Stripe is a network call outside any DB transaction, never inside one.

The second major finding is a genuine schema gap nobody flagged before this research: **the
`reviews` table has no `booking_id` column and no client-writable RLS/RPC path at all.**
`review_source` is `('google','tripadvisor','trustpilot','manual')` — every value describes
ops-curated or imported content; there is no value or column meaning "the traveller who took
this exact ride submitted this." Phase 6's ops console only builds publish/hide/reorder for rows
that already exist. LIFE-08 ("a customer is asked for a review after their ride completes") has
**zero mock precedent** anywhere in `app/` — `vamos-reviews.js`'s own header comment says "the
site reads from here and ops writes to it," describing a one-way ops-to-site pipe, not a
customer-to-ops one. This phase must design the submission path from nothing: an additive
`reviews.booking_id` column, a `SECURITY DEFINER` RPC mirroring `manage_booking_cancel`'s
guest-token pattern, and — because there is no UI precedent — this is flagged `UI hint: yes`
territory the same way the roadmap already marks it.

The third finding closes an open question the task explicitly asked this research to check:
**the quote-expiry half of LIFE-07 needs no cron at all.** Phase 4's own D-29 (research D49)
already decided this — `price_snapshots.expires_at <= now() AND booking_id IS NULL` *is* the
expired state; there is nothing to sweep because nothing needs to change. Only the **no-show**
half of LIFE-07 is Phase 9's cron work, and it inherits a genuine owner blocker: "call attempts
before a no-show" is still an unanswered `data-tok` line in `OWNER-ANSWERS.md`, and ADR-014 lists
"driver-no-show refund share" as still open. The no-show sweep design must therefore be built
**inert-by-default** — a nullable `settings_versions.no_show_grace_minutes`, seeded NULL,
gating the sweep query exactly the way `booking_access_tokens.expires_at` gates issuance (D-15's
"refuse rather than invent") — so the phase is fully buildable and testable today without
inventing a number Law 04 forbids.

**Primary recommendation:** Build one shared SQL function for the status roll-up
(`app.recompute_booking_status`) and one for the refund-tier lookup
(`app.compute_cancellation_refund`) — both callable from `manage_booking_cancel`, the no-show
sweep, and (later) Phase 8's ops-cancel/ops-refund actions — rather than re-deriving the same
logic per caller the way `manage_booking_cancel`'s current inline code already risks. Run
reminders and the no-show sweep off the existing single `0 3 * * *` Cron Trigger reconfigured to
a higher-frequency expression (Cloudflare's own CPU-budget rule — 30s per invocation below a
1-hour interval — makes this cheap as long as the handler enqueues onto Cloudflare Queues rather
than doing the work inline), and test every clock-dependent path with `createScheduledController`
(`cloudflare:test`), never `sleep`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Booking status roll-up (`bookings.status` from leg states) | Database (trigger) | API / Backend (callers) | Must be one authoritative place independent of *which* path terminates a leg (cancel, no-show, ops action) — a Worker-side recompute would race against concurrent writers; a trigger on `booking_legs` cannot be bypassed |
| Cancellation refund-tier calculation | Database (SQL function) | API / Backend (Stripe call) | The tier lookup reads the pinned `price_snapshots.policy` jsonb — a pure function of already-durable data; the *money movement* (Stripe) cannot live in SQL at all, so this capability spans both tiers by necessity |
| Refund evidence write (`booking_refunds` row) | Database (append-only table) | API / Backend (writer, service-role) | Must happen only once Stripe confirms, because the table forbids UPDATE — the write itself is DB, but its timing is owned by the Worker's post-Stripe-call code |
| Reminder / no-show sweep scheduling | API / Backend (Worker `scheduled()`) | Cloudflare Queues (fan-out) | Cron Triggers are account/Worker infrastructure, not a DB concept; the actual send/status-write is deferred to a Queue consumer so the 30s scheduled-handler CPU budget is never at risk |
| Flight-delay pickup shift | API / Backend (ops-triggered RPC first; automated poll later) | Database (`SET CONSTRAINTS ... DEFERRED` transaction) | ADR-014 defers AeroDataBox background polling; the shift itself must be one DB transaction across the exclusion constraints (U17), triggered by a human action in this phase |
| Guest self-serve cancel (`manage-booking` page) | Browser / Client | Frontend Server (SSR shell) + API (RPC call) | Same shape as every other public-mock port — Client Component collects the cancel confirmation, SSR renders the page chrome, the actual mutation is a `SECURITY DEFINER` RPC call |
| Review request → capture → moderation | API / Backend (RPC + Turnstile) | Database (new `reviews.booking_id`) → Browser (Phase 6 ops UI, unchanged) | Capture is new Phase 9 surface area with no mock precedent; moderation reuses Phase 6's already-built publish/hide/reorder screen untouched — the only new thing Phase 6 needs is more rows to appear with `published=false` |
| Assignment notification (driver name/vehicle/plate to customer) | Database (trigger on `booking_events`) | API / Backend (Queue consumer → Resend) | Decouples Phase 9's notification plumbing from however Phase 8 implements the assignment UI — react to the already-designed `assignment.chauffeur_set`/`assignment.vehicle_set` event kinds, don't couple to Phase 8's write path directly |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LIFE-01 | Booking moves through quote→pending→paid→confirmed→assigned→completed/cancelled/refunded/no-show, every move recorded | `app.recompute_booking_status()` shared trigger (closes U21); `booking_events` already has the vocabulary (`booking.status_changed`, `flight.delayed`, etc.) — Phase 9 adds `review.requested`/`review.submitted` to the CHECK list only |
| LIFE-02 | Customer cancels, refunded automatically against tiers 100%/75%/0% | `app.compute_cancellation_refund()` reading `price_snapshots.policy->cancellation_tiers`; two-phase Stripe-refund pattern (mirrors Phase 7 D-05/D-06/D-07) |
| LIFE-03 | Refund computed from the policy stored on the booking, never today's settings | Already schema-enforced — `price_snapshots.policy` is insert-only jsonb (§9); `compute_cancellation_refund` must read `price_snapshots.policy`, never `settings_versions` directly, or LIFE-03 is silently violated by the very function built to satisfy it |
| LIFE-04 | Customer manages booking signed-in or via tokened link | `booking_access_tokens` + `app.booking_has_manage_token()` already built (Phase 2 §8); `manage-booking.dc.html` is the port target, no new token mechanism needed |
| LIFE-05 | Reminder before pickup; driver name/vehicle/plate once assigned | Cron sweep → `booking_notifications` claim-then-send (reuses Phase 7 D-14/D-17's stuck-row-sweep pattern); assignment notification reacts to `booking_events` |
| LIFE-06 | Delayed flight shifts pickup, notifies customer + ops | Ops-triggered leg-time-shift RPC across the `DEFERRABLE INITIALLY IMMEDIATE` exclusion constraints (U17); `flight.delayed` event kind already exists; AeroDataBox automation explicitly out of scope (ADR-014) |
| LIFE-07 | Stale quotes expire; no-shows swept on schedule | Quote-expiry half needs **no cron** (Phase 4 D-29, confirmed by direct read); no-show half is new cron+Queue work, gated inert behind a nullable `no_show_grace_minutes` setting (owner blocker) |
| LIFE-08 | Customer asked for review after ride completes | Entirely new: `reviews.booking_id` FK, `submit_review()` RPC, Turnstile-protected public capture surface, `review_request`/`review.submitted` notification plumbing — zero mock precedent, flag for UI phase |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Law 04 (a pending value is a labelled gap).** Two genuine owner blockers land squarely in
  this phase's core mechanism: "call attempts before a no-show" (`OWNER-ANSWERS.md`) and
  "driver-no-show refund share" (ADR-014 "Still open"). Neither may be invented. The no-show
  sweep and the `no_driver` refund-reason path must both ship inert (NULL-gated) rather than with
  a guessed number, exactly like `manage_link_validity_days`'s established precedent (Phase 2
  D-15: "issuance refuses rather than inventing the window").
- **Four languages, same pass.** Every new notification kind this phase adds
  (`reminder_24h`, `assignment`, `cancellation`, `refund`, `review_request`) needs its email
  template in en/de/fr/ar in the same pass `packages/emails` already established for
  `confirmation` (Phase 7). The review-submission page itself needs the same four-language,
  RTL-checked treatment as every other public surface.
- **Never invent a CHF price.** Any pgTAP fixture computing a refund must use the same
  synthetic-integer-rappen discipline `charge_gate.test.sql` already established (Phase 2 §15:
  "synthetic 1/2/3 integers, commented 'rolled back, never a real CHF amount'") — never a real
  matrix figure, even in a test.
- **Every page uses `SiteHeader`/`SiteFooter`.** `manage-booking.dc.html` already does this in
  the mock (`variant="inverse"`); the review-submission surface (new, no mock) must too.
- **Smooth scrolling is Lenis, everywhere.** Applies to the new review-submission page exactly as
  every other ported/new public page.
- **No glow, no tinted yellow.** The review-submission form's star rating / Turnstile widget
  styling must follow the same Appearance-API-equivalent discipline Phase 7 applied to Stripe's
  Elements (`--vt-ring` charcoal, never a yellow-tinted focus).
- **`.claude/CLAUDE.md`'s audit trail requirement** ("audit trail on booking/price/payment/
  assignment changes") extends here to no-show and refund decisions — every automatic no-show
  sweep write and every refund decision must produce a `booking_events` row, not just a status
  flip.

## Standard Stack

### Core

No new runtime packages. Phase 9 is SQL (triggers, functions, migrations), Cloudflare Worker
`scheduled()`/`queue()` handlers, and email templates — every library it needs is already
recommended or landed by an earlier phase's own research.

| Library | Version | Purpose | Provenance |
|---------|---------|---------|--------------|
| `stripe` | 22.5.0 | `stripe.refunds.create({ payment_intent, amount })` for the cancellation/no-driver refund call | `[CITED: 07-RESEARCH.md Standard Stack]` — already verified live against npm + official docs in Phase 7's research; Phase 9 reuses the same SDK instance construction pattern, no re-audit needed |
| `resend` + `@react-email/components` | 6.22.0 / 1.0.12 | Five new templates: `reminder_24h`, `assignment`, `cancellation`, `refund`, `review_request` | `[CITED: 07-RESEARCH.md Standard Stack]` — same package, new templates in the same `packages/emails` scaffold Phase 7 fills |
| `date-fns-tz` | 3.2.0 | Europe/Zurich wall-clock math for the reminder window and DST-safe delay-shift arithmetic | `[VERIFIED: npm registry, checked live 2026-08-24]` — recommended project-wide since `STACK.md` (`npm install zod date-fns-tz`), **not yet present in `apps/web/package.json`** as of this research date (Phase 4/7 have not executed) — Phase 9's Wave 0 must confirm it landed by the time Phase 9 executes (it depends on Phase 7, which depends on Phase 4, both of which need it first) |
| `@marsidev/react-turnstile` | 1.6.0 | Turnstile widget on the new review-submission form | `[VERIFIED: npm registry, checked live 2026-08-24]` — `[CITED: STACK.md]` as the project's already-chosen Turnstile package for "contact/partner forms"; the review form is the same class of public, abuse-prone form |
| `postgres` (via `@vamos/db`) | already in stack | `withIdentity`/`asAnon`/`asGuest`/`asStaff` calls into the new RPCs | Phase 3's door; do not import `postgres` directly in `apps/web` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | already in stack | Request-body validation on the new `/api/manage/[token]/cancel`, `/api/reviews/submit` routes | Every route boundary already uses it project-wide |
| `cloudflare:test` (`createScheduledController`) | bundled with `@cloudflare/vitest-pool-workers` | Time-travel testing of the reminder/no-show sweep without `sleep` | `[VERIFIED: official Cloudflare docs, fetched live 2026-08-24]` — no install, part of the existing Vitest Workers pool |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Cron Trigger (`scheduled()`) reused at higher frequency for reminders + no-show | A dedicated Durable Object alarm per booking leg | DO alarms give sub-minute, per-booking precision but are a new primitive this codebase does not use anywhere else and add real operational surface (one DO per leg) for a problem a 15-minute sweep already solves within the product's own tolerance (a reminder "before pickup" does not need minute-level precision) — not recommended unless a future requirement demands it |
| Reusing the existing `booking_access_tokens` manage token for review submission | Minting a dedicated `purpose='review'` token type | Reuse is simpler (no new token table, no new issuance code) and the manage token is already 30-days valid (ADR-014 §5) — comfortably covers the review-ask window after a completed ride; a dedicated token type is only worth it if review-submission needs a *shorter* validity window than manage access, which nothing in the requirements asks for |
| `app.compute_cancellation_refund()` as one shared SQL function | Duplicating the tier-walk inside `manage_booking_cancel` (as it exists today) and again inside the no-show sweep and again inside Phase 8's future ops-refund action | Three copies of "walk `cancellation_tiers` jsonb, find the matching row" is exactly the drift risk `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md`'s "one key, one fact" rule (ADR-005) already warns against for policy numbers — a shared function is one thing to get right and one thing for Phase 8 to call later |

**Installation:** none — every package above is either already installed by an earlier phase or
ships with an already-installed toolchain (`cloudflare:test`).

**Version verification:** `date-fns-tz` and `@marsidev/react-turnstile` confirmed live via
`npm view <pkg> version` on 2026-08-24 (see table). `stripe`/`resend`/`@react-email/*` versions
are Phase 7's own live verification, cited not re-run, since Phase 9 does not add a new major
version constraint on any of them.

## Package Legitimacy Audit

No new external packages are introduced by this phase. Every package Phase 9 code touches was
already registry-verified by an earlier phase's research (`STACK.md`, `07-RESEARCH.md`) or is a
zero-install part of the existing Cloudflare Vitest toolchain.

| Package | Registry | Age | Downloads/wk | Source Repo | Postinstall | Disposition |
|---------|----------|-----|--------------|-------------|-------------|-------------|
| `date-fns-tz` | npm | 3.2.0 checked live 2026-08-24; package itself long-established (`date-fns` ecosystem, 2016+) | high (millions/wk, `date-fns` org) | github.com/marnusw/date-fns-tz | none observed | Approved — reused, not new |
| `@marsidev/react-turnstile` | npm | 1.6.0 checked live 2026-08-24 | moderate (community-maintained, widely referenced in Cloudflare's own Turnstile ecosystem docs) | github.com/marsidev/react-turnstile | none observed | Approved — reused from `STACK.md`, not newly introduced by this phase |

**Packages removed due to slopcheck `[SLOP]` verdict:** none — slopcheck was not run this
session (no new packages to check; both rows above are npm-registry-confirmed reuses of an
already-audited/cited earlier-phase decision, not new provenance claims).
**Packages flagged as suspicious `[SUS]`:** none.

*If a plan for this phase does end up adding a genuinely new package (e.g., an `.ics`-style
helper for something not yet anticipated), the planner must run the full Package Legitimacy
Gate protocol at that time — this table only covers what this research identified as needed.*

## Architecture Patterns

### System Architecture Diagram

```
                              ┌─────────────────────────────────────────┐
                              │  Cloudflare Cron Trigger (existing slot,  │
                              │  reconfigured to a higher frequency —     │
                              │  e.g. */15 * * * *, still one account-    │
                              │  level trigger; CPU budget 30s/invocation │
                              │  below a 1h interval, official docs)      │
                              └───────────────────┬───────────────────────┘
                                                   │ scheduled(controller, env, ctx)
                                                   ▼
                       ┌─────────────────────────────────────────────────┐
                       │ Worker fetch/scheduled entry (worker.ts)          │
                       │  branch on controller.cron OR just run both       │
                       │  sweeps every tick — both are cheap SELECTs        │
                       └───────────┬───────────────────────┬───────────────┘
                                   │                        │
                    reminder-window SELECT        no-show-window SELECT
             (leg.scheduled_at ≈ now()+24h,        (leg.scheduled_at + grace
              booking_notifications has no          < now(), status still
              reminder_24h row yet)                 'assigned'/'confirmed')
                                   │                        │
                                   ▼                        ▼
                     ┌─────────────────────────────────────────────┐
                     │ env.LIFECYCLE_SWEEP.send() — one Queue        │
                     │ message per candidate leg (never inline work  │
                     │ inside scheduled(), matches STACK.md's own    │
                     │ CPU-budget guidance)                          │
                     └───────────────────┬────────────────────────────┘
                                          ▼
                     ┌─────────────────────────────────────────────┐
                     │ Worker queue() consumer — per message:        │
                     │  · reminder: claim-then-send booking_notif.   │
                     │    (dedupe_key = booking_id:reminder_24h:leg) │
                     │  · no-show: UPDATE booking_legs SET status=   │
                     │    'no_show' WHERE status IN(...) — the       │
                     │    booking_legs_*_no_overlap constraints'     │
                     │    WHERE clause auto-releases the driver/     │
                     │    vehicle slot (no extra code)               │
                     │  → fires app.recompute_booking_status() via   │
                     │    the AFTER trigger, writes booking_events   │
                     └─────────────────────────────────────────────┘

Guest self-serve cancel (LIFE-02/03/04):
Browser (manage-booking port) → POST /api/manage/{token}/cancel
  → manage_booking_cancel(token_hash, leg_seq)   [SECURITY DEFINER, existing + extended]
      · validates token, FOR UPDATE lock
      · flips leg(s) to 'cancelled'
      · calls app.recompute_booking_status(booking_id)   ← same trigger path as the sweep
      · calls app.compute_cancellation_refund(snapshot_id, leg_seq)
      · returns { booking_id, refund_rappen, basis_rappen, tier_applied, hours_before,
                   stripe_payment_intent_id }  — writes NOTHING to booking_refunds yet
  ← Worker receives the payload
  → stripe.refunds.create({ payment_intent, amount: refund_rappen })   [network call, outside any DB tx]
  → record_booking_refund(booking_id, snapshot_id, payment_id, stripe_refund_id, ...)
      [SECURITY DEFINER, service-role-gated — the ONE INSERT into the append-only booking_refunds]
  → booking_notifications: claim-then-send 'cancellation' + 'refund' (may be one email)

Flight delay (LIFE-06, U17):
Ops action (Phase 8 UI, or a manual dispatcher tool this phase can stub) → shift_leg_time(leg_id, new_scheduled_at, reason)
  BEGIN;
    SET CONSTRAINTS booking_legs_chauffeur_no_overlap, booking_legs_vehicle_no_overlap DEFERRED;
    -- pre-check: does the new range conflict with anything BEFORE committing to the shift?
    SELECT ... FROM booking_legs WHERE scheduled_range && new_range AND assigned_chauffeur_id = ...
    -- if conflict found: RAISE a NAMED exception before the UPDATE, not after COMMIT
    UPDATE booking_legs SET scheduled_at = new_scheduled_at WHERE id = leg_id;
    INSERT booking_events (kind='flight.delayed', ...);
  COMMIT;   -- constraint check happens here; a real 23P01 is the fallback path, not the primary one
  → booking_notifications: claim-then-send 'cancellation'-adjacent 'delay' kind to customer + ops broadcast
    (reuse Phase 2 §14f's realtime.broadcast_changes() 'ops:board' topic — no new channel)

Review lifecycle (LIFE-08):
booking.status_changed → 'completed'/'partially_completed'  (via app.recompute_booking_status trigger)
  → AFTER trigger on bookings (or booking_events insert of kind 'booking.status_changed')
    enqueues 'review_request' booking_notification
  → email links to /review/{manage_token}  (reuses the SAME token as manage-booking)
  → Browser: new public page, Turnstile-protected
    → POST /api/reviews/submit { token, rating, body, ... }
      → submit_review(token_hash, rating, body, ...)  [SECURITY DEFINER, new]
          · validates token via app.booking_has_manage_token() (existing helper, reused)
          · checks bookings.status IN ('completed','partially_completed')
          · INSERT INTO reviews (booking_id, source='manual', published=false, verified=true, ...)
  → Phase 6's ALREADY-BUILT OpsReviews publish/hide/reorder screen picks it up unmodified
```

### Recommended Project Structure
```
packages/db/supabase/migrations/
├── <ts>_booking_status_rollup.sql       # app.recompute_booking_status() + AFTER trigger on booking_legs
├── <ts>_cancellation_refund.sql         # app.compute_cancellation_refund(); extends manage_booking_cancel's return shape
├── <ts>_record_booking_refund.sql       # record_booking_refund() — the ONE append-only INSERT after Stripe confirms
├── <ts>_no_show_grace.sql               # settings_versions.no_show_grace_minutes (nullable, NULL-seeded)
├── <ts>_leg_time_shift.sql              # shift_leg_time() RPC — U17's pre-check + deferred-constraint transaction
├── <ts>_review_submission.sql           # reviews.booking_id FK; submit_review() RPC
└── <ts>_lifecycle_notification_kinds.sql # additive: booking_events.kind CHECK += review.requested/review.submitted

packages/db/supabase/tests/
├── booking_status_rollup.test.sql        # every leg-status combination × 1-leg and 2-leg bookings
├── cancellation_refund.test.sql          # synthetic tiers, hours_before boundary cases, no_show tier
├── leg_time_shift.test.sql               # deferred-constraint pre-check + real 23P01 fallback path
└── review_submission.test.sql            # RLS/RPC grant model, booking-status gate, dedupe

apps/web/
├── worker.ts                             # scheduled() gains real reminder+no-show cases; queue() gains LIFECYCLE_SWEEP consumer
├── wrangler.jsonc                        # cron frequency change; new LIFECYCLE_SWEEP queue producer+consumer
├── app/api/manage/[token]/cancel/route.ts
├── app/api/manage/[token]/delay/route.ts # ops-only or system-only, depending on where Phase 8 lands the UI
├── app/api/reviews/submit/route.ts
├── app/(public)/manage-booking/page.tsx  # port of manage-booking.dc.html
├── app/(public)/review/[token]/page.tsx  # NEW — no mock precedent, flag for UI phase
└── lib/lifecycle/
    ├── sweep.ts                          # reminder-window / no-show-window SELECT builders
    ├── refund.ts                         # Stripe refund call + record_booking_refund orchestration
    └── clock.ts                          # date-fns-tz Europe/Zurich helpers, DST-safe

packages/emails/src/
├── ReminderEmail.tsx
├── AssignmentEmail.tsx
├── CancellationEmail.tsx
├── RefundEmail.tsx
└── ReviewRequestEmail.tsx
```

### Pattern 1: The roll-up trigger is one function, called from every terminating path

**What:** `app.recompute_booking_status(p_booking_id uuid)` — a `SECURITY DEFINER` SQL function
implementing the enum comment's rule (§3 of `02-SCHEMA-DRAFT.md`), attached as an `AFTER INSERT
OR UPDATE OF status ON public.booking_legs FOR EACH ROW EXECUTE FUNCTION
app.tg_recompute_booking_status()` trigger that calls it. `manage_booking_cancel`'s existing
inline `update public.bookings set status = case ... end` block is **replaced** by a call to this
function, not left duplicated.

**When to use:** Every place a `booking_legs.status` changes — cancel (guest or ops), no-show
sweep, completion mark. The function itself must **no-op** (leave `bookings.status` untouched)
when no leg has reached a terminal state yet, so it never clobbers the `quote→pending→paid→
confirmed→assigned` progression Phase 7/8 already own.

**Example (author's synthesis from the enum comment's documented rule — not verified against a
built implementation, since none exists yet):**
```sql
-- Source: rule text is verbatim from 02-SCHEMA-DRAFT.md §3's enum comment, "binding on Phase 9"
create or replace function app.recompute_booking_status(p_booking_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_live integer; v_done integer; v_cancelled integer; v_completed integer;
        v_no_show integer; v_total integer;
begin
  select count(*) filter (where status not in ('cancelled','completed','no_show')),
         count(*) filter (where status in ('completed','no_show')),
         count(*) filter (where status = 'cancelled'),
         count(*) filter (where status = 'completed'),
         count(*) filter (where status = 'no_show'),
         count(*)
    into v_live, v_done, v_cancelled, v_completed, v_no_show, v_total
    from public.booking_legs where booking_id = p_booking_id;

  -- No-op until at least one leg is terminal — never downgrade an in-flight commercial status.
  if v_cancelled = 0 and v_done = 0 then return; end if;

  update public.bookings set status = case
      when v_cancelled = v_total then 'cancelled'
      when v_completed = v_total then 'completed'
      -- UNCERTAIN (see below): whether an all-no_show booking should read 'no_show' at the
      -- booking level, or fall into 'completed' by the "every leg completed-or-no_show" reading.
      when v_no_show = v_total then 'no_show'
      when v_live = 0 then 'partially_completed'   -- mix of cancelled + (completed or no_show)
      else 'partially_cancelled'                    -- ≥1 cancelled, ≥1 still live
    end
   where id = p_booking_id;
end $$;
```

### Pattern 2: Refunds are compute-then-call-then-record, never one transaction

**What:** `manage_booking_cancel` (extended) computes and *returns* the refund payload but does
**not** write `booking_refunds`. A second, service-role-gated function
(`record_booking_refund`) performs the one permitted append-only INSERT, called by the Worker
only after `stripe.refunds.create()` has actually returned a `stripe_refund_id`.

**When to use:** Any refund path — self-serve cancel (this phase), and later Phase 8's
ops-initiated refund/cancel actions, which should call the **same** `compute_cancellation_refund`
+ `record_booking_refund` pair rather than re-deriving the tier math.

**Example:**
```sql
-- Source: pattern mirrors Pattern 2 of 07-RESEARCH.md (checkout_create_booking), applied to the
-- refund direction. New for Phase 9 — no prior implementation exists to cite verbatim.
create or replace function app.compute_cancellation_refund(
  p_snapshot_id bigint, p_leg_seq smallint default null, p_now timestamptz default now()
) returns table (basis_rappen rappen, refund_percent numeric, refund_rappen rappen,
                  tier_applied jsonb, hours_before numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_policy jsonb; v_basis rappen; v_hours numeric; v_pct numeric; v_tier jsonb;
        v_scheduled_at timestamptz; v_all_no_show boolean;
begin
  select s.policy into v_policy from public.price_snapshots s where s.id = p_snapshot_id;

  -- basis: whole-booking total, or one leg's subtotal for a single-leg cancel (ADR-006)
  if p_leg_seq is null then
    select s.total_rappen into v_basis from public.price_snapshots s where s.id = p_snapshot_id;
  else
    select psl.leg_subtotal_rappen into v_basis
      from public.price_snapshot_legs psl
     where psl.snapshot_id = p_snapshot_id and psl.leg_seq = p_leg_seq;
  end if;

  select bl.scheduled_at, bl.status = 'no_show' into v_scheduled_at, v_all_no_show
    from public.booking_legs bl
   where bl.booking_id = (select booking_id from public.price_snapshots where id = p_snapshot_id)
     and (p_leg_seq is null or bl.leg_seq = p_leg_seq)
   order by bl.scheduled_at asc limit 1;   -- earliest leg governs a whole-booking cancel

  v_hours := extract(epoch from (v_scheduled_at - p_now)) / 3600.0;

  -- Walk the tiers jsonb (§4's shape) — a no_show basis uses the {"no_show":true,...} row
  -- regardless of hours_before; a live cancel matches the first from_hours_before <= v_hours,
  -- descending. Never falls back to a live settings_versions read (LIFE-03).
  select t into v_tier from jsonb_array_elements(v_policy->'cancellation_tiers') t
   where (v_all_no_show and (t->>'no_show')::boolean is true)
      or (not v_all_no_show and (t->>'from_hours_before')::numeric <= v_hours)
   order by (t->>'from_hours_before')::numeric desc nulls last
   limit 1;

  v_pct := coalesce((v_tier->>'refund_percent')::numeric, 0);
  return query select v_basis, v_pct, floor(v_basis * v_pct / 100.0)::rappen, v_tier, v_hours;
end $$;
```

### Pattern 3: React to `booking_events`, don't couple to the writer

**What:** Assignment and completion notifications are triggers/functions that fire off newly
inserted `booking_events` rows of a known `kind` (`assignment.chauffeur_set`,
`assignment.vehicle_set`, `booking.status_changed` → `to_status IN ('completed',
'partially_completed')`), not code wired directly into Phase 8's assignment-write path or
Phase 9's own completion-write path.

**When to use:** Any notification whose trigger condition is "something changed," where the
thing that changes it is owned by a different phase's code that has not been written yet.

**Why:** `booking_events` already has the exact vocabulary needed
(`assignment.chauffeur_set`/`assignment.vehicle_set`/`booking.status_changed`) — Phase 9 does not
need Phase 8 to exist yet to build against it, because the event *shape* is already a Phase 2
contract, independent of Phase 8's actual UI.

### Anti-Patterns to Avoid

- **Computing the roll-up inline in more than one place.** `manage_booking_cancel`'s current
  stub is the ONE place the logic exists today; if Phase 9 adds a second inline copy for the
  no-show sweep instead of extracting `app.recompute_booking_status()`, the two will drift the
  moment either one is touched again — exactly the failure mode ADR-005 already names for policy
  copy, applied here to state-machine logic instead.
- **Writing `booking_refunds` before calling Stripe.** The table is append-only with no UPDATE
  path at all (unlike `booking_payments`'s status/captured_at whitelist) — a row written before
  the Stripe call exists either has no `stripe_refund_id` forever, or (worse) a made-up one that
  later disagrees with what Stripe actually processed.
- **Reading `settings_versions` (current) instead of `price_snapshots.policy` (pinned) for the
  refund tiers.** This is the literal failure LIFE-03 exists to prevent — cited directly from
  Pitfall 7 of the project's own `PITFALLS.md`, applying to this phase specifically.
- **Doing sweep work inline inside `scheduled()`.** Cloudflare's own CPU-time budget for a
  sub-1-hour cron interval is 30 seconds per invocation (official docs) — a sweep that queries,
  sends emails, and writes status for every due leg inline risks timing out as booking volume
  grows; `scheduled()` should only SELECT candidates and enqueue, matching `STACK.md`'s own
  guidance and Phase 7's already-established fast-ack pattern for the webhook path.
- **Inventing a no-show grace period or a driver-no-show refund percentage.** Both are named,
  dated owner blockers (`OWNER-ANSWERS.md`, ADR-014's "Still open" list) — Law 04 applies exactly
  as strictly to a settings number as to a CHF price.
- **Hardcoding the review-submission window as "no expiry check."** Reuse
  `app.booking_has_manage_token()`'s existing expiry logic (`t.expires_at > now()`) rather than a
  second, bespoke check — a second check is a second place the 30-day validity number can drift.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Freeing a chauffeur/vehicle after a no-show/cancel | An explicit "clear the assignment and check for the next eligible booking" routine | Nothing — the existing exclusion constraints' `WHERE (... status not in ('cancelled','no_show'))` clause already excludes a no-show/cancelled leg from the overlap check the instant its `status` column changes (Phase 2 §7) | Already correct by construction; writing new code here duplicates a guarantee the database already gives for free |
| Refund-tier lookup, three separate times | Copy-pasting the tier-walk into the guest-cancel RPC, the no-show sweep, and (eventually) Phase 8's ops-refund action | `app.compute_cancellation_refund()`, one shared function all three call | Exactly the drift risk ADR-005 already names for policy copy, generalized to logic |
| Guest token re-validation for review submission | A second hashing/expiry/revocation check bespoke to reviews | `app.booking_has_manage_token()`, already built and pgTAP-proven in Phase 2 | One token validation path, one thing to get right, one thing security review has to look at |
| Calendar-adjacent reminder timing math | Hand-computed "is this leg's pickup within [23,25) hours from now" using naive `Date` arithmetic | `date-fns-tz`'s Europe/Zurich-aware helpers, computed the same way `research/quote-lock-expiry.md` already established for the quote-lock clock | DST-boundary bookings (Pitfall 11, project's own `PITFALLS.md`) silently mis-fire a reminder by exactly one hour twice a year if done naively |
| Webhook-adjacent claim-then-send for reminders | A bespoke dedupe mechanism for the reminder cron | `booking_notifications.dedupe_key` (already built, Phase 2), with the exact claim-then-send pattern Phase 7 D-14/D-17 already established for `confirmation` | The stuck-row-sweep design Phase 7 built (`booking_notifications_pending` index) was explicitly written to be reused by Phase 9 — its own comment says so |

**Key insight:** Nearly every "don't hand-roll" item in this phase is "reuse a Phase 2 or Phase 7
primitive that was deliberately over-built to be reused here." The one genuinely new invention
this phase makes is the shared roll-up/refund-tier *functions themselves* — and even those
extract logic that already exists once, inline, in `manage_booking_cancel`.

## Runtime State Inventory

Not applicable — Phase 9 adds new tables/columns/functions and new Worker cron/queue cases; it
does not rename, refactor, or migrate any existing runtime state. Skipped per the trigger
condition in the output format.

## Common Pitfalls

### Pitfall 1: The roll-up trigger fires on every `booking_legs` write, including non-terminal ones

**What goes wrong:** If `app.tg_recompute_booking_status()` is attached without the "no-op unless
at least one leg is terminal" guard, an ordinary Phase 8 assignment write (`UPDATE booking_legs
SET assigned_chauffeur_id = ...`) — which does not touch `status` at all if the trigger is scoped
to `OF status`, but WOULD if scoped more broadly — could recompute and silently downgrade
`bookings.status` from `'assigned'` back to whatever the case expression's `else` branch produces
for an all-live leg set.
**Why it happens:** A trigger written to "always recompute" rather than "recompute only when
something terminal happened" is the natural first draft.
**How to avoid:** Scope the trigger to `AFTER UPDATE OF status ON booking_legs` (not a broader
column set) and keep the explicit `if v_cancelled = 0 and v_done = 0 then return; end if;` guard
in the function body itself, as a second, defense-in-depth layer.
**Warning signs:** A pgTAP case asserting that assigning a chauffeur to a leg of a
`status='assigned'` booking leaves `bookings.status` unchanged.

### Pitfall 2: The no-show sweep and the reminder sweep race the same leg

**What goes wrong:** A leg whose `scheduled_at` has just passed is a candidate for the no-show
sweep; if its 24h reminder window (which reads `scheduled_at - now() BETWEEN 23 AND 25 hours`,
roughly) is computed with an off-by-one boundary, the same leg could theoretically match both
windows in adjacent sweep ticks near a boundary, though this is a data-integrity risk (duplicate
work), not a double-send risk, since `booking_notifications.dedupe_key` already prevents the
double-send outcome.
**Why it happens:** Two independent SELECT queries against overlapping time windows, computed
with slightly different rounding.
**How to avoid:** Both windows should derive from the same `date-fns-tz`-based helper function
(`lib/lifecycle/clock.ts`), not two independently hand-written boundary expressions.
**Warning signs:** A pgTAP/Vitest fixture where a leg's `scheduled_at` sits exactly on a window
boundary produces different results depending on which sweep query runs first.

### Pitfall 3: `manage_booking_cancel`'s existing status-guard list omits `'no_show'` and needs revisiting

**What goes wrong:** The function's current guard —
`if v.status not in ('pending','paid','confirmed','assigned','partially_completed',
'partially_cancelled') then raise 'not_cancellable'` — already correctly excludes `'no_show'` and
`'completed'` (a customer cannot cancel a booking that already happened). This is *correct as
written*, but easy to accidentally "fix" by adding `'no_show'` to the cancellable list while
extending the function for Phase 9's refund work, since a developer skimming might assume every
status needs explicit handling.
**Why it happens:** Touching a function for one reason (adding the refund computation) invites
touching adjacent code for an unrelated reason.
**How to avoid:** Leave the existing guard list untouched; add only the refund-computation call
and the widened return signature. A no-show booking's "refund" (the 0% tier, if the driver-no-show
question resolves differently) is a distinct, ops-triggered path — not something the guest-facing
cancel RPC should ever reach.
**Warning signs:** A diff that touches the `if v.status not in (...)` line for reasons unrelated
to the actual Phase 9 scope.

### Pitfall 4: A deferred exclusion-constraint violation caught only at COMMIT loses the conflicting leg's identity

**What goes wrong:** `SET CONSTRAINTS ... DEFERRED` postpones the exclusion check to COMMIT; a
`23P01` raised there carries no row context by default — the delay-shift handler cannot tell the
customer or dispatcher *which* other booking the new time conflicts with, only that it does
(this is U17, explicitly unresolved by Phase 2, shared with Phase 8).
**Why it happens:** Deferred constraints trade "fails fast with row context" for "the transaction
can reach a valid final state via an illegal intermediate one" — the tradeoff Phase 2 accepted
on purpose (§7's comment: "a transaction that ends in a legal state may ask for the check to be
postponed").
**How to avoid:** Pre-check with an explicit `SELECT ... WHERE scheduled_range && new_range AND
assigned_chauffeur_id = ...` query *before* the UPDATE, inside the same transaction, so a real
conflict is named and reported with a friendly message before ever reaching COMMIT; only fall
back to catching `23P01` (matching `err.constraint_name`, per Phase 2's own established pattern)
as the last-resort safety net for a race the pre-check missed.
**Warning signs:** A delay-shift error message that shows Postgres's raw constraint-violation
text to a dispatcher instead of "conflicts with VT-XX-XXXX, driver Name, 09:40."

### Pitfall 5: DST transitions corrupt the reminder window and the delay-shift math

**What goes wrong:** Already documented at HIGH confidence project-wide (`PITFALLS.md` Pitfall
11) — this phase is one of the two places (with Phase 4/5) the project's own pitfalls research
explicitly names as needing DST-boundary test fixtures, because both the 24h-reminder window and
the flight-delay pickup shift do duration arithmetic that a naive local-time string breaks across
the last Sunday of March/October.
**How to avoid:** Store and compute exclusively on `timestamptz`; format to Europe/Zurich only at
the last step for display/email copy; add the DST-boundary fixtures this phase's own Wave 0 gap
list should include (a leg at 02:15 on the spring-forward date, one at each ambiguous fall-back
occurrence).
**Warning signs:** A reminder that fires an hour early or late twice a year, or a delay-shift that
computes a pickup time an hour off from what the customer actually agreed to.

## Code Examples

### Time-travel testing the no-show sweep (never `sleep`)

```ts
// Source: https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/
// (fetched live, 2026-08-24)
import { env } from "cloudflare:workers";
import { createScheduledController, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { it, expect } from "vitest";
import worker from "../worker";

it("sweeps a leg past its grace period into no_show", async () => {
  // seed a booking_legs row with scheduled_at = now-90min, no_show_grace_minutes = 60
  const ctrl = createScheduledController({
    scheduledTime: new Date("2026-08-24T12:00:00Z"),
    cron: "*/15 * * * *",
  });
  const ctx = createExecutionContext();
  await worker.scheduled(ctrl, env, ctx);
  await waitOnExecutionContext(ctx);
  // assert booking_legs.status = 'no_show', bookings.status rolled up, booking_events written
});
```

### Manually exercising the sweep against a real deployed/dev Worker

```bash
# Source: Cloudflare's own --test-scheduled flag (WebSearch-corroborated against multiple
# community + Cloudflare-ecosystem sources, 2026-08-24; use the Vitest API above for CI —
# this is for local ad-hoc verification only)
wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=*/15+*+*+*+*&time=1798200000000"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `docs/build/GSD-LAUNCH.md`'s original sketch: one daily `0 3 * * *` cron doing "expire stale quotes, T-24h reminder emails, no-show sweep" all in one illustrative case | Quote expiry needs **no cron at all** (Phase 4 D-29); reminders and no-show need a **higher-frequency** cron (bookings are scattered through the day, a once-daily 03:00 UTC tick cannot deliver a reminder "before pickup" for a booking at any other hour) | Phase 4's own research (D-29, dated before this session) already corrected the quote-expiry half; this research is the first to note the reminder/no-show half's frequency is also wrong as currently declared in `wrangler.jsonc` | `wrangler.jsonc`'s `triggers.crons` array needs a frequency change from `["0 3 * * *"]` to something sub-hourly, in both `env.staging` and `env.production` |
| `STACK.md`'s illustrative `scheduled()` switch statement (`case "*/15 * * * *": /* expire stale quote locks */`) | That specific case is now dead code per Phase 4 D-29 — quote-lock expiry is a computed `WHERE` clause, never a mutation | Phase 4 research, predates this session but had not yet propagated into a wrangler.jsonc change | The `*/15 * * * *` slot in `STACK.md`'s sketch should be **repurposed** for the reminder/no-show sweep this phase actually needs, not left implying quote-expiry work that no longer exists |

**Deprecated/outdated:**
- The mock's `vamos-reviews.js` review pipeline (ops-only add/import, no customer submission) —
  superseded by this phase's `submit_review()` RPC, which is genuinely new, not a port of
  anything in `app/`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The roll-up trigger should be scoped to `AFTER UPDATE OF status ON booking_legs` (not `INSERT`, not a broader column set) | Pattern 1, Pitfall 1 | LOW — a wrong trigger scope is caught immediately by the pgTAP fixture matrix this phase's own plan should include; not a silent risk |
| A2 | No-show and cancelled legs should both count toward the "done" bucket for the `partially_completed` vs `partially_cancelled` distinction, matching `manage_booking_cancel`'s *already-shipped* implementation rather than the enum comment's prose (which is silent on `no_show`) | Pattern 1's code example, UNCERTAIN table below | MEDIUM — this is a genuine product-semantics question (does a no-show read as "the trip happened, badly" or "the trip didn't happen"?), not purely technical; flagged explicitly in the UNCERTAIN table, not silently decided |
| A3 | A booking where every leg is `no_show` should roll up to booking-level `status = 'no_show'` (a third pure case, symmetric with "every leg cancelled → cancelled" / "every leg completed → completed") rather than `'completed'` | Pattern 1's code example | MEDIUM — same root uncertainty as A2; affects what the ops board and account history literally display for a fully-missed booking |
| A4 | Reusing the existing manage token (not minting a dedicated review token) is the right design for LIFE-08's submission link | Alternatives Considered, Don't Hand-Roll | LOW — reversible; if a shorter review-window validity is later wanted, a `purpose='review'` row can be added to `booking_access_tokens.purpose`'s CHECK list without touching the manage-token design |
| A5 | The no-show sweep and reminder sweep should share one Cron Trigger slot (reused at higher frequency) rather than requesting a second trigger | Architecture Patterns, State of the Art | LOW — Cloudflare allows multiple cron expressions sharing one `scheduled()` handler (official docs, `STACK.md`'s own sketch already shows the pattern); this is a config choice, not a design risk |
| A6 | `booking_events.kind`'s CHECK list needs two new values (`review.requested`, `review.submitted`) rather than reusing the generic `note.added` | Recommended Project Structure | LOW — cosmetic; `note.added` would technically work but loses the queryability a distinct kind gives the ops timeline |

**If this table is empty:** N/A — see rows above.

## Open Questions

1. **Should the delay-shift RPC (`shift_leg_time`) live in this phase, or does it belong to
   Phase 8 (since U17 names both phases and Phase 8 owns the dispatch-swap half of the same
   deferred-constraint pattern)?**
   - What we know: U17 is explicitly shared between "the delay handler and the ops swap action"
     (Phase 2's own research table); Phase 8 has not been researched yet as of this session.
   - What's unclear: whether the pre-check-vs-catch-23P01 resolution this research recommends
     should be a single shared helper both phases call, or two independent implementations that
     happen to agree.
   - Recommendation: Phase 9 should build `shift_leg_time()` (it owns LIFE-06 and needs it
     regardless), and flag it clearly enough in this document that whoever researches Phase 8
     next reads this section and reuses the same pre-check pattern rather than re-deriving it —
     see the UNCERTAIN table's U17 row.

2. **Does the review-request email fire immediately on completion, or after a delay (e.g., a few
   hours, to avoid asking for a review while the customer is still literally in transit from the
   airport)?**
   - What we know: LIFE-08 only says "after their ride completes," no timing precision.
   - What's unclear: whether an immediate send is acceptable UX or whether a delay is expected.
   - Recommendation: Claude's Discretion for the planner — a delayed send (e.g., 2-4 hours after
     the `completed` transition) is a defensible default and costs nothing extra given the sweep
     architecture already built for reminders is trivially reusable for a delayed review-request
     window too.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `date-fns-tz` installed in `apps/web` | Reminder/no-show/delay-shift clock math | ✗ (not yet in `apps/web/package.json` as of this research date) | — | Phase 9 depends on Phase 7, which depends on Phase 4 — both should have installed it first per `STACK.md`; Phase 9's Wave 0 must confirm, and install it itself if somehow still missing |
| Cloudflare Queues — a new `LIFECYCLE_SWEEP` queue | Fan-out from the reminder/no-show sweep | ✗ (only `STRIPE_EVENTS` exists in `wrangler.jsonc` today) | — | Must be created (`wrangler queues create`) and declared under both `env.staging`/`env.production`, mirroring the existing `STRIPE_EVENTS` producer+consumer block exactly |
| `vitest`/`@cloudflare/vitest-pool-workers` in `apps/web` | Time-travel sweep testing (`createScheduledController`) | ✗ (not present in `apps/web/package.json` as of this research date) | — | Phase 7's own research already flags this as an assumed Phase 4 Wave 0 dependency; Phase 9 inherits the same assumption one link further down the chain — verify, don't assume, at Wave 0 |
| Stripe account (live or test mode) | LIFE-02 refund calls | ✗ (does not exist yet — same owner blocker Phase 7 already named) | — | Test-mode keys are available immediately on signup (Phase 7's own finding); Phase 9's refund-call tests can proceed in test mode the same way Phase 7's checkout tests can |
| Resend account | LIFE-05/06/08 notification sends | ✗ (does not exist yet — same owner blocker Phase 7 already named) | — | Resend sandbox/test sending mode, per Phase 7's own finding |

**Missing dependencies with no fallback:**
- The two owner-blocked numbers (no-show grace period, driver-no-show refund share) — genuinely
  block the *automated* no-show sweep and the `no_driver` auto-refund path from ever firing for
  real bookings, by design (Law 04). Does not block building, migrating, or testing this phase's
  code — the sweep ships inert (NULL-gated) and is fully pgTAP-provable with a synthetic non-NULL
  value in a test fixture.

**Missing dependencies with fallback:**
- Every other row above has an established, already-precedented fallback (test-mode keys, sandbox
  sending, Wave-0 verification) — none blocks this phase's build or test work.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pgTAP (via Supabase CLI, `packages/db`) for the roll-up trigger, refund-tier function, and RLS/RPC grant proofs; Vitest + `@cloudflare/vitest-pool-workers`'s `createScheduledController` for the cron sweep; Playwright for the manage-booking and review-submission page visual/i18n proofs |
| Config file | `packages/db/supabase/config.toml` (exists); `apps/web/vitest.config.ts` (assumed landed by Phase 4/7 — verify at Wave 0, see Environment Availability); `apps/web/playwright.config.ts` (exists) |
| Quick run command | `pnpm --filter @vamos/db run test:db supabase/tests/booking_status_rollup.test.sql` / `pnpm --filter web exec vitest run lib/lifecycle` |
| Full suite command | `pnpm db:reset && pnpm db:test` + `pnpm --filter web exec vitest run` + `pnpm test:visual` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIFE-01 | Every leg-terminating path rolls up `bookings.status` correctly | pgTAP (matrix: all leg-status combinations, 1-leg and 2-leg bookings) | `pnpm --filter @vamos/db run test:db supabase/tests/booking_status_rollup.test.sql` | ❌ Wave 0 |
| LIFE-02 | Cancel refunds against the pinned tier, not live settings | pgTAP (synthetic-rappen fixture, hours_before boundary cases) + Vitest (Stripe refund call, mocked) | `pnpm --filter @vamos/db run test:db supabase/tests/cancellation_refund.test.sql` | ❌ Wave 0 |
| LIFE-03 | `compute_cancellation_refund` never reads live `settings_versions` | pgTAP (mutate `settings_versions` after snapshot creation, assert refund unchanged — directly proves the Pitfall-7 defence) | same file as LIFE-02 | ❌ Wave 0 |
| LIFE-04 | Guest manages booking via tokened link | Playwright (manage-booking page, en/de at minimum) + pgTAP (token expiry/revocation gate, reused helper) | `pnpm test:visual -- manage-booking.spec.ts` | ❌ Wave 0 |
| LIFE-05 | Reminder fires in the correct window; assignment notification fires on `booking_events` insert | Vitest (`createScheduledController`, time-travel — never `sleep`) + pgTAP (dedupe_key claim-then-send) | `pnpm --filter web exec vitest run lib/lifecycle/sweep` | ❌ Wave 0 |
| LIFE-06 | Delay shift moves pickup, notifies both sides, honours the exclusion constraints | pgTAP (`leg_time_shift.test.sql` — pre-check conflict, deferred-constraint real 23P01 fallback, DST-boundary fixture) | `pnpm --filter @vamos/db run test:db supabase/tests/leg_time_shift.test.sql` | ❌ Wave 0 |
| LIFE-07 | No-shows swept on schedule; sweep is inert while `no_show_grace_minutes` is NULL | Vitest (time-travel) + pgTAP (NULL-gate proof: sweep query returns zero candidates when the setting is NULL) | `pnpm --filter web exec vitest run lib/lifecycle/sweep` | ❌ Wave 0 |
| LIFE-08 | Review request → submission → moderation queue | pgTAP (`submit_review` RLS/RPC grant model, booking-status gate) + Playwright (new review page, 4 languages, RTL) | `pnpm --filter @vamos/db run test:db supabase/tests/review_submission.test.sql` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the relevant quick-run command for the file touched.
- **Per wave merge:** `pnpm db:reset && pnpm db:test` + `pnpm --filter web exec vitest run`.
- **Phase gate:** full suite green, plus a real (test-mode) Stripe refund E2E and a real
  `wrangler dev --test-scheduled` manual pass against staging data, before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `packages/db/supabase/tests/booking_status_rollup.test.sql`
- [ ] `packages/db/supabase/tests/cancellation_refund.test.sql`
- [ ] `packages/db/supabase/tests/leg_time_shift.test.sql`
- [ ] `packages/db/supabase/tests/review_submission.test.sql`
- [ ] `apps/web/lib/lifecycle/sweep.test.ts` (Vitest, `createScheduledController`-based)
- [ ] Confirm `date-fns-tz` and `@cloudflare/vitest-pool-workers` are actually installed by the
  time Phase 9 executes (both are inherited assumptions from Phase 4/7, not this phase's own
  install — verify, don't assume)
- [ ] DST-boundary fixtures (spring-forward 02:15 leg, both fall-back-hour occurrences) reused
  across the reminder-window, no-show-window, and delay-shift tests

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | partial | Guest cancel/review-submit reuse the already-designed manage-token bearer model (Phase 2), not a new auth mechanism |
| V3 Session Management | yes | The manage token's existing properties (32-byte random, SHA-256 hashed before reaching Postgres, reusable-not-single-use, 30-day validity) are reused unchanged for the review-submission link — do not shorten or otherwise re-derive its properties ad hoc |
| V4 Access Control | yes | Every new RPC (`shift_leg_time`, `record_booking_refund`, `submit_review`) follows the existing `SECURITY DEFINER` + explicit `revoke all ... grant execute to <specific role>` pattern (Phase 2 §8/§9's established shape); `record_booking_refund` in particular must be service-role-only, never granted to `vamos_guest`/`vamos_staff` directly, mirroring §14e's "no client-facing role holds INSERT on the ledger set" rule |
| V5 Input Validation | yes | zod schemas on `/api/manage/[token]/cancel`, `/api/reviews/submit`; a review's `rating`/`body` fields need length/range validation before the RPC call, not only the DB-level `rating between 0 and 5` CHECK |
| V6 Cryptography | yes | No new crypto — reuses the existing SHA-256 manage-token hash path |
| V11 Business Logic | yes | The refund-tier lookup is the business-logic-critical path this phase adds — LIFE-03's entire point is that this logic must be tamper-resistant against "read the wrong (live) policy," which is a business-logic integrity concern, not just an access-control one |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| A guest replays an old cancel request to trigger a second refund attempt | Tampering / Repudiation | `manage_booking_cancel`'s existing `FOR UPDATE` lock + status guard (a booking already `'cancelled'` fails the guard on a second call) — Phase 9 must not weaken this guard while extending the function |
| Turnstile-bypassed spam review submissions | Denial of Service | Server-side `siteverify` call (already the established project pattern, `STACK.md`), never trusting the client-supplied token alone; rate-limit `/api/reviews/submit` the same way `/api/quote` is rate-limited (Phase 4's own layered abuse model, reused not re-invented) |
| A forged/expired manage token attempting to submit a review for a booking that never completed | Spoofing / Elevation of Privilege | `submit_review` must check both `app.booking_has_manage_token()` (token validity) AND `bookings.status IN ('completed','partially_completed')` (business-state gate) — a valid-but-premature token must not be able to submit a review for an in-progress booking |
| A no-show sweep tick racing a customer's in-flight self-serve cancel for the same leg | Tampering (race condition) | Both paths must acquire the same `FOR UPDATE` lock discipline `manage_booking_cancel` already establishes — the sweep's `UPDATE booking_legs SET status='no_show' WHERE status IN (...) AND ...` should be a single atomic statement, not a check-then-act round trip |
| Deferred-constraint delay-shift transaction left uncommitted/rolled back mid-way, leaving a leg's `scheduled_at` changed but no `booking_events` row | Tampering / Repudiation | The `UPDATE` and the `booking_events` INSERT must be in the same transaction as the deferred constraint check (Architecture Patterns diagram) — never split across two round trips |

## Decisions taken here

| # | Decision | Rationale | Confidence |
|---|----------|-----------|------------|
| D-01 | The `booking_status` roll-up is one shared SQL function (`app.recompute_booking_status`), triggered `AFTER UPDATE OF status ON booking_legs`, replacing (not duplicating) `manage_booking_cancel`'s current inline case expression | Directly closes U21 as the Phase 2 research table names it ("Phase 9: land the trigger that maintains the roll-up for all paths, and re-point every ops/account query that reads `bookings.status`") | HIGH — the requirement and the shape are both directly cited from Phase 2's own research |
| D-02 | The refund path is compute-then-call-then-record: `manage_booking_cancel` (extended) computes and returns the refund payload without writing `booking_refunds`; a separate `record_booking_refund()` performs the one append-only INSERT after Stripe confirms | `booking_refunds` has no UPDATE whitelist (verified directly against `0016_append_only.sql`'s trigger-attachment list) — a `stripe_refund_id` cannot be added after the row exists, so the row cannot exist before Stripe is called | HIGH — directly verified against the append-only migration's actual trigger list, not assumed |
| D-03 | `app.compute_cancellation_refund()` is a shared function, callable by the guest-cancel RPC now and Phase 8's future ops-cancel/ops-refund actions later | Avoids the three-copies-of-the-same-tier-walk drift risk `ADR-005`'s "one key, one fact" rule already warns against for policy copy, generalized to logic | MEDIUM-HIGH — the pattern is sound and low-risk to adopt now; its actual reuse by Phase 8 cannot be verified until Phase 8 is researched |
| D-04 | LIFE-07's quote-expiry half needs **no cron** — `price_snapshots.expires_at <= now() AND booking_id IS NULL` already is the expired state (Phase 4 D-29). Only the no-show half is this phase's cron work | Directly cited from `04-CONTEXT.md` D-29: "No Cron that mutates `price_snapshots`. ... LIFE-07's no-show half stays Phase 9" | HIGH — directly cited, not re-derived |
| D-05 | The no-show sweep ships **inert by default**: a new nullable `settings_versions.no_show_grace_minutes`, seeded NULL, with the sweep's candidate query gated `WHERE no_show_grace_minutes IS NOT NULL` | Two independent owner blockers ("call attempts before a no-show" in `OWNER-ANSWERS.md`; "driver-no-show refund share" in ADR-014's "Still open" list) make any invented number a Law 04 violation; the pattern mirrors Phase 2 D-15's already-established precedent for `manage_link_validity_days` ("issuance refuses rather than inventing the window") | HIGH — the blockers are directly cited from dated owner-facing documents; the inert-gate pattern is a direct reuse of an already-accepted precedent |
| D-06 | The reminder and no-show sweeps reuse the **existing single Cron Trigger slot**, reconfigured to a higher frequency (e.g. `*/15 * * * *`), rather than requesting a second/third trigger | Cloudflare's own docs confirm multiple cron expressions can share one `scheduled()` handler (branch on `controller.cron`); the CPU-time budget for a sub-1-hour interval is 30s per invocation (official docs, fetched live) — comfortably enough for a SELECT-and-enqueue pattern, never inline work | HIGH — official Cloudflare docs, fetched live 2026-08-24 |
| D-07 | All sweep work is SELECT-and-enqueue inside `scheduled()`; the actual status write / email send happens in a new `LIFECYCLE_SWEEP` Cloudflare Queue consumer, mirroring the `STRIPE_EVENTS` fast-ack pattern Phase 7 already established | Matches `STACK.md`'s own explicit guidance ("For any sweep expected to take more than a few seconds, have `scheduled()` enqueue work onto a Queue rather than doing it inline") and Phase 7's already-proven Queue infrastructure shape | HIGH — directly cited from the project's own prior research |
| D-08 | The flight-delay shift (`shift_leg_time`) pre-checks for a conflict with an explicit `SELECT ... WHERE scheduled_range && new_range` query inside the same transaction, before the UPDATE, and only falls back to catching a real `23P01` at COMMIT as a last-resort safety net | Resolves U17's open question with the option that gives the dispatcher/cron a nameable conflict ("conflicts with VT-XX-XXXX") instead of a bare constraint-violation error; Phase 2's own §7 explicitly names this as one of the two viable resolutions | MEDIUM-HIGH — this is this research's own synthesis (U17 was explicitly left open by Phase 2 for Phase 8/9 to decide together); flagged for confirmation once Phase 8 is researched, not asserted as final |
| D-09 | LIFE-08's review-submission link **reuses** the existing `booking_access_tokens` manage token, rather than minting a dedicated token type | Fewer moving parts; the manage token's 30-day validity (ADR-014 §5) comfortably covers a post-completion review-ask window; nothing in the requirements demands a shorter window | MEDIUM — a defensible default, not the only valid design (see Assumptions Log A4) |
| D-10 | `reviews` gains a nullable `booking_id uuid references bookings(id)` column; `submit_review()` (new `SECURITY DEFINER` RPC) inserts with `published=false`, `verified=true`, `source='manual'` — Phase 6's existing OpsReviews publish/hide/reorder screen requires no changes | Direct read of `02-SCHEMA-DRAFT.md` §12 confirms `reviews` has no FK to `bookings` and no client-writable path today; direct read of `06-CONTEXT.md`/`06-RESEARCH.md` confirms Phase 6 only builds the ops-curation half, never a submission path | HIGH — both negative claims (no FK, no submission path) are directly verified by reading the actual schema draft and Phase 6's research, not assumed |
| D-11 | `booking_events.kind`'s CHECK list gets two additive values: `review.requested`, `review.submitted` | The existing list (§10) has no review-specific kind; `note.added` is the only generic catch-all and would make the ops timeline's review-related entries indistinguishable from arbitrary staff notes | MEDIUM — a reasonable additive migration; low risk either way since the CHECK list is not append-only-locked itself |
| D-12 | `template_version` for every new notification kind this phase adds follows the format `<kind>@v1` (e.g. `reminder_24h@v1`) | Neither Phase 2 (U18) nor Phase 7 (which left the column at its `''` default for `confirmation`) settled a format; this phase needs one for five new kinds and proposes the simplest versioned-slug scheme, matching the `engine_version` column's own `'quote-engine@<git-sha>'` precedent in `price_snapshots` (§9) for shape consistency | LOW-MEDIUM — genuinely unsettled by any prior phase; this is this research's own proposal, not a verified standard — flag for planner confirmation, and note Phase 7's `confirmation` template should ideally adopt the same format if it has not shipped yet by the time Phase 9 executes |

## UNCERTAIN — must be settled before or during execution

| # | Uncertainty | The check that settles it | Owner |
|---|-------------|---------------------------|-------|
| U-A | Does a leg with `status = 'no_show'` count toward the "done" bucket alongside `'completed'` for the `partially_completed`/`partially_cancelled` distinction (matching `manage_booking_cancel`'s **already-shipped** implementation), or does the enum comment's silence on `no_show` mean it needs its own category? | Write the pgTAP fixture matrix (all leg-status combinations × 1-leg/2-leg bookings) **first**, as a design exercise, before writing the trigger — the act of enumerating every combination and deciding what `bookings.status` should read for each one *is* the check that settles this, not a separate research step | Planner/executor, in the Wave 0 pgTAP file for `app.recompute_booking_status` |
| U-B | Does an all-`no_show` booking roll up to a distinct top-level `bookings.status = 'no_show'` (a third pure case, symmetric with all-cancelled/all-completed), or does it fall into `'completed'` under a "every leg completed-or-no-show" reading of the rule? | Same pgTAP matrix as U-A settles this simultaneously — it is the same underlying question about how `no_show` legs bucket | Planner/executor |
| U-C | Does `bookings.status = 'refunded'` (the standalone top-level enum value, distinct from `'cancelled'`) ever get set by the roll-up trigger, or is it vestigial — with `booking_refunds` rows being the sole "was this refunded" signal, and `bookings.status` staying `'cancelled'` forever? | Check the mock's `StatusBadge`/ops-board rendering (`app/vamos-ops-data.js`'s `BOOKING_STATUS` array includes `'refunded'` as a sibling of `'cancelled'`, but no `.dc.html` file was found in this research session showing them rendered with visibly distinct treatment) — if Phase 8's ops board or the account bookings list needs `'refunded'` to render distinctly, the roll-up (or a separate trigger reacting to `record_booking_refund`) must set it explicitly; if not, leave it unset by this phase and flag as dead vocabulary for a future cleanup | Planner, cross-checked against whichever phase (5 or 8) actually builds the customer/ops status display |
| U-D | Is the no-show grace period a single global `settings_versions.no_show_grace_minutes`, or does it need to vary by scenario (e.g., airport pickup vs. city pickup, matching the existing `airport_waiting_minutes`/`city_waiting_minutes` split)? | This research assumed one global value for simplicity; re-check against the exact wording of the still-open `OWNER-ANSWERS.md` line ("call attempts before a no-show") once the owner actually answers it — the answer itself may imply a split the way waiting time already does | Owner answer, then planner |
| U-E | Pre-check-then-defer vs. catch-`23P01`-and-re-check for the flight-delay shift's exclusion-constraint handling (U17) — this research recommends pre-check-first (D-08), but Phase 8 has not been researched yet and may reach a different conclusion for its own dispatch-swap use of the same deferred-constraint mechanism | Once Phase 8 is researched, cross-check its resolution against this document's D-08; if they disagree, extract a single shared helper both phases call rather than shipping two independently-reasoned implementations of the same low-level pattern | Phase 8's researcher, reading this document first |
| U-F | Exact `template_version` format (D-12's `<kind>@v1` proposal) — genuinely unsettled by Phase 2 (U18) or Phase 7 | Confirm at Wave 0 whether Phase 7 has executed and shipped a `confirmation` template by the time Phase 9 starts; if so, match whatever format it actually used instead of introducing a second convention | Planner, checked against Phase 7's actual shipped code (not just its research document) at Wave 0 |

## Owner blockers that touch this phase

1. **"Call attempts before a no-show" — still a live `data-tok` line in `docs/build/OWNER-ANSWERS.md`.**
   Blocks the no-show sweep from ever firing automatically against real bookings until answered.
   Does not block building or testing the sweep (D-05's inert-by-default design). Ask when needed,
   matching the project's established "ask when needed" pattern (ADR-014 §4).

2. **"Driver-no-show refund share" — listed under ADR-014's "Still open (not this sitting)."**
   Blocks the `booking_refunds.reason = 'no_driver'` path from having an automatic percentage;
   `app.compute_cancellation_refund()` should not be assumed to cover this case at all until
   answered — recommend routing `no_driver` refunds through an ops-manual path only (Phase 8
   territory) until this lands, never a guessed 100%.

3. **Stripe and Resend accounts do not exist yet** — the same blocker Phase 7 already named.
   Test-mode/sandbox de-risks Phase 9's build and most of its testing exactly as it does Phase 7's
   (see Environment Availability). Not a design blocker.

4. **The CHF price matrix is still open.** Every pgTAP fixture this phase writes for the
   refund-tier calculation must use synthetic rappen amounts, never a real figure, matching the
   project's own established `charge_gate.test.sql` precedent (Phase 2 §15).

## Proposed Phase 9 plan split

| # | Plan | Goal (one line) | File scope | Depends on | Parallel with |
|---|---|---|---|---|---|
| **P1** | **Booking status roll-up (U21)** | `app.recompute_booking_status()` + the `AFTER UPDATE OF status` trigger on `booking_legs`; `manage_booking_cancel`'s inline case expression replaced by a call to it; the full leg-status-combination pgTAP matrix that settles U-A/U-B | `packages/db/supabase/migrations/<ts>_booking_status_rollup.sql`, `tests/booking_status_rollup.test.sql` | Phase 2 Wave 5 (`booking_legs`, `manage_booking_cancel` — already landed through migration `…011`) | Nothing (foundation for every later plan) — **locally buildable today, no gate on Phase 7/8 executing** |
| **P2** | **Cancellation refund-tier calculation** | `app.compute_cancellation_refund()`; widen `manage_booking_cancel`'s return signature to carry the full refund payload without writing `booking_refunds`; `record_booking_refund()` (service-role-gated, the one append-only INSERT); pgTAP proving LIFE-03 (mutate live settings after snapshot creation, assert refund unchanged) | `packages/db/supabase/migrations/<ts>_cancellation_refund.sql`, `<ts>_record_booking_refund.sql`, `tests/cancellation_refund.test.sql` | P1; **Phase 2 Wave 6 landing** (money tables `013`–`016` — not yet executed as of this research date, same coordination note Phase 7 already flagged) | Nothing (needs P1's roll-up call inside the extended function) |
| **P3** | **Guest cancel + refund Worker route** | `POST /api/manage/[token]/cancel` — calls the extended `manage_booking_cancel`, then `stripe.refunds.create()` outside any DB transaction, then `record_booking_refund()`; `lib/lifecycle/refund.ts` | `apps/web/app/api/manage/[token]/cancel/route.ts`, `apps/web/lib/lifecycle/refund.ts` | P2; **Phase 3** (Hyperdrive wiring — not yet executed) and **Phase 7** (Stripe client construction pattern, `stripe.ts`) for real execution, though the RPC/SQL side (P1/P2) needs neither | Nothing |
| **P4** | **`manage-booking.dc.html` port** | Next.js port of the guest self-service page, wired to P3's cancel route and the existing token-gated read path (§14b RLS, already built) | `apps/web/app/(public)/manage-booking/page.tsx`, i18n additions | P3; reuses **Phase 5**'s public-page-porting pattern (peer track, not a hard code dependency) | P5–P9 |
| **P5** | **No-show grace setting + sweep query** | Additive nullable `settings_versions.no_show_grace_minutes`; `lib/lifecycle/sweep.ts`'s no-show candidate SELECT, gated inert on the NULL setting (D-05); reminder-window candidate SELECT sharing the same `date-fns-tz` clock helper (Pitfall 2) | `packages/db/supabase/migrations/<ts>_no_show_grace.sql`, `apps/web/lib/lifecycle/sweep.ts`, `apps/web/lib/lifecycle/clock.ts` | P1 (no-show write needs the roll-up trigger to exist) | P2–P4 (file-disjoint) |
| **P6** | **Cron + Queue wiring** | `wrangler.jsonc` cron-frequency change + new `LIFECYCLE_SWEEP` queue (producer+consumer, both environments); `worker.ts`'s `scheduled()` gains the real reminder/no-show cases (SELECT + enqueue only); `queue()` gains the `LIFECYCLE_SWEEP` consumer case (claim-then-send reminders, atomic no-show status write) | `apps/web/wrangler.jsonc`, `apps/web/worker.ts` | P5 | P7 |
| **P7** | **Assignment + lifecycle email templates** | `packages/emails`'s five new templates (`reminder_24h`, `assignment`, `cancellation`, `refund`, `review_request`); the `booking_events`-reactive trigger for assignment notifications (Pattern 3) | `packages/emails/src/{Reminder,Assignment,Cancellation,Refund,ReviewRequest}Email.tsx`, a small migration for the trigger | P6 (needs the claim-then-send consumer to call into it); reuses Phase 7's `packages/emails` scaffold | P8 |
| **P8** | **Flight-delay shift (LIFE-06, U17)** | `shift_leg_time()` RPC — pre-check-then-defer pattern (D-08); `flight.delayed` `booking_events` write; ops-broadcast reuse (§14f's `ops:board` topic, no new channel); DST-boundary pgTAP fixtures | `packages/db/supabase/migrations/<ts>_leg_time_shift.sql`, `tests/leg_time_shift.test.sql` | P1 (roll-up must not misfire on a mid-flight time change); **flag for Phase 8 alignment** once Phase 8 is researched (U-E) | P7 |
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
disjoint files (money/refund, cron/settings, delay-shift RPC, review schema respectively). P2 has
an external coordination note (Phase 2 Wave 6 landing timing) but no file conflict with the
other three. Wave 3: **P3** (needs P2) and **P6** (needs P5) in parallel. Wave 4: **P4** (needs
P3) and **P7** (needs P6) in parallel. Wave 5: **P10**, the phase gate, blocked on everything
above.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-SCHEMA-DRAFT.md` §3, §7, §8,
  §9, §10, §12, §13–14, §16 — direct read of the designed and partially-executed schema
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-RESEARCH.md` — U17/U18/U19/
  U20/U21/U22 uncertainty rows, direct quotes
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-CONTEXT.md` — D-06 through D-38,
  the deferred-ideas list
- `packages/db/supabase/migrations/` (directory listing) — ground truth on what has actually
  executed (through `…012`) vs. what remains designed-only (`…013`–`…016`)
- `.planning/phases/07-checkout-payment/07-RESEARCH.md` and `07-CONTEXT.md` — the Checkout
  Session architecture, the two-phase Stripe-call pattern (Pattern 2/D-05/D-06/D-07), the
  claim-then-send stuck-row-sweep design (D-14/D-17/Pitfall 4), the still-open `template_version`
  question
- `.planning/phases/04-quote-pricing-engine/04-CONTEXT.md` — D-29 (quote-expiry needs no cron),
  D-43/D-44 (payment window, manage-link validity), U-series notes
- `.planning/phases/06-ops-reference-data-content-console/06-RESEARCH.md` and `06-CONTEXT.md` —
  confirms Phase 6's `reviews` scope is publish/hide/reorder only, no submission path
- `.planning/ADR-002-waiting-allowances-null.md`, `ADR-005-cancellation-copy-settings-driven.md`,
  `ADR-006-return-trips-booking-legs.md`, `ADR-014-owner-sitting-2026-08-22.md` — direct read
- `docs/build/OWNER-ANSWERS.md`, `docs/build/GSD-LAUNCH.md` — direct read, the "call attempts
  before a no-show" blank and the original one-cron sketch
- `app/pages/manage-booking.dc.html`, `app/vamos-reviews.js`, `app/ops/OpsReviews.dc.html`,
  `app/vamos-ops-data.js` — direct read of the mocks and the client-side data contract
- `apps/web/worker.ts`, `apps/web/wrangler.jsonc` — direct read of the current Worker entry and
  cron/queue declarations
- `developers.cloudflare.com/workers/platform/limits/` — fetched live 2026-08-24, Cron Trigger
  account-level caps and the 30s/15min CPU-budget-by-interval rule
- `developers.cloudflare.com/workers/testing/vitest-integration/test-apis/` — fetched live
  2026-08-24, `createScheduledController` API shape
- `docs.stripe.com/api/refunds/create` — fetched live 2026-08-24, refund amount/currency/
  idempotency shape
- npm registry (`npm view <pkg> version`) — `date-fns-tz` 3.2.0, `@marsidev/react-turnstile`
  1.6.0, both checked live 2026-08-24

### Secondary (MEDIUM confidence)
- WebSearch aggregation on Cloudflare Cron Trigger minimum interval / per-Worker trigger count —
  multiple community sources agree (1-minute granularity, 5 free/250 paid account-level caps);
  the official docs page fetched directly did not itself state a per-*script* cap, only the
  account-level numbers, so the community-sourced per-script figure (3 free/5 paid) is not
  asserted as fact anywhere in this document
- WebSearch aggregation on `wrangler dev --test-scheduled` / `/__scheduled` local testing
  endpoint — consistent across multiple sources, not fetched from a single official page directly
  this session

### Tertiary (LOW confidence)
- The `template_version` format proposal (`<kind>@v1`, D-12) — this research's own synthesis,
  genuinely unsettled by any prior phase; flagged in both the Decisions table and the UNCERTAIN
  table, not presented as verified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; every reused package's version was either freshly
  verified live (`date-fns-tz`, `@marsidev/react-turnstile`) or cited from Phase 7's own
  live-verified research
- Architecture: MEDIUM-HIGH — the Cron/Queues/testing mechanics are HIGH (official docs, fetched
  live); the roll-up trigger and refund two-phase pattern are this research's own synthesis from
  directly-cited schema evidence, reasoned soundly but not verifiable against a built
  implementation since none exists yet — hence MEDIUM-HIGH, not HIGH
- Pitfalls: HIGH — five of the five pitfalls listed either cite the project's own prior
  `PITFALLS.md` (DST, append-only-table timing) or are directly derived from reading the actual
  schema/constraint definitions (deferred-exclusion, roll-up-trigger scope), not speculative

**Research date:** 2026-08-24
**Valid until:** 21 days — this phase depends on Phase 7 and Phase 8, neither executed yet; if
either phase's own research/planning changes the money-table shape, the `booking_notifications`
`template_version` convention, or the U17 resolution before Phase 9 executes, re-verify the
affected sections (D-02, D-08, D-12, U-E, U-F above) against whatever those phases actually
shipped, not just their research documents.
