---
phase: 27
slug: consent-record
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-30
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 27-RESEARCH.md "Validation Architecture". Working directory for every command:
> `/Users/koss/Developer/vamos-wt/phase-27`. Local DB is the phase's own stack on 59322
> (`scripts/local-stack-27.sh`); never 54322/55322/56322/57322/58322/60322, never hosted.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (web, db); pgTAP via `supabase test db` on the 59322 stack; Playwright (local banner spec) |
| **Config file** | `apps/web/vitest.config.ts`, `packages/db/vitest.config.ts`, scratch `config.toml` written by `scripts/local-stack-27.sh` (Wave 0 creates it), `apps/web/playwright.config.ts` |
| **Quick run command** | `pnpm --filter web exec vitest run lib/consent lib/meta components/consent lib/live-no-tbc.test.ts lib/legal-updated.test.ts tests/unit/auth tests/unit/consent` |
| **Full suite command** | `pnpm test:unit && bash scripts/local-stack-27.sh test` |
| **Estimated runtime** | quick ~30 s; full ~6 min |

---

## Sampling Rate

- **After every task commit:** the quick run command (plus the task's own `<automated>` command).
- **After every plan wave:** `pnpm test:unit`, `bash scripts/local-stack-27.sh test`, `pnpm typecheck`, `pnpm i18n:check`.
- **Before `/gsd-verify-work`:** the 17-item phase gate in plan 27-14 must be recorded, each with a result. The auth e2e (D-01) and the Playwright banner spec may not be skipped.
- **Max feedback latency:** 60 seconds for task-level checks.

Expected temporary red: `pnpm db:seed:check` between plan 27-03 (new message keys) and plan 27-11
(seed regenerated). Nothing else may stay red across a wave boundary.

Phase hold (D-34): plan 27-13 stops the phase if 26.5 is not on origin/main; plan 27-14 refuses to
run unless 27-13's SUMMARY says "COMPLETE: D-03a built".

Server start for browser tests in this sandbox: mock pages from a `node:http` static server over
`apps/web/public` inside the spec; Next pages through `tests/support/server-harness.ts` (real
`next` binary, never `pnpm dev`); auth e2e through `tests/e2e-worker/run.sh` on the built Worker.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | META-03 | T-27-06 | Own stack only (5932x), auth hook block + hook secret file written, other stacks untouched | infra | `docker ps` + config greps in plan | ❌ W0 (`scripts/local-stack-27.sh`) | ⬜ pending |
| 27-01-02 | 01 | 1 | META-03, META-05 | T-27-01..04 | Latest row under current version; as-of; anon-only EXECUTE; definer + `search_path=''`; no table grant; row id 3 style excluded | pgTAP | `bash scripts/local-stack-27.sh test` (`consent_choice_reader.test.sql`) | ❌ W0 | ⬜ pending |
| 27-01-03 | 01 | 1 | META-03 | T-27-01 | Reader through Worker client (`fetch_types:false`), booleans + timestamp, no arrays | local vitest | `VAMOS_LOCAL_DB_PORT=59322 pnpm --filter @vamos/db exec vitest run test/local/consent-reader.test.ts` | ❌ W0 | ⬜ pending |
| 27-02-01 | 02 | 2 | META-03 | T-27-08 | Accept all true, Necessary only false, Save exact, strict booleans | unit | `pnpm --filter web exec vitest run lib/consent/choice.test.ts` | ❌ W0 | ⬜ pending |
| 27-02-02 | 02 | 2 | META-03 | T-27-10 | Sign-up confirm writes no consent_log row | unit + e2e pin | `pnpm --filter web exec vitest run tests/unit/auth lib/consent/record.test.ts` | ✅ (rewrite) | ⬜ pending |
| 27-02-03 | 02 | 2 | META-03 | T-27-07, T-27-09 | Turnstile iff marketing true; Necessary only never; CSRF kept | unit | `pnpm --filter web exec vitest run tests/unit/consent/route.test.ts` | ❌ W0 | ⬜ pending |
| 27-03-01 | 03 | 2 | META-04 | T-27-13 | Owner texts byte-equal (mock) | unit | `pnpm --filter web exec vitest run lib/consent/owner-texts.test.ts` | ❌ W0 | ⬜ pending |
| 27-03-02 | 03 | 2 | META-04 | T-27-13, T-27-14 | Owner texts byte-equal (Next), insert-only JSON | unit + gate | same + `pnpm i18n:check` | ✅ | ⬜ pending |
| 27-03-03 | 03 | 2 | META-04 | T-27-14 | Two UI strings, 4 languages, insert-only | grep | `git diff --numstat app/vamos-i18n-dict.js` | ✅ | ⬜ pending |
| 27-04-01 | 04 | 2 | META-04 | T-27-18 | Banner on every customer mock (incl. sign-in, account, bookings, reset-password, coming-soon); none on ops | source pin | `pnpm --filter web exec vitest run lib/consent/mock-mounts.test.ts` | ❌ W0 | ⬜ pending |
| 27-04-02 | 04 | 2 | META-04 | T-27-16 | Cached mock HTML carries only the public site key; `serveDcHtml` not reshaped | source pin | same | ❌ W0 | ⬜ pending |
| 27-05-01 | 05 | 2 | META-05 | T-27-19 | as-of helper, no raw table read | unit | `pnpm --filter web exec vitest run lib/consent/read.test.ts` | ❌ W0 | ⬜ pending |
| 27-05-02 | 05 | 2 | META-04 | T-27-19, T-27-20, T-27-23 | GET state: no-store, Vary Cookie, no UUID, no mint, no DB call without cookie | unit | `pnpm --filter web exec vitest run tests/unit/consent/state-route.test.ts` + `pnpm check:db-fences` | ❌ W0 | ⬜ pending |
| 27-06-01 | 06 | 3 | META-04 | T-27-26 | Mock runtime fails open, ignores stale cache | unit (vm) | `pnpm --filter web exec vitest run lib/consent/vamos-consent.test.ts` | ❌ W0 | ⬜ pending |
| 27-06-02 | 06 | 3 | META-03, META-04 | T-27-24, T-27-27 | Mock banner posts every choice; Law fixes; six-state gallery | grep | plan command | ✅ | ⬜ pending |
| 27-06-03 | 06 | 3 | META-03, META-04 | T-27-25, T-27-28 | Footer opens sheet only; no Meta; two copies in step; button + shell visual specs unchanged | source pin + Playwright | `pnpm --filter web exec vitest run lib/consent lib/live-no-tbc.test.ts`; `pnpm --filter web exec playwright test tests/visual/button.spec.ts tests/visual/shell.spec.ts` | ❌ W0 | ⬜ pending |
| 27-07-01 | 07 | 4 | META-03, META-04 | T-27-29..31 | Next banner = mock; state GET; no PendingSlot | grep + typecheck | plan command | ✅ | ⬜ pending |
| 27-07-02 | 07 | 4 | META-04 | T-27-32 | New contract pins; "no fbevents" and "flag off" kept | unit | `pnpm --filter web exec vitest run components/consent lib/live-no-tbc.test.ts lib/meta/legal-gate.test.ts` | ✅ (rewrite) | ⬜ pending |
| 27-09-01 | 09 | 4 | META-04 | T-27-38 | Cookies §06 + D-29/D-30 + consent date | grep | plan command | ✅ | ⬜ pending |
| 27-09-02 | 09 | 4 | META-03 | T-27-37, T-27-39 | Cookies panel reads server; Reset removed | grep | plan command | ✅ | ⬜ pending |
| 27-09-03 | 09 | 4 | META-04 | T-27-38 | Privacy §3; dates D-31; hygiene | unit | `pnpm --filter web exec vitest run lib/legal-updated.test.ts lib/consent/legal-pages-27.test.ts lib/legal-text-hygiene.test.ts` | ❌ W0 (`legal-pages-27.test.ts`) | ⬜ pending |
| 27-08-01 | 08 | 5 | META-04 | T-27-34, T-27-36 | Banner on /checkout/*, /confirmation/*, pay link, 404; not ops/dashboard/dev | unit render | `pnpm --filter web exec vitest run components/consent` | ❌ W0 (`banner-hosts.test.ts`) | ⬜ pending |
| 27-08-02 | 08 | 5 | META-04 | T-27-33, T-27-35 | Footer writes nothing; PAY bar and FAB offset by reserve | source pin | same + `pnpm lint:css` | ❌ W0 | ⬜ pending |
| 27-12-01 | 12 | 6 | META-04 | T-27-58 | Twelve existing specs stubbed (incl. locale-follow-26-3); no re-baseline | Playwright | `pnpm --filter web exec playwright test tests/visual/pay-link-page.spec.ts tests/integration/locale-follow-26-3.spec.ts` | ❌ W0 (`tests/support/consent-state.ts`) | ⬜ pending |
| 27-12-02 | 12 | 6 | META-03, META-04 | T-27-54..57 | PAY above banner at 390x844 en/de; mock /about: banner, Necessary only posts and hides, reload keeps hidden; gallery six states; /ops unauthenticated has no banner; not skippable | Playwright | `pnpm --filter web exec playwright test tests/integration/consent-banner-27.spec.ts` | ❌ W0 | ⬜ pending |
| 27-10-01 | 10 | 7 | META-03 | T-27-42 | Next slots carry §2/§3; D-29/D-30 on Next /cookies; consent date on both builds | unit | `pnpm --filter web exec vitest run lib/meta/legal-gate.test.ts lib/legal-updated.test.ts` | ✅ (rewrite) | ⬜ pending |
| 27-10-02 | 10 | 7 | META-03, META-05 | T-27-40, T-27-41 | Version = consent date; one assignment; gate false | unit | `pnpm --filter web exec vitest run lib/meta lib/legal-updated.test.ts lib/consent` | ✅ | ⬜ pending |
| 27-11-01 | 11 | 8 | META-04 | T-27-43 | Unused Next keys removed only at zero users; mock dict never deleted from (list for control session) | gate | `pnpm i18n:check` | ✅ | ⬜ pending |
| 27-11-02 | 11 | 8 | META-03 | T-27-44 | Seed generated, counts aligned, pgTAP full | pgTAP | `pnpm db:seed:check && bash scripts/local-stack-27.sh test` | ✅ | ⬜ pending |
| 27-13-01 | 13 | 9 | META-03 | T-27-46 | Gate: 26.5 table + notice/tick on origin/main, else PHASE STOPPED (D-34) | git checks | `head -1 27-13-SUMMARY.md` status line | ❌ (written by the task) | ⬜ pending |
| 27-13-02 | 13 | 9 | META-03 | T-27-47..49 | D-03a built only by gap plans (`/gsd-plan-phase 27 --gaps`) against 26.5's real code; not autonomous | checkpoint | SUMMARY first line "COMPLETE: D-03a built" + `27-1[5-9]-SUMMARY.md` exists | ❌ (gap plans) | ⬜ pending |
| 27-14-01..03 | 14 | 10 | META-03..05 | T-27-50..53 | Refuses unless D-03a complete; merged tree passes the 17-item gate (auth e2e and Playwright not skippable); must-not diff allows only one `checkout.css` line; hand-over complete incl. 4242 payment step | all | 17 gate commands in plan 27-14 | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Requirement -> behaviour map (from research)

| Req | Behaviour | Proof |
|-----|-----------|-------|
| META-03 | Accept -> all categories true; Necessary only -> all false; Save -> exact switches; bad booleans -> 400 | `tests/unit/consent/route.test.ts`, `lib/consent/choice.test.ts` |
| META-03 | Latest row under current version wins; tie by id; older version ignored (D-03b); other subject invisible | pgTAP R1-R4, R7, R8, R2 |
| META-03 | Sign-up confirm writes no consent_log row | `tests/unit/auth/signup-consent.test.ts`, e2e check 1b `=== 0` |
| META-04 | Banner on every customer page incl. pay link; never ops | `mock-mounts.test.ts`, `banner-hosts.test.ts`, Playwright spec |
| META-04 | Pixel never loads on a pay link (nothing loads it in 27) | `legal-gate.test.ts` "no fbevents.js", "flag off"; Playwright case B; must-not greps in 27-14 |
| META-05 | Accept t1, Necessary only t3: now -> off; as of t2 -> on | pgTAP R3, R5 |
| META-05 | Necessary only t1, paid t2, Accept t3: as of t2 -> off (no backfill) | pgTAP R6 |

---

## Wave 0 Requirements

- [ ] `pnpm install --frozen-lockfile` in the worktree (27-01 Task 1)
- [ ] `scripts/local-stack-27.sh` (5932x) and a baseline pgTAP run on unchanged code (27-01 Task 1), including the `[auth.hook.send_email]` block and hook secret file
- [ ] `packages/db/supabase/tests/consent_choice_reader.test.sql` (27-01 Task 2)
- [ ] `packages/db/test/local/consent-reader.test.ts` (27-01 Task 3)
- [ ] `apps/web/lib/consent/choice.test.ts`, `apps/web/tests/unit/consent/route.test.ts` (27-02)
- [ ] `apps/web/lib/consent/read.test.ts`, `apps/web/tests/unit/consent/state-route.test.ts` (27-05)
- [ ] `apps/web/lib/consent/owner-texts.test.ts` (27-03), `apps/web/lib/consent/mock-mounts.test.ts` (27-04)
- [ ] `apps/web/lib/consent/vamos-consent.test.ts`, `mock-banner.test.ts` (27-06)
- [ ] `apps/web/components/consent/banner-hosts.test.ts` (`.ts`, React.createElement; vitest include covers `components/consent/**/*.test.ts`), `reserve-and-footer.test.ts` (27-08)
- [ ] `apps/web/tests/support/consent-state.ts` stub helper and `tests/integration/consent-banner-27.spec.ts` (27-12)
- [ ] `apps/web/lib/consent/legal-pages-27.test.ts` (27-09)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Banner, sheet, cookies §06, privacy §04 look right at 1440/1024/768/390 in en, de, ar | META-04 | Visual review is the owner's gate; browser UAT runs in Hermes | Numbered owner UAT in 27-HANDOVER.md, on staging after the control session deploys |
| `VamosLocale.coverage(document)` returns empty on each surface in de and ar | META-04 | Needs a live browser runtime | Owner UAT step (Hermes browser console) |
| A real Accept then a Necessary only on staging produce two consent_log rows under the new version | META-03, META-05 | Needs the hosted DB after the control session applies the migration | Control session reads consent_log read-only after the owner's clicks |
| Hosted `postgres` has `rolbypassrls` and anon has EXECUTE on `consent_choice` | META-04 | Hosted is off-limits to this worktree | Read-only SQL listed in 27-HANDOVER "Pre-ship hosted read-only checks" |
| After deploy: one 4242 test payment, then `booking_payments` by status | META-04 | Banner now sits on checkout; CLAUDE.local.md rule 8 | Control-session step in 27-HANDOVER "Control session after deploy" |
| /sign-up tick reads like checkout and lands in `account_agreement_records` | META-03 (D-03a) | Owner UAT replaces the former control-session checkpoint | Owner UAT step 12 in 27-HANDOVER |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
