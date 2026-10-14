---
phase: 32-auto-translate
verified: 2026-10-14T08:30:26Z
status: human_needed
score: 11/11 requirements verified in code (2 warnings, 0 blockers)
overrides_applied: 0
human_verification:
  - test: "Billed smoke of the real model: pnpm i18n:smoke --yes-billed, read the 15 outputs"
    expected: "All accepted; Swiss ss, no ß; Vamos Taxi, CHF 000, VT-26-0753, ZRH, LX 318 unchanged; Arabic uses 0-9"
    why_human: "Every test uses the AI stub; the real Gemma 4 output has never been read, and the call is billed"
  - test: "After the live steps (4 migrations, 2 queues, staging deploy): send a German message through /contact on vamostaxi.site"
    expected: "Within about 60 s the ticket shows the English translation, 'Translated from German', the original underneath; translate DLQ stays empty"
    why_human: "Live queue, live Workers AI binding and live database; nothing was deployed or applied"
  - test: "In that ticket write a reply, press ANSWER BY E-MAIL in both mail-app modes"
    expected: "Gmail / the mail app opens with the German text, blank line, 20 hyphens, blank line, his text; German subject"
    why_human: "Opening a real mail client; the ready state was stubbed in the browser proof (local Worker has no AI binding)"
  - test: "On the live home, tap Translate on a review written in another language, then Show original"
    expected: "Translation appears with no vendor or model name; original comes back with no new request"
    why_human: "Cache-miss path calls the live model; only seeded cache rows were proven locally"
---

# Phase 32: Automatic translator Verification Report

**Phase Goal:** Every text that has a language reaches the customer in en/de/fr/ar without Koss checking it; Gemma 4 on Workers AI in the background, cached, never in a public page view; missing translation shows the source; legal and human strings untouched; no machine mark; his typed value wins; Content › Pages/Legal removed; home reviews translate on tap.
**Verified:** 2026-10-14 12:30 (+04), head 30def186
**Status:** human_needed
**Re-verification:** No, initial verification

Owner decisions applied: D-05 (no mark, no Translations page, no preview), D-06 (Pages/Legal removed), D-12 (booking notes translated and stored, no screen), F-01 (legal never machine-translated).

## Goal Achievement

### Observable Truths (roadmap requirements)

| # | Truth | Status | Evidence |
|---|---|---|---|
| TR-01 | Catalog gaps filled, never overwriting a human string | VERIFIED | `scripts/i18n-fill.mjs` + `apps/web/lib/translate/catalog.ts` (`findGaps`, `isDenied`, apply* refuse existing values and ß); `node --test scripts/i18n-fill.test.mjs` 5/0, `catalog.test.ts` 10/10 (run here); `static.log` i18n:fill --check 0 gaps. Fill is a controller command by plan 32-09 design; catalog text ships in git |
| TR-02 | Dashboard text translated on write; his value wins; review language on write | VERIFIED | `rate-book/route.ts:673-697` `saveExtraLabels` -> `planExtraLabels` -> `translateText`; no m2m100 left; `system_extra_label_fill` writes only empty/machine languages; `staff/reviews/route.ts:79-84` and `reviews/[id]/route.ts:125-130` enqueue `kind:"review"`. See warning W-2 |
| TR-03 | Customer messages shown in his language with "Translated from" and the original | VERIFIED | Producers `ticket-inbound.ts:157-164` (support), `api/contact/route.ts:76-81` (support-form), ids only -> `worker.ts:261-269` -> `queue-consumer.ts` -> `jobs.ts` `supportJob` -> `store.ts` definers -> `tickets.ts:74` left join -> `tickets-map.ts:165-177` statuses -> `OpsSupportTicket.dc.html:245-260, 575` (`?lang=`, poll 5x2 s). Browser B 16/0 |
| TR-04 | Reply goes out in the customer's language via mail app | VERIFIED | `reply-translate/route.ts` (staff, 4000 cap, 20 s); DC `runTranslate` 701, `mailBody` 731-739 (text, blank, 20 hyphens, blank, his text; >1800 drops original); subject `tickets-map.ts:215`; dashboard sends nothing |
| TR-05 | Other customer language: inbound translated, reply untranslated | VERIFIED | `translateUnknown` keeps any ISO 639-1 code; route returns `skipped` for non-en/de/fr/ar `lang` |
| TR-06 | Review card: original + Translate on tap; cached, rate-limited, opaque ref, no vendor, never at load | VERIFIED | `lib/public/reviews.ts:67-88` ref + language, no id; `api/reviews/[ref]/translation/route.ts` limiter -> published source -> cache -> cap 3/24 h -> model; `vamos-reviews.js:209`; `Reviews.dc.html:179-187, 354-438`; browser C: 0 requests before first tap |
| TR-07 | Content › Pages and Legal removed everywhere; nothing dropped | VERIFIED | OpsContent, `api/staff/content*`, `lib/ops/content.ts`, `ops/content/actions.ts` absent; sidebar `CONTENT` = reviews only (`OpsSidebar.dc.html:137-138`); middleware has no `/pages` `/legal`; sitemap rows dropped (8959fe1e); 4 migrations add only, no drop |
| TR-08 | Vamos Taxi in Latin in every Arabic string | VERIFIED | No Arabic-script spelling left in `app/`, `apps/web/i18n`, `packages/emails/src`, seed; `strings-signed.test.ts` pins `F01_KEPT` empty |
| TR-09 | Never machine-translated list; protected tokens stay Latin; ss | VERIFIED | `scripts/i18n-machine-denylist.json` + run-time scan of data-vt-legal / data-tok / patterns / `$meta`; `mask.ts` + `guard.ts` reject altered tokens; `post-process.ts` ß->ss |
| TR-10 | Binding only, Gemma 4, thinking off, no AI Gateway, no page-load / e-mail render call, no customer text on queue or logs | VERIFIED | `model.ts:11`, `translate.ts:159-170` `enable_thinking:false`; only callers: queue consumer, two routes, extras save, scripts; `boundary.test.ts` 7/7 (run here); `parseTranslateJob` exact key set (14/14); logs carry reason/lang/hash only |
| TR-11 | Failure shows source, never blank, never blocks save/send | VERIFIED | `translateText/Unknown` never throw; producers wrap send in try/catch; ticket shows original with "Translation not available"; review card keeps original + Try again; extras save survives model failure |

**Score:** 11/11 requirements verified in code. Plan must_haves of 32-01..32-12 checked against the same files; none missing.

### Key Link Verification

| From | To | Status |
|---|---|---|
| `worker.ts` queue() | `consumeTranslateBatch` before Stripe `-dlq` branch | WIRED (`worker.ts:261`, order pinned in `sweep.test.ts` 9/9) |
| `worker.ts` 03:00 | `runTranslateSweep` after refund check | WIRED (`worker.ts:164-169`) |
| `wrangler.jsonc` | `TRANSLATE_QUEUE` producer, consumer, DLQ (staging + production) | WIRED (104, 143-158, 340, 377-392) |
| DC ticket | `/api/staff/tickets?lang=` and `/reply-translate` | WIRED |
| DC review card | `VamosReviews.translate` -> `/api/reviews/<ref>/translation` | WIRED |

### Behavioral Spot-Checks (single files, run 12:2x)

| Check | Result |
|---|---|
| `lib/translate/boundary.test.ts` | 7/7 pass |
| `lib/translate/jobs-contract.test.ts` | 14/14 pass |
| `lib/translate/sweep.test.ts` (changed after the gate run) | 9/9 pass |
| `lib/translate/queue-consumer.test.ts` | 10/10 pass |
| `lib/ops/support-reply-dc.test.ts` | 25/25 pass |
| `lib/ops/reply-translate.test.ts` | 29/29 pass |
| `tests/unit/review-translation-route.test.ts` | 18/18 pass |
| `lib/translate/catalog.test.ts`, `scripts/i18n-fill.test.mjs` | 10/10, 5/0 |

Gate, pgTAP and browser runs taken from `evidence/` logs (gate-local exit=0, 6607 tests; pgTAP 126 files / 3833; Chromium A/B/C 48 frames). Commits after the gate head fb13271e touch only `sweep.test.ts` and planning files.

### Anti-Patterns

No TBD/FIXME/XXX/TODO or placeholder text in added lines. No vendor/model name or "machine" in any visible string (`machine_langs` stays internal, never rendered).

### Warnings (not blockers)

- **W-1 Booking notes are enqueued only by the 03:00 sweep.** No producer at booking create (`sendTranslateJob` callers: contact, ticket-inbound, staff reviews, sweep). RESEARCH line 192 planned "booking create"; no plan carried it. `booking_legs.note` is not covered. No screen reads note translations (D-12), so nothing visible today; a note waits up to 24 h.
- **W-2 A review created hidden and published later is not enqueued.** `reviews/[id]/route.ts:108-112` (publish switch) sends no job, and `jobs.ts` `reviewJob` skips unpublished rows, so its Translate button appears only after the next 03:00 sweep. **Fixed after verification:** the publish switch now sends the review job (`reviews-language-enqueue.test.ts`, red then green).
- Info: `32-HANDOVER.md` section 6 still says `sitemap.dc.html` lists `/pages` and `/legal`; the rows were dropped in 8959fe1e.

### Human Verification Required

1. Billed real-model smoke (`pnpm i18n:smoke --yes-billed`): outputs never read; all tests use the stub.
2. Live German contact message -> translated ticket within about 60 s; DLQ empty.
3. Reply in both mail-app modes opens the agreed body and German subject.
4. Live review Translate tap on a cache miss, then Show original.

### Gaps Summary

No blocker. Every requirement is reachable end to end in code: producer -> ids-only queue -> consumer -> definer store -> staff/public read -> DC screen. What remains is the real model's output and the live path, which cannot be checked before the controller's live steps.

---

_Verified: 2026-10-14 12:30 (+04)_
_Verifier: Claude (gsd-verifier)_
