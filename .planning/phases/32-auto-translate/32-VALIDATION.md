---
phase: 32
slug: auto-translate
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-13
signed_off: 2026-10-14
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `32-RESEARCH.md` § Validation Architecture, adjusted to the owner's answers of 2026-10-13 (no dashboard marks, no Translations page; Content › Pages/Legal removed; review translate on tap). Signed off 2026-10-14 by plan 32-12 Task 3 against the real files; results come from the plan SUMMARYs and `evidence/README.md`. The full-gate and pgTAP line is filled by the orchestrator when the Task 2 logs finish.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 (`apps/web/vitest.config.ts`); pgTAP via `scripts/test-lab/lab.sh pgtap <name>` (native Supabase stack, no Docker); `node --test` for `scripts/*.test.mjs` |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `apps/web/node_modules/.bin/vitest run <touched test files>` (in a worktree `pnpm exec` aborts; memory ops-signing-pictures-real-shell) |
| **Full suite command** | `pnpm gate:local` (lead only, once per wave; memory parallel-agents-gate-load) |
| **Estimated runtime** | quick ~20 s; full gate ~15 min |

---

## Sampling Rate

- **After every task commit:** run the touched test files only.
- **After every plan wave:** the lead runs `pnpm gate:local` once, detached (`nohup … ; echo exit=$?`), log outside `/tmp`.
- **Before `/gsd-verify-work`:** full gate green + pgTAP green + the browser runs below.
- **Max feedback latency:** 60 s for task-level checks.

---

## Behaviours that must be proven

| Behaviour | Type | Command / file | Exists |
|---|---|---|---|
| Mask/unmask round-trip: ICU `{x}`, `$1`, HTML tags, `data-tok`, refs `VT-…`, flight numbers, CHF/amounts, ZRH, class names, "Vamos Taxi", "Ride with class" | unit (property) | `apps/web/lib/translate/mask.test.ts`, `apps/web/lib/translate/post-process.test.ts` (32-01: 25 tests pass) | ✅ |
| Guard rejects lost placeholder, digit change, preamble/refusal, `ß` (→ `ss` post-step), wrong script, length ratio, truncated output; rejection keeps the source | unit | `apps/web/lib/translate/guard.test.ts` (32-01: a failing-output case per reason; pass) | ✅ |
| Call input: model `@cf/google/gemma-4-26b-a4b-it`, `chat_template_kwargs.enable_thinking=false`, `response_format` json_schema, `max_completion_tokens`, timeout; called on `env.AI` only (no AI Gateway option present) | unit with `AiLike` stub | `apps/web/lib/translate/translate.test.ts` (deep search: no `gateway`, no `tools` key) + `apps/web/lib/translate/boundary.test.ts` rule (e) (pass) | ✅ |
| Machine write never overwrites a human row; overlay read returns public contexts only; support/note translations readable by staff only | pgTAP | `packages/db/supabase/tests/translations_cache.test.sql` (60/60 after 32-05), `reviews_language.test.sql` (32/32), `support_note_translations.test.sql` (74/74), `extra_labels_system_fill.test.sql` (22/22); full suite at 32-02: Files=125, Tests=3765, 0 `not ok` | ✅ |
| `worker.ts` `queue()` routes `vamos-translate-*` batches to the translator before the Stripe loop; translate DLQ acks and logs, never mails | unit | `apps/web/lib/translate/queue-consumer.test.ts` (ack, retry with backoff, quiet DLQ, no mailer in deps; pass). Branch order inside `worker.ts` was proven by a one-time source check in 32-05 (translate branch offset 10453 before the Stripe `-dlq` branch 11299), not by a committed test | ✅ (consumer) / one-time check (branch order) |
| Queue message bodies carry ids only, never customer text | unit (asserts the enqueued payload shape) | `apps/web/lib/translate/jobs-contract.test.ts` (extra keys `text`/`body` → null), `boundary.test.ts` rule (d) (`TRANSLATE_QUEUE.send` only in `jobs-contract.ts`), producer tests `apps/web/lib/ops/ticket-inbound.test.ts`, `apps/web/tests/unit/contact-route-translate.test.ts`, `apps/web/lib/ops/reviews-language-enqueue.test.ts` (exact key sets; pass) | ✅ |
| Extras on Gemma keep "his typed value wins" | unit | `apps/web/lib/ops/extra-label-translate.test.ts`, `apps/web/lib/ops/rate-book-labels.test.ts` (32-06: 13 tests pass) | ✅ |
| Legal pages, `data-vt-legal`, `non_translatable`, decision-cited `$meta` keys and `[data-tok]` are skipped by the fill | unit | `scripts/i18n-fill.test.mjs` (plan 32-09: denied keys, legal-page texts and `data-tok` copy stay untouched). Result: `node --test scripts/i18n-fill.test.mjs` 5 pass, 0 fail (32-09; re-run 2026-10-14 12:17 by plan 32-12, 5 pass 0 fail). The overlay half is not built by decision (D-05/D-06): there is no overlay route, so nothing to skip there | ✅ (fill) / n/a — not built by decision (D-05/D-06) (overlay) |
| Overlay merge precedence (human > machine > source), fetch failure leaves the source, never blank | — | Not built by decision (D-05/D-06): no Translations page, no dashboard-typed public text after Pages/Legal removal, so no overlay route and no `overlay-merge.test.ts`. Public text reads the catalog/`content_strings`; extras read `extra_labels_read()`; "his typed value wins" is proven by `extra_labels_system_fill.test.sql` (plan 32-02) and `extra-label-translate.test.ts` (plan 32-06) | n/a (by decision) |
| Reply mail body = translation, blank line, 20 hyphens, blank line, original; failed → original only + note; non-en/de/fr/ar target → untranslated; over 1,800 chars → original dropped + note | unit + browser | `apps/web/lib/ops/support-reply-dc.test.ts` (32-10: 24 tests, vm-run reply flow), server side `apps/web/lib/ops/reply-translate.test.ts` (32-07), `apps/web/lib/ops/tickets-map.test.ts`; browser surface B 16/16 frames (32-12) | ✅ |
| Review translate route: cache-first, model only on a miss, rate-limited, unknown review 404, legal/other contexts refused, no vendor name in the response | unit + route test | `apps/web/tests/unit/review-translation-route.test.ts` for `apps/web/app/api/reviews/[ref]/translation/route.ts` (GET), `apps/web/lib/abuse/read-rate-limit.test.ts`, real-database read `apps/web/lib/public/reviews.local.test.ts` (32-08: 1 passed, none skipped), lab Worker probe `evidence/32-08-worker-route.log` | ✅ |
| Removed: `/pages` and `/legal` no longer in `OPS_CONSOLE_EXACT`; `/api/staff/content*` answer 404; `OpsContent` absent from `SHELL_SCREENS`; the public content loader still reads `content_strings` | unit / integration / browser | `apps/web/lib/ops/content-removed.test.ts` (4 pass), `apps/web/lib/ops/ops-console-paths.test.ts` (pass), `apps/web/lib/ops/ops-session-lost.test.ts` (12 route screens, OpsContent absent); browser surface A 16/16 frames (32-12). `apps/web/tests/integration/ops-dc-content-loader.spec.ts` was kept and edited (32-03) but is a Playwright spec (component-1440 project) and has not been run | ✅ (unit, browser) / not run (Playwright loader spec) |
| New strings resolve in de/fr/ar; no `ß`; no vendor/model name or "machine" in any new visible string | gate + unit + browser | `scripts/check-i18n-coverage.mjs` (`pnpm i18n:check` pass, 32-04/10/11), `apps/web/lib/translate/strings-signed.test.ts` (13 pass), `apps/web/lib/ops/support-ticket-strings.test.ts` (10 pass); `VamosLocale.coverage` empty and C7 in every browser frame (32-12) | ✅ |
| Home review card: Translate on tap, Show original with no new request, failure → Try again, no request at load | unit + browser | `apps/web/lib/public/reviews-translate-dc.test.ts` (32-11: 11 pass); browser surface C 16/16 frames, 0 translation requests before the first tap (32-12) | ✅ |

---

## Per-task verification map

| Plan | Task | Test file or command | Result |
|---|---|---|---|
| 32-01 | 1 Merge check, ICU pin, queue type, model constants, job contract | `apps/web/lib/translate/jobs-contract.test.ts`; `tsc --noEmit` | pass; exit=0 (`evidence/32-01-typecheck-t1.log`) |
| 32-01 | 2 Glossary, masking, post-processing, source hash (TDD) | `mask.test.ts`, `post-process.test.ts`; `pnpm check:numbers` | 25 pass; ok |
| 32-01 | 3 Guard, Gemma call, detection, AI stub (TDD) | `vitest run lib/translate lib/ops/extra-label-translate.test.ts` | 6 files, 81 tests pass |
| 32-02 | 0 Migration numbers | timestamp sort check against main and Phase 31 | pass |
| 32-02 | 1 Cache, review language/ref, extras fill | pgTAP `translations_cache` 47/47, `reviews_language` 32/32, `reviews_column_grants` 27/27, `extra_labels_system_fill` 22/22 | pass (`evidence/32-02-pgtap-task1.log`) |
| 32-02 | 2 Staff-only message and note translations | pgTAP `support_note_translations` 74/74 | pass (`evidence/32-02-pgtap-task2.log`) |
| 32-02 | 3 Types + store wrappers | `vitest run lib/translate/store.test.ts lib/db/system-reads.test.ts`; full pgTAP | 23 pass; Files=125, Tests=3765 pass |
| 32-03 | 1 Sidebar, shell, console paths, OpsContent removed | `ops-console-paths.test.ts`, `icon-files-exist` | 16 pass |
| 32-03 | 2 Staff content routes, library, retired specs removed | `apps/web/lib/ops/content-removed.test.ts`; typecheck | 4 pass; clean |
| 32-04 | 1 Signed strings + "Translated from" pattern | `apps/web/lib/translate/strings-signed.test.ts`; `pnpm i18n:check` | 13 pass; pass |
| 32-04 | 2 Latin "Vamos Taxi" in Arabic | `packages/emails` tests; `pnpm db:seed:check`; `git grep فاموس` | 293 pass; no drift; 0 |
| 32-05 | 1 Job handlers and queue consumer (TDD) | `apps/web/lib/translate/jobs.test.ts`, `queue-consumer.test.ts` | pass |
| 32-05 | 2 Sweep, worker wiring, queue bindings, stale re-queue (TDD) | `apps/web/lib/translate/sweep.test.ts`; pgTAP `translations_cache` 60/60; 23 worker/wrangler test files | pass (`evidence/32-05-vitest-final.log`: 17 files, 320 tests) |
| 32-05 | 3 Boundary test | `apps/web/lib/translate/boundary.test.ts` (+ negative check, reverted) | pass |
| 32-06 | 1 planExtraLabels on the shared engine | `extra-label-translate.test.ts`, `rate-book-labels.test.ts` | 13 pass |
| 32-06 | 2 Route comment | `git diff` of the rate-book route (comment only) | pass |
| 32-07 | 1 Enqueue new customer messages (TDD) | `ticket-inbound.test.ts`, `apps/web/tests/unit/contact-route-translate.test.ts` | pass |
| 32-07 | 2 Ticket read model (TDD) | `apps/web/lib/ops/tickets.test.ts`, `tickets-map.test.ts` | pass |
| 32-07 | 3 Staff reply-translate route (TDD) | `apps/web/lib/ops/reply-translate.test.ts` | pass (`evidence/32-07-vitest-final.log`: 14 files, 157 tests) |
| 32-08 | 1 Public reviews carry ref and language (TDD) | `apps/web/tests/unit/public-reviews-route.test.ts`, `apps/web/lib/public/reviews.local.test.ts` (real lab database) | pass; 1 passed, none skipped |
| 32-08 | 2 Review translation route (TDD) | `apps/web/tests/unit/review-translation-route.test.ts`, `read-rate-limit.test.ts`; lab Worker probe | pass (`evidence/32-08-worker-route.log`) |
| 32-08 | 3 Staff create/edit enqueue (TDD) | `apps/web/lib/ops/reviews-language-enqueue.test.ts` | pass (19 files, 169 tests) |
| 32-09 | 1 Catalog logic + denylist | `apps/web/lib/translate/catalog.test.ts` | 10 pass |
| 32-09 | 2 Runner, hook, smoke, package scripts | `node --test scripts/i18n-fill.test.mjs`; `pnpm test:scripts`; `pnpm i18n:fill --check` | 5 pass; 45 pass; 0 gaps |
| 32-10 | 1 Translated customer messages + pending poll | `apps/web/tests/unit/ops-support-read-only.test.ts` | 7 pass |
| 32-10 | 2 Reply box, mail body, states (TDD) | `apps/web/lib/ops/support-reply-dc.test.ts`, `support-ticket-strings.test.ts` (+ mutation check) | 24 + 10 pass |
| 32-10 | follow-up (found by the browser run) | `support-reply-dc.test.ts` (`20ca2fba` red, `c92bfe20` green) | pass |
| 32-11 | 1 Review store ref, lang, translate() | `apps/web/lib/public/reviews-translate-dc.test.ts` | pass |
| 32-11 | 2 Home card Translate / Show original / Try again | same file + `icon-files-exist`; `pnpm i18n:check` | 11 pass; pass |
| 32-12 | 0 Merge origin/main (Phase 31) | `refund-check.test.ts`, `sweep.test.ts` (03:00 order); typecheck; types compare | pass after `24916f3e`; exit=0; 242 = 242 |
| 32-12 | 1 Chromium proof A, B, C | `apps/web/tests/e2e-worker/translate-run.sh` → `evidence/browser.log` | A 16/0, B 16/0, C 16/0, exit=0 (05:25:57-05:50:47) |
| 32-12 | 2 Full local gates and pgTAP | `gate:local` (DB tests via `lab.sh dbtests p32 --keep`), `lab.sh pgtap p32`, static checks | see the marker below |
| 32-12 | 3 VALIDATION sign-off and hand-over | `grep` checks of this file and `32-HANDOVER.md` | pass |

<!-- GATE-RESULTS -->

---

## Wave 0 Requirements

- [x] Test files marked ❌ W0 at planning exist (failing first where TDD applies): every row above points to a committed test file, except the overlay rows, which are not built by decision (D-05/D-06).
- [x] An `AiLike` stub shared by translator tests (no network, no binding): `apps/web/lib/translate/ai-stub.ts`.
- No framework install.

---

## Manual-Only Verifications

| Behaviour | Why manual | Steps | Status |
|---|---|---|---|
| Real model on 5 fixed strings (de/fr/ar, Swiss ss, Latin "Vamos Taxi", untouched CHF/VT-ref) | billed call, needs the binding | `pnpm i18n:smoke --yes-billed` (controller-run; cents) | not run (hand-over live step) |
| Support ticket at 1440/1024/768/390 × en/de/fr/ar: translated message + original, reply opens Gmail/mail app with the agreed body | browser on the local Worker | memory browser-run-dc-forms-on-worker; one lane at a time | done 2026-10-14 05:25-05:50, surface B 16/16 (reply ready and too-long from the one stub) |
| Home review card: Translate → Translating… → translated → Show original; failed → Try again; 390 no sideways scroll; Arabic RTL | public browser run on the local Worker | same lab, stubs off for the route | done, surface C 16/16 |
| Dashboard rail without Pages/Legal; `/pages` and `/legal` addresses no longer open a screen | browser | same lab | done, surface A 16/16 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60 s
- [x] `nyquist_compliant: true` set in frontmatter
- [ ] Full `gate:local` and full pgTAP green on the merged branch (plan 32-12 Task 2; filled by the orchestrator from the logs)

**Approval:** signed off by plan 32-12 Task 3, 2026-10-14, except the full-gate/pgTAP line, which waits for the Task 2 logs.
