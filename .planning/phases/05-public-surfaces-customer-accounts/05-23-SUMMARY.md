---
phase: 05-public-surfaces-customer-accounts
plan: 23
subsystem: ci
tags: [i18n, isolate-memoisation, sitemap, playwright, legal-claims]

requires:
  - phase: 05-public-surfaces-customer-accounts
    provides: five legal pages, PUBLIC_ROUTES, PHASE_5_ROUTES, publicSql content.ts, /api/contact
provides:
  - pnpm check:legal-claims (I18N-08 / D-12 / D-29)
  - blocking isolate-memoisation ban (U31/ISOL-08 CI-grep half)
  - public-routes.spec.ts route contract
  - walk-based dev-exclusion
affects: [05-24-owner-inbox]

tech-stack:
  added: []
  patterns:
    - JSON allowlist beside the gate script, never inline exceptions
    - Dev routes discovered by readdir walk, not a hand list

key-files:
  created:
    - scripts/check-legal-language-claims.mjs
    - scripts/legal-language-claims-allowlist.json
    - apps/web/tests/integration/public-routes.spec.ts
  modified:
    - package.json
    - .github/workflows/pr.yml
    - scripts/check-db-access-fences.mjs
    - scripts/db-access-fence-allowlist.json
    - apps/web/lib/metadata.ts
    - apps/web/tests/integration/dev-exclusion.spec.ts
    - apps/web/components/legal/LegalPage.tsx
    - apps/web/tests/visual/legal-cancellation-imprint.spec.ts
    - apps/web/app/api/auth/callback/route.ts

key-decisions:
  - "U31/ISOL-08 is half-closed. Do not mark the item fully closed."
  - "/coming-soon stays in PUBLIC_ROUTES, unowned, handed to 05-24."
  - "05-19 Become a Partner stays deleted. /dev/partner-form 404 is correct."
  - "data-vt-legal mock attribute retired; I18N-08 is the CI script."

patterns-established:
  - "Legal language claims derived from page source, checked against LEGAL_LANGUAGES."
  - "isolate_memoisation_exempt is a named-file list; tests excluded structurally."

requirements-completed: [I18N-08, SITE-05, SITE-07, SITE-02]
# SITE-06 visual sweep not re-run this sitting (see Verification)

duration: 90min
completed: 2026-08-30
---

# Phase 05 Plan 23: CI gates and route contract

**Two blocking CI gates, a whole-route contract spec, walked production 404s for every `/dev` page, and a written U31/ISOL-08 verdict. U31 is not fully closed.**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-08-30T19:00:00Z
- **Completed:** 2026-08-30T19:14:00Z
- **Tasks:** 3
- **Files modified:** 12

## Task 1 mutations (exact output)

Blank `legal.who-you-contract-with` in `fr.json` → check 2 red, then restored:

```
check-legal-claims: declaration matches known facts (D-12) — pass.
check-legal-claims: positive key coverage (D-29) — FAIL:
  - terms: key "legal.who-you-contract-with" is missing or empty in fr.json (claimed by LEGAL_LANGUAGES.terms).
check-legal-claims: no over-claiming (I18N-08) — pass.
check-legal-claims: one or more checks failed — see above.
```

Set `LEGAL_LANGUAGES.imprint` to four languages → check 1 red, then restored:

```
check-legal-claims: declaration matches known facts (D-12) — FAIL:
  - apps/web/lib/legal-languages.ts LEGAL_LANGUAGES.imprint is ["en","de","fr","ar"], must be exactly ["en","de"] (D-12). Restoring a four-language claim repeats the verified false claim at app/pages/imprint.dc.html:124.
check-legal-claims: positive key coverage (D-29) — pass.
check-legal-claims: no over-claiming (I18N-08) — pass.
check-legal-claims: one or more checks failed — see above.
```

`git diff .github/workflows/pr.yml` added exactly one step: `Legal language claims (I18N-08)` beside `i18n:check`.

## U31 / ISOL-08 two-part verdict

- **CI-grep half: CLOSED here.** `checkIsolateMemoisation` is blocking across `apps/web/app` and `apps/web/lib` (not tests). Patterns: module-scope `Map`/`Set`/`WeakMap`/`WeakSet`, `unstable_cache`, `React.cache`, `'use cache'`.
- **Harness half: NOT closed.** Phase 3's stated target `/api/account/bookings` is Phase 8 and does not exist. Nearest Phase 5 candidate `/api/contact` is an `asAnon` write through OpenNext; re-pointing `apps/isolation-probe` at it needs a deployed staging Worker (plan 05-24). `/api/partner-application` is deleted (05-19 never runs).
- **Do not mark U31 fully closed.** Remainder owner: 05-24 (staging probe) and Phase 8 (account bookings).

Mutation: `const cache = new Map();` at module scope in `apps/web/lib/db/content.ts` → red, then restored:

```
check-db-access-fences: no isolate-level memoisation under apps/web/app and apps/web/lib (U31/ISOL-08 CI-grep) — FAIL:
  - apps/web/lib/db/content.ts:11 (isolate-memoisation pattern — module-scope Map/Set/WeakMap/WeakSet, unstable_cache, React.cache, or 'use cache')
check-db-access-fences: one or more fences failed — see above.
```

`isolate_memoisation_exempt` started empty. The upgraded ban fired on `apps/web/lib/quote/errors.ts` (`BODY_ALLOW_KEYS = new Set([...])` — frozen JSON-key allow-list, not a request cache). One named entry; regex not loosened.

Before this task, `pnpm check:db-fences` was 8/8 pass (forward-grep warning path). After: 8/8 pass with the blocking ban.

## D-26

Ban #5 `WRAPPER_IMPORT_RE` already matches `from "@/lib/db/public"`. `publicSql` importers are covered without an extension. `force_dynamic_exempt` still needs `apps/web/lib/db/content.ts` (library; `force-dynamic` is meaningless on it). 05-13 recorded no extra allowlist for the contact route.

## `/coming-soon` → 05-24

Still in `PUBLIC_ROUTES`. No requirement id. Unowned. Sitemap still lists it. Flagged for the owner in plan 05-24. Not deleted.

## 05-19

Become a Partner is deleted from V1. This plan did not recreate `/become-a-partner`, the partner form, or `/api/partner-application`. `/dev/partner-form` is absent from the walk (404 is correct). `depends_on` 05-19 treated as satisfied by deletion.

## Verification

| Gate | Result |
|------|--------|
| `node scripts/check-legal-language-claims.mjs` | pass (3/3) |
| `node scripts/check-i18n-coverage.mjs` | pass (1601 keys, 725 call sites) |
| `node scripts/check-db-access-fences.mjs` | pass (8/8, 284 files) |
| `node scripts/check-next-public-allowlist.mjs` | pass |
| `pnpm typecheck` | **inherited red** — `auth-signout.spec.ts`, `home-content.spec.ts`, `contact.spec.ts`. Not this plan's files. Not patched. |
| `pnpm lint` | 0 errors, 5 inherited warnings |
| `pnpm lint:css` | pass |
| Playwright `public-routes.spec.ts` + `dev-exclusion.spec.ts` `--project=component-1440 --workers=1` | **8 passed** |
| `pnpm test:visual` | **not run.** Command: `pnpm test:visual`. Phase 1's 373 baselines not recorded (no real output this sitting). |
| `pnpm db:test` | **inherited fail** (stack was already up; did not `db:start`). `extensions.test.sql` #12 `vamos_edge has no password` (local-roles residue). `seed_idempotent.test.sql` #30 `have: 6 want: 5` reviews. Files=35 Tests=668. Not this plan. Did not `skip(`. Did not edit `config.toml`. |

## Task commits

1. **Task 1** — `c529d0d` feat: add legal language-claims CI gate (I18N-08)
2. **Task 2** — `bf2fc6a` feat: block isolate memoisation under apps/web app and lib
3. **Task 3** — `2361b2b` test: assert public route contract and walked dev exclusion

**Plan metadata:** (this commit)

## Deviations

- `scripts/legal-language-claims-allowlist.json` not listed in `files_modified` (required: threshold never inline).
- Retired `data-vt-legal` on `LegalPage` so the route contract can assert the mock mechanism is gone; updated `legal-cancellation-imprint.spec.ts` to match.
- Un-exported `validateAuthRedirectTarget` from `app/api/auth/callback/route.ts` so `next build` (dev-exclusion) can compile. Inherited Next route-export error, not invented here.
- Copied gitignored `apps/web/.dev.vars` from the main checkout so auth pages can SSR in `next dev`. Not committed.
- First `pnpm check:legal-claims` created worktree `node_modules` (pnpm lifecycle). Not committed.

## Self-Check: PASSED

- Key files exist on disk
- Three production/test commits plus this SUMMARY on `gsd/05-23-ci-gates`
- Acceptance greps for tasks 1–3 hold
- STATE.md / ROADMAP.md not touched
- No become-a-partner recreation
- U31 not marked fully closed
