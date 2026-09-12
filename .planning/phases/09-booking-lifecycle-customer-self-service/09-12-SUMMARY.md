---
phase: 09-booking-lifecycle-customer-self-service
plan: 12
subsystem: booking-lifecycle
tags: [reviews, photos, r2, cancellation, d-02]
requires:
  - phase: 09-booking-lifecycle-customer-self-service
    provides: submit_review RPC and booking_lifecycle_reviews migration
  - phase: 06-ops-console
    provides: PHOTOS R2 helpers and public GET /api/reviews
provides:
  - Customer review submit via token or signed-in bookingRef
  - Optional one customer photo under reviews/ via PHOTOS.put
  - /review?token= form with thank-you, four languages
  - /cancellation D-02 windows without a 75% customer tier
affects:
  - apps/web/app/api/reviews/submit/route.ts
  - apps/web/app/api/reviews/photo/route.ts
  - apps/web/app/[locale]/review/page.tsx
  - apps/web/app/[locale]/cancellation/page.tsx
  - app/pages/cancellation.dc.html
tech-stack:
  - next.js
  - supabase
  - cloudflare-r2
  - vitest
  - next-intl
key-files:
  - apps/web/app/api/reviews/submit/route.ts
  - apps/web/app/api/reviews/photo/route.ts
  - apps/web/app/[locale]/review/ReviewForm.tsx
  - apps/web/app/[locale]/cancellation/page.tsx
  - app/pages/cancellation.dc.html
---

# Phase 09 Plan 12: Review submit/photo + cancellation D-02 Summary

**One-liner:** Customers submit a one-shot review (stars + optional comment/photo) at `/review?token=`, and `/cancellation` now states the 24h / 6h D-02 windows instead of a 75% customer tier.

## What Shipped

- `POST /api/reviews/submit` calls `submit_review` (guest hashed token) or `submit_review_customer` (signed-in, after `asCustomer` ownership). Company, chauffeur, and overall stars 1–5 required. Optional comment. Optional `photoKey` must start with `reviews/`.
- Unpaid/cancelled map to 403 `not-reviewable`. Second submit maps to 409 `already-reviewed`. Turnstile reuses the existing contact challenge helper (no `@marsidev`).
- `POST /api/reviews/photo` writes live `PHOTOS.put` via `buildPhotoKey('review', bookingId, mime)`. 5 MB jpeg/png/webp. Returns `{ key }` only. Never staff-gated, never other prefixes.
- `/review?token=` (also `bookingRef` for signed-in) — SiteHeader/SiteFooter from locale layout, four languages, thank you after submit. No dedicated DC mock.
- Public `GET /api/reviews` stays published-only. Ops publish/hide unchanged. No new migration. No `supabase db push`.
- `/cancellation` and `cancellation.dc.html`: >24h automatic full captured refund; 24h–6h cancel immediately, refund pending ops (default 100%); ≤6h through pickup and after pickup if not completed — no automatic refund, ops can still refund; completed/no-show — no customer cancel. 24h/6h are locked (no TBC pills). Coach 8 seats / 72 hours still TBC.

## Key Files

- `apps/web/app/api/reviews/submit/route.ts` — submit RPC + Turnstile + SQL error map
- `apps/web/app/api/reviews/photo/route.ts` — R2 `reviews/` upload
- `apps/web/app/[locale]/review/page.tsx` + `ReviewForm.tsx` + `review.css`
- `apps/web/lib/lifecycle/review-submit.test.ts` — source-read contract
- `apps/web/app/[locale]/cancellation/page.tsx`
- `app/pages/cancellation.dc.html`
- `apps/web/i18n/messages/{en,de,fr,ar}.json`

## Decisions

- Photo eligibility is a Worker status check (`quote`/`pending`/`cancelled`/`partially_cancelled` → 403) plus the existing `submit_review` D-18 gate on insert. No new RPC.
- Signed-in submit uses `asSystem` for `submit_review_customer` because EXECUTE is `vamos_system`; ownership is the `asCustomer` SELECT first.
- Turnstile action stays `"contact"` so `TurnstileWidget` / `TurnstileAction` stay unchanged (plan: reuse helper, no new packages).
- `/review` is not added to `PUBLIC_ROUTES` (avoids the 18-page sitemap count). Metadata is title/description only.
- `review_submitted` was not added to `manage_booking_read` (would need a migration; plan forbids adding one).
- Locale of the form is the URL locale. Review-request email (09-11) should link the booking-locale path.

## Patterns Established

- Customer R2 writes go through `buildPhotoKey('review', …)` and `PHOTOS.put` on a public route authenticated by hashed manage token or JWT — never the staff upload route.
- Lifecycle SQL `P0001` messages (`not_reviewable`, `already_reviewed`) map to 403/409 at the route.

## Issues Encountered

- Source-read tests reject the word `TRIP` even in comments (`No TRIP` failed `\bTRIP\b`). Header comments omit it.

## Test Evidence

- Command: `pnpm exec vitest run lib/lifecycle/review-submit.test.ts tests/unit/public-reviews-route.test.ts` (cwd `apps/web`)
- Result: pass — 2 files, 10 tests
- Notes: 6 review-submit + 4 public-reviews-route. Python assert on cancellation page + dc.html: 24 hours / 6 hours present, no `75%`.

## Self-Check: PASS

- [x] All tasks from PLAN.md completed
- [x] All success criteria met
- [x] All verifications passed
- [x] No leftover TODOs or placeholders
- [x] Ready for next plan

**Confidence:** High — submit/photo routes and `/review` exist, Vitest 10/10, cancellation D-02 copy verified by the plan's Python assert. Not live-exercised against R2 or `submit_review` (no Docker, no db push).
