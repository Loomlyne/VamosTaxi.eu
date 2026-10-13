---
phase: 32-auto-translate
plan: 05
subsystem: translate-background
tags: [cloudflare-queues, dlq, cron, workers-ai, translation, boundary-test]
requires: [32-01, 32-02]
provides:
  - apps/web/lib/translate/jobs.ts (handleTranslateJob, handleDeadTranslateJob, bindTranslateStore, TranslateStore, TranslateRetryError)
  - apps/web/lib/translate/queue-consumer.ts (consumeTranslateBatch, TranslateConsumerDeps)
  - apps/web/lib/translate/sweep.ts (runTranslateSweep, runTranslateSweepWithDeps, SWEEP_LIMIT)
  - TranslateJob kind "cache" ({ v:1, kind:"cache", translationId }) for stale machine cache rows
  - public.system_translation_stale / system_translation_stale_source (vamos_system only) + store wrappers
  - worker.ts translate branch (before the Stripe -dlq branch) and 03:00 translate sweep
  - wrangler.jsonc TRANSLATE_QUEUE producer + consumer + quiet DLQ (staging and production)
affects: [32-07, 32-08, 32-12]
tech-stack:
  added: []
  patterns: ["deps-injected consumer (worker.ts only delegates)", "quiet DLQ: ack + mark failed, never mail", "ids-only queue bodies", "static import-graph boundary test"]
key-files:
  created:
    - apps/web/lib/translate/jobs.ts
    - apps/web/lib/translate/jobs.test.ts
    - apps/web/lib/translate/queue-consumer.ts
    - apps/web/lib/translate/queue-consumer.test.ts
    - apps/web/lib/translate/sweep.ts
    - apps/web/lib/translate/sweep.test.ts
    - apps/web/lib/translate/boundary.test.ts
  modified:
    - apps/web/worker.ts
    - apps/web/wrangler.jsonc
    - apps/web/lib/translate/jobs-contract.ts (+ test)
    - apps/web/lib/translate/store.ts (+ test)
    - packages/db/supabase/migrations/20261012260000_translations_cache.sql
    - packages/db/supabase/tests/translations_cache.test.sql
    - packages/db/database.types.ts
    - apps/web/lib/checkout/settle.test.ts
decisions:
  - "Stale cache re-queue needs a reader and a job kind the plan did not provide: two definer functions added to the unshipped Phase 32 migration 20261012260000 (no new migration number) and a 'cache' job kind carrying the translations.id only"
  - "A support message with detected_lang already set is skipped (duplicate delivery); a whole-call final failure marks failed via the definer, an all-guard-rejected answer writes rejected rows with the detected language"
  - "Store errors are logged (step + SQLSTATE class) and retried like a transient model failure; in the DLQ they are logged and the message is still acked"
  - "Extra jobs translate de/fr/ar from label_en; system_extra_label_fill keeps every name he typed (D-02)"
  - "Sweep result counts read failures and failed sends together in `failed`; worker logs translate_sweep at error level when failed > 0"
metrics:
  duration: 15min
  started: 2026-10-14T03:41+04:00
  completed: 2026-10-14T03:56+04:00
  tasks: 3
  files: 16
---

# Phase 32 Plan 05: Background translation Summary

Translate queue consumer with ids-only jobs (support, support-form, note, review, extra, plus a new `cache` kind), backoff retries, a quiet DLQ that marks "Translation not available" and never mails, a nightly 03:00 sweep that also re-queues machine cache rows of an older `prompt_version` (human rows never), the Worker and wrangler wiring, and a static boundary test fencing every model call site.

## Tasks

| # | Task | Commits |
|---|---|---|
| 1 | Job handlers and queue consumer (TDD) | `508e82e6` (test RED), `4a6da610` (feat GREEN) |
| 2 | Sweep, worker.ts wiring, queue bindings, stale re-queue (TDD) | `5710eaf1` (test RED), `46e0d9a9` (feat GREEN) |
| 3 | Boundary test | `92110931` |

## Verification (2026-10-14, local only, AI stub, no network)

- `vitest run lib/translate lib/db/system-reads.test.ts lib/ops/extra-label-translate.test.ts lib/ops/rate-book-labels.test.ts lib/checkout/settle.test.ts lib/checkout/queue-consumers.test.ts`: 17 files, 320 tests passed (`evidence/32-05-vitest-final.log`).
- 23 test files that read `worker.ts` / `wrangler.jsonc`: all green after the settle.test.ts fix (`evidence/32-05-worker-wrangler-tests.log` holds the pre-fix run with the one red).
- pgTAP on lab p32: `translations_cache.test.sql` 60/60, `db_privilege_hardening.test.sql` green (`evidence/32-05-pgtap-translations-cache.log`, `32-05-pgtap-privileges.log`).
- `tsc --noEmit` apps/web exit 0 after each task (`evidence/32-05-typecheck-t1/t2/t3.log`); eslint on touched files exit 0; `node scripts/check-db-access-fences.mjs` all 8 checks passed.
- Branch-order one-liner exits 0 (translate branch at offset 10453, Stripe `-dlq` at 11299).
- Acceptance greps: no `handleDlqMessage|consumeDlqMessage|sendMail|resend` in jobs.ts / queue-consumer.ts (0/0); `caughtFields` 4 in total; `failBookingNoteTranslation` 5 in jobs.ts; each translate queue name 2x in wrangler.jsonc; `runTranslateSweep(env)` 1; `m2m100` 0.
- Boundary negative check: adding `import { translateText } from "@/lib/translate/translate"` to `apps/web/app/api/reviews/route.ts` failed rules (a) and (c); reverted with `git checkout -- app/api/reviews/route.ts` (file clean afterwards).
- Native `supabase gen types` (2.119) output for the two new functions matches the hand-applied `database.types.ts` hunk.

## Phase 31 cron ordering (merge note)

Phase 31 is not on main. The translate sweep sits in the `0 3 * * *` block after `sweepMetaPurchaseIds`, before `return;`, with a comment. When Phase 31 merges, keep both blocks: Phase 31 `refundCheck` first, then the translate sweep, then `return;`. The `queue()` change does not overlap Phase 31. wrangler.jsonc: Phase 31 edits the `env.staging` vars block, a different hunk from the queue blocks.

## Live steps for the plan-12 hand-over (controller only, none run here)

1. `wrangler queues create vamos-translate-staging` and `wrangler queues create vamos-translate-staging-dlq`, BEFORE any deploy: wrangler.jsonc now names consumers for them and a deploy fails without them.
2. Production twins `vamos-translate-production` and `vamos-translate-production-dlq` only when production exists.
3. Migration `20261012260000_translations_cache.sql` now also creates `system_translation_stale` and `system_translation_stale_source` (applied verbatim with the other three Phase 32 files).

## Deviations from Plan

### Auto-fixed

1. **[Rule 3 - Blocking] No reader or job kind for the stale-row re-queue.** The plan asks the sweep to re-enqueue `translations` rows with `origin = 'machine'` and an older `prompt_version`, but plan 02 gave no definer to list them (vamos_system has no table grant) and the job contract had no kind to re-translate a cache row. Added to the unshipped Phase 32 migration `20261012260000` (no new number, owner-signed set unchanged): `system_translation_stale(p_prompt_version, p_limit)` (ids of machine rows below the version, limit clamped 1..200) and `system_translation_stale_source(p_id, p_prompt_version)` (source only while still machine and stale), EXECUTE vamos_system only, 13 new pgTAP checks (human row never listed or returned). New job kind `{ v:1, kind:"cache", translationId }` (decimal id, 1-18 digits) with a handler that re-translates and stores through `putMachineTranslation` (human wins twice: the reader and the upsert). The sweep filters `origin === 'machine'` again in TS; the unit test proves a human row with an old version is never enqueued. Lab p32 got the two functions with a scoped apply script (`~/.vamos-scratch/lab-p32/scripts/apply-32-05.mjs`); plan 12's full `lab.sh pgtap` reset replays the file. Commit `46e0d9a9`.
2. **[Rule 1 - Bug] settle.test.ts counted every `retry_delay` in wrangler.jsonc** (pinned 4 / two at 30). The translate consumer adds `retry_delay: 30` per environment, so the count is now scoped to the Stripe consumer blocks. Commit `46e0d9a9`.
3. **[Rule 3] worker.ts imported the `AiLike` type from `translate.ts`,** which rule (a) of the boundary test forbids. It now takes the type from `TranslateConsumerDeps["ai"]`. Commit `92110931`.
4. **No `m2m100` string in wrangler.jsonc existed;** the two stale `ai` comments (D-44 wording) were replaced with "the one translator in lib/translate (Gemma 4, Phase 32), never AI Gateway".

### Known limits (not fixed, by scope)

- A stale cache row whose re-translation is rejected keeps its old `prompt_version` (a mark never touches a done row), so it is re-queued every night after a bump, at most 100 rows per night.
- A cache row that was only ever rejected (`prompt_version` null) is not re-queued by a bump.
- Support and note translation rows written under an older `prompt_version` are not re-queued (the plan names `translations` only).

## Known Stubs

None.

## Threat Flags

None. The two new functions are vamos_system-only readers of the existing table (no new endpoint, no anon grant). T-32-21..24 are covered by tests: ids-only parse and producer fence, text-free logs (key and value assertions), backoff + quiet DLQ with no mailer in the deps, branch order asserted.

## Self-Check: PASSED

- Files exist: jobs.ts, jobs.test.ts, queue-consumer.ts, queue-consumer.test.ts, sweep.ts, sweep.test.ts, boundary.test.ts; modified worker.ts, wrangler.jsonc, migration, pgTAP, types, store, contract, settle.test.ts.
- Commits in `git log`: `508e82e6`, `4a6da610`, `5710eaf1`, `46e0d9a9`, `92110931`.
