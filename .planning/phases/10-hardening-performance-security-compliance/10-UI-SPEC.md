---
phase: 10
slug: hardening-performance-security-compliance
status: approved
reviewed_at: 2026-09-12
shadcn_initialized: false
preset: none
created: 2026-09-12
---

# Phase 10 — UI Design Contract

> Cookie banner + `/cookies` only. `--vt-*` tokens. Four languages same pass.
> No glow. No tinted yellow. No fake toggles. No invented legal/CHF.
> CONTEXT D-01…D-12 and D-05/D-06 win. Not a DC gallery mock.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (Vamos design system) |
| Component library | `Button`, `Card`, `Alert`, `Icon` |
| Icon library | Lucide via `Icon` |
| Font | Qurova display + Poppins UI |

**Forbidden:** shadcn, four-category cookie grid, analytics/marketing/functional toggles, fake cookies, banner on dashboard, glow, yellow washes.

---

## Screens

### 1. Public cookie banner (`vamostaxi.site` + `www` only)

- Bottom sheet / strip. Two actions only: **Accept** and **Dismiss**. Same result (necessary-only). Both POST `record_consent`.
- Copy lists cookies we really set: language, auth session, `consent_subject`. No extra categories.
- Returning visitor with `consent_subject`: **no banner**.
- Dashboard: **no banner**.
- Tokens: `--vt-*` spacing 4px grid. Buttons existing kit sizes. Touch 44px.

### 2. `/cookies` (four languages)

- Same necessary-only truth. Can write a new `consent_log` row (`settings_change`).
- Withdrawal = new row, never UPDATE.
- Legal TBC pills stay TBC. Do not invent policy text. `policy_version` is the dated stamp from tests.

---

## States

| State | UI |
|-------|----|
| First visit | Banner visible, site usable |
| After Accept or Dismiss | Banner gone |
| Return with cookie | No banner |
| POST fail / 429 | Existing product error family (`rate_limited`). No invented copy |
| Turnstile on Accept | Same pattern as contact. No widget on Dismiss if Dismiss is the same write — still challenge Accept |

---

## Copy

Four languages same pass. Do not invent Swiss legal paragraphs. Short: necessary cookies only; CF analytics is cookieless; no ads.

---

## Non-UI this phase

Health, WAF, headers, cache, runbook have no customer screens beyond `/cookies` and the banner.
