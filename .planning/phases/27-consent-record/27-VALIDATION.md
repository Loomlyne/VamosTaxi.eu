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

Phase hold (D-34): plan 27-13 stops the phase if 26.5 is not on origin/main. The hold is lifted: 26.5
is live (origin/main 9a5263cd, merged at c037c6dd). D-03a and D-36 are built by the gap plans: wave 10
= 27-17 (grant) and 27-18 (sign-in link, flag removal), wave 11 = 27-15 (server), wave 12 = 27-16
(page), wave 13 = 27-14 (hand-over). Each gap plan's Task 1 checks the first line of the SUMMARY it
depends on and stops otherwise. Plan 27-14 refuses to run unless 27-13's SUMMARY starts with
"PRECONDITION MET", the 27-17, 27-15 and 27-16 SUMMARYs with "COMPLETE: D-03a built" and 27-18's with
"COMPLETE: D-36 built". The Worker e2e and the full suites run once, in 27-14 only.

Server start for browser tests in this sandbox: mock pages from a `node:http` static server over
`apps/web/public` inside the spec; Next pages through `tests/support/server-harness.ts` (real
`next` binary, never `pnpm dev`); auth e2e through `tests/e2e-worker/run.sh` on the built Worker.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
as-of; anon-only EXECUTE; definer + `search_path=''`; no table grant; row id 3 style excluded | pgTAP | `bash scripts/local-stack-27.sh test` (`consent_choice_reader.test.sql`) | ❌ W0 | ⬜ pending |
Necessary only never; CSRF kept | unit | `pnpm --filter web exec vitest run tests/unit/consent/route.test.ts` | ❌ W0 | ⬜ pending |
sign-in, account, bookings, reset-password, coming-soon); none on ops | source pin | `pnpm --filter web exec vitest run lib/consent/mock-mounts.test.ts` | ❌ W0 | ⬜ pending |
`serveDcHtml` not reshaped | source pin | same | ❌ W0 | ⬜ pending |
Law fixes; six-state gallery | grep | plan command | ✅ | ⬜ pending |
no Meta; two copies in step; button + shell visual specs unchanged | source pin + Playwright | `pnpm --filter web exec vitest run lib/consent lib/live-no-tbc.test.ts`; `pnpm --filter web exec playwright test tests/visual/button.spec.ts tests/visual/shell.spec.ts` | ❌ W0 | ⬜ pending |
state GET; no PendingSlot | grep + typecheck | plan command | ✅ | ⬜ pending |
Reset removed | grep | plan command | ✅ | ⬜ pending |
dates D-31; hygiene | unit | `pnpm --filter web exec vitest run lib/legal-updated.test.ts lib/consent/legal-pages-27.test.ts lib/legal-text-hygiene.test.ts` | ❌ W0 (`legal-pages-27.test.ts`) | ⬜ pending |
not ops/dashboard/dev | unit render | `pnpm --filter web exec vitest run components/consent` | ❌ W0 (`banner-hosts.test.ts`) | ⬜ pending |
PAY bar and FAB offset by reserve | source pin | same + `pnpm lint:css` | ❌ W0 | ⬜ pending |
locale-follow-26-3); no re-baseline | Playwright | `pnpm --filter web exec playwright test tests/visual/pay-link-page.spec.ts tests/integration/locale-follow-26-3.spec.ts` | ❌ W0 (`tests/support/consent-state.ts`) | ⬜ pending |
mock /about: banner, Necessary only posts and hides, reload keeps hidden; gallery six states; /ops unauthenticated has no banner; not skippable | Playwright | `pnpm --filter web exec playwright test tests/integration/consent-banner-27.spec.ts` | ❌ W0 | ⬜ pending |
D-29/D-30 on Next /cookies;
one assignment; gate false | unit | `pnpm --filter web exec vitest run lib/meta lib/legal-updated.test.ts lib/consent` | ✅ | ⬜ pending |
mock dict never deleted from (list for control session) | gate | `pnpm i18n:check` | ✅ | ⬜ pending |
checkout grant kept; anon/authenticated 42501; no table grant; sign-up shape; consent_log untouched; local apply only | pgTAP | `bash scripts/local-stack-27.sh test` (`signup_agreement_grant.test.sql`, `account_agreement_records.test.sql`) | ❌ (created by the task) | ⬜ pending |
int8 as string; anon/authenticated refused | local vitest | `VAMOS_LOCAL_DB_PORT=59322 pnpm --filter @vamos/db exec vitest run test/local/signup-agreement.test.ts test/local/checkout-account.test.ts` | ❌ (created by the task) | ⬜ pending |
same answer for known and unknown address; sign-up mode still creates | unit | `pnpm --filter web exec vitest run tests/unit/auth app/api/auth lib/auth` | ❌ (`signin-link-no-account.test.ts`) | ⬜ pending |
D-01 pins green | unit + grep | `pnpm --filter web exec vitest run lib/auth tests/unit/auth lib/consent/record.test.ts` | ✅ (rewrite) | ⬜ pending |
record before Supabase as vamos_system; failed record = 503, no account; no e-mail in logs; no consent_log write | unit | `pnpm --filter web exec vitest run lib/auth tests/unit/auth app/api/auth lib/consent/record.test.ts lib/db` + `pnpm check:db-fences` | ❌ (`signup-agreement.test.ts`, `signup-agreement-route.test.ts`) | ⬜ pending |
error line in the dictionary, insert only | unit | `pnpm --filter web exec vitest run lib/auth/signup-notice-mock.test.ts lib/checkout/phase-26-5-laws.test.ts` | ❌ (created by the task) | ⬜ pending |
fail closed without the text; design laws | source pin + gate | same vitest file + `lib/ops/auth-ui-dc.test.ts`; `pnpm i18n:check` | ✅ | ⬜ pending |
de/fr/ar text and `VamosLocale.coverage` empty; 1440/1024/768/390; no yellow ring; ops has no tick | Playwright | `pnpm --filter web exec playwright test tests/integration/signup-agreement-27.spec.ts` | ❌ (created by the task) | ⬜ pending |
main wins, D-03a/D-36 files hand-merged; version = ship day; merged tree passes the 17-item gate once (auth e2e incl. 1a0/1a/1b/3b and both Playwright specs not skippable); must-not checks on added lines / tree; hand-over complete incl. 4242 payment step, hosted grant order, D-37 under "Not in this phase" | all | 17 gate commands in plan 27-14 | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Requirement -> behaviour map (from research)

| Req | Behaviour | Proof |
|-----|-----------|-------|
Necessary only -> all false; Save -> exact switches; bad booleans -> 400 | `tests/unit/consent/route.test.ts`, `lib/consent/choice.test.ts` |
tie by id; older version ignored (D-03b); other subject invisible | pgTAP R1-R4, R7, R8, R2 |
the agreement is stored in `account_agreement_records` (surface sign-up), never in consent_log | `signup-agreement-route.test.ts`, `signup_agreement_grant.test.sql`, `test/local/signup-agreement.test.ts`, `signup-agreement-27.spec.ts`, e2e 1a0 / 1a |
same answer for every address | `signin-link-no-account.test.ts`, `checkout-route.test.ts`, e2e 3b |
pay link; never ops | `mock-mounts.test.ts`, `banner-hosts.test.ts`, Playwright spec |
Playwright case B; must-not greps in 27-14 |
as of t2 -> on | pgTAP R3, R5 |

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
browser UAT runs in Hermes | Numbered owner UAT in 27-HANDOVER.md, on staging after the control session deploys |
CLAUDE.local.md rule 8 | Control-session step in 27-HANDOVER "Control session after deploy" |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
