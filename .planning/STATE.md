---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 1
current_phase_name: Platform Foundation, Design System Port & i18n Runtime
status: executing
stopped_at: "Completed 01-11-PLAN.md (Task 3: data/transfer galleries, baselines, language passes)"
last_updated: "2026-08-21T18:52:52.398Z"
last_activity: 2026-08-21
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 14
  completed_plans: 10
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-17)

**Core value:** A customer can book a fixed-price transfer in under a minute and trust that
the driver will be there. If nothing else works, the booking funnel — quote, pay,
confirmation — must.
**Current focus:** Phase 1 — Platform Foundation, Design System Port & i18n Runtime

## Current Position

Phase: 1 of 11 (Platform Foundation, Design System Port & i18n Runtime)
Plan: 10 of 14 in current phase
Status: Ready to execute
Last activity: 2026-08-21

Progress: [███████░░░] 71%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01 P01 | 55min | 2 tasks | 51 files |
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P02 | 40min | 3 tasks | 8 files |
| Phase 01 P05 | ~25min | 3 tasks | 95 files |
| Phase 01 P03 | 50min | 3 tasks | 36 files |
| Phase 01 P08 | 55min | 2 tasks | 3 files |
| Phase 01 P07 | 50min | 3 tasks | 7 files |
| Phase 01 P06 | ~70min | 3 tasks | 75 files |
| Phase 01 P09 | ~3h (two sessions) | 3 tasks | 100 files |
| Phase 01 P04 | 45min | 3 tasks | 8 files |
| Phase 01 P11 | ~3h (Task 3 this session) | 3 tasks | 116 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Hyperdrive wiring is its own hard-gate phase (Phase 3), split out of schema work, because it needs a concurrency load test before Phase 4 builds on it — not just a smoke test.
- Roadmap: Checkout/payment (Phase 7) is a convergence point, not a parallel track — ops dispatch (Phase 8) and the full booking lifecycle (Phase 9) are sequenced after it, not alongside it.
- Roadmap: the i18n runtime's SSR-safe architecture (render-time `t()`/`useT()` over the existing `vamos-i18n-dict.js`, replacing DOM-walking) is decided in Phase 1, not deferred.
- Roadmap: no standalone late-i18n phase — the ~600-string legal dictionary migration and the content-strings admin UI fold into Phase 6 (ops reference/content) as ongoing work, since no orphan v1 requirement justified a separate phase under fine-granularity guidance.
- [Phase ?]: Checkpoint D-11/D-12 resolved: option-a — /en/<path> permanently (308) redirects to /<path>; next-intl's own middleware issues that redirect as 307 by default, corrected in middleware.ts scoped to explicit /en paths only.
- [Phase ?]: initOpenNextCloudflareForDev() gated to NODE_ENV=development in next.config.ts — calling it unconditionally broke next build against the declared-but-unprovisioned Hyperdrive binding.
- [Phase ?]: Task 3 (deploy to staging.vamostaxi.eu) deferred — no Cloudflare account/DNS setup exists yet; Task 1+2 fully verified locally via opennextjs-cloudflare preview instead.
- [Phase ?]: 01-02: core.hooksPath set locally (not via husky npm package) since package.json is out of this plan's scope — pre-commit hook works on this machine but needs a prepare script later for portability
- [Phase ?]: 01-02: GSD-LAUNCH.md § Secrets stayed prose (no table exists to add rows to, contrary to the plan's assumption) — gates appended in matching style
- [Phase ?]: 01-05: Self-hosted Noto Sans Arabic (D-22's delegated choice) vendored directly from its own upstream GitHub release; Google Fonts hotlink fully removed from apps/web, verified zero external requests on a real /ar preview load
- [Phase ?]: 01-05: --vt-orange (#D4632B, D-07's fourth guideline swatch) recorded as a palette token in design-system/tokens/colors.css with no product-UI usage
- [Phase ?]: 01-05: next/image on this platform proven to require wrangler.jsonc's images.binding=IMAGES (Plan 01-04's file scope) for real resizing — without it /_next/image returns 200 with correct content-type but passes the original file through unresized; flagged for Phase 5, not fixed in this plan's scope
- [Phase ?]: 01-03: stylelint's declaration-property-value-disallowed-list is one rule with two prop-pattern entries (box-shadow, catch-all) — the config format allows only one entry per rule name
- [Phase ?]: 01-03: i18n gate's ADR-011/D-18 exclusions read from a reserved $meta block in en.json, not hardcoded, so Plan 10's migration and the script can't drift apart
- [Phase ?]: 01-03: mountPort renders server-side via react-dom/server + the TypeScript compiler API (no bundler, no new dependency) rather than the Next dev server
- [Phase ?]: isLocked() reads inline style, not getComputedStyle() — a literal port of the vendored locked() function deadlocks the body-lock release direction because Lenis's own lenis-stopped CSS class sets overflow:clip on the root element
- [Phase ?]: Raw Lenis core class over lenis/react bindings for direct instance control the singleton/reduced-motion/pathname effects need
- [Phase ?]: 01-07: Dictionary migration to dotted-key ICU JSON — product names non-translatable, ADR-012 duplicates auto-collapsed by JS semantics, 20 data-tok pending-value keys detected programmatically, 44 concatenation patterns converted to 39 ICU messages (15 plurals)
- [Phase ?]: Badge/Card tinted tones (warning/accent) dropped per Law 02, matching plan's pre-resolved Card decision applied identically to Badge
- [Phase ?]: IconButton ships with no Selected/pressed state — no source to port from (compiled bundle has none; the header notification bell is a bespoke element, not built from IconButton)
- [Phase ?]: Dev gallery routes live under app/[locale]/dev/components/** (not the plan's literal app/dev/components/** path), required by the existing [locale]-segment routing architecture
- [Phase ?]: Every Rule 2 addition the compiled design-system bundle doesn't recognize as a prop at all (Checkbox indeterminate/invalid, Counter disabled/error, Select loading, DatePicker disabled/error/loading) gets a single-sided port-only screenshot baseline, not a bundle-vs-port diff — the bundle silently ignores an unrecognized prop rather than rendering a comparable state.
- [Phase ?]: mock-harness.ts's resolveLocal and waitForMockReady both gained generalizable fixes (directory/index.ts import fallback; infinite-CSS-animation filter in the settle wait) — every later port batch that imports across components/{core,forms,...}/ categories or adds another loading spinner inherits both.
- [Phase ?]: 01-04: @cloudflare/workers-types added as devDependency (pinned to compatibility_date) so CloudflareEnv gets real runtime typing instead of any-under-skipLibCheck; confirmed with a @ts-expect-error smoke test
- [Phase ?]: 01-04: DEPLOY_ENV added as a plain wrangler.jsonc vars entry under env.staging only, the seam apps/web/middleware.ts reads to scope X-Robots-Tag: noindex to staging
- [Phase ?]: 01-04: Cloudflare Access (D-37) and Logpush (D-38) deferred by explicit owner decision, not implemented — recorded in docs/build/CLOUDFLARE-RESOURCES.md and .planning/WINDOWS.md
- [Phase ?]: 01-11: mock-harness.ts mountPort now links every composed component's CSS transitively (collectLocalCssLinks), not just the top-level component's own — a real, silent styling gap found while diffing StatusBadge/VehicleCard's composed Badge against the bundle
- [Phase ?]: 01-11: PriceSummary's bundle-vs-port screenshot diff uses two intentionally different prop shapes per side (bundle: pre-formatted value/total strings; port: amount:number|null routed through formatAmount) since the compiled bundle does no currency formatting of its own at all

### Pending Todos

None yet.

### Blockers/Concerns

- Five owner blockers remain unanswered (CHF price matrix, remaining policy numbers, vehicle/destination photography, payment/social brand marks, Qurova webfont licence). The build proceeds behind `pricing_live=false` and `data-tok` TBC pills — no phase should block waiting on these.
- Hyperdrive must bind to Supabase's **direct** connection string, never the pooled Supavisor (6543) string — double-pooling only surfaces under real concurrency (Phase 3).
- Data residency / Worker region-pinning is still open with counsel per PROJECT.md — must resolve before Phase 10 (hardening), since Sentry/monitoring must not ship ahead of a working `consent_log`.
- `docs/brief/PROJECT-BRIEF.md` and `DECISIONS.md` #14 are stale (name Vercel, shadcn/ui, EN+DE-first) — superseded by `docs/build/GSD-LAUNCH.md`, the bound design system and `CLAUDE.md`'s four-language rule. Do not consult them as current guidance.
- Phase 1 Plan 1 Task 3 (deploy to staging.vamostaxi.eu) blocked on owner Cloudflare account setup: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, and the vamostaxi.eu zone added with existing Freshpage DNS imported first.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260818-wxa | Stream 1 blocker reconciliation: mark every LEGAL-PLACEHOLDER-CHECKLIST decision and conflict resolved-or-open against OWNER-ANSWERS, correct stale counts, register five new conflicts, list contradicted mock sites | 2026-08-18 | e15eaec | [260818-wxa-stream-1-blocker-reconciliation-mark-eve](./quick/260818-wxa-stream-1-blocker-reconciliation-mark-eve/) |
| 260819-0l5 | Stream 2: decide the eight engineering-decidable open questions as ADRs and fill their answer lines in OPEN-QUESTIONS.md | 2026-08-19 | 364e45f | [260819-0l5-stream-2-decide-the-eight-engineering-de](./quick/260819-0l5-stream-2-decide-the-eight-engineering-de/) |
| 260819-0zd | Stream 3: write the Client Input Pack - one sendable document converting every open gap into a sitting's work for a non-technical reader | 2026-08-19 | 39da7c7 | [260819-0zd-stream-3-write-the-client-input-pack-one](./quick/260819-0zd-stream-3-write-the-client-input-pack-one/) |
| 260819-1kt | Stream 4: Qurova webfont licence - provenance, ADR-009, vendored OFL text, rendered fallback comparison, conflict C25 | 2026-08-19 | b1c1cc9 | [260819-1kt-stream-4-qurova-webfont-licence-establis](./quick/260819-1kt-stream-4-qurova-webfont-licence-establis/) |
| 260819-279 | Stream 5 (superseded): translation split - premise voided by measurement, replaced by 260819-mdn | 2026-08-19 | 366fb89 | [260819-279-stream-5-translation-draft-the-156-produ](./quick/260819-279-stream-5-translation-draft-the-156-produ/) |
| 260819-mdn | Stream 5 resumed: measured i18n residual to zero, marked both snapshot files superseded, rewrote C22, registered C26 | 2026-08-19 | 354b2e3 | [260819-mdn-stream-5-resumed-translate-the-8-residua](./quick/260819-mdn-stream-5-resumed-translate-the-8-residua/) |
| 260819-uoq | Record three decided items: ADR-010 Vercel-to-Cloudflare subprocessor fix (C27), ADR-011 data-tok labels stay English, ADR-012 dictionary duplicates and Arabic product names | 2026-08-19 | c23a5a0 | [260819-uoq-record-three-decided-items-as-adrs-verce](./quick/260819-uoq-record-three-decided-items-as-adrs-verce/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-08-21T18:52:52.390Z
Stopped at: Completed 01-11-PLAN.md (Task 3: data/transfer galleries, baselines, language passes)
Resume file: None
