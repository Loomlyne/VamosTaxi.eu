---
phase: 1
slug: platform-foundation-design-system-port-i18n-runtime
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-20
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `01-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `@playwright/test` 1.62.x (screenshot diffs, integration) + `tsc --noEmit` (typecheck) + `stylelint` (law and RTL gates). Greenfield repo — no test framework exists yet. |
| **Config file** | none yet — Wave 0 creates `playwright.config.ts` and `.stylelintrc` |
| **Quick run command** | `pnpm typecheck && pnpm stylelint "apps/web/**/*.css"` |
| **Full suite command** | `pnpm typecheck && pnpm build && pnpm stylelint "apps/web/**/*.css" && pnpm i18n:check && pnpm playwright test` |
| **Estimated runtime** | ~180 seconds full suite (build dominates); ~20 seconds quick |

---

## Sampling Rate

- **After every task commit:** Run the quick command
- **After every plan wave:** Run the full suite
- **Before `/gsd-verify-work`:** Full suite green **plus** the ADR-001 booking-widget acceptance test
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

Task IDs are assigned by the planner; this table maps each phase requirement to its automated
check so the planner can attach the right `<automated>` verify to the task that delivers it.

| Requirement | Behaviour | Threat Ref | Secure Behaviour | Test Type | Automated Command | File Exists | Status |
|-------------|-----------|------------|------------------|-----------|-------------------|-------------|--------|
| PLAT-01 | Worker serves an SSR page on the staging custom domain | — | N/A | smoke (post-deploy) | `curl -sfI https://staging.vamostaxi.eu \| head -1` in the CD workflow | ❌ W0 | ⬜ pending |
| PLAT-02 | One entry exports `fetch`, `scheduled` and `queue`; the latter two fire and log | — | N/A | integration | `pnpm playwright test --grep @worker-handlers` plus a `wrangler` cron/queue trigger in staging | ❌ W0 | ⬜ pending |
| PLAT-03 | PR runs typecheck + build + preview; main deploys staging; tag deploys prod | — | N/A | CI meta | the workflows themselves — verified by a green PR run | ❌ W0 | ⬜ pending |
| PLAT-04 | Ported component renders pixel-identical to its `.dc.html` source | — | N/A | visual | `pnpm playwright test --grep @component` | ❌ W0 | ⬜ pending |
| PLAT-05 | Single Lenis instance, `prefers-reduced-motion` honoured, stops on body lock | — | N/A | integration | `pnpm playwright test --grep @lenis` | ❌ W0 | ⬜ pending |
| PLAT-06 | No secret in the repo or the client bundle | T-01-01 | Every credential arrives via `wrangler secret`; no secret in `wrangler.jsonc` `vars` | static analysis | `gitleaks detect` + `node scripts/check-next-public-allowlist.mjs` | ❌ W0 | ⬜ pending |
| I18N-01 | Every visible string resolves in all four locales, including `placeholder`/`aria-label`/`title`/`alt` | — | N/A | static analysis | `pnpm i18n:check` | ❌ W0 | ⬜ pending |
| I18N-02 | Language switch relabels in place, survives navigation and a return visit | — | N/A | integration (ADR-001 acceptance test) | `pnpm playwright test --grep @lang-switch` — fill booking widget, switch language, assert every field survives | ❌ W0 | ⬜ pending |
| I18N-03 | Chosen language correct in the server-rendered HTML — no English flash | — | N/A | integration | `pnpm playwright test --grep @ssr-locale` asserting on the raw response body, not the hydrated DOM | ❌ W0 | ⬜ pending |
| I18N-04 | Arabic renders RTL; no physical left/right properties in app CSS | T-01-02 | Locale param validated against the fixed four-locale list; anything else 404s rather than loading an arbitrary file | static analysis + integration | `pnpm stylelint` with `stylelint-use-logical`, plus `@ssr-locale` asserting `dir="rtl"` in `/ar` server HTML | ❌ W0 | ⬜ pending |
| I18N-05 | Currency swaps the mark, never the number | — | N/A | integration | `pnpm playwright test --grep @currency` | ❌ W0 | ⬜ pending |
| I18N-06 | Strings built from parts are translated | — | N/A | static analysis | `pnpm i18n:check` — parameterised-message coverage, no bare concatenation | ❌ W0 | ⬜ pending |
| D-32 (law gate) | No coloured `box-shadow`, no `--vt-shadow-accent`, no tinted-yellow tokens in app CSS | — | N/A | static analysis | `pnpm stylelint` with `declaration-property-value-disallowed-list` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `pnpm add -D @opennextjs/cloudflare wrangler @playwright/test stylelint stylelint-use-logical` — no framework exists yet
- [ ] `playwright.config.ts` — projects, screenshot baseline directory, CI reporter, deterministic font loading
- [ ] `.stylelintrc` — `stylelint-use-logical` (I18N-04) plus `declaration-property-value-disallowed-list` for the glow and tinted-yellow bans (D-32)
- [ ] i18n key-coverage script or `@lingual/i18n-check` config (D-17)
- [ ] `scripts/check-next-public-allowlist.mjs` — custom; no package covers this (D-35)
- [ ] `.gitleaks.toml` + pre-commit hook + `gitleaks-action` step (D-35)
- [ ] GitHub Actions workflows: PR (typecheck + build + preview), main (staging deploy), tag (prod deploy) — PLAT-03
- [ ] Locally vendored React/Babel copy for the screenshot-diff job, so it needs no network egress (D-25 as amended)

---

## Manual-Only Verifications

| Behaviour | Requirement | Why Manual | Test Instructions |
|-----------|-------------|------------|-------------------|
| Arabic layout reads correctly, not merely `dir="rtl"` | I18N-04 | Mirroring can be structurally correct and still visually wrong; no assertion covers "reads right" | Open each built surface at `/ar` at 1440, 1024, 768 and 390 px; check nothing is clipped, no text is left-aligned against a mirrored container, and figures/codes stay LTR |
| German at 1080 px does not break layout | I18N-01 | Overflow is a judgement call, not a boolean | Open each surface at `/de`, 1080 px; strings grow ~30 % |
| Cloudflare Access actually gates staging | D-37 | Requires an out-of-band identity check | Load `staging.vamostaxi.eu` in a clean browser profile and confirm the Access challenge appears |
| Logpush delivers structured logs | D-38 | Depends on live Cloudflare account configuration | Trigger a staging request, confirm the JSON line with request id, route and locale reaches the sink |

---

## Validation Sign-Off

- [ ] All tasks have an `<automated>` verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without an automated verify
- [ ] Wave 0 covers every ❌ reference above
- [ ] No watch-mode flags
- [ ] Feedback latency < 180 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
