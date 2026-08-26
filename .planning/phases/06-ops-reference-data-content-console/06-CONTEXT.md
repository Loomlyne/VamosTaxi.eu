# Phase 6: Ops Reference Data & Content Console - Context

**Gathered:** 2026-08-24
**Status:** Ready for planning
**Source:** Research express path (06-RESEARCH.md, Phase 2 CONTEXT/SCHEMA-DRAFT, Phase 3 CONTEXT,
Phase 5 RESEARCH, ADR-005/011/012/014)

<domain>
## Phase Boundary

Staff run the operational reference data and site content behind the public site from a
role-gated `/ops/*` console — reachable only by an invited, MFA-verified (`aal2`) session, with
Postgres RLS as the actual boundary and Next.js middleware as a UX-layer redirect only. Every
table this phase's screens edit is Phase 2's schema, already migrated (as far as it has executed)
and RLS-reviewed; this phase writes no migration of its own.

Four structural findings drive this phase's shape, not the mocks alone:

- **(a)** `OpsContent.dc.html` is a link directory to other page mocks, not the string editor
  I18N-07 requires — the editor is designed fresh against `content_strings`' three `$meta` flags.
- **(b)** `OpsPricing.dc.html` mutates each row's `live` flag directly; it has no draft/publish
  concept at all, though `rate_versions` (Phase 2) demands one — the publish flow is designed
  fresh against the DB triggers' error vocabulary (SQLSTATE, never message text).
- **(c)** `OpsFleet.dc.html` has no photo-upload control despite `vehicles.photo_path`/
  `chauffeurs.photo_path` existing in the schema.
- **(d)** TOTP enrolment, the MFA challenge screen, and invite-acceptance appear nowhere in
  `AuthForm.dc.html`'s prop surface (`mode: signin|signup|forgot` only) — these are genuinely new
  screens, flagged as design-review checkpoints, not ports.

A fifth finding corrects the roadmap's own premise: ROADMAP's Phase 6 success criterion 4 says
"the ~600-string legal-page dictionary migrates here." That figure is stale — the dictionary
(`apps/web/i18n/messages/en.json`) already holds 1,495 leaf keys, translated except 19
proper-noun residuals, verified by line-count comparison across `de`/`fr`/`ar`. This phase's
content work is the DB-backed editor and the `loadRawMessages()` loader swap (I18N-07's actual
requirement), not a translation-filling push against a number that no longer describes reality.

This phase can be **planned** now against frozen upstream contracts, but its **execution**
inherits three different upstream states: Phase 2 is mid-flight (schema/RLS this phase reads are
landing incrementally, not yet all merged); Phase 3 is planned but not executed (`packages/db`'s
`withIdentity`/`asStaff`/`publicSql` module does not exist on disk yet, though its signature is
frozen in `03-CONTEXT.md`); Phase 5 has no plan yet, only research, and is the phase most likely
to race Phase 6 to create the shared `apps/web/lib/supabase/*` client module both need. What is
locally buildable regardless: the route/middleware skeleton, the TOTP/MFA/invite screen markup,
and every screen's static chrome, against a local `supabase start` or mocked data. What cannot
start until Phase 3 actually lands is any Server Action that calls `asStaff`/`publicSql` for
real.

Requirements covered: OPS-06, OPS-07, OPS-08, OPS-09, OPS-10, I18N-07, AUTH-05 (ops half).

**In scope:**
- The role-gated route group `app/[locale]/(ops)/ops/**`, `OpsSidebar` shell, middleware
  redirect chain (no user → sign-in; no `vamos_role` → home; not `aal2` → MFA challenge).
- Staff sign-in, TOTP enrolment, MFA challenge, invite-accept — the AUTH-05 UI half, built as
  new screens, not ports.
- Fleet CRUD (vehicle classes, vehicles, chauffeurs) with real R2 photo upload.
- Pricing redesigned around `rate_versions` draft→publish (distance rates, fixed routes,
  surcharges, coupons), every priced field rendering `CHF 000`/NULL by data.
- Read-only customers + booking history (OPS-07); reviews publish/hide/reorder + R2 photo
  (OPS-08).
- Business settings singleton editor + read-only current policy version display; staff
  management (invite/deactivate/role change); staff's own profile (OPS-09).
- A real `content_strings` editor surfacing all three `$meta` flags, a legal-doc coverage view,
  and — sequenced last — the `loadRawMessages()` swap to a DB-backed read (I18N-07).
- R2 bucket provisioning with `jurisdiction: "eu"` for chauffeur/vehicle/review photos.

**Out of scope:**
- No booking mutation (assign, cancel, refund, confirm) — that is OPS-01…05, Phase 8.
- No live board or Realtime subscriptions — Phase 8 (OPS-01). Every screen here uses a Server
  Action + revalidation.
- No `settings_versions` "publish a new policy version" workflow by default — a read-only
  current-version display only (see Decisions, settings scope).
- No quote/pricing *engine* logic — Phase 4 computes prices; this phase only curates the rate
  book that feeds it.
- No CHF price matrix, ever, in any migration, fixture, or screenshot this phase produces.
- No customer-facing account pages (`/account/*`) — Phase 5's explicit exclusion (its own D-01),
  inherited here unchanged.

</domain>

<decisions>
## Implementation Decisions

Every bullet cites the originating research decision (`research D-n`) or uncertainty
(`research Un`) in parentheses for traceability back to `06-RESEARCH.md`.

### Route architecture, shared client module, data-access invariants
- **D-01:** (research D-01, resolves U1) `/ops/*` nests under `app/[locale]/(ops)/ops/**` —
  canonical `/ops/*` unprefixed for English, `/de/ops/*` etc. — not an unprefixed route group
  outside `[locale]`. The ops mocks call `VamosLocale` throughout and Law 03 is platform-wide;
  `HANDOFF-CLAUDE-CODE.md`'s older "locale in a cookie" language predates and is superseded by
  Phase 1's actual `[locale]`-segment decision (D-11/D-12). One-way and costly to reverse once
  invite-email links are published — locked now rather than left open into Wave 1.
- **D-02:** (research D-03) Every ops write goes through `asStaff(env, claims, fn)` on
  `HYPERDRIVE_NOCACHE`, imported only via the named wrapper — never a raw `postgres` import
  (Phase 3 D-08/D-10, CI-enforced; a forgotten wrapper is SQLSTATE `42501`).
- **D-03:** (research D-02) Public read of `content_strings` goes through `publicSql(env)` on the
  cacheable `HYPERDRIVE` binding; the swap point is exactly `apps/web/i18n/request.ts`'s
  `loadRawMessages()` (Phase 1's seam, Phase 3 D-11's branding) — nothing else in that file moves.
- **D-04:** (research U4) `apps/web/lib/supabase/{server,middleware,client}.ts` is shared with
  Phase 5, which needs the same `@supabase/supabase-js` + `@supabase/ssr` client factories.
  Whichever phase's Wave 1 plan lands first creates the module; the other phase's plan imports it
  rather than assuming greenfield — noted explicitly in both phases' plan files so the
  second-landing planner checks before recreating it.

### AUTH-05 UI — three screens with no mock (finding d)
- **D-05:** (research D-06) TOTP enrolment, MFA challenge, and invite-accept are net-new screens
  built from existing Vamos primitives (`Card`, `Input`, `Button`, `Alert`, a step indicator) —
  no mock exists to port. Flag each for an owner/design look at its first-draft checkpoint
  (`checkpoint:human-verify`), the same pattern the project already uses for other no-mock
  screens (Phase 8's phone-booking screen).
- **D-06:** (research D-11, code example) The staff invite Route Handler is service-role only,
  gated behind the caller's own `aal2` admin session, calls `inviteUserByEmail` with `redirectTo`
  pinned to a known staging/production origin (never derived from request input), and writes the
  authoritative `staff` row itself — `invited_role` in `user_metadata` is display-only cosmetic
  metadata, never authoritative.
- **D-07:** (research D-08) Staff-management writes (invite, deactivate, role change) are
  admin-only at the RLS layer (`staff_admin_write`), matching `02-SCHEMA-DRAFT.md` §14c.
- **D-08:** (research U2) Execution check, not a code fallback: confirm the Custom Access Token
  Hook is actually enabled on the live Supabase dashboard for `yaumjzvylngfjhtuffqs` before
  relying on `app_metadata.vamos_role` appearing in a minted JWT — pgTAP (Phase 2) proves only
  the hook *function*, not that the auth server invokes it. If unset, every staff query returns
  zero rows with no diagnosable error. Blocks every RLS-gated screen in this phase.
- **D-09:** (research U3) Execution check: read the `@opennextjs/cloudflare` changelog between
  the version the cookie-folding bug (`opennextjs-cloudflare#501`) was filed against (0.5.12) and
  this repo's pinned `1.20.2`. Regardless of the finding, use `NextResponse.next({ request })` in
  every cookie-setting path in ops middleware, never a freshly constructed `NextResponse(body)` —
  Supabase's own documented pattern, independent of whether the specific bug is fixed.
- **D-10:** (research U7) `packages/db/src/claims.ts`'s `ClaimsFor<'staff'>` shape is re-read once
  Phase 3 actually lands (it is designed, not executed, as of this research) before any Server
  Action in this phase calls `asStaff`. Blocks every Server Action this phase writes.

### Pricing — redesigned around draft/publish, never a live toggle (finding b)
- **D-11:** (research D-04, Pattern 2) The Pricing screen is redesigned around `rate_versions`'
  draft→publish model — a completeness checklist gating a publish action — not ported as the
  mock's per-row `live` toggle. Client-side pre-validation is a UX courtesy; the DB's
  `tg_rate_version_transition` trigger is the actual gate.
- **D-12:** (research D-07, Pitfall 4) `rate_versions_admin_write` is `AS RESTRICTIVE FOR ALL` —
  a dispatcher's query returns zero rows, never a 403. The Pricing (and Settings→staff) nav item
  must not render at all for a dispatcher role, decided server-side from the rendered session,
  never a client-side `role !== 'admin'` check that could be built visible-but-disabled.
- **D-13:** (research Pattern 2) Publish failures are branched on SQLSTATE/`err.code`
  (`23514`/`P0001`), never parsed from message text; the UI re-queries which classes/routes/
  surcharges are still unpriced to surface the specific gap, matching Phase 3 D-08's rule.
- **D-14:** Every priced field renders `CHF 000`/NULL by data (NULL columns), never by a UI
  conditional. The publish button stays provably inert against the seed's single `draft`
  `rate_versions` row — no `live` row exists until the CHF matrix lands. `PRICING_PREVIEW=true`
  is the only sanctioned way to show draft numbers on staging, and even then never a real one. No
  CHF amount is written by this phase's engineering anywhere — not a migration, not a fixture,
  not a screenshot, not a demo value.

### Content strings editor — a real table, not a directory (finding a)
- **D-15:** (research D-05, D-12) The Content screen is redesigned into a real per-key
  string-table editor: per-language columns, all three `content_strings` `$meta` flags
  (`pending_value`, `non_translatable`, `no_param_reason`) surfaced as distinct,
  separately-toggleable states — never collapsed into one "translatable" boolean
  (`02-SCHEMA-DRAFT.md` §12's explicit warning: "drop this flag and a pending value silently
  becomes a stated fact").
- **D-16:** Stale-premise correction (see `<domain>`): the phase's content work is the DB-backed
  editor plus the loader swap, not a fill-the-blanks translation push against ROADMAP's
  superseded ~600-string figure. Do not size a Content plan task against that number.
- **D-17:** (research Pitfall 5) The `loadRawMessages()` swap to `publicSql` is sequenced as the
  *last* task in the Content plan, after the editor is built and proven against a seeded
  `content_strings` table, with an explicit rollback (revert to the JSON loader) as a named
  fallback step — swapping early risks a blank or English-only public site.
- **D-18:** A legal-doc language-coverage view ships alongside the editor. The imprint's pending
  street/postcode (ADR-014 §7, "stays TBC") renders in the editor exactly like any other
  `pending_value` row — not a special case, not a hard-coded exception.

### Photo storage — R2, server-relayed, never base64/localStorage (finding c)
- **D-19:** (research D-09, D-10) Photo storage is R2 (`PHOTOS` binding, already declared in
  `apps/web/wrangler.jsonc`), never Supabase Storage. Upload is a real write via a server-side
  Route Handler/Server Action, never the mock's `FileReader.readAsDataURL()` → localStorage
  pattern. `vehicles.photo_path`/`chauffeurs.photo_path`/`reviews.avatar_path` store R2 object
  keys, never data URIs.
- **D-20:** (research U5) Execution check, run before the first photo-upload task in Fleet or
  Reviews: confirm via the Cloudflare dashboard or `wrangler r2 bucket list` whether
  `vamos-photos-{staging,production}` already exist without `jurisdiction: "eu"`. If absent,
  `wrangler r2 bucket create … --jurisdiction=eu` is the literal first command — irreversible
  after creation (Phase 2 D-24). Whichever of the Fleet or Reviews plan runs this task first owns
  the bucket; the other imports the binding, never re-creates it.
- **D-21:** (research U6) Execution check: look for `images.binding = "IMAGES"` in
  `apps/web/wrangler.jsonc` at the start of the Fleet/Reviews plan. If absent (Phase 1 flagged it
  for Phase 5, not guaranteed to land first), use a plain `<img>` against the R2 read path — a
  display-quality gap, not a correctness one.
- **D-22:** (research Owner blocker 2) Zero real vehicle/chauffeur/review photography exists at
  ship time (ADR-014's "still open" list). The upload feature and the icon/initials fallback
  rendering (matching `OpsReviews.dc.html`'s existing pattern) must both be correct with **zero**
  photos supplied — that is the expected state to build against, not a degraded one.
- **D-23:** (research Open Question 3) The R2 photo read path defaults to a Worker route
  (`/photos/[key]`) proxying `PHOTOS.get(key)`, keeping the bucket private, for uniform
  cache-header control under the project's WAF posture — revisit only if a measured latency cost
  argues otherwise.

### Staff invite delivery — a double blocker (copy + mailer)
- **D-24:** (research D-11, Pitfall 2, Owner blocker 3) Wiring Resend as Supabase Auth's custom
  SMTP provider (a dashboard setting, not code) is a named prerequisite task, not an assumption —
  Supabase's default mailer is ~2 emails/hour and restricted to team-listed addresses, so it
  cannot deliver a real staff invite. The exact blocking point is the **first real, non-`@example`
  invite in staging**, not the whole phase; local `supabase start` (Inbucket/CLI-printed links) is
  unaffected. The invite *copy/template* itself is a separate, still-open owner item (ADR-014's
  "still open" list, independent of the mailer) — build the mechanism against placeholder copy
  and swap text when the copy lands; do not block the mechanism on the copy.

### Reviews, customers, settings — scope and defaults
- **D-25:** (research D-13) Review reordering is a "move up/down" Server Action reassigning
  adjacent `sort_order` integers — no drag-and-drop library; matches the mock's existing
  affordance and the schema's existing `(published, sort_order, created_at desc)` index.
- **D-26:** (research D-14) OPS-07 (customer + booking history) is read-only against
  `bookings`/`booking_legs` in this phase — no booking mutation ships here; that is OPS-01…05,
  Phase 8.
- **D-27:** (research D-16, U9) `settings_versions` (the immutable policy history — cancellation
  tiers, waiting minutes, all seeded by ADR-014 §5, cf. ADR-005's settings-driven cancellation
  copy) gets a **read-only "current version" display** in this phase's Settings screen. Publishing
  a *new* policy version from the console is out of this phase's default scope; the mutable
  `settings` singleton is what OPS-09's "edit business settings" maps onto. If a later planning
  pass wants full versioned-policy editing in V1, that is a materially larger scope change to
  confirm explicitly, not a silent default.
- **D-28:** (research U8) Reset-MFA for a staff member defaults to **deferred** —
  `docs/build/MISSING-FEATURES.md` marks it the sole 🟡 (launch-window) item in an otherwise 🔴
  staff-management list; invite, role-change and deactivate stay in this phase's scope.
- **D-29:** (research U11) Every CRUD screen in this phase uses a Server Action plus
  `router.refresh()`/revalidation for reactivity, not Realtime — no screen here has a genuine
  multi-staff-concurrent-edit scenario in practice (one dispatcher edits at a time). Realtime
  stays Phase 8's territory (OPS-01, the live board).

### Console chrome, i18n, and the platform laws
- **D-30:** (research D-15) The ops console's own chrome (nav labels, buttons, hints, empty
  states) is translated through the identical `content_strings`/`t()` runtime as the public site
  — Law 03 is platform-wide by explicit project rule; this phase is not exempt because its
  audience is staff, not travellers.
- **D-31:** Draft/pending states in Pricing and Content use charcoal, white with a
  `--vt-border-subtle` hairline, or `--vt-danger`/`--vt-success` — never `--vt-yellow-50…300` or
  `-600/-700` — even though "draft" is exactly the state a generic admin UI reaches for a yellow
  pill to express (Law 02).
- **D-32:** No CHF amount is ever written by this phase's engineering — not a migration, not a
  fixture, not a screenshot, not a demo value behind `PRICING_PREVIEW` (Law 04, reinforcing
  D-14).

### Cross-phase sequencing — the hard precondition
- **D-33:** Phase 6 can be **planned** now against frozen upstream contracts, but three upstream
  phases gate **execution** differently: Phase 2 is mid-flight (schema/RLS this phase reads land
  incrementally, not all merged as of this research); Phase 3 is planned but not executed
  (`packages/db`'s actual module is absent from disk; its own P6 — staging Hyperdrive wiring — is
  owner-gated on Cloudflare credentials per Phase 3 D-29); Phase 5 has no plan yet, only research,
  and is the phase most likely to race Phase 6 for the shared `lib/supabase/*` module (D-04).
  What is locally buildable regardless of all three: the route/middleware skeleton, the
  TOTP/MFA/invite screen markup, and every screen's static chrome, against a local
  `supabase start` or mocked data. What cannot start until Phase 3 actually lands on disk is any
  Server Action that calls `asStaff`/`publicSql` for real.

### Claude's Discretion
- Exact plan-to-file mapping beyond the research's proposed P1–P7 split — merging plans (e.g.
  Fleet + Reviews for shared R2 setup) or splitting Settings from staff-management, as long as
  P1 (shell) and P2 (AUTH-05 UI) stay a hard gate before P3–P7.
- Playwright spec file granularity beyond the five named in the Validation Architecture table —
  splitting or combining within a screen's test file is fine as long as each requirement row's
  behaviour is covered.
- Whether R2 bucket creation (D-20) is a task in the Fleet plan or the Reviews plan, as long as
  exactly one of them creates it and the other imports the binding.
- Exact visual layout of the three no-mock AUTH-05 screens (D-05) and the redesigned
  Pricing/Content screens, as long as they compose only existing Vamos design-system primitives
  and are flagged for an owner/design look at first draft.
- Whether `jwt-decode` is added for client-side nav-hide UX (research A2) — purely additive,
  no security implication either way since RLS is the real gate (D-12).

### Proposed plan split `[informational]`
Reproduced from `06-RESEARCH.md`'s "Proposed Phase 6 plan split" — a recommendation the planner
may adopt, adapt or replace; not a locked decision. The coverage gate should not treat this table
or the wave diagram as D-NN items.

| # | Plan | Goal (one line) | Depends on | Parallel with |
|---|---|---|---|---|
| **P1** | Ops shell, routing, password sign-in | Phase 3 executed; coordinate with Phase 5 on `lib/supabase/*` (D-04) | nothing (hard gate) |
| **P2** | TOTP enrolment, MFA challenge, invite-accept | P1 | P3–P7 authored in parallel, not staff-usable until this lands |
| **P3** | Fleet: vehicle classes, vehicles, chauffeurs + photo upload | P1, P2 | P4, P5, P6, P7 |
| **P4** | Pricing (draft/publish) & coupons | P1, P2 | P3, P5, P6, P7 |
| **P5** | Customers (read-only) + Reviews (publish/hide/reorder + photo) | P1, P2, R2 bucket coordination with P3 | P3, P4, P6, P7 |
| **P6** | Content strings editor + the `loadRawMessages` swap | P1, P2 | P3, P4, P5, P7 |
| **P7** | Settings, staff management, profile | P1, P2 | P3, P4, P5, P6 |

```
P1 ── P2 ──┬── P3 ──┐
           ├── P4 ──┤
           ├── P5 ──┼── (phase gate: full Playwright + pgTAP suites, German/Arabic pass)
           ├── P6 ──┤
           └── P7 ──┘
```
Wave 1: P1 alone. Wave 2: P2 alone (every other screen assumes an `aal2` session to test
against). Wave 3: P3–P7 in parallel — five file-disjoint CRUD surfaces against tables Phase 2
has already migrated. The one coordination point in Wave 3 is R2 bucket creation (D-20).

</decisions>

<specifics>
## Specific Ideas

- The six screens with no mock, exact list: **TOTP enrolment** (QR + secret fallback + confirm
  code), **MFA challenge** (returning staff, post-password, pre-`aal2`), **invite-accept** (set
  password → straight into mandatory enrolment), **the real content-string editor**, **the
  pricing draft/publish workflow**, **vehicle/chauffeur photo upload**.
- Recommended route tree: `app/[locale]/(ops)/ops/{layout,sign-in,mfa-challenge,accept-invite,
  vehicles,chauffeurs,pricing,coupons,customers,reviews,content,content/legal,settings,
  profile}/page.tsx`, `api/staff/invite/route.ts`; `lib/supabase/{server,middleware,client}.ts`;
  `components/ops/{OpsSidebar,Fleet*,Pricing*,Content*,Customers*,Reviews*,Settings*,Profile*}.tsx`.
- Named RLS objects the UI must respect: `chauffeurs_staff_gate`, `rate_versions_admin_write`,
  `staff_admin_write` — all `AS RESTRICTIVE`, all keyed on `app.is_staff()`/`app.is_admin()` +
  `aal2`.
- Trigger name: `tg_rate_version_transition` — raises on an incomplete publish, SQLSTATE `23514`
  or `P0001`.
- `content_strings`' three `$meta` flags, exact names: `pending_value`, `non_translatable`,
  `no_param_reason`.
- R2 binding `PHOTOS`; bucket names `vamos-photos-staging` / `vamos-photos-production`; proposed
  read path `/photos/[key]` Worker route.
- Packages to install: `@supabase/supabase-js@2.112.3`, `@supabase/ssr@0.12.4` — both slopcheck
  `[OK]`, re-verify versions immediately before the install task (`npm view … version`).
- Test files the plan must create: `apps/web/tests/integration/{ops-role-gate,ops-aal-gate,
  ops-pricing-publish,ops-reviews-publish,content-string-edit}.spec.ts`; seeded staff fixtures
  (a dispatcher and an admin `staff` row, one with a TOTP factor pre-enrolled) — none exist yet,
  Phase 2's seed covers reference data only.
- `pnpm --filter web exec playwright test tests/integration/ops-<area>.spec.ts` (quick run);
  `pnpm test:visual` + `pnpm db:test` (full suite, phase gate).

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase research (primary source for this CONTEXT)
- `.planning/phases/06-ops-reference-data-content-console/06-RESEARCH.md` — full lane analysis,
  the D-01–D-16 decision table, the U1–U11 uncertainty table, "where sources disagreed," the six
  screens with no mock, the six owner blockers, the P1–P7 plan split, Validation Architecture,
  Security Domain, Package Legitimacy Audit.

### Cross-phase contracts this phase binds to
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-CONTEXT.md` — D-04/D-05 (staff
  claim + `aal2`, three-layer enforcement), D-09 (`pricing_live` is not a boolean, the freeze
  trigger), D-10 (`settings`/`settings_versions` split), D-17/D-18 (`audit_log`/`booking_events`,
  append-only), D-22 (seeded `content_strings`/`reviews`), D-34/D-35 (nullable priced columns,
  ADR-014-seeded policy numbers).
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-SCHEMA-DRAFT.md` §6
  (`rate_versions` freeze trigger), §12 (`content_strings` three-flag design, `reviews`), §14c
  (staff/admin RLS split).
- `.planning/phases/03-hyperdrive-data-access-wiring/03-CONTEXT.md` — D-07/D-08 (the frozen
  `withIdentity(cs, kind, claims, fn, opts?)` signature and named wrappers), D-09 (`PG_ROLE` map),
  D-10 (forgotten-wrapper `42501`), D-11 (`publicSql` branded to `content_strings` + three other
  tables on `HYPERDRIVE`), D-12 (pricing tables never granted to `vamos_public`).
- `.planning/phases/05-public-surfaces-customer-accounts/05-RESEARCH.md` — D-01 (Phase 5's route
  scope excludes `/account/*`, checkout, confirmation — Phase 8's territory, not assumable here),
  D-04 (customer-linking trigger, not relevant to staff), D-13 (Phase 5 reads FAQ/reviews via
  `publicSql` *ahead of* this phase's loader swap — a deliberate two-source window, not a
  dependency), D-14 (`SiteHeader`'s signed-in branch is Phase 5's, unrelated to `OpsSidebar`),
  P1 plan row (creates `apps/web/lib/supabase/{server,client,middleware}.ts` — the same module
  D-04 above coordinates).

### Requirements and roadmap
- `.planning/ROADMAP.md` § Phase 6 — goal, four success criteria (criterion 4's ~600-string
  premise is corrected by D-16), requirement list, `Depends on: Phase 3`, `Parallel with: Phase
  4, Phase 5`.
- `.planning/REQUIREMENTS.md` — OPS-06…10 (lines 113–117), I18N-07 (line 36), AUTH-05 (line 56);
  status table lines 196, 210, 252–256.
- `docs/build/MISSING-FEATURES.md` — the per-screen gap audit naming OpsContent/OpsPricing/
  OpsFleet as needing more than a port, and the 🟡 reset-MFA / role-based-nav notes.
- `HANDOFF-CLAUDE-CODE.md` §7–8 — the "ask before inventing these" rule for no-mock screens, and
  the stale route-table language D-01 supersedes.

### Architecture decisions that bind this phase
- `.planning/ADR-005-cancellation-copy-settings-driven.md` — why the 24 h cancellation promise is
  a settings-driven value, not copy; feeds D-27's read-only current-version display (the value
  this phase must show, not let the console silently fork).
- `.planning/ADR-011-data-tok-labels-stay-english.md` — the "a pending value is a labelled gap"
  precedent this phase's `pending_value` editor state (D-15/D-18) extends into a DB-backed
  equivalent.
- `.planning/ADR-012-dictionary-duplicates-and-product-names.md` — product names (`Economy`,
  `Business`, `Van`, `Vamos Taxi`) are never translated; the Content editor's
  `non_translatable` flag (D-15) is exactly the mechanism that must keep these rows out of any
  translation workflow.
- `.planning/ADR-014-owner-sitting-2026-08-22.md` — §4 (accounts: Resend/Cloudflare state
  feeding D-24), §5 (policy numbers now seeded, feeding D-27), §6 (vehicle-class capacities,
  relevant to Fleet's editable fields), §7 (Qurova open, imprint TBC feeding D-18), "still open"
  list (CHF matrix, photography, staff invite copy — feeding D-14, D-22, D-24).

### Project rules
- `CLAUDE.md` — Law 02 (no tinted yellow, feeding D-31), Law 03 (four languages, feeding D-30),
  Law 04 (a pending value is a labelled gap, feeding D-14/D-32).
- `.claude/CLAUDE.md` — the fixed stack, TOTP MFA for staff, audit trail on booking/price/
  payment/assignment changes (this phase does not touch that trail directly, but its staff
  actions are what the trail records).

</canonical_refs>

<deferred>
## Deferred Ideas

Owner/counsel-only questions, or items explicitly owned by a later phase — each needs a person
or a later phase's execution, not a Phase 6 migration or component. None of these block Phase 6.

- **The CHF price matrix** — still open. Phase 6 ships the Pricing screen provably inert against
  it (D-14); the number itself is an owner decision with no date.
- **Vehicle and destination photography** — still open. Phase 6 ships the upload feature and the
  zero-photo fallback (D-22) correctly; the photos themselves are an owner-supplied asset with
  no date.
- **Staff invite email copy/template** — still open (ADR-014's "still open" list), independent of
  the Resend/SMTP delivery mechanism this phase must wire (D-24).
- **Imprint street/postcode** — stays TBC (ADR-014 §7); the Content editor renders it as an
  ordinary `pending_value` row (D-18), nothing further to build.
- **Wheelchair/Art. 9 (health-data) classification** (research U10, inherited from Phase 2's own
  U11) — a counsel question for privacy-policy wording. No schema field for an accessibility
  declaration exists yet, so nothing in this phase's engineering is blocked; only a hypothetical
  future field would need counsel's answer first.
- **Qurova webfont purchase** — open until bought (ADR-014 §7). No Phase 6 impact; this phase
  renders through the same design system and inherits whatever font-serving state Phase 1/5 land
  in.
- **Full `settings_versions` versioned-publish workflow** — deferred by default (D-27). If a
  later decision expands OPS-09 to include publishing new policy versions from the console, that
  is a materially larger scope addition, not an extension of this phase's plan.
- **Reset-MFA for a staff member** — deferred by default (D-28), the sole 🟡 item in an otherwise
  in-scope staff-management list.
- **Booking mutation** (assign, cancel, refund, confirm) and the **live board** — both Phase 8
  (OPS-01…05). This phase's customer/booking views are read-only by design (D-26).
- **Realtime ops-board reactivity** — Phase 8 (OPS-01). This phase's screens use Server Action +
  revalidation only (D-29).
- **Cloudflare Regional Services / ADR-007's counsel question** — Phase 10's territory; unrelated
  to this phase's photo-storage or data-access choices.

</deferred>

---

*Phase: 06-ops-reference-data-content-console*
*Context gathered: 2026-08-24 via research express path*
