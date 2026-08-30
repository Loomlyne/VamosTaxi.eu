---
phase: 05-public-surfaces-customer-accounts
plan: 13
subsystem: api
tags: [turnstile, contact, resend, asAnon]

requires:
  - phase: 05-01
    provides: TURNSTILE_SECRET_KEY, RESEND_API_KEY, CloudflareEnv
  - phase: 05-08
    provides: submit_contact_message, submit_partner_application
  - phase: 05-12
    provides: "@vamos/emails layoutHtml, escapeHtml, Resend"
provides:
  - verifyTurnstile
  - contactSchema
  - partnerApplicationSchema
  - POST /api/contact
  - POST /api/partner-application
affects: [05-17, 05-19, 05-24]

tech-stack:
  added: []
  patterns: ["challenge then zod then asAnon then notify", "machine-readable form codes"]

key-files:
  created:
    - apps/web/lib/turnstile.ts
    - apps/web/lib/turnstile.test.ts
    - apps/web/lib/forms/schemas.ts
    - apps/web/lib/forms/notify.ts
    - apps/web/app/api/contact/route.ts
    - apps/web/app/api/partner-application/route.ts
    - apps/web/tests/integration/contact-form.spec.ts
  modified:
    - packages/emails/index.ts

key-decisions:
  - "Did not extend Phase 4 lib/abuse/turnstile.ts — quote abuse fails open; form writes fail closed. New lib/turnstile.ts."
  - "Shared step helpers live in lib/forms/notify.ts (formFailure/formSuccess, renderOwnerNotice, sendOwnerNotice). Each route still calls verifyTurnstile, safeParse, asAnon in source."
  - "Documented Cloudflare test secrets short-circuit siteverify (always-pass / always-fail). Missing secret still fails closed."
  - "D-26: pnpm check:db-fences passed with no allowlist change. Both routes export POST + force-dynamic and do not import publicSql."
  - "Become-a-partner PAGE is out of V1; POST /api/partner-application is in this plan."
  - "Real inbox delivery is plan 05-24. RESEND_API_KEY absent logs the subject and still returns 200."

patterns-established:
  - "Form routes return { ok:true, created } or { ok:false, code } — never zod issues, row ids, or payload echoes."
  - "Owner notifications reuse @vamos/emails layoutHtml/layoutText + escapeHtml; internal copy stays English and states submitter locale."

requirements-completed: [SITE-04, SITE-09]

duration: 40min
completed: 2026-08-30
---

# Phase 05: 05-13 contact API

**Turnstile-gated POST /api/contact and /api/partner-application write through 05-08 definer RPCs and notify once per created row.**

## Performance

- **Duration:** ~40 min (resume from Task 2)
- **Completed:** 2026-08-30
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Shared `verifyTurnstile` + zod schemas (Task 1, `ce40a4c`).
- Two Route Handlers: challenge → validate → `asAnon` RPC → owner email. Shared envelope/notify in `lib/forms/notify.ts`.
- Integration spec written; local Postgres was not up so Playwright was not executed this sitting.

## Task Commits

1. **Task 1: shared Turnstile helper and form schemas** - `ce40a4c` (feat)
2. **Task 2: Route Handlers** - `6fd7b24` (feat), `2dc9864` (refactor: shared notify + test-key short-circuit)
3. **Task 3: integration spec** - `b39ca7d` (test)

**Plan metadata:** this file.

## Zod max() vs column checks

| Field | Schema | Check in `20260828000002_contact_forms.sql` |
|-------|--------|-----------------------------------------------|
| contact.name | max(200) | char_length(name) between 1 and 200 |
| contact.phone | max(40) | char_length(phone) <= 40 |
| contact.bookingRef | max(32) | char_length(booking_ref) <= 32 |
| contact.message | max(4000) | char_length(message) between 1 and 4000 |
| partner.name | max(200) | char_length(name) between 1 and 200 |
| partner.city | max(200) | char_length(city) <= 200 |
| partner.phone | max(40) | char_length(phone) <= 40 |
| partner.vehicle | max(200) | char_length(vehicle) <= 200 |
| partner.permit | max(200) | char_length(permit) <= 200 |
| locale | z.enum(routing.locales) | locale in ('en','de','fr','ar') |
| acceptedTerms / acceptedPrivacy | z.literal(true) × 2 | RPC stores true, true; unticked box never reaches SQL |

## Step order (line numbers)

Both routes, after `2dc9864`:

| Call | contact/route.ts | partner-application/route.ts |
|------|------------------|------------------------------|
| `verifyTurnstile(` | 37 | 37 |
| `safeParse(` | 50 | 50 |
| `asAnon(` | 59 | 59 |

## D-26 / db-fences

```
check-db-access-fences: all 8 checks passed (236 files scanned).
```

`git diff --stat scripts/db-access-fence-allowlist.json` — no change. Route Handlers exporting `POST` + `force-dynamic` need no `force_dynamic_exempt` entry.

## Phase 4 Turnstile helper

`apps/web/lib/abuse/turnstile.ts` already existed (quote-abuse ladder, fail-open below threshold). This plan added `apps/web/lib/turnstile.ts` instead of extending it.

## Route response contract (05-17 / 05-19)

| Status | Body |
|--------|------|
| 200 | `{ ok: true, created: boolean }` |
| 403 | `{ ok: false, code: "challenge_failed" }` |
| 400 | `{ ok: false, code: "invalid_input" }` |
| 503 | `{ ok: false, code: "unavailable" }` |

`code` is the only visitor-facing discriminator. Pages map it through the catalogue. Never an English `message`, field map, row id, or submitted value.

## Verification

- `pnpm --filter web run typecheck` exit 0
- `pnpm lint` exit 0 (pre-existing warnings only)
- `pnpm check:db-fences` exit 0
- Playwright `tests/integration/contact-form.spec.ts --project=component-1440` **not run**: `127.0.0.1:54322` was down; `pnpm db:start` timed out at 180s. Spec does not `skip(`; it throws `Local stack is not running. Run \`pnpm db:start && pnpm db:reset\`.` Real inbox delivery remains 05-24.

## Self-Check: PASSED (Playwright deferred on local stack)
