---
phase: 32-auto-translate
plan: 08
subsystem: review-translate-server
tags: [reviews, translation, public-api, rate-limit, queue, i18n]
requires: [32-01, 32-02, 32-05]
provides:
  - PublicReview.ref (16 hex = public.review_ref(body)) and PublicReview.language (two letters or null); no row id
  - GET /api/reviews/:ref/translation?lang=en|de|fr|ar -> 200 { ok, data:{ text } } public, max-age=3600, s-maxage=86400 | 400 bad-request | 404 not-found | 409 same-language | 429 | 503 unavailable (all non-200 private, no-store); POST/PUT/PATCH/DELETE 405
  - ReadRoute "review-translate" (key read:review-translate:<ip> on READ_RATE_LIMITER, no new namespace)
  - staff POST /api/staff/reviews and text-changing PATCH enqueue { v:1, kind:"review", reviewId }
  - createReview returns the new id; updateReview clears language when the body changes
affects: [32-11 (home review card codes against PublicReview.ref/language and the translation route)]
tech-stack:
  added: []
  patterns: ["cache-first, model only on miss", "attempt cap 3 per review x language per 24 h", "catch around asSystem wrappers, never inside", "enqueue after a successful write in its own try/catch"]
key-files:
  created:
    - apps/web/app/api/reviews/[ref]/translation/route.ts
    - apps/web/tests/unit/review-translation-route.test.ts
    - apps/web/lib/public/reviews.local.test.ts
    - apps/web/lib/ops/reviews-language-enqueue.test.ts
  modified:
    - apps/web/lib/public/reviews.ts
    - apps/web/tests/unit/public-reviews-route.test.ts
    - apps/web/lib/abuse/read-rate-limit.ts
    - apps/web/lib/abuse/read-rate-limit.test.ts
    - apps/web/app/[locale]/(ops)/api/staff/reviews/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/reviews/[id]/route.ts
    - apps/web/app/[locale]/(ops)/ops/reviews/actions.ts
decisions:
  - "Failure reasons guard/refusal/empty/too_long are stored as rejected; timeouts and errors as failed; no AI binding records nothing (setup gap, not an attempt)"
  - "A human row returned by putMachineTranslation wins over the fresh text"
  - "A text edit on the dashboard clears reviews.language (case when body = new then language else null), so the review job, which skips reviews that already have a language, re-detects it"
  - "A review whose language is outside en/de/fr/ar goes through translateUnknown with fallbackLang = that code"
metrics:
  duration: 20min (two executors; finish pass 04:21-04:31)
  started: 2026-10-14T04:05+04:00
  completed: 2026-10-14T04:31+04:00
  tasks: 3
  files: 11
---

# Phase 32 Plan 08: Review translate server side Summary

Public reviews now carry an opaque `ref` (first 16 hex of sha256 of the body) and their `language`; a new GET `/api/reviews/:ref/translation?lang=xx` serves the cached translation, calls the translator only on a cache miss for a published review (3 failed tries per review and language per 24 h, 15 s ceiling, own rate-limit key), and answers codes only, no vendor or "machine" word. Dashboard create and text edits queue language detection.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 RED | 42f08965 | test(32-08): add failing tests for review ref and language on the public list |
| 1 GREEN | c82e7487 | feat(32-08): public reviews carry an opaque ref and their language |
| 2 RED | 30cf917f | test(32-08): add failing tests for the public review translation route |
| 2 GREEN | ec276424 | feat(32-08): public review translation route, cache-first and rate-limited |
| 3 RED | c2f390d3 | test(32-08): add failing tests for review language enqueue on staff create and edit |
| 3 GREEN | 69ee3076 | feat(32-08): staff review create and text edit enqueue language detection |
| fix | eff735b3 | fix(32-08): type the public reviews route test payload for tsc |

The first executor was interrupted after eff735b3; the finish pass found all three tasks committed and added no code. It ran the plan's verification, including the real-database read.

## Verification

- vitest (public-reviews-route, reviews-cache, review-translation-route, lib/abuse, reviews-language-enqueue, reviews, reviews-patch-merge, translate/boundary): **19 files, 169 tests passed**
- `pnpm --filter web typecheck`: exit=0 (evidence/32-08-typecheck.log)
- eslint on the 10 touched files: exit 0
- Real DB (lab p32, port 45122, vamos_public via the Worker client options): `✓ lib/public/reviews.local.test.ts > public review list through the real vamos_public client (local, committed rows) > returns ref (16 hex = sha256(body)) and language, no 42501, no unpublished row, no row id` / `Tests  1 passed (1)`, none skipped (evidence/32-08-reviews-local.log)
- Lab Worker probe (evidence/32-08-worker-route.log): list items `{ref, language}` with no `id`; same language 409; null language 409; unknown ref 404; bad ref 400; lang=it 400; cache miss without the AI binding 503 unavailable, `private, no-store`; POST 405
- Grants on the lab: vamos_staff has UPDATE on reviews.language (staff edit's language reset is allowed); vamos_public has EXECUTE on review_translation_source
- Acceptance greps: `review_ref(r.body)` = 1; `r.id` = 0; `"review-translate"` = 1; `readCachedTranslation(` line 105 before `translateText(` line 164; `kind: "review"` = 1 per staff route file

Stack lock: acquired 04:25:54, lab up, tests, destroy, released 04:28:35.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Text edit clears the stored language**
- **Found during:** Task 3 (first executor)
- **Issue:** the review language job skips a review that already has a language, so an enqueue after a text edit would have kept the old language
- **Fix:** both UPDATE statements in `updateReview` set `language = case when body = <new> then language else null end`; `createReview` returns the new id (`returning id`) so POST can enqueue it
- **Files modified:** apps/web/app/[locale]/(ops)/ops/reviews/actions.ts (outside the plan's file list)
- **Commit:** 69ee3076

**2. [Rule 3 - Blocking] read-rate-limit test listed the routes**
- **Fix:** apps/web/lib/abuse/read-rate-limit.test.ts gained the new route; commit 30cf917f

**3. [Rule 1 - Bug] tsc on the route test payload** — commit eff735b3

Note: the 404 answer carries Next's own `private, no-cache, no-store, max-age=0, must-revalidate` on the Worker, not the literal `private, no-store`; it is still no-store.

## Known Stubs

None.

## Threat Flags

None. The new public endpoint is the one in the plan's threat model (T-32-32..36).

## Self-Check: PASSED

All created and modified files exist; commits 42f08965, c82e7487, 30cf917f, ec276424, c2f390d3, 69ee3076, eff735b3 are on the branch.
