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

---

# 2026-10 check — the new security check of the changed app

**Written:** 2026-09-29. **Discuss:** owner answers through the question form, 2026-09-29.
**Plan signature:** see `## Signatures` below. **Order:** after 26.0 → 26.2; before 19.

## Where the old list stands

Nothing is left to build from the 2026-09-19 list (`.planning/PHASE-CLOSURE-2026-09-29.md`):
52 items fixed and live, 7 accepted with a written reason, K10 solved by 26.1 (code asked once an
authenticator app is enrolled), K11 on since Supabase Pro (2026-09-28). Plans 20-01…20-03 are
done; **20-04 and 20-05 are superseded** (banner at the top of each). SEC-01…SEC-12 stay as done
history.

## Why a new check

26.1 and 26.3 changed the money path: one `/checkout` page, Stripe's hosted page instead of our
card form, pay links, dashboard "Take card" and extra-fare payment on Stripe's page, generic
extras from the dashboard with Workers AI translation, the hourly delete of unpaid bookings, the
hourly resend of confirmation e-mails, guest bookings linked to accounts, and eight new
migrations (definer functions, a carve-out in the append-only trigger).

## Decisions (2026-10 check)

- **D-15 (owner):** Scope is the whole app — vamostaxi.site and dashboard.vamostaxi.site —
  **changes first**: everything 26.1 and 26.3 added or changed, then the rest, then the
  2026-09-19 regression list (the fixed K-rows of 20-05 still hold).
- **D-16 (owner):** Live probes may create **up to 10 test bookings** on vamostaxi.site. Each
  uses the name "TEST SECURITY" and an e-mail the owner owns, is listed by reference in the
  findings, and is either paid with the Stripe sandbox card 4242 (the live Worker uses sandbox
  keys) or left unpaid for the hourly delete. The owner removes paid ones with the D-37 script.
  No other writes on live; no load; nothing that e-mails a real customer.
- **D-17 (owner):** **Serious findings are fixed in this phase without asking again.**
  Serious means one of: someone can pay less than the saved price or get "Booked" without
  paying; read or change another person's booking or personal data; act as staff without staff
  rights; run up our costs (Stripe sessions, Mapbox, Workers AI, e-mail) without limit; a secret
  or key is readable. Each fix has a test that fails before and passes after. Every other
  finding waits for the owner, one question each.
- **D-18:** Method: code review of the changed files (gstack `cso` skill + a second reviewer),
  Supabase security advisors and grant readback on `yaumjzvylngfjhtuffqs` (read-only), passive
  scan of both hosts, the up-to-10 live probes, and the same probes with more force on the local
  stack. No DoS, no brute force on live.
- **D-19:** Unchanged: no `vamostaxi.eu`, no `sk_live_`, no Publish click, no `db push`, no
  restore onto live, no invented CHF or legal copy. Hosted SQL follows `CLAUDE.local.md`: each
  migration file applied verbatim with the Ship, then read back and compared.
- **D-20:** CSP `'unsafe-inline'`/`'unsafe-eval'` for the DC pages stays an accepted risk unless
  the check finds that the DC runtime no longer needs it.

## Requirements (2026-10 check)

- SEC-13 Findings file with proof for every changed surface (20-06)
- SEC-14 Serious findings fixed with regression tests (20-07)
- SEC-15 Other findings decided by the owner one by one (20-08)
- SEC-16 Live readback after the Ship that carries the fixes (20-09)

## Signatures

| Gate | State |
|---|---|
| Discuss (D-15…D-20) | Owner answers, question form, 2026-09-29 |
| Plan (20-06…20-09) | **Signed by the owner, question form, 2026-09-29** |
| UAT / Ship | Not started |
