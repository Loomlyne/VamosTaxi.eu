# Phase 2: Data Schema, RLS & Staff Auth Foundations - Context

**Gathered:** 2026-08-23
**Status:** Ready for planning
**Source:** Research express path (02-RESEARCH.md, 02-SCHEMA-DRAFT.md, ADR-001…014)

<domain>
## Phase Boundary

Postgres holds the full `VamosOps`-mirrored schema with row-level security enforced on every
table, and staff can only reach it through an invited, MFA-verified session. The versioned
price/policy snapshot shape (needed by Phase 4/9) and the driver double-booking exclusion
constraint (needed by Phase 8) are designed into the schema here, not retrofitted.

Requirements covered: DATA-01, DATA-02, DATA-03, DATA-04, DATA-07, AUTH-05.

**In scope:**
- Versioned, hand-written SQL migrations in `packages/db/supabase/migrations/` covering every
  `VamosOps` table plus the forward-designed tables Phase 4/7/8/9 will need.
- Four Postgres roles (`vamos_edge`, `vamos_public`, `vamos_guest`, `vamos_staff`) and the
  `app.*` identity-helper functions — grants first, policies second.
- RLS enabled on every table with per-actor policies proving DATA-02/03/04.
- Staff invitation-only account creation, the `staff` table, the Custom Access Token Hook, and
  TOTP MFA enforced in SQL as `aal = 'aal2'` (AUTH-05).
- The price/policy snapshot shape (`rate_versions`, `settings_versions`, `price_snapshots` +
  `price_snapshot_legs`) and its DB-level charge gate — forward-designed for Phase 4/7/9.
- The two `booking_legs` exclusion constraints (chauffeur, vehicle) — forward-designed for
  Phase 8.
- `booking_events`, generic `audit_log`, `consent_log` — append-only, RLS-enforced.
- A generated, idempotent `seed.sql` (vehicle classes, settings, content strings, reviews) and
  `supabase gen types typescript` output, both CI-checked for drift.
- The CI gate: `supabase db reset` + `supabase test db` (pgTAP) on every PR; migration steps
  added to the staging/production deploy workflows.

**Out of scope:**
- No Worker/Hyperdrive data access code — that is Phase 3 (`apps/web/lib/db/identity.ts` is
  sketched in research only, as the contract Phase 2 must make possible).
- No pricing/quote engine logic — Phase 4. Phase 2 ships the shapes the engine writes into.
- No UI of any kind, public or ops.
- No CHF price matrix — every priced column stays nullable and NULL-seeded until the matrix
  lands (owner blocker, see decisions below).

</domain>

<decisions>
## Implementation Decisions

Every bullet below cites the originating research decision (`research Dn`) or uncertainty
(`research Un`) in parentheses for traceability back to `02-RESEARCH.md`.

### Identity & roles, Hyperdrive topology
- **D-01:** (research D1) Identity reaches SQL via `set_config('role', …, true)` +
  `set_config('request.jwt.claims' | 'request.vamos.manage_token_hash', …, true)`, both
  `is_local => true`, inside one explicit `BEGIN`/`COMMIT`. Postgres reverts at commit/rollback;
  a lost `BEGIN` fails to set identity rather than leaking it. — Phase 3 (DATA-06).
- **D-02:** (research D2) The security boundary is the grant on a privilege-less `vamos_edge`
  login role (`NOINHERIT`, holds every app role `WITH INHERIT FALSE, SET TRUE`) — never the
  discipline of setting the claim. A forgotten wrapper raises `42501`. — Phase 3, DATA-02/03/04.
- **D-03:** (research D3) Two Hyperdrive configs on the direct connection string:
  `HYPERDRIVE_NOCACHE` (`--caching-disabled`, `vamos_edge`, identity-scoped transactions) and
  `HYPERDRIVE` (`vamos_public`, four public-content tables, cacheable). Auth, session and
  `pricing_live` reads must never sit behind a 60 s cache. — Phase 3, Phase 4.

### Staff auth (AUTH-05)
- **D-04:** (research D4) Staff role claim is `app_metadata.vamos_role`, written by a Custom
  Access Token Hook reading the app-owned `staff` table on every mint — never `user_metadata`
  (user-writable) and never the top-level `role` claim (schema-constrained to
  `anon`/`authenticated`). Revoking staff takes effect on next mint. — AUTH-05, Phase 6.
- **D-05:** (research D5) Second factor is checked by reading the `aal` claim (`aal2`
  required), never "has a factor enrolled". Three independent layers: SQL (`app.is_staff()`
  requires `aal2` + an active `staff` row), middleware (`getUser()`, never `getSession()`), and
  the invite/claim flow (no active `staff` row until enrolment completes). Ops policies are
  `AS RESTRICTIVE`. — AUTH-05, Phase 6.

### Money & snapshots
- **D-06:** (research D6) Money storage is `create domain rappen as integer` — CHF minor units,
  one CHF amount everywhere. The stored number *is* Stripe's `amount`; ADR-004's schema half
  (no per-currency price columns) still stands. — Phase 4, 7, 9.
- **D-07:** (research D7) Price durability is three objects: versioned `rate_versions` +
  insert-only `price_snapshots` (typed totals + jsonb `lines`/`policy`) + `price_snapshot_legs`.
  Rejected: `bookings.price_json` (mutated by dispatch); FK'd normalised lines (a live FK
  resolves to today's label); SCD-2 recompute (reproduces inputs, not the decision). Supersedes
  GSD-LAUNCH's `bookings.price_chf numeric` (Q1). — QUOTE-05, LIFE-03, Phase 4/7/9.
- **D-08:** (research D8) Snapshot line labels are an i18n key + numeric params, never rendered
  English prose — the mock's `label:'Airport pickup'` pattern is not ported, or every German
  confirmation freezes an English price line into an immutable row. — Phase 4, `packages/emails`.
- **D-09:** (research D9) `pricing_live` is not a boolean. Exactly one `rate_versions` row may
  hold `status='live'` (partial unique index); a `BEFORE INSERT` trigger on `booking_payments`
  refuses any charge whose snapshot is not chargeable, expired, or mismatched. No off switch.
  — QUOTE-10, Phase 7, 11.
- **D-10:** (research D10) Policy durability splits immutable `settings_versions` (fields a
  refund/cancellation depends on) from a mutable `settings` singleton (contacts, toggles).
  Supersedes GSD-LAUNCH's one-mutable-settings sketch (Q4). — LIFE-03, Phase 9.
- **D-11:** (research D11) Return trips are one `bookings` row + `booking_legs`, **one** shared
  `price_snapshot` with per-leg `price_snapshot_legs` subtotals (ADR-006) — never two
  snapshots, never a `return_at` column, never two bookings. — Phase 4, 8, 9.
- **D-12:** (research D12) Booking reference is `VT-YY-####` from a per-year sequence table,
  uniqueness by index (ADR-003) — not the mock's collision-prone random 4-digit generator.
  — Phase 4, emails, ops search.

### Bookings & legs — the dispatch exclusion
- **D-13:** (research D16) Two independent partial `EXCLUDE USING gist` constraints on
  `booking_legs` (chauffeur, vehicle) over a **`STORED`** generated `tstzrange` column, never one
  combined constraint (only blocks the exact pair recurring) and never a live `settings` join (a
  generated column can't subquery). Supersedes GSD-LAUNCH's `bookings.assigned_chauffeur_id`
  (Q3, ADR-006). `DEFERRABLE INITIALLY IMMEDIATE`; violation is `23P01`, caught on
  `err.code`/`err.constraint_name`, never message text, returned as 409. — OPS-03, Phase 8.
- **D-14:** (research D17) `settings.chauffeur_turnaround_minutes` seeds **30**, not NULL —
  departs from ADR-002's NULL discipline because this is an internal dispatch parameter that
  never renders publicly, and NULL would coalesce to a zero buffer (under-blocking, the
  dangerous direction). Snapshotted onto the leg at assignment with a `greatest(buffer,1)` floor.
  — Phase 8.

### Manage token (DATA-03)
- **D-15:** (research D14) Token is opaque 32-byte base64url, SHA-256 hashed **in the Worker**
  before it reaches SQL, stored `bytea` in a **separate** `booking_access_tokens` table,
  **reusable, not single-use** (mail-gateway link scanners would burn a single-use token before
  the customer clicks). Supersedes GSD-LAUNCH's `bookings.manage_token uuid` (Q2). — DATA-03,
  AUTH-06 (Phase 8).
- **D-16:** (research D15) Enforcement splits by operation — RLS for **reads** (`vamos_guest`),
  `SECURITY DEFINER` RPC for **mutations** (`set search_path = ''`, `EXECUTE` only to
  `vamos_guest`). Mutations need one atomic `FOR UPDATE` check-and-act (token + state-machine +
  write + `booking_events` row) in one transaction, not a check-then-act round trip. — DATA-03,
  Phase 9.

### Audit & append-only
- **D-17:** (research D18) Two audit tables — `booking_events` (app-written inside the
  state-change transaction using the service-role key, never a trigger, because a trigger can't
  express *why* or see an actor for a webhook/cron) and `audit_log` (generic, trigger-written,
  for plain-CRUD admin tables). — DATA-08, Phase 8.
- **D-18:** (research D19) Append-only is four layers together — trigger (raises on
  `UPDATE`/`DELETE`) + `REVOKE UPDATE, DELETE` + RLS-with-no-policy + `FORCE ROW LEVEL SECURITY`.
  `service_role`/superusers bypass layers 2–4; only the trigger catches a `postgres`-role
  session. `booking_payments` gets a column whitelist instead (Stripe legitimately moves status).
  — DATA-08, Phase 7.
- **D-19:** (research D20) Erasure is redact-in-place (+`erased_at`), row never deleted, never
  `ON DELETE CASCADE` — Swiss CO Art. 958f's 10-year accounting-record duty. — Phase 10.

### Migrations, seed, types
- **D-20:** (research D13) Enum convention — native Postgres `ENUM` for closed/stable/
  cross-table domains, `CHECK (x in …)` for churn-prone taxonomies (event kinds, actor kinds).
  Enums become TS unions in `gen types`; what churns most stays CHECK. — Phase 3 types, all later
  phases.
- **D-21:** (research D21) Tooling is the Supabase CLI, hand-written timestamped SQL, pinned
  exact devDependency, always `supabase migration new` (never a hand-typed timestamp) — not
  declarative schemas + `db diff`, not a hand-rolled runner. Rollback is forward-only, no
  `down.sql` convention. — all later phases.
- **D-22:** (research D22) Seed is generated: `packages/db/seed/generate-seed.mjs` writes a
  committed `seed.sql` from `apps/web/i18n/messages/{en,de,fr,ar}.json` (not the superseded
  `app/vamos-i18n-dict.js`) and `app/vamos-reviews.js`'s `SEED` array. Every INSERT uses
  `ON CONFLICT … DO UPDATE` on a natural key — the only thing making a second
  `--include-seed` push safe. — DATA-07.
- **D-23:** (research D23) Types are `supabase gen types typescript --local`, committed, CI
  drift-checked (`git diff --exit-code`). No query-typing library. — Phase 3.

### Residency
- **D-24:** (research D24) R2 buckets are created with `jurisdiction: "eu"` on the **first**
  creation call — irreversible after creation; the "location hint" alternative is documented
  as best-effort only, not a guarantee. — Phase 6, Phase 10.

### Execution-time checks the plan must run (research UNCERTAIN items, with fallback)
- **D-25:** (U1) Before writing the first migration, run
  `grant authenticated to vamos_edge with inherit false, set true;` in the staging SQL editor.
  If refused, fall back to `create role vamos_customer nologin` mirroring `authenticated`'s
  grants and use `TO vamos_customer` everywhere a policy would say `TO authenticated`. — Blocks
  the roles migration.
- **D-26:** (U2) Confirm `set_config('role', $1, true)` ≡ `SET LOCAL ROLE $1` with
  `begin; select set_config('role','authenticated',true); select current_user; commit; select
  current_user;` (expect `authenticated` then `vamos_edge`). Fallback:
  `tx.unsafe('set local role ' + PG_ROLE[kind])` — safe because `PG_ROLE` is a closed map.
  — Blocks Phase 3's `withIdentity`.
- **D-27:** (U3) Confirm whether `supabase db push --include-seed` re-runs the seed every push
  (`--dry-run` against a scratch project, then a real second push, diff row counts). Assume
  **load-bearing** either way — every generated `INSERT` keeps `ON CONFLICT` regardless of the
  answer. — Blocks the `deploy-staging.yml` migration step.
- **D-28:** (U4) Run `select version();` on staging before the snapshot migration. Write
  `stored` explicitly on every generated column regardless (correct on both PG17 and PG18) — a
  confirmation, not a blocker.
- **D-29:** (U7) Coupon consumption timing — confirmed by ADR-014 §6: an abandoned quote does
  **not** burn a coupon use. `coupon_redemptions` consumes at **payment**, FKing a
  `booking_payments` row, not a snapshot. A soft KV reservation for the checkout window is
  Phase 7 work. — The `coupon_redemptions` migration.
- **D-30:** (U8) Sub-rappen per-km rates — if the CHF matrix quotes a fractional-rappen per-km
  figure, `per_km_rappen integer` truncates. Read the matrix when it lands; fix is
  `per_km_millirappen integer` if needed. The line **amount** stays integer rappen regardless.
  Safe to defer.
- **D-31:** (U9) `display_currency` stays on the snapshot. ADR-014 §1 confirms the customer
  does see an amount converted to their chosen display currency (not "only ever CHF"), so the
  column is needed, not merely harmless — exact display copy is Phase 7's job.
- **D-32:** (U10) `consent_log.ip_truncated` ships nullable now; counsel decides the retention
  ceiling and collection policy for consent rows not tied to a booking before Phase 10 turns
  the banner live.
- **D-33:** (U15) Confirm the Custom Access Token Hook's production dashboard path
  ("Authentication → Hooks (Beta)") against the **live dashboard** when wiring it, not from
  docs alone — Beta labelling implies drift. pgTAP proves the hook function itself; that the
  auth server invokes it is a dashboard setting. — AUTH-05 execution.

### Owner blockers touching this schema
- **D-34:** The CHF price matrix is still open. Every priced column (`distance_rates.*_rappen`,
  `fixed_routes.price_rappen`, `surcharges.amount_rappen`/`.percent`, `price_snapshots.*_rappen`,
  `bookings.price_total_rappen`) stays nullable and seeds NULL until it lands; the seed inserts
  **no** `rate_versions` row with `status='live'` (reinforces D-09). Never invent a CHF price
  anywhere — not in a migration, the seed, a fixture, or a screenshot.
- **D-35:** Corrects 02-RESEARCH.md, which was written to ADR-002's original NULL-seed
  discipline for these fields. ADR-014 (2026-08-22, explicitly binding on Phase 2 migrations)
  closes them with confirmed numbers, seeded in **one dated `settings_versions` row**:
  `free_cancel_hours=24` + the 100%/75%/0% cancellation tiers (owner-confirmed, ADR-005-driven),
  `airport_waiting_minutes=60`, `city_waiting_minutes=15`, `min_advance_minutes=180`,
  `manage_link_validity_days=30` (closes research's U5), `round_trip_discount_percent=10`
  (closes research's U16 — its "do not seed a number" line no longer holds), night-window
  surcharge predicate `20:00–06:00 Europe/Zurich` (not the mock's/research's example
  `22:00–06:00`). Where 02-RESEARCH.md's body text still says "seed NULL" for these specific
  fields, ADR-014 governs. The broader ADR-002 NULL discipline still applies to any policy
  number the owner has **not** confirmed.
- **D-36:** Vehicle-class seed capacities, hard-coded in the seed generator (D-22, since no
  JS/JSON source exists): **Economy 3 pax/3 bags, Business 3/3, Van 8/8** (ADR-014 §6). `first`
  does not ship in V1 and must not be seeded as a class.

### Claude's Discretion
- Exact migration file numbering beyond the research's proposed `0001…0023` sequence — those
  are illustrative file names, not a contractual list; gaps, merges or an extra file like
  `0011a_coupon_redemptions` are the planner's call as tables interleave.
- pgTAP test file granularity beyond "one file per DATA-0x claim" — the file names in the plan
  split below are illustrative; splitting or combining within a lane is fine.
- CI job layout (one combined job vs. split jobs for `db reset` / `test db` / `gen types` /
  drift-check) as long as all four checks in D-21's CI gate run and all block the PR.

### Proposed plan split `[informational]`
Reproduced verbatim from 02-RESEARCH.md's "Proposed Phase 2 plan split" — a recommendation the
planner may adopt, adapt or replace; not a locked decision. The coverage gate should not treat
this table or the wave diagram as D-NN items.

| # | Plan | Goal (one line) | File scope | Depends on | Parallel with |
|---|---|---|---|---|---|
| **P1** | **Foundation: extensions, roles, helpers, types** | A database a migration can be written against at all: `citext`/`pgcrypto`/`btree_gist`/`pgtap`, the four roles, the `app.*` identity helpers, every enum and the `rappen` domain | `0001_extensions`, `0002_roles_and_helpers`, `0003_types`, `tests/extensions.test.sql`, `packages/db/supabase/config.toml` | — | nothing (hard gate) |
| **P2** | **Reference data: settings, fleet, people, staff auth** | The tables ops curates plus the AUTH-05 identity surface: `settings`/`settings_versions`, `vehicle_classes`/`vehicles`/`chauffeurs`, `customers`, `staff`, the Custom Access Token Hook **and its `supabase_auth_admin` policy** | `0004_settings`, `0005_fleet`, `0006_customers_and_staff`, `tests/staff_hook_claim.test.sql` | P1 | P3, P4 |
| **P3** | **Pricing: versioned batches and the publish gate** | A matrix that cannot go live half-priced or be edited once published: `rate_versions` (+`slug`), `service_zones`, `distance_rates`, `fixed_routes`, `surcharges`, `coupons`, the freeze trigger with its availability carve-out, and the transition/validation trigger | `0007_rate_versions`, `0008_coupons`, `tests/rate_version_publish.test.sql` | P1 (needs `vehicle_classes` from P2 for its FK — take the FK in P3, the table in P2, and merge on the same branch, or run P3 after P2's `0005`) | P4 (file-disjoint) |
| **P4** | **Booking core: bookings, legs, manage token, dispatch exclusion** | The commercial record and the dispatchable unit, with OPS-03's exclusion constraints correct on day one: reference generator, `bookings` (+`idempotency_key`), `booking_legs` (+assignability CHECKs, deferrable exclusions, buffer trigger), `booking_access_tokens`, `app.booking_has_manage_token`, `manage_booking_*` | `0009_bookings`, `0010_booking_legs`, `0011_booking_access_tokens`, `0011a_coupon_redemptions`, `tests/exclusion.test.sql`, `tests/reference_format.test.sql` | P1, P2 (`customers`), P3 (`coupons`) | P3 late-stage |
| **P5** | **Money and evidence: snapshots, payments, ledgers, consent** | The forward-designed shapes Phase 4/7/9 bind to: `price_snapshots` (+`price_snapshot_legs`, rate-version-flag trigger), `booking_payments` (charge gate + update whitelist), `booking_refunds`, `stripe_events`, `booking_notifications`, `booking_events`, `audit_log`, `consent_log` + `record_consent()`, and the four append-only layers | `0012`–`0016`, `0015a_consent_log`, `tests/charge_gate.test.sql`, `tests/append_only.test.sql`, `tests/consent_write.test.sql` | P4 | P6 authoring can start, but not land |
| **P6** | **RLS: enable everywhere, then policies per actor** | DATA-02/03/04 proved by grants first and policies second, in one pass over the finished table set, plus §14f Realtime authorization | `0018_content_and_reviews`, `0019_rls_enable`, `0020_rls_customer`, `0021_rls_guest`, `0022_rls_staff`, `0023_rls_public`, `tests/{bookings_customer_rls,bookings_manage_token_rls,ops_role_rls,ops_write_denied,customer_columns,settings_public,fail_closed}.test.sql` | P2, P3, P4, P5 (**every** table must exist first) | nothing (hard gate) |
| **P7** | **Seed, types and the CI gate** | DATA-07: a fresh environment loads vehicle classes, settings, content strings and reviews, twice, with the same row counts — and CI proves the whole stack applies from zero | `packages/db/seed/generate-seed.mjs`, `supabase/seed.sql`, `packages/db/database.types.ts`, `.github/workflows/pr.yml` + `deploy-staging.yml` + `deploy-production.yml`, `tests/seed_idempotent.test.sql` | P6 (seeding runs as owner, but the CI job runs the whole reset including policies) | — |

```
P1 ──┬── P2 ──┬── P4 ── P5 ──┬── P6 ── P7
     └── P3 ──┘              │
                             └── (P6 authored in parallel, landed after P5)
```
Wave 1: **P1** alone. Wave 2: **P2** and **P3** in parallel (P3's only cross-dependency is the
`vehicle_classes` FK). Wave 3: **P4**, then **P5**. Wave 4: **P6** alone — deliberately not
parallelised, because `0020` opens with `revoke all on all tables in schema public` and two
agents adding grants in different files at the same time is exactly how a table ends up
ungranted or over-granted. Wave 5: **P7**.

</decisions>

<specifics>
## Specific Ideas

- The four Postgres roles, by name: **`vamos_edge`** (login, NOINHERIT, owns nothing —
  Hyperdrive's identity-scoped connection), **`vamos_public`** (login, NOINHERIT, direct SELECT
  on public-content tables — the cacheable Hyperdrive connection), **`vamos_guest`** (NOLOGIN,
  holder of a valid manage token), **`vamos_staff`** (NOLOGIN, dispatcher/admin).
- The two Hyperdrive bindings, by name: **`HYPERDRIVE_NOCACHE`** (`--caching-disabled`, the
  `vamos_edge` identity path) and **`HYPERDRIVE`** (`vamos_public`, cacheable content path).
- `rappen`: `create domain rappen as integer` — CHF minor units, ceiling CHF 21'474'836.47.
- Booking reference format: `VT-YY-####` from a per-year sequence table (ADR-003).
- `booking_access_tokens` shape: `id uuid`, `booking_id uuid` (FK, cascade), `purpose text`
  (`'manage'` only for now), `token_hash bytea unique` (sha256 of 32 raw bytes,
  `octet_length = 32` CHECK), `created_at`, `expires_at` (NOT NULL — issuance refuses rather
  than inventing the window), `revoked_at`, `last_used_at`, `use_count`.
- The two exclusion constraints, by name: `booking_legs_chauffeur_no_overlap` and
  `booking_legs_vehicle_no_overlap`, both `EXCLUDE USING gist (… with =, scheduled_range with
  &&)`, `WHERE (… is not null and status not in ('cancelled','no_show'))`,
  `DEFERRABLE INITIALLY IMMEDIATE`.
- `app.*` helper names, exact: `app.jwt()`, `app.uid()`, `app.manage_token_hash()`,
  `app.is_staff()`, `app.is_admin()`, `app.booking_has_manage_token(uuid)`.
- Test commands the plan is built around: `supabase db reset` (proves every migration applies
  clean from zero — the actual DATA-07 proof) and `supabase test db` (the pgTAP suite). Both
  run in `pr.yml` with no secrets required.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase research (primary source for this CONTEXT)
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-RESEARCH.md` — the full lane
  analysis, the D1–D24 decision table, the U1–U22 uncertainty table, the "where lanes
  disagreed" resolutions, the owner-blocker nullability rules, and the proposed 7-plan split
  reproduced below.
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-SCHEMA-DRAFT.md` — the
  reviewed (revision 2, 36 findings folded in) SQL draft every migration is written against.
  Key sections: §1 Extensions, §2 Roles/app schema/identity helpers, §3 Enum types and the
  money domain, §4 Settings, §5 Fleet and people, §6 Pricing (versioned batches), §7
  Bookings/legs/reference generator (+ "The exclusion constraints"), §8 The manage token, §9
  The price/policy snapshot (+ Payments/refunds/charge gate, + the notification ledger), §10
  Booking events and the generic audit log (+ append-only enforcement), §11 Consent log, §12
  Content and reviews, §13 RLS enabled everywhere, §14 Policies grouped by actor (14a customer,
  14b guest, 14c staff, 14d anon/public, 14e service role, 14f Realtime authorization), §15
  pgTAP tests, §16 Migration file layout, §17 Seed, §18 Reviewed and rejected findings.
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/research/rls-hyperdrive.md` —
  Lane 1: RLS-over-Hyperdrive verdict, edge JWT verification, prepared-statement safety, the
  DATA-06 proof design.
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/research/price-snapshot.md` —
  Lane 2: why an amount alone can't answer LIFE-03, rejected snapshot shapes, the
  `lines`/`policy` jsonb contracts.
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/research/staff-mfa.md` — Lane 3:
  invite-only staff creation, the role-claim hook, the three MFA layers.
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/research/manage-token.md` — Lane
  4: why RLS-only and definer-RPC-only both lose, the resolved read/write split (D-16).
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/research/exclusion-constraint.md`
  — Lane 5: `btree_gist` availability, the generated-column design, the deferred-check
  rationale.
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/research/migrations-seed.md` —
  Lane 6: CLI tooling decision, the CI gap this phase closes, seed generation design.
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/research/residency-audit.md` —
  Lane 7: `consent_log` design, the audit split, erasure vs. Art. 958f, R2/KV residency
  findings, the ADR-007 correction.
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/research/extract-constraints.md`
  — the binding-requirement extraction from GSD-LAUNCH/REQUIREMENTS/ROADMAP this phase must
  satisfy or explicitly supersede.
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/research/extract-ops-contract.json`
  — the machine-readable `VamosOps` table/field contract DATA-01 mirrors.

### Architecture decisions that bind this phase
- `.planning/ADR-002-waiting-allowances-null.md` — **Superseded 2026-08-22 by ADR-014 §5** for
  `airport_waiting_minutes`/`city_waiting_minutes` (D-35). NULL discipline remains the rule for
  any unconfirmed policy.
- `.planning/ADR-003-booking-reference-format.md` — `VT-YY-####` reference format (D-12).
- `.planning/ADR-004-currency-display-only.md` — **Partially superseded 2026-08-22 by ADR-014
  §1** (display/charge rule replaced by Stripe FX conversion; no Phase 2 schema impact). Schema
  half stands: one CHF amount per rate/route/surcharge, no per-currency columns (D-06).
- `.planning/ADR-005-cancellation-copy-settings-driven.md` — the 24 h cancellation promise as a
  settings-driven value (feeds D-10, D-35).
- `.planning/ADR-006-return-trips-booking-legs.md` — one booking, two legs; assignment lives on
  `booking_legs`, not `bookings` (D-11, D-13).
- `.planning/ADR-007-edge-data-residency.md` — the placement/residency proposal Lane 7 finds
  does not do what it implies; no schema impact, correction feeds back into the ADR.
- `.planning/ADR-011-data-tok-labels-stay-english.md` — the data-tok pending-value set the seed
  generator carries into `content_strings.pending_value` (D-22).
- `.planning/ADR-014-owner-sitting-2026-08-22.md` — **the most recent binding source for Phase
  2 migrations.** §1 currency, §2 the four GSD-LAUNCH-vs-Phase-2 schema conflicts (resolved in
  Phase 2's favour — matches D-07/D-11/D-13/D-10), §5 the now-confirmed policy numbers (D-35),
  §6 product decisions relevant to seed data (D-29, D-36). Read in full: several of its numbers
  contradict what 02-RESEARCH.md still describes as open or NULL, because the research predates
  or does not incorporate this sitting.

### Requirements and roadmap
- `.planning/ROADMAP.md` § Phase 2 — goal, the five success criteria, requirement list.
- `.planning/REQUIREMENTS.md` — DATA-01, DATA-02, DATA-03, DATA-04, DATA-07, AUTH-05 in full
  (lines 41–56, status table lines 198–210).
- `docs/build/GSD-LAUNCH.md` §Phase 2 (~lines 62–78) — the original table sketch, **superseded
  on four rows**: `bookings.price_chf numeric` → `price_snapshots` (D-07); `bookings.manage_token
  uuid` → `booking_access_tokens` (D-15); `bookings.assigned_chauffeur_id` → assignment on
  `booking_legs` (D-13); one mutable `settings` → `settings` + `settings_versions` (D-10). The
  migration must not carry both shapes for any of the four.
- `docs/build/GSD-LAUNCH.md` § Secrets — where the three new Supabase CI secrets
  (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`) join the existing
  Cloudflare secrets matrix.
- `docs/build/OWNER-ANSWERS.md` — the owner-answer log research points to for U7-class
  questions, now resolved in ADR-014 §6 / D-29.

### Runtime contract this schema mirrors
- `app/vamos-ops-data.js` — the `VamosOps` client-side data contract (vehicles, chauffeurs,
  bookings, customers, coupons, routes, rates, surcharges, settings, profile). DATA-01 requires
  the schema to mirror every table this file names; its seed arrays are what
  `generate-seed.mjs` reads where a JS/JSON source exists (reviews) and what it hard-codes
  where none exists (vehicle classes, D-36).

### Project rules
- `CLAUDE.md` — Law 04 (a pending value is a labelled gap — the schema-level analogue is "seed
  NULL, never invent"), the four-languages-same-pass rule the content-string seed must satisfy.
- `.claude/CLAUDE.md` — the fixed stack (Hyperdrive, Supabase eu-central, postgres.js), the
  security posture (RLS on every table, server-authoritative quotes, Stripe webhook
  verification, idempotent booking/payment creation, TOTP MFA for staff, audit trail on
  booking/price/payment/assignment changes) — this phase builds most of that posture.

</canonical_refs>

<deferred>
## Deferred Ideas

Owner/counsel-only questions the research raised that are not trackable engineering decisions —
each needs a person, not a migration, to answer. Phase 2 ships the schema shape that survives
whichever answer lands; none of these block Phase 2.

- **U6 — one price-snapshot row per eligible vehicle class per quote, or only the chosen
  class?** Settle when Phase 4's `/api/quote` response contract is written.
- **U11 — is a wheelchair declaration Art. 9 (health) data?** Counsel question for
  privacy-policy wording, Phase 6.
- **U12 — GDPR Art. 17(3)(b) vs (e) as the retention basis for the Swiss CO Art. 958f duty?**
  Counsel citation question only; the redact-not-delete pattern (D-19) is correct either way.
- **U13 — is Cloudflare Regional Services available/affordable, and does its Queues/Cron
  coverage gap change what ADR-007 can promise?** Cloudflare account-team question; owned by
  the ADR-007 revision, Phase 10.
- **U17 — what a deferred exclusion-constraint violation looks like to a dispatcher.** Owned by
  Phase 8 (dispatch swap) with Phase 9 (flight-delay shift).
- **U18 — `booking_notifications` template vocabulary and locale fallback.** Phase 2 ships the
  table and `dedupe_key` contract only; owned by Phase 7 (Resend wiring).
- **U19 — Stripe out-of-order and stuck-event handling.** Phase 2 ships the columns/indexes
  only; owned by Phase 5/7.
- **U20 — who generates `bookings.idempotency_key`, and its lifetime.** Phase 2 ships the
  unique partial index only; owned by Phase 7 (checkout POST contract).
- **U21 — the `booking_status` roll-up trigger for every leg-terminating path other than
  `manage_booking_cancel`.** Phase 2 ships the vocabulary and the rule; owned by Phase 9.
- **U22 — where the ops assign dialog gets `estimated_duration_minutes` for a phone booking.**
  Owned by Phase 8 (OPS-03/OPS-04 UI).
- **The guest-booking → account claim flow's UI/email steps** (ADR-014 §2 "extends Q2"): the
  schema (`booking_access_tokens`, email-anchored `customers`) already supports it; the signup/
  verify flow itself is AUTH-06, Phase 8.

</deferred>

---

*Phase: 02-data-schema-rls-staff-auth-foundations*
*Context gathered: 2026-08-23 via research express path*
