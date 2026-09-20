# Phase 20 — Security audit fix-up

**Date:** 2026-09-19
**Source:** live ZAP baseline on https://vamostaxi.site, Supabase advisors + SQL on `yaumjzvylngfjhtuffqs`, code review of Worker/middleware/staff/checkout. No booking POSTs. No `supabase db push`. No `sk_live_`.

## Goal

Close every confirmed leak and gap from the 2026-09-19 audit, one by one, without inventing CHF, touching `.eu`, flipping `public_chf`, or applying SQL on live (owner applies).

## Locked decisions

- D-01: Do **not** `supabase db push` / restore onto live. Migrations land in the repo; owner applies.
- D-02: Do **not** enable live Stripe or bind `vamostaxi.eu`.
- D-03: `create_quote_snapshot` must not be executable by `anon` or `authenticated`. Worker/Hyperdrive (`vamos_edge`) is the only writer.
- D-04: Dashboard HTML (`serveOpsDc`) must carry the same HSTS/CSP/XFO/Referrer/Permissions-Policy as public pages. Today it drops them.
- D-05: `vamos_dash` is HttpOnly + Secure + SameSite=Lax.
- D-06: Next.js `X-Powered-By` is off.
- D-07: Mutating `/api/staff/*` and `/api/photos/upload` refuse missing/wrong Origin. Allowlist is `dashboard.vamostaxi.site`, `dashboard.localhost`, and `*.koussayzayeni.workers.dev` hosts that contain `ops-changes` — not any `workers.dev`.
- D-08: Staff photo `recordId` is a UUID (or existing slug charset `[a-zA-Z0-9_-]{1,64}`). No `..`.
- D-09: MFA stay **paused** until Koss confirms AAL2 is enrolled (2026-09-01 pause). Plan 20-04 is owner-gated, not autonomous.
- D-10: `vamos.koussayzayeni.workers.dev` gets `X-Robots-Tag: noindex`. Do not flip `workers_dev: false` without owner (staging probes).
- D-11: CSP `'unsafe-inline'` / `'unsafe-eval'` stays — DC `support.js` + Babel. Tracked as accepted risk, not ripped out.
- D-12: 0-policy RLS tables stay fail-closed. No new SELECT policies for anon.
- D-13: Leaked-password protection is owner toggle in Supabase Auth dashboard.
- D-14: Funnel, Hyperdrive roles, and charge-matches-snapshot trigger stay. This phase does not reprice.

## Requirements (this phase)

- SEC-01 Dashboard security headers on `serveOpsDc`
- SEC-02 HttpOnly `vamos_dash`
- SEC-03 Hide `X-Powered-By`
- SEC-04 CSRF Origin required on staff mutating routes + photo upload
- SEC-05 Photo `recordId` sanitised
- SEC-06 Revoke dangerous PostgREST EXECUTE (owner SQL)
- SEC-07 Revoke `rls_auto_enable` EXECUTE from PUBLIC/anon/authenticated (owner SQL)
- SEC-08 workers.dev noindex
- SEC-09 `/.well-known/security.txt`
- SEC-10 MFA restore path (owner-gated)
- SEC-11 Leaked-password protection (owner-gated)
- SEC-12 Live verify on `vamostaxi.site` + `dashboard.vamostaxi.site` after deploy

## Must-nots

No `.eu`. No `sk_live_`. No practice restore. No invented CHF. No Publish. No booking-creating probes.

## Kanban

| ID | Sev | Item | Plan | Gate |
|----|-----|------|------|------|
| K1 | P0 | anon can EXECUTE `create_quote_snapshot` | 20-03 | owner SQL |
| K2 | P0 | Dashboard HTML missing HSTS/CSP/XFO | 20-01 | code + deploy |
| K3 | P1 | `rls_auto_enable` EXECUTE PUBLIC | 20-03 | owner SQL |
| K4 | P1 | Staff CSRF allows empty Origin | 20-02 | code |
| K5 | P1 | Photos upload no CSRF + loose recordId | 20-02 | code |
| K6 | P1 | `vamos_dash` not HttpOnly | 20-01 | code |
| K7 | P1 | `X-Powered-By: Next.js` on 404 | 20-01 | code |
| K8 | P1 | workers.dev duplicate public site | 20-01 | code |
| K9 | P2 | no `security.txt` | 20-01 | code |
| K10 | P2 | MFA paused on APIs + dashboard host | 20-04 | owner |
| K11 | P2 | leaked-password protection off | 20-03 | owner dashboard |
| K12 | P2 | other anon RPCs (`quote_rate_book`, coupons, …) | 20-03 | owner SQL |
| K13 | info | CSP unsafe-eval (DC) | none | accepted |
| K14 | info | 0-policy tables (fail-closed) | none | accepted |
| K15 | info | unindexed FKs | later | perf |
