# Phase 31: Refunds in Stripe - Research

**Researched:** 2026-10-12
**Domain:** Stripe-side refunds on a Cloudflare Worker (Next.js/OpenNext), webhook-recorded money, dashboard DC mock edits, customer copy in four languages, a nightly read-only Stripe-vs-database check
**Confidence:** HIGH on the code map and the webhook path (read in this session); MEDIUM on Stripe Dashboard URL forms and the live account id (not verifiable from the repo); the one migration question is HIGH (grants read from migrations)

Claim tags: `[VERIFIED: codebase]` read in this worktree on 2026-10-12; `[CITED: url]` official docs fetched this session; `[ASSUMED]` training knowledge or inference, listed in the Assumptions Log.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** Dashboard booking detail keeps REFUND. It opens that booking's payment in the Stripe Dashboard in a new tab. The site never sends a refund from the dashboard again. The refund-decision box goes.
- **D-02** The site keeps recording what Stripe did (existing webhook), so the booking, the dashboard money totals and the customer's account show refunded amounts.
- **D-03** Duplicate charge stays automatic: the second charge on one booking is refunded at once and he gets the mail. `settle.ts` duplicate branch unchanged.
- **D-04** Customer cancel of a paid trip: one policy line, no amount, never the word Stripe. en/de/fr/ar drafted in `31-UI-SPEC.md` for his signature.
- **D-05** Single-leg refund work is parked (`archive/fix-single-leg-refund-a46ac2ca`), not in this phase. Migration number not taken here: Phase 30 owns 20261012200000 onward; the controller asks the owner (2026-10-13).

Owner signatures (question form, 2026-10-12 ~19:05 +04, via the controller):

- **S-01** Sheets 1, 2 and 3 (`screens/`) signed as drawn.
- **S-02** Customer wording signed as written, en/de/fr/ar: cancel sheet line, Refund row, cancellation email line (`31-UI-SPEC.md` Copywriting Contract).
- **S-03** Q1 = A. When he refunds in Stripe, the customer gets a Vamos email in their language with the amount Stripe sent back. New customer copy (subject + body, en/de/fr/ar, Swiss German "ss") is drafted in the plan for his signature; not signed yet. The amount comes from the Stripe refund event; never computed or invented.
- **S-04** Q2 = A. "Refund to check" shows until Stripe records a refund or the pickup time has passed. No NO REFUND button.
- **S-05** No next-step line for "This booking has no Stripe payment to open." (ui-checker suggestion left out).

CONTEXT.md D-06..D-09 are "Recommendations on the open technical points" written by the discuss step and then accepted by the owner's sign-off on the pictures; treat them as binding unless this research shows a defect (defects are flagged below as "CONTEXT correction"):

- **D-06** Stripe page = PaymentIntent page `https://dashboard.stripe.com/{acct}/payments/{pi_...}` live, `.../{acct}/test/payments/{pi_...}` test. Mode from the Worker secret key via `stripeSecretKeyMode` (`apps/web/lib/checkout/stripe-mode.ts:25`), never the browser. `{acct}` from a new plain wrangler var `STRIPE_ACCOUNT_ID` per env; unset: path omits it. New admin-only `GET /api/staff/bookings/[id]/stripe-payments` (both mounts) returning every succeeded `booking_payments` row with a `pi_` id: kind (trip / extras), charged CHF, captured time, URL. One payment: REFUND opens it straight away; several: "Which payment?" list, one OPEN IN STRIPE per payment, newest first. Links fetched when the detail opens; click opens the tab synchronously. No per-payment mode column.
- **D-07** Keep `refund_owed_rappen`, `refund_status`, `refunded_rappen` and all `ops_refund_*` SQL as they are; no migration for them; the "Refund due" red alert becomes the neutral "Refund to check" note; a drop migration for the unused functions is a later clean-up after a week live.
- **D-08** `CancellationEmail` refund line becomes the policy line (4 languages, `packages/emails/src/messages/*.json:91-94`). "Refund issued" mail loses its staff sender (kept if Q1 = A, reused from the webhook). `RefundFailedEmail` keeps its job with copy pointing to Stripe; `OpsMustFixEmail` "send the refund again" becomes "refund it in Stripe". Paid-after-cancel / duplicate alert stays.
- **D-09** Nightly read-only refund check in the existing `0 3 * * *` branch of `apps/web/worker.ts`, own try/catch, counts only in logs, Stripe `GET /v1/refunds` last 48 h (paged, cap 500), skip refunds younger than 30 minutes, findings (a) missing on booking, (b) amount differs, (c) status differs, (d) payment belongs to no booking, plus booking `refunded_rappen` vs its refund rows; one read-only DB path; mail to info@ in English only when something is found, one "could not run" mail if Stripe does not answer; findings repeat nightly inside the 48 h window. The owner-approved mail text is in CONTEXT.md D-09. Jev: none fits; this check is the phase's automation agent.

### Claude's Discretion

CONTEXT.md has no separate discretion list. Open for the planner to recommend (this research recommends below): the exactly-once mechanism for the customer refund mail (Q1 = A), the nightly check's DB read path, the file split of the removed `refund.ts`, plan/wave slicing, and the account-id source.

### Deferred Ideas (OUT OF SCOPE)

- Single-leg refund work (parked at `archive/fix-single-leg-refund-a46ac2ca`, D-05).
- Dropping the unused `ops_refund_plan`, `ops_refund_decide`, `ops_refund_intent_sent`, `ops_refund_intent_failed`, `ops_refund_record` functions: "a later clean-up after a week live, not this phase" (D-07).
- Option B/C of Q1 (Stripe's own receipt, no email) and Option B/C of Q2 (NO REFUND button, no note): not chosen.
- A per-payment test/live mode column (D-06: test bookings are deleted by the owner's script before go-live).
</user_constraints>

<phase_requirements>
## Phase Requirements

ROADMAP.md lists `Requirements: TBD` for Phase 31 and no IDs were supplied. These IDs are **provisional**, invented here so VALIDATION.md and the plans can cite something; the planner may rename them.

| ID | Description | Research Support |
|----|-------------|------------------|
| R31-01 | Dashboard REFUND opens that booking's PaymentIntent in Stripe in a new tab (one payment direct; several: list) | Q4: new `stripe-payments` route, URL builder, `STRIPE_ACCOUNT_ID` var |
| R31-02 | The site sends no refund from the dashboard; refund routes, decision box, parsers, mail sender removed | Q5 blast radius |
| R31-03 | Refunds Stripe makes keep being recorded (booking, totals, account) | Q1: unchanged webhook path, regression tests |
| R31-04 | Duplicate-charge automatic refund unchanged | Q1: metadata `vamos_source=app`, `settle.ts:593-665` |
| R31-05 | Customer cancel of a paid trip shows the signed policy line (no amount, no "Stripe") on every customer surface and the cancellation email | Q6 |
| R31-06 | When Stripe records a refund, the customer gets a Vamos email in their language with Stripe's refund amount, once per refund id, never for duplicate-charge refunds | Q1 |
| R31-07 | "Refund to check" neutral note until a refund is recorded or pickup passed | UI-SPEC state table; Q5 |
| R31-08 | Nightly read-only reconciliation mails info@ on a mismatch | Q3 + Migrations wanted |
| R31-09 | Internal mails (`RefundFailedEmail`, `OpsMustFixEmail`) point to Stripe | Q6 |
| R31-10 | Four languages, four platform laws, gates green | Q7 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

From `/CLAUDE.md`, `/.claude/CLAUDE.md` and the owner's global rules (all binding, same authority as locked decisions):

- Bound Vamos design system is the only visual truth; no invented colour, font, radius, shadow. Four laws: no glow, no tinted yellow, `CHF 000`/`VamosLocale.money`, four languages in the same pass. `--vt-shadow-accent:none` and `.vt-input--focus{box-shadow:none}` stay in every `.dc.html`.
- Every visible string (labels, `placeholder`, `aria-label`, `title`, `alt`) in `app/vamos-i18n-dict.js` with de/fr/ar; concatenated strings as `patterns` regex; Swiss German "ss"; Arabic logical properties and `vt-dir-keep` for figures. Run `VamosLocale.coverage(root)` on every new surface.
- Check at 1440 / 1024 / 768 / 390; touch targets 44 px; nothing scrolls sideways at 390.
- Never read `localStorage.vamosLang/vamosCurrency`; never reload to apply a choice; no smooth-scroll library.
- GSD workflow: edits only through a GSD command; the phase runs in its own worktree/branch; control session ships; CI runs once on the PR (private-repo minutes are scarce), gates run locally (`pnpm gate:local`).
- Never invent prices or legal copy (S-03: the customer refund mail copy is NOT signed; the plan drafts it for his signature). Memory rules that bite this phase: owner is the only operator (say "you"); no internal ids/vendor plumbing on public pages or APIs; Worker pg client has no arrays (use `sql.json`); `postgres.js begin()` rethrows caught errors; real sandbox card payment before ship; Deploy needs `--env staging`; new i18n keys need `db:seed:gen`; DC `{{ value }}` splits sentences into text nodes.
- Jev: none fits any step here (exact money match, no probability). Automation: the nightly check (D-09) is the one unattended agent this phase adds.

## Summary

Phase 31 is mostly **removal plus three small additions**. Removal: the site-side refund sender (`lib/ops/refund.ts` `refundBooking`/`decideRefund`, two staff routes in two mounts each, parsers in `refund-map.ts`, the decision box and its handlers in `OpsDetail.dc.html`), the "Refund issued" staff sender, and several amount-bearing customer strings. Additions: (1) a read-only admin route that turns a booking's succeeded payments into Stripe Dashboard URLs, (2) a customer "refund issued" mail triggered from the existing webhook, (3) a nightly Stripe-vs-database reconciliation.

The webhook path is a single funnel: `charge.refunded`, `refund.updated`, `refund.failed` and `charge.refund.updated` all end in `handleChargeRefundedWithDeps` for succeeded refunds, which calls `stripe_charge_refunded_record` once per refund id. That SQL function is idempotent on `stripe_refund_id` and returns `outcome = 'recorded'` to exactly one caller; duplicate-charge and other app-made refunds carry `metadata.vamos_source=app` and can never return `'recorded'` (they are refused with `app_refund_pending` until the app's own row exists, then return `'already'`). That makes `outcome === 'recorded'` the natural, migration-free hook for the customer mail, with Resend's idempotency key as a second belt.

**Migrations wanted: one, and only for the nightly check.** `vamos_system` (the cron's role) has no table SELECT; `service_role` was deliberately taken off the money ledger in `20261012170000`; the repo has no existing definer that reads `booking_refunds` by Stripe refund id. The customer mail, the staff route, the URL builder, the copy changes and all removals need **no** migration. If the owner rejects any migration, the only honest alternative is to drop the database half of D-09 (the check would then compare Stripe with itself, which is not the signed behaviour).

Two CONTEXT corrections the planner must carry: (1) Phase 30 **does** touch `app/ops/OpsDetail.dc.html` (+37/-9: Assign block, five T-table lines, state, `renderVals`) and two shared DC test files, not only `app/vamos-i18n-dict.js`; (2) the live Stripe account differs from the sandbox account named in the runbooks, so `STRIPE_ACCOUNT_ID` for the staging Worker (which runs the live key) must be the **live** account id, which the repo never states.

**Primary recommendation:** Build in this order: (A) URL builder + `stripe-payments` route + trimmed `refund.ts`/`refund-map.ts` and their tests; (B) webhook customer mail on `outcome==='recorded'` (copy drafted for signature first); (C) the single read-only reader migration + nightly check + new English ops mail; (D) `OpsDetail.dc.html` / dictionary / DC tests; (E) customer copy surfaces; (F) runbook and e2e. Land Phase 30 or Phase 31 first and have the second merge `origin/main` before hand-over.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Build Stripe Dashboard URL (mode, account, `pi_`) | API / Backend (Worker) | — | Mode comes from the secret key and the account id is config; neither may reach a public page or be chosen by the browser |
| List a booking's refundable payments | API / Backend (`asStaff`, RLS) | Database (staff SELECT grants) | Admin-only, row-security-scoped read |
| Open the tab | Browser / Client (DC mock) | — | `window.open` / `<a target=_blank rel=noopener>` inside the click, URL from the API only |
| Record a Stripe refund | Database (`stripe_charge_refunded_record`) | API / Backend (queue consumer) | Idempotent definer; Worker only forwards Stripe's numbers |
| Customer "refund issued" mail | API / Backend (queue consumer) | Email (Resend) | Fires from the webhook after the record call returns `recorded` |
| Duplicate-charge refund | API / Backend (`settle.ts`) | Stripe | Unchanged |
| Nightly reconciliation | API / Backend (Worker `scheduled`) | Database (new read-only definer), Stripe | Cron already lives in `worker.ts`; DB read must be a definer because `vamos_system` is function-only |
| Policy line on cancel | Browser / Client (DC mocks, live) | Frontend Server (Next twins, mostly unreached) | Customers see the DC mocks; React twins kept consistent |
| Customer/ops copy | Static dictionaries (`vamos-i18n-dict.js`, `i18n/messages`, `packages/emails/messages`) | — | Four-language law |

## Standard Stack

### Core (all already in the repo; this phase installs nothing)

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| stripe (node SDK) | 22.6.1 `[VERIFIED: codebase apps/web/package.json:29]` | `refunds.list`, `retrieveCharge`, fetch HTTP client | The only Stripe client (`lib/checkout/stripe.ts:18-33`, `Stripe.createFetchHttpClient`) |
| resend | 6.24.0 (web) / 6.26.0 (emails) `[VERIFIED: codebase package.json]` | Customer and ops mail | `emails.send(payload, { idempotencyKey })` already used at `lib/forms/notify.ts:99` |
| postgres.js via Hyperdrive | existing | DB access through `asSystem`/`asStaff` only | `lib/db/identity.ts` is the single door; `check:db-fences` enforces |
| vitest | existing | Unit tests (`apps/web/vitest.config.ts`) | node env, `lib/**/*.test.ts`, `tests/unit/**` |
| pgTAP via `supabase test db` / lab | existing | SQL tests (`packages/db/supabase/tests`) | One new test file for the reader |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New definer reader for the nightly check | `service_role` PostgREST client (as `lib/supabase/service.ts` does for the digest) | Rejected: `20261012170000` (W5-08) revoked `service_role` from the money ledger and money functions; re-using it re-opens that hole |
| New definer reader | Cron minting staff claims for `asStaff` | Rejected: impersonation; identity door states "authority is the grant" (`identity.ts:92-98`) |
| `outcome==='recorded'` hook + Resend idempotency key | `notification_claim` (`booking_notifications`) | `notification_claim` dedupes per booking and kind only (`20260827000004_settlement_rpcs.sql:428-478`, key `booking:kind:leg`), not per refund id; per-refund dedupe needs a new function (migration) |
| `account id` var | `GET /v1/account` at runtime, or deriving it from the publishable key | Runtime call adds a Stripe round trip and may be refused for restricted keys; derivation is undocumented (`[ASSUMED]`) |

**Installation:** none. **Version verification:** versions read from `apps/web/package.json` and `packages/emails/package.json`; no registry lookup needed because nothing new is added.

## Package Legitimacy Audit

No external package is installed or changed by this phase. slopcheck is installed locally (`/opt/homebrew/bin/slopcheck`) but there is nothing to check.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                   OWNER (dashboard, admin only)                              CUSTOMER
                           |                                                       |
   booking detail opens -> GET /api/staff/bookings/:id/stripe-payments    paid cancel (DC page)
                           |  withAdmin -> asStaff (RLS) -> payments + refunded per payment      |
                           |  URL = https://dashboard.stripe.com[/acct][/test]/payments/pi_...  v
                           v  (mode from STRIPE_SECRET_KEY, acct from var)            policy line only
   REFUND (menu) --1 payment--> window.open(url,'_blank','noopener')                  (no amount, no "Stripe")
                 --2+ payments-> "Which payment?" list -> <a target=_blank>
                           |
                           v
                  STRIPE DASHBOARD  (owner refunds there)
                           |
        Stripe events: charge.refunded | refund.updated | refund.failed | charge.refund.updated
                           v
        POST /api/stripe/webhook -> record -> STRIPE_EVENTS queue -> handleStripeMessage
                           v
        money-events.ts: handleChargeRefundedWithDeps / handleRefundUpdateWithDeps
                           |  per succeeded CHF refund:
                           v
        stripe_charge_refunded_record(pi, session, re_id, amount, created, appSource)
            'recorded'  --> [NEW] mail customer once (sendRefund, Resend idempotency key re_id)
            'already'   --> nothing (replay, or app refund already written)
            P0002 app_refund_pending --> retry in 30 s (duplicate-charge refunds wait here)

   03:00 UTC cron ("0 3 * * *") -> [NEW] refund-check:
        Stripe GET /v1/refunds created in [now-48h, now-30min], <=500, read-only
                           v
        vamos_system -> [NEW] public.refund_check_read(jsonb)  (STABLE definer, read-only)
                           v
        compare (a)-(d) + booking total -> findings? -> mail info@ (English) ; none -> silence ; Stripe down -> "did not run" mail
```

### Recommended Project Structure (new and changed files)

```
apps/web/lib/checkout/stripe-dashboard-url.ts     NEW  pure URL builder next to stripe-mode.ts (validates acct_ and pi_ shapes)
apps/web/lib/ops/stripe-payments.ts               NEW  asStaff read of payments + refunded per payment + URL (replaces loadRefundPicker)
apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/stripe-payments/route.ts   NEW  GET, withAdmin
apps/web/app/api/staff/bookings/[id]/stripe-payments/route.ts                  NEW  re-export of the above (2-line pattern)
apps/web/lib/ops/refund.ts                        REMOVE (or shrink to nothing; keep RefundPayment type only if reused)
apps/web/lib/ops/refund-map.ts                    TRIM  keep sqlErrorCode, PAYMENT_CHANGED, isPaymentChanged, mapRefundSqlError, RefundFail, refundFailStatus
apps/web/lib/checkout/money-events.ts             CHANGE add optional dep mailCustomerRefund, call after 'recorded'
apps/web/lib/checkout/settle.ts                   CHANGE recordChargeRefund also returns bookingId; wire mailCustomerRefund
apps/web/lib/checkout/refund-check.ts             NEW  nightly check, WithDeps pure core + env wrapper (shape of stripe-fee.ts)
apps/web/lib/db/system-reads.ts                   CHANGE add loadRefundCheckRows wrapper for the new definer
apps/web/lib/ops/must-fix-mail.ts                 CHANGE add deliverRefundCheckAlert (or a new file) ; copy tweaks for refund-failed
apps/web/worker.ts                                CHANGE new try/catch in the "0 3 * * *" branch before its `return`
apps/web/lib/env.d.ts, wrangler.jsonc, .dev.vars.example   CHANGE STRIPE_ACCOUNT_ID
packages/emails/src/refund.ts, lib/send.ts        CHANGE sendRefund gets optional idempotencyKey; new copy keys after signature
packages/emails/src/RefundCheckEmail (new) + send helper  NEW English-only report mail (layoutHtml/layoutText, like refund.ts)
packages/emails/src/CancellationEmail.tsx + messages/*.json   CHANGE one policy key
packages/db/supabase/migrations/20261012220000_refund_check_reader.sql   NEW (see Migrations wanted)
packages/db/supabase/tests/refund_check_reader.test.sql             NEW pgTAP
app/ops/OpsDetail.dc.html, app/vamos-i18n-dict.js, app/pages/{booking-detail,manage-booking}.dc.html, app/vamos-manage-ticket.js   CHANGE
apps/web/i18n/messages/{en,de,fr,ar}.json         CHANGE checkout.cancelSheetFull/Ops, refundPendingOps (React twins)
docs/runbook/refunds.md                           REWRITE (LAUNCH-07; 40 lines, still describes the in-app Refund panel)
```

### Q1. Webhook path and the customer refund mail (answers with evidence)

**Which events carry the refund id and amount.** `moneyEventKind` (`money-events.ts:143-148`) maps `charge.refunded` to `charge_refunded` and `refund.failed | refund.updated | charge.refund.updated` (`:136-140`) to `refund_update`. `charge.refunded`: the consumer re-reads the charge with `refunds` expanded and paged (`stripe.ts:288-314`, called from `settle.ts:943`) and `handleChargeRefundedWithDeps` (`:208-306`) loops every refund (`:240-270`). A refund update re-reads the refund (`retrieveRefund`, `stripe.ts:336`) and, when `status === "succeeded"`, re-reads its charge and calls the **same** function (`:338-355`). So one loop sees every refund: `refund.id`, `refund.amount` (rappen; non-CHF refunds are skipped at `:246`), `refund.created`, `refund.metadata.vamos_source` (`:248-255`). `[VERIFIED: codebase]`

**Idempotent per refund id.** `stripe_charge_refunded_record` (`20261012160000_refund_ledger_mirroring.sql:698-846`): returns `'already'` when `booking_refunds.stripe_refund_id` exists (`:727-735`; the column is `unique`, `20260823000014_payments_refunds.sql:157`); locks the payment row `for update` first (`:737-743`) so two events racing for the same refund serialize; refuses app-made refunds with `app_refund_pending` (`:757-759`); inserts reason `stripe_dashboard` (`:795`), bumps `bookings.refunded_rappen` and `refund_status` (`:809-827`), writes `booking_events` `refund.issued` (`:829-842`); returns `'recorded'` (`:844`). Only the one call that inserts returns `'recorded'`. `[VERIFIED: codebase]`

**What the TS side drops.** `settle.ts:946-960` returns only `{ outcome }`. The SQL also returns `booking_id` (`:706-710`). Extend the TS return to `{ outcome, bookingId }` (no migration).

**Hook point.** In `handleChargeRefundedWithDeps`, immediately after `recordChargeRefund` resolves with `outcome === "recorded"` (`money-events.ts:248-260`), call a new optional dep `mailCustomerRefund?: (input: { bookingId; stripeRefundId; refundRappen }) => Promise<void>`. It must **never** change the `HandleResult` (a mail failure is logged at error level and sent to info@ as an ops alert, mirroring "A mail failure never turns that into a retry" in `notify.ts:7-10`).

**Telling duplicate-charge refunds apart.** App-made refunds are created by `createRefund` (`stripe.ts:206-237`) with `metadata: { vamos_source: "app", booking_id, payment_id, reason, ... }`; the duplicate/paid-after-cancel reasons are `duplicate_charge | paid_after_cancel | test_booking | requote_superseded` (`20260928100000_settle_revive_pi_duplicate.sql:719-726`), the missing-booking one is `booking_missing` with no payment row. The webhook passes `appSource` (`money-events.ts:254`); the SQL refuses such a refund until the app row exists and then returns `'already'`, so **`'recorded'` can never be an app refund**. The Stripe idempotency key (`refund:${booking}:${payment}:${reason}`, `settle.ts:624`) is only an HTTP header and is not on the refund object; do not use it. Belt: also skip when `refund.metadata.vamos_source === "app"` before mailing. `[VERIFIED: codebase]`

**Exactly-once options (decision for the planner, recommendation first):**

| Option | Migration | Guarantee | Failure behaviour |
|--------|-----------|-----------|-------------------|
| **N1 (recommended)**: mail only on `outcome==='recorded'`; Resend `idempotencyKey = "refund-mail:" + re_id` (precedent `forms/notify.ts:99`) | none | Never twice (single `'recorded'` caller + 24 h Resend dedupe `[ASSUMED]`); at-most-once delivered | A failed send or a Worker death after the commit loses the mail; failure is logged and mailed to info@; booking page still shows the refund |
| N2: persist "mailed" on the Stripe refund (`refunds.update` metadata `vamos_customer_mail`) and mail whenever it is absent | none | Retry-safe, exactly-once in practice | Adds a Stripe write path and a second failure mode; rejects "Worker never writes to Stripe" in spirit (D-09 is about the nightly check only) |
| M1: new definer `notification_claim_refund(booking, re_id, locale, version)` inserting `booking_notifications` kind `'refund'` with dedupe `booking:refund:re_...`, settled by the existing `notification_settle` | yes (small, function only) | True exactly-once with retry of a failed send | Needs the live apply ritual; could ride in the same file as the reader |

Why not plain `notification_claim`: its dedupe key is `booking:kind:leg` (`20260827000004:428-478`), so a booking with two Stripe refunds would only ever mail once. The kind check (`20260823000014:218`) already allows `'refund'`, so M1 needs no constraint change. **Latent issue found, outside this phase:** `notify-lifecycle.ts:42-50` claims kinds `refund_failed`, `assignment_customer`, `time_change`, `flight_no`, which are **not** in that check list (`confirmation, reminder_24h, assignment, cancellation, refund, review_request, manage_link_resend`) and no later migration alters it. Either live differs from the files or those claims fail with 23514; the controller should read `pg_get_constraintdef` of `booking_notifications_kind_check` live (read-only) before the plan relies on lifecycle claims. N1 does not depend on it.

**Reusing the staff "Refund issued" mail.** It fits, with changes. `sendRefund` (`packages/emails/src/lib/send.ts:377`) renders `renderRefundEmail` (`packages/emails/src/refund.ts`) in four languages, with an amount variant (`issuedRestAmount`), Arabic LTR isolation of the amount, and `formatPaidTotal`. Recipients: `refundMailRecipients(contactEmail, payerEmail)` (`send.ts:365`, D-60: contact plus company payer if different). Language: the booking's own locale through `emailLocale(result.locale)` (old route `refund/route.ts:34-37,67-80`); name `contact_name`. The new caller needs `booking.locale/contact_name/contact_email/payer_email/reference`: read them with the existing definer `checkout_booking_for_email(booking_id)` (returns exactly `reference, locale, contact_name, contact_email, payer_email, ...`, `20260930100000_confirmation_mail_definer.sql:662-684`; `vamos_system` has EXECUTE; pattern at `notify.ts:306-313`). Changes: add optional `idempotencyKey` to `sendRefund`; amount is now **this refund's** `refund.amount` (the old route passed the booking's running total); the existing English/German/French/Arabic strings are marked "written by the builder for the owner to read" in `refund.ts` and are **not owner-signed**, and S-03 requires new copy drafted for signature ("CHF 40.00 is on its way back to the card you paid with"). Plan task: draft four-language subject + body, owner signs, then replace `COPY` (and `refund.test.ts` snapshots).

### Q2. Outbox / kinds that would need a migration

`booking_notifications.kind` check = 7 values incl. `'refund'` (`20260823000014_payments_refunds.sql:218`). `booking_events.kind` check is rewritten by `do $$` blocks per migration (`20261012160000:120-130`); N1 writes no event. So the recommended design needs **no** new kind and **no** migration. A new kind (only if the owner wants a visible "customer mailed" history event) would be a `booking_events_kind_check` rewrite: not recommended.

### Q3. Nightly check

**Branch.** `worker.ts:123` `if (controller.cron === "0 3 * * *") { ... return; }` runs only the notification sweep and the Meta sweep, each in its own try/catch (`:124-139`), then returns, so the hourly branch does not run at 03:00. Add a third try/catch before the `return`, logging counts only (`emit("info","refund_check",{ stripeRefunds, findings, ... })`). `wrangler.jsonc:141,352` list both crons. `[VERIFIED: codebase]`

**Stripe client.** `stripeFromEnv` (`stripe.ts:18-33`) = `new Stripe(key, { httpClient: Stripe.createFetchHttpClient(), apiVersion "2026-08-26.dahlia", maxNetworkRetries: 2, timeout: 10_000 })`: fetch-based. List refunds with `stripe.refunds.list({ created: { gte, lt }, limit: 100 })`; the API takes `created` (object), `limit` 1-100, `starting_after`, `payment_intent`, `charge`, newest first `[CITED: docs.stripe.com/api/refunds/list]`; `autoPagingToArray({ limit: 500 })` exists in the SDK types (`node_modules/stripe/cjs/autoPagination.d.ts:12`) and is the one-liner for the "paged, capped at 500" rule; if exactly 500 come back, say "truncated" in the mail.

**DB reads from cron: `asSystem` cannot read these tables.** `vamos_system` starts at zero (`20260827000002_checkout_roles.sql:50-52` revokes all tables/functions), gets EXECUTE on specific definers only, and has no SELECT on `bookings`, `booking_payments`, `booking_refunds` (`system-reads.ts:1-9`: "every raw table statement issued through asSystem fails with 42501"; `resolve-booking-id.ts:1-3`; memory `customer-column-grants`). `service_role` was taken off the money ledger and money functions by `20261012170000_db_privilege_hardening.sql` (W5-08, `:16-21,78-113`). `asStaff` needs real staff JWT claims and must not be faked by cron. There is **no existing definer** that reads a refund by Stripe refund id (checked all migrations: `grep booking_refunds`; the `20260930210000_system_role_narrow_reads.sql` readers are listed at `system-reads.ts` and none cover refunds). Therefore a read-only definer is required: see **Migrations wanted**.

**Alert mail path.** `must-fix-mail.ts`: `sendMustFixOrThrow` (`:42`) → `sendOpsMustFix` to `SUPPORT_EMAIL = info@vamostaxi.site` (`contact-channels.ts:15`); `deliverStuckPaymentAlert` (`:107`) is the pattern; failures throw `MustFixMailError`. But `OpsMustFixEmail` carries only trips + `{eventId,eventType,objectId}` (`OpsMustFixEmail.tsx:46-58`), so it cannot hold the signed D-09 body (lists of references, amounts, `re_`/`pi_` ids). Add a small English-only mail in `packages/emails` built like `refund.ts` (`layoutHtml`/`layoutText`, no React tree needed) plus `sendRefundCheck` in `send.ts`, and `deliverRefundCheckAlert` in `must-fix-mail.ts` that throws on failure. Note the tension (flag, not blocker): money alerts today are "ids and the booking reference only, never a name, e-mail or amount" (`money-events.ts:96`, D-06 of the earlier phase), while the owner-signed D-09 text contains CHF amounts and references to his own inbox. Keep amounts in that internal mail, keep **logs** to counts only, and never include names or e-mails.

**Findings to exclude to avoid permanent noise.** Stripe refunds with `metadata.vamos_reason === "booking_missing"` (`settle.ts:333-339`) have no payment row by design and already mail ops; skip them from "(d) not linked". Refunds with `status` `pending`/`requires_action` are in flight: skip; `failed`/`canceled` compare against the reversal row. Duplicate-charge refunds have a `booking_refunds` row written by `checkout_duplicate_refund_record` with reason `duplicate_charge|paid_after_cancel|test_booking|requote_superseded` and, for `duplicate_charge`, do **not** count toward `bookings.refunded_rappen` (`20260928100000:765-783`; `stripe_charge_refunded_record:806-827` also skips `status='duplicate'` payments), so the "booking total vs rows" test must exclude refunds on `duplicate` payment rows and refunds that have a `booking_refund_reversals` row.

**Can it be done without a migration?** No (above). It can be done with exactly one additive, function-only migration.

### Q4. Staff route `GET .../stripe-payments`

- **Auth.** `withAdmin` (`lib/ops/staff-json.ts:128`): requires an admin session, rejects document navigations with 404 (`:67-83`), checks the staff row is still active (S13), CSRF only for non-GET. Use `withAdmin`, not `withStaff` (UI-SPEC: admin only).
- **Booking key parsing.** Copy the `bookingKey(request)` helper of the old route (`refund/route.ts:25-32`: split path, `lastIndexOf("bookings")`, next segment, reject the literal route name) and `resolveStaffBookingId` (`lib/ops/resolve-booking-id.ts`, `asStaff`, `erased_at is null`, id or reference). Answer 404 `not-found` for unknown/other keys (no existence oracle beyond what staff may see).
- **Reading payments.** Reuse the payments query of `readRefundState` (`refund.ts:~139-165`), as `asStaff` (`vamos_staff` has SELECT: `20260823000023_rls_staff.sql:90`): `booking_payments` where `booking_id = $1`, `status = 'succeeded'` (CONTEXT/UI-SPEC say succeeded; `readRefundState` uses `captured_at is not null`, which also includes `duplicate` rows: filter on `status`), `stripe_payment_intent_id like 'pi\_%'` (a legacy `cs_` id stays in the column until write-back, `20260930100000:60-65`), kind = `exists (select 1 from booking_edit_requests e where e.extra_snapshot_id = p.snapshot_id)` → `extra` else `trip`. `refunded` = `sum(booking_refunds.refund_rappen)` for the payment **excluding** rows that have a `booking_refund_reversals` row; `leftRappen = max(0, charged − refunded)` (`refund.ts:~150-190`). Order newest first (`captured_at desc nulls last, id desc`). Response `jsonOk([{ kind, chargedRappen, leftRappen, capturedAt, url }])` (UI-SPEC shape). The `intents` join in `readRefundState` is not needed.
- **Both mounts.** Real handler under `app/[locale]/(ops)/api/staff/bookings/[id]/stripe-payments/route.ts`; the plain mount is two lines (`export const dynamic = "force-dynamic"; export { GET } from "../../../../../[locale]/(ops)/api/staff/bookings/[id]/stripe-payments/route";`), same as `pay-link/route.ts`.
- **Mode and URL.** `stripeSecretKeyMode(env.STRIPE_SECRET_KEY)` (`stripe-mode.ts:25`) returns `live | test | null`; null → respond with an empty list or 503, never guess. Builder (pure, unit-testable, no I/O): fixed origin `https://dashboard.stripe.com`, optional `/acct_...` only if it matches `^acct_[A-Za-z0-9]{8,64}$`, `/test` only for `test`, `/payments/` + the `pi_` id only if it matches `^pi_[A-Za-z0-9_]{1,250}$` (same shape discipline as `STRIPE_PAYMENT_ID` in `stripe-fee.ts:39`); anything else → no URL for that payment (the row is dropped, so "none" state shows). `[ASSUMED]` URL forms `/payments/pi_…`, `/test/payments/pi_…`, `/acct_…/test/payments/pi_…` (search confirmed the `/test/` dashboard prefix exists; no official page spells out the PaymentIntent path): verify by opening one real payment in each mode during the pre-ship sandbox payment (memory `real-card-payment-before-ship`).
- **Account id source (CONTEXT correction).** Runbooks name the **sandbox** account `acct_1UIZmqHcNp9GZYjz` (`docs/runbook/local-harness-26.3.md:42`, `.planning/prompts/00-common-rules.md:44`). But the Worker `vamos` (wrangler `env.staging`) runs the **live** key (`lib/env.d.ts:361-366`) and its publishable key is `pk_live_51UIZmAQbJiSLxJfu…` (`wrangler.jsonc:75`; accepted by `stripe-sandbox-only.test.ts:48-55`). Audit W1-17 infers the live account is `acct_1UIZmAQbJiSLxJfu`, unconfirmed by the owner (`.planning/audits/2026-10-09-stripe-W1.md:36`). So `env.staging.vars.STRIPE_ACCOUNT_ID` must be the live account id (owner to confirm), `.dev.vars.example` carries the sandbox one for the lab, and `env.production` (still `pk_test_placeholder`, `wrangler.jsonc:289`) stays unset. Leaving it unset must keep working (path without account), and a bad value must be dropped by the regex, not passed through.
- **Where things live.** Declare `STRIPE_ACCOUNT_ID?: string` in `lib/env.d.ts` (next to `STRIPE_PUBLISHABLE_KEY`, `:381`); add to `wrangler.jsonc` vars of `env.staging` (after `:76`) and, if wanted, `env.production`; add a line to `apps/web/.dev.vars.example` (`:58-64`). `check:public-env` (`scripts/check-next-public-allowlist.mjs`, `public-env-allowlist.json`) only flags `NEXT_PUBLIC_*` names and forbidden credential names in the built client bundle; `STRIPE_ACCOUNT_ID` is neither, so no script change is needed as long as the id is used only in server code and never serialised into a page. `stripe-sandbox-only.test.ts` greps for key literals and the retired account suffix; an `acct_` literal in `wrangler.jsonc` is fine.

### Q5. Removal blast radius (every caller and test)

Source (all read in this session):

| File | Action |
|------|--------|
| `lib/ops/refund.ts` (587 lines): `refundBooking` :354, `decideRefund` :552, `readRefundState` :111, `loadRefundPicker` :210, imports of `createRefund/findRefundByIntent/retrieveRefund/payoutFactsFromRefund` | Delete; payments read moves to the new `stripe-payments.ts`. After removal `stripe.ts:findRefundByIntent` (:244) and `paid-cancel.ts:payoutFactsFromRefund` (:62) may have no production caller: keep (own tests) or delete in the same pass, planner's call |
| `lib/ops/refund-map.ts`: `parseRefundBody` :157, `RefundRequest`/`ParsedRefundBody` :122-155, `parseRefundDecision`/`RefundDecision` :220-232, `RefundPart/RefundOk/RefundPartial/RefundResult` :10-42, `stripeFeeRappen` :111 (only used by `refund.ts`/its test) | Remove those. **Keep** `sqlErrorCode`, `PAYMENT_CHANGED`, `isPaymentChanged`, `mapRefundSqlError`, `RefundFail`, `refundFailStatus`: imported by `bookings-write.ts:14`, `edit-request-map.ts:6`, `booking-change-map.ts:11` |
| `app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts` (POST+GET) and `.../refund-decision/route.ts`; plain mounts under `app/api/staff/...` | Delete all four |
| `packages/emails` `renderRefundEmail`, `sendRefund`, `refundMailRecipients` | **Keep** (Q1 = A reuses them); only the staff route caller disappears |
| `lib/checkout/settle.ts:910-920 (refund dep)`, `stripe.ts:createRefund` | Keep (duplicate charge) |

Tests:

| Test | Action |
|------|--------|
| `lib/ops/refund-by-hand.test.ts` (597), `refund-by-hand.local.test.ts` (196), `ops-refund-review-dc.test.ts` (273) | Delete; replace the DC pins with a new `ops-refund-stripe-dc.test.ts` (menu item, T keys in 4 languages, no POST to `/refund`, no `data-ops-refund-pick`) |
| `lib/ops/refund.test.ts` (361: parsers, `mapRefundSqlError`, `stripeFeeRappen`, route, mail) | Rewrite: keep the `mapRefundSqlError` cases (also covered by `payment-changed.test.ts`), add URL-builder and `stripe-payments` tests |
| `lib/ops/payment-changed.test.ts` (457: imports `refundBooking`; "Refund" case ~:169; route source pin :130-131) | Edit: drop the Refund-plan case and the refund-route pin, keep the maps and neighbours |
| `lib/ops/refusal-rpc-errors.test.ts` (207: `decideRefund`, `readRefundState`) | Edit: drop the decide/refund sections |
| `lib/ops/booking-change.local.test.ts` (250: calls `refundBooking`) | Rewrite the tail: a cheaper change leaves `refund_owed` and sends no refund (the e2e already asserts "Stripe stand-in got no refund call") |
| `lib/ops/ops-dc-dash-design.test.ts` §1b (:316-415: refund panel, `markRefund`, `refundFormShown`, POST `/refund`) | Rewrite §1b for the new menu item/links |
| `lib/ops/ops-toast-tone-dc.test.ts` ("refund" describe :438-445, `markRefund`) and the copy "Use Refund for the difference." (:436) | Rewrite |
| `lib/ops/ops-p6-server-dc.test.ts` (:42-49: `tripCreditBody`/`classCreditBody` counts, `tRefundBody`) | Rewrite with the new notes (UI-SPEC deletes those keys) |
| **End-anchor pins on `markRefund:`**: `lib/ops/customers-board.test.ts:104`, `ops-class-change-dc.test.ts:52`, `ops-dc-u08.test.ts:231`, `ops-p6-edit-dc.test.ts:79` slice the `saveEdit` source up to `markRefund:` | Re-anchor (e.g. on the next property) or they throw when `markRefund` is deleted |
| `lib/ops/ops-detail-i18n.test.ts` (T key parity en/de/fr/ar) | Keep; it will enforce the new keys in all four languages |
| `lib/ops/class-change-customer-line.test.ts` (:88-98 `refundLine` strings), `tests/unit/manage-ticket-account-refund.test.ts`, `tests/unit/account-booking-details-refund.test.ts` | Update to the policy line / no owed amount on cancel |
| `lib/lifecycle/paid-cancel.test.ts` (:227-255 `refundLine` values, amounts), `staff-cancel-by-hand.test.ts` (:93,102), `customer-resend.test.ts`, `customer-paths.local.test.ts:133`, `notify-cancellation.test.ts` | Update per the `refundLine` collapse |
| `lib/legal/refund-texts-20-10.test.ts` (pins T2 cancel sheet, T4/T5 email, ROW "Full refund · sent by our team" byte for byte to `.planning/decisions/2026-09-30-refunds-by-hand.md`) | **Rewrite**: T1 and T3 (policy page, signed earlier) stay; T2, T4, T5 and ROW now come from a NEW decision file holding the 2026-10-12 signed wording tables (write `.planning/decisions/2026-10-12-refunds-in-stripe-wording.md` or extend the existing decision file); also the `banned` list can gain "our team decides" for the touched surfaces only |
| `packages/emails/src/refund.test.ts`, `layout.test.ts` | Keep; update for new copy; `OpsMustFixEmail.test.tsx` (refund-failed copy) update |
| `tests/e2e-worker/p6-browser.e2e.mjs:274-281,482-505` ("Trip changed. Refund due: CHF…" toast, `getByText("Refund due")`, `[data-ops-refund-region]`) and `fakes.mjs:104-108` (Stripe stand-in `POST /refunds`; add a `GET /refunds` for the nightly check if exercised) | Update expectations to "Class/Trip changed. Difference to refund: …"; lab-only, not in `gate:local` |
| `tests/integration/manage-booking-money-driver-260929.spec.ts:49-57` | Update the cancel answer fixture (no amount) |
| `docs/runbook/refunds.md` | Rewrite |

Not touched: `settle.test.ts`/`money-events.test.ts` duplicate and webhook tests (extend, never weaken), pgTAP refund suites (no SQL change for the removal).

### Q6. Customer side

- **Server.** `finishPaidCancel` (`lib/lifecycle/paid-cancel.ts:176-197`) computes `refundLine` (`full_captured | pending_ops | none`) and returns `refundRappen`; the two cancel routes echo `refundMode/refundStatus/refundRappen` (`app/api/account/bookings/paid-cancel/route.ts:54-62`, `app/api/manage/cancel/route.ts:58-67`). The DC pages keep reading `result.body.refundStatus` and use `refundRappen` as `refundOwedRappen` (`booking-detail.dc.html:957`, `manage-booking.dc.html:965`) to choose between "full refund" and "under review" copy (`:1175-1176`). Drop the amount from the answers and the branch from the pages. `refundStatus` stays `pending_ops` so the dashboard note and totals still work.
- **Reads that carry an owed amount.** `app/api/manage/booking/route.ts:172-201` and `app/api/account/bookings/details/route.ts:59-82` return `refundOwedRappen`; CONTEXT says "no owed amount for a cancel; refunded amount KEEP". The class/trip difference line (`vamos-manage-ticket.js:280,284`, `changeCreditLine` :288+) still needs `refundOwedRappen` for non-cancelled bookings, so only hide it for cancelled/ended statuses (the function already returns "" for those: `changeCreditLine` returns "" when `bs` is cancelled/refunded/partially_cancelled).
- **Live surfaces (DC mocks).** `app/pages/booking-detail.dc.html:487-495,540-552` and `manage-booking.dc.html:497-505,550-562`: two cancel-sheet paragraphs become one signed line; the "Refund" card variants (`refundFull`, `refundReview`) collapse (UI-SPEC "dead card" note: the card is never rendered while `isCancelled:false`, keep it correct anyway). `vamos-manage-ticket.js:269` (`refundLine`) → one value. **Not in CONTEXT's list but also promises a refund:** `cancelSub` (`booking-detail.dc.html:~1154`: "See what comes back at this notice before you decide." / "See the refund you are due before anything is confirmed.") and the matching lines in `manage-booking.dc.html`. Owner-signed wording does not cover them: ask the owner (Open Question 4) or leave and document.
- **Dictionary.** `app/vamos-i18n-dict.js` lines 1500-1502, 1845, 1861-1865 hold the old strings; new strings are keyed by the English text. Because the dict is shared with Phase 30, edit only these entries and add new ones beside them (Phase 30 appends dashboard class strings and edits the About fleet entry).
- **React twins (reach almost nobody, keep consistent).** `apps/web/i18n/messages/{en,de,fr,ar}.json:573-575` (`checkout.cancelSheetFull`, `cancelSheetOps`, `refundPendingOps`; `refundedToCard` KEEP). The key `refundPendingOps` is also read by `lib/checkout/voucher-badge.ts:29,38` and `components/booking/BookingVoucher.tsx:333-345` ("Refund under review" badge): change the value to the signed Refund-row wording; do not rename the key without updating `voucher-badge.test.ts`, `ops/voucher.test.ts:58`. `app/[locale]/confirmation/[ref]/page.tsx:63` passes `refundOwedRappen: null`. Per memory the Next legal/home pages reach no customer, so no live-surface risk, but `pnpm i18n:check` and `db:seed:gen` must pass.
- **Email.** `packages/emails/src/CancellationEmail.tsx:24-28` maps `pending_ops` and `full_captured` to two keys (`messages/*.json:92-93`). Collapse to one key (UI-SPEC suggests `refundPolicy`) with the signed long sentence; keep `refundNone` (`:94`) for "none". `customer-resend.ts:41 refundLineOf` also builds this line for resends: collapse in step. Also `OpsMustFixEmail` `refundFailedBody` (`messages/*.json:82`) and `differenceNotAppliedBody` (:78, "Send it back from the dashboard") need "refund it in Stripe" wording; `refundFailed.body` (:100) already says "Retry the refund in Stripe".

### Q7. Gates (what a plan must run)

- `pnpm gate:local` = `check:public-env && typecheck && lint:css && lint && i18n:check && check:legal-claims && check:numbers && build && test:unit && test:db-lab` (`package.json` scripts). `test:unit` = `test:scripts && pnpm -r test`; `apps/web` `test` runs `node ../../scripts/sync-dc-mock-to-public.mjs && vitest run` (DC tests read the synced public copy; `apps/web/public/app/` is gitignored and regenerated).
- Per task (agents): `pnpm --filter web exec vitest run <touched files>`; the lead runs the full gates once (memory `parallel-agents-gate-load`).
- Extra gates when relevant: `pnpm db:seed:check` (and `db:seed:gen` after `apps/web/i18n/messages/*.json` changes, bare digits need `$meta.noParamKeys`: memory `new-i18n-keys-gates`), `pnpm db:types:check` (only with the reader migration), `pnpm check:db-fences`, pgTAP via `pnpm db:test` / `test:db-lab`, `*.local.test.ts` need `VAMOS_LOCAL_DB_PORT`.
- DC work: run `VamosLocale.coverage(root)` per new element in de/fr/ar (UI-SPEC deviation 6); render harness `.planning/phases/31-refunds-in-stripe/tools/render.mjs`; remove `apps/web/.next-*` build folders after dev-server specs (memory `test-build-folders-hang-gates`).
- Ship-time (his word, not the plan's): a real sandbox card payment and a Stripe-made refund on the local/staging Worker to see the webhook record + customer mail; migration applied verbatim with md5 guard and read-back by the controller.

### Q8. File overlap with Phase 30 (branch `origin/phase-30-vehicle-class-lifecycle` at `63fbc003`)

`git diff --name-only origin/main...origin/phase-30-vehicle-class-lifecycle` (non-planning files): `app/home/VehicleClasses.dc.html`, `app/pages/VehicleClasses.dc.html`, `app/ops/{OpsDash,OpsDetail,OpsFleet,OpsPricing,OpsSidebar,OpsSoon,OpsTable,ops}.dc.html`, `app/vamos-i18n-dict.js`, `app/vamos-ops-data.js`, and tests `lib/ops/{fleet-persist,ops-dc-arabic-count-lines,ops-dc-chauffeur-class,ops-dc-editor-foot,ops-dc-p4}.test.ts`. Its plans also list migrations `20261012200000/210000` and `database.types.ts` (30-01).

- **CONTEXT correction:** `app/ops/OpsDetail.dc.html` is in Phase 30's diff (+37/-9): the Assign block, `assignableChauffeurs(…, retiredIds)`, `AR_COUNT`, five T-table lines (`actions:… noDriversClass` line in en/de/fr/ar, `OpsDetail:853-1270` area), `state` (adds `classRows`), `renderVals`. Phase 31 edits the same file's T tables (deleting ~20 keys, adding ~12), state, `renderVals` and markup, so expect hunks within a few lines of each other (`markRefund`/`saveEdit` line sits 2-3 lines from Phase 30's `actions:` line). Also `app/ops/OpsDash.dc.html` is touched by Phase 30; Phase 31 only reads its money totals (KEEP).
- Shared: `app/vamos-i18n-dict.js` (different entries), `ROADMAP.md`/`STATE.md`, and `lib/ops/ops-dc-p4.test.ts`, `ops-dc-chauffeur-class.test.ts` (both read `OpsDetail`; run them after merging).
- **Migration/`database.types.ts`:** the reader migration adds a function, so `packages/db/database.types.ts` is regenerated (`db:types:check`) and will conflict with 30-01. Mitigation: land Phase 30 first, or regenerate after merging `origin/main`; the CONTEXT claim "Phase 31 keeps `database.types.ts` out of Phase 30's way" only holds for the no-migration part of this phase.
- Rule: whichever lands second merges `origin/main`, resolves T lines by keeping both key sets, and re-runs `ops-dc-*` tests. Migration numbers do not collide: Phase 31 waits for a number from the controller (Phase 30 owns 20261012200000 onward).

### Pattern 1: Hook the customer mail after the record call

```ts
// Source: apps/web/lib/checkout/money-events.ts:247-260 (existing loop), extended
const { outcome, bookingId } = await deps.recordChargeRefund({ ...existing });
deps.emit("info", "charge_refund_recorded", { eventId: message.eventId, refundId: refund.id, outcome });
if (outcome === "recorded" && bookingId && refund.metadata?.vamos_source !== "app" && deps.mailCustomerRefund) {
  try {
    await deps.mailCustomerRefund({ bookingId, stripeRefundId: refund.id, refundRappen: refund.amount });
  } catch {
    // The refund is recorded. A mail that did not go out never turns into a retry (a retry would answer 'already').
    deps.emit("error", "customer_refund_mail_failed", { eventId: message.eventId, refundId: refund.id });
  }
}
```

### Pattern 2: Pure URL builder (no I/O, unit tested)

```ts
// New: apps/web/lib/checkout/stripe-dashboard-url.ts (shape only)
const ACCT = /^acct_[A-Za-z0-9]{8,64}$/;
const PI = /^pi_[A-Za-z0-9_]{1,250}$/;
export function stripePaymentUrl(i: { mode: "live" | "test" | null; accountId?: string; paymentIntentId: string }): string | null {
  if (!i.mode || !PI.test(i.paymentIntentId)) return null;
  const acct = i.accountId && ACCT.test(i.accountId) ? `/${i.accountId}` : "";
  return `https://dashboard.stripe.com${acct}${i.mode === "test" ? "/test" : ""}/payments/${i.paymentIntentId}`;
}
```

### Pattern 3: Nightly check shape (copy `stripe-fee.ts`)

`refundCheckWithDeps(deps)` pure (inputs: `listStripeRefunds`, `readSite(rows)`, `sendAlert`, `emit`) + `refundCheck(env)` wrapper, a `*.test.ts` for the pure core and a `*.local.test.ts` for the reader (precedent: `stripe-fee.ts` + `checkout_payment_fee_pending` in `20261007290000_stripe_fee_record.sql`, `stripe-events-sweep.ts`). Pass the Stripe list to the reader with `sql.json(...)`, never a JS array or `JSON.stringify(x)::jsonb` (memory `worker-pg-client-no-arrays`).

### Anti-Patterns to Avoid

- **Computing the refund amount.** The mail and any display use `refund.amount` from Stripe only (S-03). Never `charged − refunded`.
- **Mailing on `'already'`.** It also returns for event replays and for app refunds; that is how duplicates would start.
- **Letting a mail failure retry the event.** The next run returns `'already'`; the retry would also redo the record loop for sibling refunds.
- **Reading money tables as `vamos_system`, or reviving `service_role`, or faking staff claims in cron.**
- **Building the URL in the browser or from request data.** Mode, account and `pi_` id come from server config and the database; validate shapes.
- **Deleting `markRefund` without re-anchoring the four DC tests that slice up to it.**
- **Renaming `refundPendingOps` in only one place** (voucher-badge, BookingVoucher and tests read it).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Paging Stripe's refund list | A cursor loop | `stripe.refunds.list({created,limit:100}).autoPagingToArray({limit:500})` | Built into the SDK `[VERIFIED: node_modules/stripe/cjs/autoPagination.d.ts:12]` |
| Customer recipient logic | New address handling | `refundMailRecipients` (contact + payer if different) | D-60, already tested |
| Four-language refund mail shell | New template | `renderRefundEmail` (+ `formatPaidTotal`, Arabic LTR isolation) | Layout, RTL and amount formatting are solved |
| Mail dedupe | A homemade table | Single `'recorded'` outcome + Resend `idempotencyKey`; or the existing `booking_notifications` via a function if M1 is chosen | Precedents exist; a new table is a bigger migration |
| Ops alert mail failure handling | Swallowed errors | `MustFixMailError` / `sendMustFixOrThrow` pattern | W4-02: "nobody was told" must be an error |
| Reading money tables from cron | Raw SQL as `vamos_system` | Definer function wrapper in `lib/db/system-reads.ts` | `system-reads.ts:1-9` rule; `check:db-fences` |
| Stripe key mode | String sniffing in new code | `stripeSecretKeyMode` | One place, tested (`stripe-mode.test.ts`) |
| Dashboard money totals | Recomputing refunds | Existing `booking_refunds` / `bookings.refunded_rappen` (`OpsDash.dc.html:274-322`) | Webhook already mirrors them |

**Key insight:** every hard part (idempotent recording, role fencing, mail dedupe, four-language mail layout, cron + Stripe + definer sweep) already exists as a pattern; the risk is in removing the old sender cleanly and in the exactly-once semantics, not in inventing machinery.

## Runtime State Inventory

This is a removal/refactor phase for the refund sender; answered explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `bookings.refund_status/refund_owed_rappen/refunded_rappen`, `booking_refunds`, `booking_refund_reversals`, `booking_refund_intents` (history). Live today (CONTEXT, read 2026-10-12): 1 booking `pending_ops`, 1 `refunded`, 2 bookings with payment rows | None (kept, D-07). The one `pending_ops` booking will show "Refund to check" until Stripe records a refund or pickup passes (code edit only) |
| Live service config | Stripe webhook endpoint must stay subscribed to `charge.refunded`, `refund.updated`, `refund.failed`, `charge.refund.updated` (`money-events.ts:131-140`) | Verify in Stripe Dashboard > Developers > Webhooks (no change expected); D-09 mail tells the owner to resend failed deliveries there |
| OS-registered state | Cloudflare cron `0 * * * *` and `0 3 * * *` (`wrangler.jsonc:141,352`) | None: the nightly check rides the existing `0 3 * * *` trigger; no new cron |
| Secrets / env vars | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (secrets, unchanged); NEW plain var `STRIPE_ACCOUNT_ID` per env | Add var (not a secret); owner supplies the live account id |
| Build artifacts | `apps/web/public/app/` is a gitignored sync copy of `app/`; `.open-next` build | Re-run `sync-dc-mock-to-public.mjs` (the `test` script does) |

Functions `ops_refund_plan/decide/intent_sent/intent_failed/record` stay in the database with no caller (D-07, deferred drop); `database.types.ts` keeps them.

## Common Pitfalls

### Pitfall 1: The mail goes out twice (or for the duplicate-charge refund)
**What goes wrong:** mailing on `'already'`, or on every event that mentions a refund.
**Why:** `charge.refunded` and `refund.updated` both reach the same loop; app refunds return `'already'` after the app row lands.
**How to avoid:** `'recorded'` only; skip `vamos_source=app`; Resend idempotency key; unit tests for: recorded→1 mail, already→0, app→0, two events same refund→1, mail throws→event still acked.
**Warning signs:** two mails for one `re_` in Resend logs; a customer mail for a duplicate charge.

### Pitfall 2: A failed mail silently loses the customer notice
**What goes wrong:** N1 cannot retry (the record already committed).
**How to avoid:** log at error level and mail info@ with the booking reference + refund id so the owner can write to the customer; or choose M1/N2 if the owner wants guaranteed delivery. State the choice in the plan.

### Pitfall 3: Nightly check reports permanent false positives
**What goes wrong:** `booking_missing` refunds, in-flight refunds, duplicate-payment refunds, reversed refunds, and refunds younger than 30 minutes show as mismatches every night for 48 h.
**How to avoid:** the exclusions in Q3; fixtures for each in the pure-core test and pgTAP.

### Pitfall 4: Wrong Stripe account/mode in the link
**What goes wrong:** live key with the sandbox account id (or vice versa) opens "not found" or the wrong object.
**How to avoid:** mode only from the key; account id per env; validate; fall back to the no-account path; verify both modes once on a real payment.

### Pitfall 5: Popup blocked / link built after an await
**How to avoid:** links fetched on open (admin+paid), click handler calls `window.open(url,'_blank','noopener')` synchronously; list rows are real anchors (UI-SPEC).

### Pitfall 6: DC test anchors and text-node splitting
`markRefund:` anchors (Q5). `{{ value }}` splits sentences into text nodes: the new strings with `{a}` amounts are `patterns` regex entries and the amount lives in `vt-dir-keep` + `data-vt-no-i18n` (memory `dc-i18n-text-nodes-split`). Copy in the page `T` tables must equal the dictionary text character for character (UI-SPEC).

### Pitfall 7: Fields the old UI hid come back through the API
Both cancel routes and the details routes serialise `refundRappen/refundOwedRappen`; removing the amount from the page without removing it from the response leaves a number in the network tab (not a customer-visible surface but contradicts D-04). Remove both.

### Pitfall 8: `postgres.js begin()` rethrows caught errors
Catch SQL refusals around `asSystem`/`asStaff`, never inside the callback (memory). Relevant to the new reader call and `checkout_booking_for_email` read.

## Code Examples

### Stripe refunds list for the last 48 h
```ts
// Source: https://docs.stripe.com/api/refunds/list (params: created, limit 1-100, starting_after); SDK autoPagingToArray
const now = Math.floor(Date.now() / 1000);
const refunds = await stripe.refunds
  .list({ created: { gte: now - 48 * 3600, lt: now - 30 * 60 }, limit: 100 })
  .autoPagingToArray({ limit: 500 });
```

### Cron wiring
```ts
// apps/web/worker.ts, inside if (controller.cron === "0 3 * * *") { ... } before `return`
try {
  const result = await refundCheck(env);          // counts only
  emit(result.ranOk ? "info" : "error", "refund_check", result.counts);
} catch {
  emit("error", "refund_check", { outcome: "failed" });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Site sends refunds (intent per payment, `ops_refund_plan` → Stripe → `ops_refund_intent_sent`) | Owner refunds in Stripe; webhook records (`stripe_dashboard` reason) | This phase (decision 2026-10-12) | Remove sender, keep recorder |
| Amount-bearing cancel copy ("full refund; our team sends it") | Policy line only | This phase | Fewer promises on screen |

**Deprecated after this phase (not removed yet):** `ops_refund_*` SQL functions, `booking_refund_intents` writes, `refund_status = processing` transitions (drop later, D-07).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Dashboard URL forms `https://dashboard.stripe.com/payments/pi_…`, `…/test/payments/pi_…`, `…/acct_…/[test/]payments/pi_…` open the PaymentIntent page | Q4 | Link opens a wrong/empty page; verify once per mode on a real payment before ship |
| A2 | Live account id is `acct_1UIZmAQbJiSLxJfu` (inferred from the live publishable key, audit W1-17) | Q4 | Wrong id in `STRIPE_ACCOUNT_ID`; owner must confirm |
| A3 | Without `/acct_…` the dashboard opens the signed-in account | Q4 | Owner signed in to another account sees "not found"; keep the var set |
| A4 | Resend idempotency keys dedupe for ~24 h | Q1 | N1 loses only the second belt; the single `'recorded'` caller is the real guard |
| A5 | The refund mail copy in `refund.ts` is unsigned (comment says "written by the builder") | Q1 | If the owner already signed it, the drafting task shrinks |
| A6 | Amounts in the internal D-09 mail are acceptable despite the "ids only" convention of earlier money alerts | Q3 | Owner may want ids only; trivial change |
| A7 | Live `booking_notifications_kind_check` equals the repo (7 kinds) | Q1 | If equal, lifecycle claims for 4 kinds fail today; if different, no issue. Does not affect N1 |
| A8 | Stripe sends `charge.refunded` for dashboard refunds incl. partial ones and the live endpoint is subscribed (code comments say so, `money-events.ts:131-140`) | Q1 | No customer mail and no record for dashboard refunds; check the endpoint's event list |

## Open Questions (RESOLVED)

All answered in 31-CONTEXT.md or gated in a plan (2026-10-12/13): 1 → D-10 (claim + retry, 31-03/31-04/31-05); 2 → C-01, gated in 31-11; 3 → gated in 31-04 (owner signs the copy); 4 → O-1, gated in 31-12; 5 → D-12; 6 → C-04 (read live 2026-10-12, reported, out of scope); 7 → D-13.

1. **Exactly-once mechanism for the customer mail (N1 vs M1 vs N2)**
   - Known: N1 needs no migration and never double-sends; it can lose a mail if the send fails after the commit.
   - Unclear: whether "exactly once" in S-03 tolerates a rare lost mail with an info@ alert.
   - Recommendation: N1 + alert, put the question to the owner in the plan; if he wants guaranteed delivery add M1 to the reader migration file (same apply, one extra function).
2. **Live Stripe account id for `STRIPE_ACCOUNT_ID`** (A2). Owner confirms in the Stripe Dashboard; record it next to the sandbox id.
3. **Customer refund mail copy (four languages, Swiss German "ss")** is not signed (S-03). The plan must contain the draft and a signature gate before code ships it.
4. **`cancelSub` lines** ("See what comes back at this notice…", "See the refund you are due…") in both DC pages promise a refund and are outside the signed wording. Owner to sign replacement wording or confirm leaving them.
5. **Nightly mail contains amounts** (A6) versus earlier ids-only money alerts. Owner confirmation.
6. **Live `booking_notifications_kind_check`** (A7): controller read-only query; outside this phase's scope but affects whether lifecycle mails work.
7. **Test bookings**: should the customer refund mail skip `bookings.is_test`? Recommended: do not filter (the pre-ship sandbox payment should show the mail), but the recipient is the test contact address.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build/tests | yes | v26.7.0 (engines >=22) | — |
| pnpm | all scripts | yes | 11.7.0 | — |
| Docker daemon | pgTAP / lab (`test:db-lab`, `db:test`) | yes | 29.5.2 server | — |
| Supabase CLI | local stack, `db:types` | yes | 2.119.0 | — |
| wrangler | deploy (controller only) | yes | present | — |
| Playwright browsers | visual/e2e (not in `gate:local`) | not checked | — | lab-only |
| Stripe live/test access | pre-ship real payment, URL check | owner-side | — | none: owner step |

**Missing dependencies with no fallback:** none for planning. **Missing with fallback:** none.

## Migrations wanted

**One migration, for the nightly check only. Everything else: none.**

- Why: the cron runs as `vamos_system`, which has EXECUTE on definers only and no SELECT on `booking_refunds`, `booking_payments`, `bookings` (`20260827000002_checkout_roles.sql:50-52`; `system-reads.ts:1-9`). `service_role` is off the money ledger (`20261012170000`). No existing function reads a refund by Stripe refund id. Staff-claim impersonation is not acceptable.
- Proposed file: `packages/db/supabase/migrations/20261012220000_refund_check_reader.sql`; the number comes from the controller (Phase 30 owns 20261012200000 onward).
- Contents (additive, no DDL on tables, no rows touched, one transaction `begin; … commit;`, per the house style of `20261007260000_meta_purchase.sql`):
  - `public.refund_check_read(p_refunds pg_catalog.jsonb)` `returns table (...)`, `language sql stable security definer set search_path = ''`. Input: JSON array of `{id, payment_intent}` objects (the Stripe refunds). Output per input refund: `stripe_refund_id`, `payment_intent_id`, `payment_found`, `booking_reference` (reference only, no name/e-mail), `site_refund_rappen`, `site_reason`, `site_reversed` (has a `booking_refund_reversals` row), `booking_refunded_rappen` (`bookings.refunded_rappen`), `booking_rows_sum_rappen` (sum of non-reversed `booking_refunds` on non-`duplicate` payments of that booking).
  - `revoke all on function … from public, anon, authenticated; grant execute on function … to vamos_system;` plus a `comment on function`.
  - Optional (only if the owner picks M1): `notification_claim_refund(...)` inserting `booking_notifications` kind `'refund'`, dedupe `booking:refund:<re_id>`.
- Companion: pgTAP `packages/db/supabase/tests/refund_check_reader.test.sql` (grants: only `vamos_system`; `provolatile = 's'`; fixtures: recorded, missing, amount differs, reversed, unlinked, duplicate-payment refund, booking-total mismatch; no write: row counts unchanged), `database.types.ts` regenerated (`db:types:check`; conflict with Phase 30's 30-01, see Q8), local test through the real Worker client options (memory `isolated-local-supabase`, `worker-pg-client-no-arrays`).
- Apply: live apply is the controller's (md5-guard, verbatim, read-back); the Worker must not call the function before it exists. Ship order: migration first (a new function breaks nothing), then the Worker (add a try/catch so a missing function in the cron only logs `refund_check failed`, never breaks the branch).
- Not needed: any change for the customer mail (N1), the staff route, URL builder, copy, removals, the `Refund to check` note (reads existing fields).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (node env) in `apps/web`; pgTAP (`packages/db/supabase/tests`); `node --test scripts/*.test.mjs`; Playwright specs exist but are outside `gate:local` |
| Config file | `apps/web/vitest.config.ts` (includes `lib/**/*.test.ts`, `tests/unit/**`, `app/api/auth/**`, `components/consent`, `components/checkout`) |
| Quick run command | `pnpm --filter web exec vitest run <path>` (run `node scripts/sync-dc-mock-to-public.mjs` first for DC tests) |
| Full suite command | `pnpm test:unit` then `pnpm gate:local` (adds typecheck, lint, i18n, build, `test:db-lab`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R31-01 | URL builder: mode/acct/pi validation, injection rejected | unit | `pnpm --filter web exec vitest run lib/checkout/stripe-dashboard-url.test.ts` | ❌ Wave 0 |
| R31-01 | `stripe-payments` reader: succeeded + `pi_` only, newest first, `leftRappen` with reversals, kind trip/extra, admin only, both mounts re-export | unit | `… vitest run lib/ops/stripe-payments.test.ts` | ❌ Wave 0 |
| R31-01 | DC: menu item disabled until links, one payment `window.open`, list for 2+, none error, bidi isolation | unit (DC source + vm) | `… vitest run lib/ops/ops-refund-stripe-dc.test.ts lib/ops/ops-dc-dash-design.test.ts` | ❌ Wave 0 / ✅ rewrite |
| R31-02 | refund routes, `refundBooking`, parsers gone; no POST to `/refund` in DC; kept maps still work | unit | `… vitest run lib/ops/refund.test.ts lib/ops/payment-changed.test.ts` | ✅ rewrite |
| R31-03 | webhook still records dashboard refunds; replay `'already'` | unit | `… vitest run lib/checkout/money-events.test.ts lib/checkout/settle.test.ts` | ✅ extend |
| R31-04 | duplicate / paid-after-cancel refund path unchanged, no customer mail | unit | same files, new cases | ✅ extend |
| R31-05 | paid-cancel answers carry no amount; policy line on DC pages, dict, twins, email in 4 languages; refund-texts pins rewritten | unit | `… vitest run lib/lifecycle/paid-cancel.test.ts lib/legal/refund-texts-20-10.test.ts tests/unit/manage-ticket-account-refund.test.ts tests/unit/account-booking-details-refund.test.ts lib/ops/class-change-customer-line.test.ts` and `pnpm --filter @vamos/emails exec vitest run` | ✅ update |
| R31-06 | customer mail: recorded→1 (locale, recipients, amount from Stripe), already→0, app→0, send error doesn't retry, idempotency key | unit | `… vitest run lib/checkout/money-events.test.ts packages/emails (refund.test.ts, send.test.ts)` | ✅ extend |
| R31-07 | "Refund to check" visible/hidden per state table | unit (DC) | `… vitest run lib/ops/ops-refund-stripe-dc.test.ts` | ❌ Wave 0 |
| R31-08 | nightly core: window math, 30-min skip, exclusions, findings (a)-(d)+total, cap 500 "truncated", Stripe down → "did not run", no write calls, counts-only logs | unit | `… vitest run lib/checkout/refund-check.test.ts` | ❌ Wave 0 |
| R31-08 | reader definer: grants, STABLE, fixtures, no writes | pgTAP | `pnpm db:test` (or `pnpm test:db-lab`) `packages/db/supabase/tests/refund_check_reader.test.sql` | ❌ Wave 0 |
| R31-08 | reader through Worker client options | local | `VAMOS_LOCAL_DB_PORT=… pnpm --filter web exec vitest run lib/checkout/refund-check.local.test.ts` | ❌ Wave 0 |
| R31-09 | ops mail copy: refund-failed/difference-not-applied say Stripe | unit | `pnpm --filter @vamos/emails exec vitest run src/OpsMustFixEmail.test.tsx` | ✅ update |
| R31-10 | 4-language key parity, seed, no ß, no "Stripe" on customer surfaces | gate | `pnpm i18n:check && pnpm db:seed:check && pnpm --filter web exec vitest run lib/ops/ops-detail-i18n.test.ts` | ✅ |

### Sampling Rate
- **Per task commit:** the touched test files (`vitest run <files>`), agents never the full suite.
- **Per wave merge:** `pnpm --filter web exec vitest run lib/ops lib/checkout lib/lifecycle lib/legal tests/unit` plus `pnpm --filter @vamos/emails exec vitest run`.
- **Phase gate:** `pnpm gate:local` green on the lead's machine (state in the PR that CI minutes are not used), clean-clone check by the controller, then `pr-review <num> all`.

### Wave 0 Gaps
- [ ] `lib/checkout/stripe-dashboard-url.test.ts`, `lib/ops/stripe-payments.test.ts`, `lib/ops/ops-refund-stripe-dc.test.ts`, `lib/checkout/refund-check.test.ts`, `lib/checkout/refund-check.local.test.ts`
- [ ] `packages/db/supabase/tests/refund_check_reader.test.sql`
- [ ] Re-anchor the four `markRefund:` slicing tests before deleting `markRefund`
- [ ] Decision file with the 2026-10-12 signed wording tables for the rewritten `refund-texts-20-10.test.ts`
- [ ] Framework install: none

## Security Domain

`security_enforcement` is not set to false in `.planning/config.json` (absent = enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no change | existing staff auth |
| V3 Session Management | no change | existing |
| V4 Access Control | yes | `withAdmin` + `asStaff` RLS + `resolveStaffBookingId`; definer reader EXECUTE for `vamos_system` only |
| V5 Input Validation | yes | URL builder regex validation (`acct_`, `pi_`); path key parsing; reader takes JSON built server-side from Stripe's own response |
| V6 Cryptography | no | none added; Stripe signature verification untouched |
| V7 Logging | yes | cron and mail logs carry counts and ids only, no names/e-mails/amounts |
| V8 Data Protection | yes | customer mail to booking contact (+ payer); internal report only to `info@` |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| URL injection / open redirect in the Stripe link | Tampering | Fixed origin `https://dashboard.stripe.com`; account and PI id regex-validated; mode from the secret key; id never from request/query; client only opens URLs the server returned (and may assert the prefix); `noopener noreferrer` |
| IDOR on the staff route | Information disclosure | `withAdmin` (+ active staff row), booking resolved through `asStaff` RLS, 404 for unknown; response carries only that booking's payment ids and URLs |
| Staff GET reachable by document navigation | Spoofing | `staffResponse` already 404s `sec-fetch-dest: document` |
| Customer email to the wrong recipient | Information disclosure | Recipient only from `checkout_booking_for_email` (contact + payer), lowercased/deduped by `refundMailRecipients`; skip when empty; never from event metadata |
| Duplicate customer emails | Repudiation/annoyance | `'recorded'`-only trigger, Resend idempotency key, app refunds excluded, unit tests |
| Customer mail states a wrong amount | Tampering | Amount = `refund.amount` of the Stripe refund object re-read from Stripe (`retrieveCharge`/`retrieveRefund`), CHF refunds only |
| Cron leaks PII in logs | Information disclosure | Counts-only `emit`; Stripe error text not logged raw; mail (not logs) holds references/amounts |
| Cron writes money / Stripe | Tampering | Stripe: list only (no POST); DB: STABLE definer, pgTAP asserts no change; code review gate: no `.create/.update` in `refund-check.ts` |
| Reader function callable via REST | Elevation | `revoke … from public, anon, authenticated`; pgTAP checks `has_function_privilege` for anon/authenticated/service_role = false |
| Account id / vendor plumbing on a public surface | Information disclosure | Var read only in server code; never serialised into pages; owner memory "no internal ids in public" |

## Sources

### Primary (HIGH confidence)
- Repo files read in full or in the cited ranges: `apps/web/lib/checkout/money-events.ts`, `settle.ts`, `stripe.ts`, `stripe-mode.ts`, `stripe-fee.ts`, `stripe-events-sweep.ts`, `apps/web/worker.ts`, `lib/ops/{refund,refund-map,staff-json,must-fix-mail,resolve-booking-id}.ts`, `lib/db/{identity,system-reads}.ts`, `lib/lifecycle/{paid-cancel,notify-lifecycle}.ts`, `lib/checkout/notify.ts`, `packages/emails/src/{refund.ts,CancellationEmail.tsx,OpsMustFixEmail.tsx,lib/send.ts}`, `packages/emails/src/messages/en.json`, migrations `20260823000014`, `20260827000002/04/05`, `20260928100000`, `20260930100000`, `20261012160000`, `20261012170000`, DC pages and `app/vamos-manage-ticket.js`, `scripts/*`, `wrangler.jsonc`, `lib/env.d.ts`.
- `docs.stripe.com/api/refunds/list` (fetched 2026-10-12): parameters `created`, `limit` 1-100, `starting_after`, `payment_intent`, `charge`; newest first; Refund fields.
- `git diff origin/main...origin/phase-30-vehicle-class-lifecycle` for the overlap.

### Secondary (MEDIUM confidence)
- Web search (Stripe docs and third parties): test-mode dashboard paths use a `/test/` prefix; no official page found for the PaymentIntent URL form.
- `.planning/audits/2026-10-09-stripe-W1.md` (W1-17) for the live account id inference.

### Tertiary (LOW confidence)
- Resend 24 h idempotency window (training knowledge), Dashboard behaviour without an account segment.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new packages; versions read from the repo.
- Architecture: HIGH for webhook, roles and removal map (read from code and migrations); MEDIUM for Stripe Dashboard URLs and the account id.
- Pitfalls: HIGH - each tied to a file; the notification-kind mismatch is flagged as unverified live.

**Research date:** 2026-10-12
**Valid until:** 2026-10-26 (fast-moving: Phase 30 is open on the same files; re-check the overlap before planning waves that touch `OpsDetail.dc.html`)
