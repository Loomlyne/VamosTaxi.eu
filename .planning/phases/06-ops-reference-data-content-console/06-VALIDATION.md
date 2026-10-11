---
phase: 06
slug: ops-reference-data-content-console
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-11
---

# Phase 06 — Validation Strategy (reconstructed, State B)

> Rebuilt on 2026-10-11 from 06-RESEARCH.md "Validation Architecture", the 13 PLAN/SUMMARY pairs, 06-VERIFICATION.md and the tests that exist on disk. Every path below was checked with `ls`. Statuses mean "a test exists that targets this behaviour". This audit did not re-run any of them (the Method line in 06-VERIFICATION.md records the last run on 2026-09-01: 3 files, 24 tests). The phase was replanned from a React twin to the DC console (`.dc.html` on `dashboard.vamostaxi.site`); the Wave 0 spec names in the research were never created and were replaced by the `ops-dc-*` specs.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit, `*.test.ts`) + Playwright (`tests/integration/*.spec.ts`, project `component-1440`, mostly database-free source and envelope proofs) + pgTAP (`packages/db/supabase/tests`) |
| **Config file** | `apps/web/vitest.config.ts` (includes `lib/**/*.test.ts`, `tests/unit/**`; excludes `tests/integration/**` and `**/*.spec.ts`), `apps/web/playwright.config.ts`, `packages/db/supabase/config.toml` |
| **Quick run command** | `pnpm --filter web exec vitest run lib/ops` and `pnpm --filter web exec playwright test tests/integration/ops-dc-<area>.spec.ts --project=component-1440` |
| **Full suite command** | `pnpm test:unit` + `pnpm test:visual` + `pnpm db:test` (pgTAP; no Docker for Vamos: `pnpm test:db-lab` / `scripts/test-lab/lab.sh pgtap <name>`) |
| **Estimated runtime** | not measured in this audit |

Notes: `content-string-edit.spec.ts`, `ops-claims-bridge.spec.ts` (live cases) and `home-content.spec.ts` need a local Supabase stack and skip when auth is down (fail under `REQUIRE_DB=1`). `ops-dc-*` specs are database-free and only prove envelopes, route re-exports and DC source wiring.

---

## Sampling Rate

- **After every task commit:** the relevant single `ops-dc-*` spec plus the matching `lib/ops/*.test.ts`
- **After every plan wave:** `pnpm test:unit` and `pnpm --filter web exec playwright test tests/integration/ops-*.spec.ts --project=component-1440`
- **Before `/gsd:verify-work`:** full Vitest + Playwright + pgTAP green, then the manual German-1080px and Arabic `dir="rtl"` pass on each new screen
- **Max feedback latency:** unmeasured

---

## Per-Task Verification Map

Task IDs are plan-level (the DC replan has no research-style task IDs).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01 | 01 | 1 | OPS-10 | Elevation | Ops console reachable only by staff; React ops removed, host gate serves DC | unit + source | `pnpm --filter web exec vitest run tests/unit/ops-dashboard-host.test.ts lib/ops/staff-gate.test.ts` | ✅ | ✅ exists |
| 06-02 | 02 | 1 | OPS-10 | Spoofing / EoP | Unauthenticated JSON 401 `no-session`; non-staff 403 `not-staff`; dispatcher write 403 `not-admin`; inactive staff row refused; DB cannot answer is 503, not open | unit | `pnpm --filter web exec vitest run lib/ops/staff-json.test.ts lib/ops/staff-active.test.ts lib/ops/session.test.ts` | ✅ | ✅ exists |
| 06-02 | 02 | 1 | OPS-10 | EoP | Role claim bridge: `requireStaffClaims` / `requireAdminClaims` map session to claims; dispatcher refused admin; no-vamos_role is not staff | Playwright (live local auth cases skip if stack down) | `pnpm --filter web exec playwright test tests/integration/ops-claims-bridge.spec.ts --project=component-1440` | ✅ | ✅ exists |
| 06-02 | 02 | 1 | OPS-10 / AUTH-05 | EoP | Dispatcher cannot reach admin-only surfaces (rate_versions, staff writes) at the database; customer gets 42501 on ops data; aal1 with factor is not staff | pgTAP | `pnpm db:test` (file `packages/db/supabase/tests/ops_role_rls.test.sql`) | ✅ | ✅ exists |
| 06-03 | 03 | 2 | OPS-10 | Spoofing | `/login` is the DC "Dispatch sign in" with password eye, POST `/api/auth`; `/ops` on the named host 308s; cookie factory uses `NextResponse.next({ request })` (D-09); accepted-invitation claim happens before redirect | Playwright source + unit | `pnpm --filter web exec playwright test tests/integration/ops-dashboard-host.spec.ts tests/integration/ops-accepted-invitation.spec.ts --project=component-1440` | ✅ | ✅ exists |
| 06-03 | 03 | 2 | AUTH-05 | EoP | Admin with enrolled factor at aal1 must step up (`needs-mfa`, own 403 code); dispatcher denied at any level; unverified factor never locks admin out; passkey session does not replace an enrolled authenticator | unit + pgTAP | `pnpm --filter web exec vitest run lib/ops/staff-gate.test.ts lib/ops/session.test.ts`; pgTAP `staff_aal2_factor.test.sql`, `staff_hook_claim.test.sql` | ✅ | ✅ exists |
| 06-03 | 03 | 2 | AUTH-05 | EoP | Staff cannot insert staff rows or escalate role; last active admin cannot be removed; staff self-service is scoped to own row | pgTAP | `pnpm db:test` (files `ops_write_denied.test.sql`, `last_admin_guard.test.sql`, `staff_self_service.test.sql`) | ✅ | ✅ exists |
| 06-04 | 04 | 3 | OPS-06 | Tampering | Fleet and chauffeurs JSON routes: 401 unauthenticated, empty list `[]`, photo upload non-staff 403; OpsFleet posts to `/api/photos/upload`, no `readAsDataURL` | Playwright source | `pnpm --filter web exec playwright test tests/integration/ops-dc-fleet.spec.ts --project=component-1440` | ✅ | ✅ exists |
| 06-04 | 04 | 3 | OPS-06 | Info disclosure | R2 upload key built server-side with fixed prefix; wrong type, oversize and magic-byte mismatch rejected; traversal keys 404; photos served from `/photos/<key>` | Playwright (pure functions) | `pnpm --filter web exec playwright test tests/integration/ops-photo-upload.spec.ts --project=component-1440` | ✅ | ✅ exists |
| 06-04 | 04 | 3 | OPS-06 | Data integrity | Vehicle class hard-delete when only draft rows reference it; otherwise hidden with reason | unit + pgTAP | `pnpm --filter web exec vitest run lib/ops/vehicle-class-write.test.ts`; pgTAP `vehicle_class_delete_hide.test.sql` | ✅ | ✅ exists |
| 06-05 | 05 | 3 | OPS-06 | Tampering | Publish without admin is 403 `not-admin`; OpsPricing posts publish and saves rows through `PUT /api/staff/rate-book`; publish chrome in en/de/fr/ar | Playwright source | `pnpm --filter web exec playwright test tests/integration/ops-dc-pricing.spec.ts --project=component-1440` | ✅ | ✅ exists |
| 06-05 | 05 | 3 | OPS-06 | Data integrity | Incomplete draft refused at publish; exactly one live `rate_versions` row; SQLSTATE mapped for the UI | pgTAP + unit | pgTAP `rate_version_publish.test.sql`; `pnpm --filter web exec vitest run lib/ops/sqlstate.test.ts lib/ops/publish-public-chf.test.ts lib/ops/draft-preview-lines.test.ts` | ✅ | ✅ exists (UI listing of missing rows: see Gaps) |
| 06-06 | 06 | 3 | OPS-06 | Tampering | Coupon routes wrap load/insert/withStaff; PATCH/DELETE re-exports; OpsCoupons uses `VamosOps.coupons`, no localStorage, no seeded WELCOME/CORPORATE/SKI rows | Playwright source | `pnpm --filter web exec playwright test tests/integration/ops-dc-coupons.spec.ts --project=component-1440` | ✅ | ✅ exists |
| 06-06 | 06 | 3 | OPS-06 | Data integrity | Coupon rule ladder (seven refusals, released redemption, per-user email) | pgTAP | pgTAP `coupon_evaluate.test.sql` | ✅ | ✅ exists |
| 06-07 | 07 | 3 | OPS-07 | Info disclosure | Customers 401 envelope, empty list `{ ok: true, data: [] }`, list is GET, detail is GET + DELETE, booking-sourced id uses `array_agg` not `min(uuid)`, OpsCustomers saves and lists History | Playwright source | `pnpm --filter web exec playwright test tests/integration/ops-dc-customers.spec.ts --project=component-1440` | ✅ | ✅ exists |
| 06-08 | 08 | 3 | OPS-08 | Info disclosure | Public reviews route returns published rows only, filters `published = true` in SQL, drops invalid `source_url`, never returns avatar, no staff imports | unit | `pnpm --filter web exec vitest run tests/unit/public-reviews-route.test.ts` | ✅ | ✅ exists |
| 06-08 | 08 | 3 | OPS-08 | Tampering | Staff reviews GET/POST/PATCH/DELETE re-exports; PATCH calls `moveReview` and `setReviewPublished`; partial PATCH keeps unnamed fields; no localStorage or fake quote seed | Playwright source + unit | `pnpm --filter web exec playwright test tests/integration/ops-dc-reviews.spec.ts --project=component-1440`; `pnpm --filter web exec vitest run lib/ops/reviews-patch-merge.test.ts` | ✅ | ✅ exists |
| 06-08 | 08 | 3 | OPS-08 | Info disclosure | Public roles cannot select `booking_id`, ratings, `photo_path` | pgTAP | pgTAP `reviews_column_grants.test.sql` | ✅ | ✅ exists |
| 06-08 | 08 | 3 | OPS-08 | — | Public home renders only published reviews, in `sort_order` then `created_at desc`; unreachable DB gives 200 plus designed error state | Playwright (local DB) | `pnpm --filter web exec playwright test tests/integration/home-content.spec.ts --project=component-1440` | ✅ | ✅ exists |
| 06-09 | 09 | 3 | OPS-09 | Tampering | Settings 401 envelope; dispatcher roster PATCH is 403 `not-admin`; settings/roster/profile re-exports; D-12 sidebar keeps `/pricing` admin-only without a disabled row | Playwright source | `pnpm --filter web exec playwright test tests/integration/ops-dc-settings.spec.ts tests/integration/ops-staff-me.spec.ts --project=component-1440` | ✅ | ✅ exists |
| 06-09 | 09 | 3 | OPS-09 | Repudiation | Console cannot UPDATE `settings_versions` (append-only for `vamos_staff`) | pgTAP | pgTAP `settings_versions_append_only_console.test.sql` | ✅ | ✅ exists |
| 06-10 | 10 | 3 | OPS-09 / I18N-07 | Tampering | Content GET/PATCH 401 envelope and re-exports; flag PATCH keeps three independent fields; Pages/Legal is "Coming soon"; staff PATCH writes through `asStaff` | Playwright source | `pnpm --filter web exec playwright test tests/integration/ops-dc-content.spec.ts --project=component-1440` | ✅ | ✅ exists |
| 06-10 | 10 | 3 | I18N-07 | Data integrity | Editing a `content_strings` row: dispatcher edits `de` and `updated_by` is stamped; audit is staff; pending_value shows `data-tok`; `non_translatable` with a differing `de` refused; whitespace-only `no_param_reason` refused; table pages 50 rows | Playwright (local DB + staff fixtures + TOTP) | `pnpm --filter web exec playwright test tests/integration/content-string-edit.spec.ts --project=component-1440` | ✅ | ✅ exists |
| 06-11 | 11 | 4 | I18N-07 | Data integrity | DB-derived messages equal JSON-derived messages for en, de, fr, ar; `unflattenKeys` round trip; `CONTENT_SOURCE` default is json; `loadRawMessages` delegates; public loader reads via `publicSql` when source is db; runbook names rollback | Playwright (parity needs local DB) + source | `pnpm --filter web exec playwright test tests/integration/content-loader-parity.spec.ts tests/integration/ops-dc-content-loader.spec.ts --project=component-1440` | ✅ | ✅ exists |
| 06-12 | 12 | 5 | OPS-09 / AUTH-05 | — | Daily digest runs only at 06:00 Europe/Zurich across both DST offsets; per-staff ledger claimed before send; zero-booking digest still sent; escaped branded body; no send when ledger cannot be claimed; provider failure recorded as retryable | Playwright (pure functions) | `pnpm --filter web exec playwright test tests/integration/ops-digest.spec.ts --project=component-1440` | ✅ | ✅ exists |
| 06-12 | 12 | 5 | AUTH-05 | Spoofing | Dashboard login exposes a real passkey ceremony and claims invite before redirect | Playwright source | `pnpm --filter web exec playwright test tests/integration/ops-accepted-invitation.spec.ts --project=component-1440` | ✅ | ✅ exists |
| 06-13 | 13 | 6 | OPS-09 / AUTH-05 | — | UAT regressions (hash fade, fleet hierarchy, avatar, digest brand): fingerprints only | live curl (06-VERIFICATION.md "Live fingerprints") | no repo command; see Manual-Only | n/a | ⚠️ no automated test |

*Status: ✅ exists = a test targets this behaviour and was recorded green at phase close or exists on disk · ⬜ pending · ❌ gap · ⚠️ partial / manual*

---

## Wave 0 Requirements

Research Wave 0 listed five Playwright specs and seeded staff fixtures. Disposition after the DC replan:

- [ ] `apps/web/tests/integration/ops-role-gate.spec.ts` — not created. OPS-10 role gate is covered by `lib/ops/staff-json.test.ts`, `lib/ops/staff-gate.test.ts`, `ops-claims-bridge.spec.ts` and pgTAP `ops_role_rls.test.sql`. No browser-level test that a dispatcher is turned away from `/pricing` or `/staff`.
- [ ] `apps/web/tests/integration/ops-aal-gate.spec.ts` — not created. The aal1 gate is covered at unit level (`staff-gate.test.ts`, `session.test.ts`) and in SQL (`staff_aal2_factor.test.sql`); no HTTP-level proof that an aal1 session with a factor is bounced from every console page.
- [ ] `apps/web/tests/integration/ops-pricing-publish.spec.ts` — not created; replaced by `ops-dc-pricing.spec.ts` (source and 403 only) plus `rate_version_publish.test.sql`.
- [ ] `apps/web/tests/integration/ops-reviews-publish.spec.ts` — not created; replaced by `ops-dc-reviews.spec.ts`, `reviews-patch-merge.test.ts`, `public-reviews-route.test.ts`.
- [x] `apps/web/tests/integration/content-string-edit.spec.ts` — exists.
- [x] Seeded staff fixtures — exist in `apps/web/tests/support/ops-fixtures.ts` (`createStaffFixture`, `resetStaffFixtures`, `totpCode`).
- [x] No new framework install needed.

---

## Gaps (real, not covered by any existing test)

| # | Requirement | Gap | Evidence |
|---|-------------|-----|----------|
| G1 | I18N-07 | Hosted `CONTENT_SOURCE=db` was never switched on; the public site still reads JSON. Editing a string and seeing it on the public page in all four languages after cache TTL is untested end to end (parity test only compares loader output, editor spec only checks the row write). Requirement is still Pending in REQUIREMENTS.md. | 06-VERIFICATION.md gap 1; 06-11 Task 2 owner gate |
| G2 | OPS-08 | No test hides a review through the staff route and then reads the public route/home to see it gone. The two halves are tested separately (staff PATCH source and mocks; public route filters `published = true`). | no `ops-reviews-publish.spec.ts` |
| G3 | OPS-06 | No test that the pricing UI surfaces which rows are missing when publish of an incomplete draft is refused. Database refusal is covered (pgTAP), UI wiring is source-grep only. | `ops-dc-pricing.spec.ts` checks "completeness chrome exists", not behaviour |
| G4 | OPS-10 | No browser or HTTP-level proof that a dispatcher-role session is refused on `/pricing` and `/staff`. Covered only at function, source and SQL level. | no `ops-role-gate.spec.ts` |
| G5 | AUTH-05 | MFA enrolment and challenge screens are paused by owner decision (sole admin; no `/ops/mfa-challenge` page, `staff-gate.test.ts` asserts the /ops gate never redirects there). No HTTP-level aal1-with-factor bounce test. Staff invite email delivery (custom SMTP) has no automated proof. | 06-VERIFICATION.md gap 2 |
| G6 | OPS-07 | Customers console is proven by source wiring, empty envelope and SQL-shape greps only; no test runs the list query against seeded customers and bookings. | `ops-dc-customers.spec.ts` is database-free |
| G7 | OPS-06 | Fleet, coupons and rate-book write routes are proven by 401/403 envelopes and re-export greps; no test performs an authenticated create/update/delete round trip against a database. | `ops-dc-fleet/coupons/pricing.spec.ts` are database-free |
| G8 | 06-12 / 06-13 | Staff hash route, Stripe checkout copy, passkey registration, digest brand and hash-fade fingerprints exist only as curl fingerprints in 06-VERIFICATION.md; no committed test asserts them. | 06-VERIFICATION.md "Live fingerprints" |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Arabic `dir="rtl"` renders correctly on every new ops screen | I18N-07 | Project convention (per-surface Arabic pass) | Owner or Hermes: switch language to Arabic on each ops screen, check layout, run `VamosLocale.coverage(root)` (must be empty); also check German at 1080px |
| Staff invite email reaches the invitee and lands on `/login` | AUTH-05 / OPS-10 | Needs custom SMTP / Resend and a real mailbox | Owner invites a test address from the Staff screen, opens the mail, confirms the link goes to the dashboard `/login` |
| Passkey registration and sign-in ceremony | AUTH-05 | Needs a real authenticator | Owner registers a passkey in Settings, signs out, signs in with it |
| Staff hash opens Staff, not Dashboard, after owner sign-in | OPS-09 | Needs owner session cookie | Owner signs in and clicks Staff in the sidebar; expected: Staff screen, no bounce |
| Publish of rate version | OPS-06 | Owner gate: the agent never clicks Publish | Owner reviews numbers and publishes |

---

## Validation Sign-Off

- [ ] All requirements have automated verify end to end (G1, G2, G3, G4, G5, G6, G7 open)
- [x] Sampling continuity: every plan 01-12 names an existing automated command; only 06-13 has none
- [x] No watch-mode flags (`vitest.config.ts` sets `watch: false`)
- [ ] Feedback latency measured
- [ ] `nyquist_compliant: true` — not set; gaps above are open

**Approval:** pending
