# Phase 1 verification — Platform Foundation, Design System Port & i18n Runtime

**Verdict: PASS_WITH_GAPS** — the phase's substance is real and independently
verified; the gap is the CI/CD spine, which has never run end to end.

Verified 2026-08-22 by goal-backward audit (criteria taken from ROADMAP.md, tested
against the codebase and the live staging deployment, with each plan's SUMMARY claim
re-checked independently rather than trusted).

## Success criteria

| # | Criterion | Met | Evidence |
|---|---|---|---|
| 1 | PR triggers typecheck + build + preview; `main` deploys to a real staging domain; a tag deploys production — all via one Worker entry exporting `fetch`/`scheduled`/`queue` | **No** | Worker entry half: **met**. `apps/web/worker.ts` exports all three, proven live — the Cloudflare API reports cron `0 3 * * *` registered and `vamos-stripe-events-staging` consumed by `vamos-web-staging`. Pipeline half: **unmet**, see below. |
| 2 | A ported component renders pixel-identical to its `.dc.html` source using the same class names, Lenis smooth and honouring `prefers-reduced-motion` | Yes | 33 components ported under `apps/web/components/` keeping their `vt-*` class names; 369 committed screenshot baselines; `pnpm test:visual --grep @component` passes 373/373 twice consecutively with zero flakes. |
| 3 | No secret readable from the browser or present in the repo | Yes | `pnpm check:public-env` passes; every credential reaches the Worker via `wrangler secret`; `wrangler.jsonc` carries no credential-shaped `vars` entry. |
| 4 | Language switch relabels everything in place with no reload, correct in server-rendered HTML with no English flash, Arabic RTL with logical properties | Yes | `@ssr-locale` asserts `lang`/`dir` and translated copy in the **raw response bytes**, not the hydrated DOM; `/ar` carries `dir="rtl"` before any script runs; `@lang-switch` proves a half-filled booking draft survives a switch both ways (ADR-001's own stated pass condition). |
| 5 | Currency changes only the mark, never the number; built strings translate too | Yes | `@currency` asserts the digit sequence is byte-identical across a switch and that switching triggers no request and no navigation — currency never reaches the server or a cache key (ADR-004). |

## The real gap: CI/CD has never worked end to end

Criterion 1 fails for reasons beyond the accepted domain deviation:

- **Exactly one GitHub Actions run exists in the repo's history** (Deploy Staging,
  `32475432455`). It failed at the visual-test gate; the deploy job never executed.
- **That failure is structural.** All 369 baselines are committed as `-darwin.png`;
  `ubuntu-latest` looks for `-linux.png`. The gate cannot go green on the current
  runners regardless of code quality.
- **The repo has zero Actions secrets** (`total_count: 0`, no environments, no org),
  so the `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` steps in all three
  workflows would fail even past the gate.
- **`deploy-staging.yml`'s three smoke steps curl `https://staging.vamostaxi.eu`**,
  which NXDOMAINs — a post-deploy failure by construction.
- **No git tag has ever existed**, so `deploy-production.yml` has never run.

Every staging deploy so far has been manual, from the workstation.

## Recorded deviations (owner decisions, not defects)

1. **Staging runs on `*.workers.dev`, not a real domain.** No `vamostaxi.eu` zone
   exists on this Cloudflare account; the owner chose to stay off the real domain
   until the Phase 11 cutover so the live Freshpage site keeps serving `vamostaxi.eu`
   untouched. Criterion 1's "not `*.workers.dev`" wording is therefore unmet by
   choice.
2. **Cloudflare Access and Logpush are deferred.** The owner opted to handle
   authentication through Supabase later instead. Recorded in
   `docs/build/CLOUDFLARE-RESOURCES.md`.
3. **Hyperdrive is absent from `env.staging`.** `wrangler deploy` validates the id
   against the live API as a real UUID, so a placeholder fails the deploy outright.
   Phase 3 adds it once Supabase exists.

## Defects found by the gate, and their disposition

| Defect | Status |
|---|---|
| `pnpm test:visual` exited 1 on a clean tree — five integration specs each spawned `next dev` against the shared `apps/web/.next` under `fullyParallel` | **Fixed** (`bc996a3`) — shared server harness; readiness now requires a response the app produced rather than a bound socket, and servers spawn the pinned `next` binary directly so teardown reaps the tree instead of orphaning it. The three specs now pass together. |
| Live staging served the Plan-01 tracer page — no shell, `/sitemap.xml` 404 — because it was last deployed by hand before 01-13 landed | **Fixed** — redeployed at version `546b3a21`. Shell renders, sitemap 200s, `/ar` is RTL, `x-robots-tag: noindex` present. |
| `aria-label="Footer"` hardcoded English in `SiteFooter.tsx` — a Law 3 violation reaching screen-reader users on all three non-English sites | **Fixed** (`6650c55`) — resolves through the `footer` namespace, string added to all four locales. |
| `tests/integration/lenis.spec.ts:130` (`prefers-reduced-motion`) fails deterministically even run alone | **Open — test defect, not a product defect.** Probed directly with a standalone Chromium context: steady-state behaviour is correct (`matchMedia` true → 0 Lenis instances). The provider boots and tears down one transient instance and the assertion reads inside that window. Logged in `WINDOWS.md`. |
| `TEST_DIST_DIR` seam named its directory with `testInfo.workerIndex`, so Next's `writeConfigurationDefaults` appended a fresh entry to the **committed** `tsconfig.json` on every test run | **Fixed during 01-14 close-out** — one fixed distDir name with the single include entry pre-seeded; verified idempotent across three consecutive runs. |

## Four-law audit

26 files scanned across the shell, layout, error pages and gallery, plus a repo-wide
grep sweep for every banned token pattern. Two findings, both Law 3, both now closed:
the footer landmark label above, and a latent default prop in `BrandSelect` whose
call sites always pass a translated label today.

No Law 1 (glow), Law 2 (tinted yellow) or Law 4 (invented price) violations found.

## Code review

60 files reviewed. **No findings survived verification.** Specifically checked and
found clean: `lib/logger.ts` is scalar-only at the type level and cannot serialise a
credential-shaped key, a whole request or a headers object; the language setter draws
its target from the fixed four-locale routing object, so it cannot be used as an open
redirect; no booking-draft field reaches the URL, history or a referrer header; and
nothing reads `window`/`document`/`localStorage`/`sessionStorage` during render.

## Readiness for Phase 2

Phase 2 (Data Schema, RLS & Staff Auth Foundations) can safely start. Nothing in
schema, RLS or staff auth depends on the broken CI path, and the data-access work it
feeds is gated behind Phase 3's Hyperdrive wiring regardless.

**Before launch, the CI gap must close** — it is a Phase 10/11 blocker, not a Phase 2
one. Closing it needs, at minimum: Linux baselines generated in CI (or a container
that matches the runner), the two Cloudflare secrets added to the repo, and the smoke
steps repointed off `staging.vamostaxi.eu`.
