---
phase: 05
slug: public-surfaces-customer-accounts
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-09-04
---

# Phase 05 — Validation Strategy (remaining work)

> Leftover-only. 05-01…26 already executed. Do not re-open Wave 0 for React ports.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit) + Playwright (integration) + pgTAP |
| **Config file** | `apps/web/vitest.config.ts`, `apps/web/playwright.config.ts` |
| **Quick run command** | `pnpm --filter web test:unit` |
| **Full suite command** | `pnpm --filter web test:unit && pnpm --filter web exec playwright test tests/integration/home-reviews.spec.ts tests/integration/home-flight.spec.ts` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** the plan's named unit/source test
- **After every plan wave:** `pnpm --filter web test:unit` plus the plan's Playwright file if present
- **Before `/gsd:verify-work`:** unit green + Chrome-UA curl table in 05-33
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-29-01 | 29 | 12 | SITE-01 | T-05-29-01 | Public GET returns published rows only; no staff fields | unit | `pnpm --filter web exec vitest run tests/unit/public-reviews-route.test.ts` | ❌ | ⬜ pending |
| 05-29-02 | 29 | 12 | SITE-01 | T-05-29-02 | Home hydrates `/api/reviews`; 0 published hides `#reviews` | source + curl | grep + Chrome-UA `/api/reviews` | ✅ source | ⬜ pending |
| 05-30-01 | 30 | 12 | SITE-01 | T-05-30-01 | No `FLIGHTS` fixture array; 503 does not invent status | source | grep `const FLIGHTS` = 0 | ✅ source | ⬜ pending |
| 05-31-01 | 31 | 12 | SITE-04 | T-05-31-01 | `partner_applications` dropped; no public partner write | SQL + curl | hosted table gone; `/become-a-partner` 404 | ❌ mig | ⬜ pending |
| 05-32-01 | 32 | 12 | AUTH-01 | — | OWNER-CHECKS matches live hook/Turnstile facts | docs | file contains 2026-09-04 | ✅ | ⬜ pending |
| 05-33-01 | 33 | 13 | SITE-01…09 | — | Per-URL staging connection table | curl | Chrome-UA each Phase 5 URL | n/a | ⬜ pending |

---

## Wave 0 Requirements

Existing infrastructure covers remaining work. No new test runner.

- [x] Vitest present
- [ ] `apps/web/tests/unit/public-reviews-route.test.ts` — created in 05-29
- [ ] `apps/web/tests/unit/home-flight-fixtures.test.ts` — created in 05-30 (source grep)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 05-27 contact inbox + fresh Turnstile | SITE-04 | Owner must not have the agent re-submit | Koss UAT on staging; agent does not POST `/api/contact` |
| Signed-in `/account` Save | AUTH-04 | Needs Gmail session cookie | Owner signs in; cookie-less POST is not proof |

---

## Validation Sign-Off

- [ ] All leftover tasks have automated verify or named curl
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set after 05-33

**Approval:** pending
