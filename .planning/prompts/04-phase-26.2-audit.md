You run Phase 26.2, codebase audit, bug fix and simplify, for Vamos Taxi.

Read `.planning/prompts/00-common-rules.md` on main first and follow it.

YOUR JOB
Phase folder on main: `.planning/phases/26.2-codebase-audit-bug-fix-simplify/`. Context
(D-01 to D-08), UI-SPEC, validation and 12 plans are written and signed by the owner on
2026-09-29. Read them all, then `PLANNING-REWRITE-HANDOVER-2026-09-29.md`.

Folder `/Users/koss/Developer/vamos-wt/phase-26.2`, branch `gsd/phase-26.2-audit`, cut from
origin/main.

THE OWNER STARTED THIS PHASE EARLY, on 2026-09-30, while other sessions are still building.
The signed plan assumed 26.0 had landed first. So the order inside the phase changes, and this
change goes to the owner as ONE question before you build: "26.2 starts with the folders nobody
is working on; the booking path and the tests come last, after the other sessions have shipped.
Agreed?" with one example.

WORK NOW ONLY IN FOLDERS NO OTHER SESSION TOUCHES
Allowed now: `packages/emails`, `packages/db/src` and `packages/db/test` (not migrations),
`apps/web/lib/ops`, `apps/web/app/[locale]/(ops)`, `app/ops/*.dc.html`, `apps/web/lib/geo`,
`apps/web/lib/health`, `apps/web/lib/abuse`, `apps/web/lib/security`, `scripts/`, `docs/`.
Report only, no edit, until the control session says the owner of that area has shipped:
- `app/home/*`, `apps/web/app/[locale]/checkout`, `apps/web/lib/checkout`, `apps/web/lib/pricing`,
  `apps/web/lib/quote`, `apps/web/components/transfer` (26.4.2 and 26.5)
- `apps/web/components/consent`, `apps/web/lib/consent`, `apps/web/lib/meta`,
  `app/home/CookieBanner.dc.html`, `apps/web/lib/auth/signup-consent.ts` (Phase 27)
- `apps/web/tests`, `apps/web/playwright.config.ts`, `.github` (26.0)
- `app/pages/*.dc.html` legal pages, `app/vamos-i18n-dict.js`, the message files, the seed
  (shared; append only, and only when a fix needs it)

RULES FROM THE SIGNED CONTEXT, UNCHANGED
- Simplification changes no rendered output, no copy, no route, no API contract, no SQL.
- The database is report only. A finding becomes a proposed new migration, never an edit.
- On the booking path only confirmed bugs are fixed, each with the owner's OK, one question each.
- Security-looking findings are written down and sent to Phase 20, not fixed here.
- Every commit passes typecheck, lint, lint:css, unit tests, i18n:check.

KNOWN LEADS, check each and report
- 16 files carry `data-i18n-skip`, which the runtime never reads (26.0 owns the fix; report only).
- `/about` fleet and `/terms` section 03 state things the site does not do (archived as tag
  `archive/legal-follow-up-fe4e37a0`, not shipped).
- The airport fee is saved inside the fare line, not as its own line.
- The public mock pages carry no hreflang links.

HAND-OVER per area, small and often: a branch that lives for days collides with everyone.
