---
phase: 32-auto-translate
plan: 07
subsystem: support-translate-server
tags: [support, tickets, translation, queue, staff-route, i18n]
requires: [32-01, 32-02, 32-05]
provides:
  - ticket-inbound.ts and contact/route.ts enqueue { v:1, kind:"support" | "support-form", id } after the row exists
  - OpsTicketMessage.lang + translation { text, status: ready|pending|failed|same } (null for staff/note)
  - OpsTicketReply.lang (latest detected customer language, else ticket locale, else "")
  - loadTickets(env, claims, lang = "en"); GET /api/staff/tickets?lang=en|de|fr|ar (else en)
  - POST /api/staff/tickets/:id/reply-translate -> { status: ready, text } | { status: failed } | { status: skipped } (dual mount)
  - messageTranslation(), TRANSLATION_PENDING_MS, TicketView, OpsTicketTranslation in tickets-map.ts
affects: [32-10 (dashboard reply box and bubbles code against these contracts), 32-12]
tech-stack:
  added: []
  patterns: ["enqueue after commit, own try/catch", "left join for the requested language under asStaff", "catch around asStaff, never inside", "aliased context import keeps vendor names out of route code"]
key-files:
  created:
    - apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/reply-translate/route.ts
    - apps/web/app/api/staff/tickets/[id]/reply-translate/route.ts
    - apps/web/lib/ops/reply-translate.test.ts
    - apps/web/tests/unit/contact-route-translate.test.ts
    - .planning/phases/32-auto-translate/deferred-items.md
  modified:
    - apps/web/lib/ops/ticket-inbound.ts
    - apps/web/lib/ops/ticket-inbound.test.ts
    - apps/web/app/api/contact/route.ts
    - apps/web/lib/ops/tickets.ts
    - apps/web/lib/ops/tickets.test.ts
    - apps/web/lib/ops/tickets-map.ts
    - apps/web/lib/ops/tickets-map.test.ts
    - apps/web/app/[locale]/(ops)/api/staff/tickets/route.ts
decisions:
  - "reply.lang walks customer messages newest first and takes the first usable detected language (a still-pending newest message does not hide an earlier 'de'); 'und' and null count as unknown"
  - "translation.text is '' unless status is ready; a done row with a blank body reads as failed"
  - "reply-translate: a missing or non-string lang is 'skipped' (contract lists only invalid-json / invalid-text as 400s); a malformed ticket id is 404 with no database call; a database fault on the existence check is 503 unavailable"
  - "reply-translate: an answer equal to his text (nothing to translate, e.g. '08:15') is 'skipped', so the mail never shows the same text twice around the divider"
  - "The 20-hyphen body, the 1,800-char cut and the notes stay client-side (plan 32-10, UI-SPEC B2); this route only returns the translated text"
metrics:
  duration: 9min
  started: 2026-10-14T03:59+04:00
  completed: 2026-10-14T04:08+04:00
  tasks: 3
  files: 13
---

# Phase 32 Plan 07: Support server side Summary

New customer messages (inbound e-mail and contact form) are queued for translation by id only after they are stored; the ticket API returns each customer message's detected language and its translation into the dashboard language with a ready/pending/failed/same status; a staff-only route translates his reply into the customer's language (en/de/fr/ar only) and returns text without sending or storing anything.

## Tasks

| # | Task | Commits |
|---|---|---|
| 1 | Enqueue new customer messages, ids only (TDD) | `7e5ae975` (test RED), `9f88bf98` (feat GREEN) |
| 2 | Ticket read model: language, status, reply target and subject (TDD) | `4bfe481e` (test RED), `b653af7d` (feat GREEN) |
| 3 | Staff reply-translate route with dual mount (TDD) | `3953b0bb` (test RED), `08f0e692` (feat GREEN) |

## Verification (2026-10-14, local, stub model binding, no network, no build, no database)

- `vitest run` on ticket-inbound, contact-route-translate, ticket-inbound-webhook, ticket-inbound-files, tickets-map, tickets, tickets-route-readonly, ticket-reply-link, reply-translate, translate/boundary, turnstile-replay-routes, write-rate-limit, phase-13-must-not, ops-live-data: 14 files, 157 tests passed (`evidence/32-07-vitest-final.log`, exit=0).
- `tsc --noEmit` (apps/web, equals `pnpm --filter web typecheck`): exit 0 after Task 2 and Task 3 (`evidence/32-07-typecheck-t2.log`, `-t3.log`).
- `eslint` on every touched file: exit 0. `node scripts/check-db-access-fences.mjs`: all 8 checks passed.
- Acceptance greps: `sendTranslateJob(` 1 in ticket-inbound.ts and 1 in contact/route.ts; `support_message_translations` 1 in tickets.ts; the status union line 1 in tickets-map.ts; `export { POST }` 1 in the dual mount; `gemma|workers ai|cloudflare` outside import lines of the route = 0.
- The boundary test (32-05) passes with the new route: it was already on the ENGINE_CALLERS and AI_READERS allowlists.
- `tickets-route-readonly.test.ts` (G27, PATCH refuses `reply`) stays green; the new route returns text only.
- Lab p32 was not needed (all reads are mocked through `asStaff`; no schema change in this plan).

## Deviations from Plan

### Auto-fixed / interpretation

1. **[Rule 2 - Correctness] An answer equal to his text is "skipped", not "ready".** The engine returns the source unchanged for a text with no words (e.g. "08:15") without a model call. Returning it as "ready" would make the mail repeat the same text above and below the divider. Tested. Commit `08f0e692`.
2. **[Rule 2 - Robustness] Malformed ticket id -> 404 before any database call; database fault -> 503 `unavailable`.** The contract names 404 for an unknown ticket but nothing for a cast error or an outage; the `::uuid` cast would otherwise throw inside the staff transaction. The catch sits around `asStaff`, never inside (postgres.js begin() rethrow rule). Commit `08f0e692`.
3. **Missing or non-string `lang` -> "skipped".** The contract lists only invalid-json / invalid-text as 400s; "skipped" means his text goes as written, which is the safe outcome.
4. **Route code names no vendor:** `getCloudflareContext` is imported as `workerContext`, so the acceptance grep (non-import lines) reads 0 while the plan's "take ai from the context env" still holds.

### Out of scope (logged, not fixed)

- `lib/ops/ops-session-lost.test.ts` pins at least 13 dashboard route screens; plan 32-03 (`739d55d8`) removed OpsContent, so it reads 12 and fails. No `.dc.html` is touched here. Logged in `deferred-items.md`.

## Known Stubs

None. Every new field is read from Postgres (`detected_lang`, the left-joined translation row) or computed from it.

## Threat Flags

None beyond the plan's register. T-32-26 (exact key sets asserted for both producers), T-32-27 (queue false and throw leave "ok" / the form answer unchanged; enqueue runs after the transaction resolved, asserted), T-32-28 (real withStaff in the test: 401 no-session, 403 csrf for foreign and missing Origin; ticket existence under asStaff, 404), T-32-29 (4000-char cap, 20 s ceiling, skipped with no model call outside the four or when from equals lang), T-32-31 (translations read under asStaff only; no public route returns them) are covered. Logs carry `{ reason, lang }` only; a test scans every console line for his text.

## Self-Check: PASSED

- Files exist: both reply-translate route files, reply-translate.test.ts, contact-route-translate.test.ts, deferred-items.md; modified ticket-inbound(.test).ts, contact/route.ts, tickets(.test).ts, tickets-map(.test).ts, staff tickets route.ts.
- Commits in `git log`: `7e5ae975`, `9f88bf98`, `4bfe481e`, `b653af7d`, `3953b0bb`, `08f0e692`.
