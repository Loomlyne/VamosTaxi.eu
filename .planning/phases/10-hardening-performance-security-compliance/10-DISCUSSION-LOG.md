# Phase 10: Hardening — Performance, Security & Compliance - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-12
**Phase:** 10-hardening-performance-security-compliance
**Areas discussed:** cookies/consent, rate limits/Turnstile, health/10k, backups/runbook, WAF, headers, edge cache, runbook authorship

---

## Cookie banner

| Option | Selected |
|--------|----------|
| Necessary-only, cookieless CF analytics, Sentry after consent_log | ✓ |
| Banner gates Mapbox/quote | |
| Add analytics cookie for CF Web Analytics | |
| Dismiss = necessary-only, both write consent_log | ✓ |
| Reuse consent_log + dated policy_version | ✓ |
| No fake toggles; only real cookies | ✓ (after rejecting four-toggle fake grid) |
| New production banner, not DC gallery | ✓ |
| Public hosts only; dashboard none | ✓ |
| Truncated CF IP stored | ✓ |
| Rate limit record_consent per IP + subject | ✓ |

**Notes:** User rejected fake toggles and later confirmed do not invent tracking to fill a category grid. “Always real bookings” applies to restore, not cookies.

---

## Rate limits

Quote+geo+contact+reviews+consent; checkout/webhook unchanged; Turnstile on contact + review + banner Accept; webhook already Stripe-signed; 429 `rate_limited`.

---

## Health

Secret-header route (404 to strangers); owner `wrangler secret put`; CF watch only; ping db/payments/maps; 10k = edge cache marketing HTML.

---

## Backups

Practice restore on a **copy**; live Zurich never wiped; once unless asked; Postgres only; use whatever Supabase shows; runbook `docs/runbook/` English, no screenshots.

---

## WAF / headers / cache

Managed WAF skip webhook; funnel wins; HSTS on site+dashboard; CSP Stripe/Turnstile/Mapbox; noindex until Phase 11; personal HTML `no-store`; marketing cache + hashed assets + photos long TTL.
