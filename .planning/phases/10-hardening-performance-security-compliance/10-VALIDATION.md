---
phase: 10
slug: hardening-performance-security-compliance
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-12
---

# Phase 10 — Validation Strategy

> CONTEXT.md D-01…D-47 win over RESEARCH and over leftover four-category cookie copy.
> No `vamostaxi.eu` DNS, no `sk_live_`, Hyperdrive never `:6543`, no invented CHF/legal.
> Health is secret-header `/api/internal/health`. Keep `/api/dev/db-smoke` 404.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (`apps/web`) + existing pgTAP `consent_write.test.sql` (do not add a second table) |
| **Config file** | `apps/web/vitest.config.ts`; `packages/db/supabase/config.toml` |
| **Quick run command** | `pnpm --filter web exec vitest run lib/consent lib/abuse/write-rate-limit.test.ts lib/health lib/security lib/cache lib/dc-mock-urls.test.ts` |
| **Full suite command** | `pnpm --filter web exec vitest run` + `pnpm --filter @vamos/db run test:db supabase/tests/consent_write.test.sql` + `pnpm run typecheck` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** the quick command for files touched
- **After every plan wave:** full suite
- **Before `/gsd:verify-work`:** full suite green **and** owner sittings (health secret, WAF skip, copy-restore) recorded
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | SITE-08 | T-10-01 | Wave 0 consent/IP/cookie contract files exist | vitest files | `test -f apps/web/lib/consent/ip.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | LAUNCH-02 LAUNCH-03 | T-10-02 T-10-18 | Wave 0 write-limiter + health 404 files exist | vitest files | `test -f apps/web/lib/health/header.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | LAUNCH-01 LAUNCH-02 | T-10-11 T-10-12 | Leak gate / no public `/health` / no Sentry / no `.eu` bind — green now | vitest | `pnpm --filter web exec vitest run lib/health/leak-gate.test.ts lib/security/headers.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 2 | SITE-08 | T-10-03 T-10-04 | IP truncate + HttpOnly cookie helpers | vitest | `pnpm --filter web exec vitest run lib/consent/ip.test.ts lib/consent/cookie.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-02 | 02 | 2 | SITE-08 LAUNCH-02 | T-10-02 T-10-05 | GUC bind helper; write limiter fail-closed `rate_limited` | vitest | `pnpm --filter web exec vitest run lib/consent/record.test.ts lib/abuse/write-rate-limit.test.ts` | ❌ W0 | ⬜ pending |
| 10-03-01 | 03 | 3 | SITE-08 | T-10-01 T-10-06 | POST `/api/consent` → `record_consent` via GUC; Accept Turnstile; Dismiss no Turnstile | vitest | `pnpm --filter web exec vitest run lib/consent/record.test.ts` | ❌ W0 | ⬜ pending |
| 10-03-02 | 03 | 3 | SITE-08 | T-10-07 | Signup inserts a new `consent_log` row (`customer_id` from `app.uid()`) | source + vitest | `pnpm --filter web exec vitest run lib/consent/record.test.ts` | ❌ W0 | ⬜ pending |
| 10-04-01 | 04 | 4 | SITE-08 | T-10-08 | Two-button banner; no fake toggles; public hosts only | vitest | `pnpm --filter web exec vitest run components/consent/banner-contract.test.ts` | ❌ W0 | ⬜ pending |
| 10-04-02 | 04 | 4 | SITE-08 | T-10-08 | `/cookies` necessary-only; `settings_change` new row; never UPDATE | vitest | `pnpm --filter web exec vitest run components/consent/banner-contract.test.ts` | ❌ W0 | ⬜ pending |
| 10-05-01 | 05 | 3 | LAUNCH-02 | T-10-09 | Contact + reviews POST rate-limited; Turnstile stays fail-closed | vitest | `pnpm --filter web exec vitest run lib/abuse/write-rate-limit.test.ts` | ❌ W0 | ⬜ pending |
| 10-05-02 | 05 | 3 | LAUNCH-02 | T-10-10 | No Turnstile on checkout or manage-booking cancel; webhook untouched | source grep | `pnpm --filter web exec vitest run lib/health/leak-gate.test.ts` | ❌ W0 | ⬜ pending |
| 10-06-01 | 06 | 2 | LAUNCH-01 | T-10-13 T-10-14 | CSP/HSTS/Referrer/Permissions-Policy/X-Frame-Options | vitest | `pnpm --filter web exec vitest run lib/security/headers.test.ts` | ❌ W0 | ⬜ pending |
| 10-07-01 | 07 | 2 | LAUNCH-01 | T-10-11 T-10-12 | Marketing Cache-Control; auth `no-store`; GET never mints consent cookie | vitest | `pnpm --filter web exec vitest run lib/cache/marketing-cache.test.ts` | ❌ W0 | ⬜ pending |
| 10-08-01 | 08 | 2 | LAUNCH-03 | T-10-15 T-10-16 | Secret-header health; missing/wrong → empty 404; body booleans only | vitest | `pnpm --filter web exec vitest run lib/health` | ❌ W0 | ⬜ pending |
| 10-08-02 | 08 | 2 | LAUNCH-03 | T-10-17 | `/api/dev/db-smoke` stays 404; health is not under `/api/dev` | vitest | `pnpm --filter web exec vitest run lib/health/leak-gate.test.ts` | ❌ W0 | ⬜ pending |
| 10-09-01 | 09 | 5 | LAUNCH-02 | T-10-19 | WAF skip `/api/stripe/webhook`; no `.eu` bind | docs | `python3 -c "from pathlib import Path; p=Path('docs/ops/waf-vamostaxi-site.md').read_text(); assert 'do not' in p.lower() and 'vamostaxi.eu' in p.lower(); assert 'custom_domain' not in p.lower()"` | ❌ W0 | ⬜ pending |
| 10-10-01 | 10 | 5 | LAUNCH-04 LAUNCH-07 | T-10-20 | Runbook in `docs/runbook/`; restore is a **copy**; live Zurich never the target | docs grep | `test -f docs/runbook/restore-database.md` | ❌ W0 | ⬜ pending |

No three consecutive tasks without an automated verify.

---

## Wave 0 Requirements

- [ ] `apps/web/lib/consent/ip.test.ts`
- [ ] `apps/web/lib/consent/cookie.test.ts`
- [ ] `apps/web/lib/consent/record.test.ts`
- [ ] `apps/web/lib/abuse/write-rate-limit.test.ts`
- [ ] `apps/web/lib/health/probe.test.ts`
- [ ] `apps/web/lib/health/header.test.ts`
- [ ] `apps/web/lib/health/leak-gate.test.ts`
- [ ] `apps/web/lib/security/headers.test.ts`
- [ ] `apps/web/lib/cache/marketing-cache.test.ts`
- [ ] `apps/web/components/consent/banner-contract.test.ts`

Existing infrastructure: `packages/db/supabase/tests/consent_write.test.sql` already proves `record_consent` / GUC / no direct INSERT. Do not duplicate as a new table. Do not `supabase db push`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `wrangler secret put HEALTH_PROBE_SECRET` | LAUNCH-03 | Agent must never see the value (D-19) | Owner types the secret in their terminal for `vamos` staging. Agent confirms only that a later authorized GET returns JSON booleans. |
| Zone managed WAF + webhook skip | LAUNCH-02 | Cloudflare dashboard clicks (D-28) | Owner enables managed WAF on `vamostaxi.site` zone; skip `/api/stripe/webhook`. Do not touch `vamostaxi.eu`. Funnel quote/pay must still work (D-29). |
| Practice restore onto a **copy** | LAUNCH-04 | Destructive dashboard path (D-39) | Owner follows `docs/runbook/restore-database.md`. Live `yaumjzvylngfjhtuffqs` is never the restore target. One drill (D-41). |
| Banner Accept/Dismiss on staging | SITE-08 | Visual + live row | First visit on `vamostaxi.site`: two buttons, no toggles. Both write `consent_log`. Return visit: no banner. Dashboard: no banner. |
| 10k browse / p95 | LAUNCH-01 | No public load-test URL (D-23) | After ship, read Cloudflare Web Analytics + Workers metrics. Do not publish a k6 URL. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true`

**Approval:** pending execute
