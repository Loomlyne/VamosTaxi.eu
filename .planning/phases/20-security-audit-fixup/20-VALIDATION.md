# Phase 20 validation

## Test infrastructure

Framework: vitest (existing apps/web tests) + live curl after deploy.
No new packages. No `sk_live_`. No booking POST.

## Automated

| ID | Check |
|----|--------|
| V-01 | `serveOpsDc` / security helper source contains HSTS, CSP, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy |
| V-02 | `vamos_dash` Set-Cookie includes HttpOnly |
| V-03 | `next.config.ts` has `poweredByHeader: false` |
| V-04 | `staffOriginAllowed` returns false for empty Origin; workers.dev allowlist requires `koussayzayeni.workers.dev` |
| V-05 | photos upload rejects `recordId` containing `..` or non `[a-zA-Z0-9_-]` |
| V-06 | migration file revokes EXECUTE on `create_quote_snapshot` and `rls_auto_enable` from anon, authenticated, PUBLIC |
| V-07 | `/.well-known/security.txt` route exists |
| V-08 | workers.dev host sets X-Robots-Tag noindex in middleware |

## Live (after Worker deploy — SEC-12)

| ID | Command-level |
|----|----------------|
| L-01 | `curl -sI https://dashboard.vamostaxi.site/login` shows HSTS, CSP, X-Frame-Options, HttpOnly vamos_dash |
| L-02 | `curl -sI https://vamostaxi.site/dev` has no `x-powered-by` |
| L-03 | `curl -sI https://vamos.koussayzayeni.workers.dev/` has `x-robots-tag: noindex` |
| L-04 | `curl -s https://vamostaxi.site/.well-known/security.txt` is 200 text |
| L-05 | `curl -sI https://vamostaxi.site/api/dev/db-smoke` still 404 |

## Owner-only (not agent)

| ID | Action |
|----|--------|
| O-01 | Apply 20-03 SQL on Supabase (SQL editor). Agent does not push. |
| O-02 | Auth → leaked password protection ON |
| O-03 | Confirm AAL2 enrolled before 20-04 MFA unpause |

## Manual-only

| Check | Why not automated |
|-------|-------------------|
| Dashboard still loads after header change | CSP must not break ops.dc.html |
| Owner can still sign in | Cookie HttpOnly must not break staff session (session cookies are already HttpOnly via Supabase) |

## Dimension 8

Nyquist: each SEC-* is claimed by a plan frontmatter `requirements` list.

---

## 2026-10 check (plans 20-06 … 20-09)

| Plan | Req | Automated | Manual / owner |
|---|---|---|---|
| 20-06 | SEC-13 | advisors + grant readback (read-only SQL); passive scan output saved | ≤ 10 live test bookings, listed by reference |
| 20-07 | SEC-14 | one failing-then-passing test per serious finding; `pnpm test:unit`, `typecheck`, `lint`, `check:db-fences`, pgTAP for SQL fixes | — |
| 20-08 | SEC-15 | same gates per fix | Owner decides each non-serious finding through the question form |
| 20-09 | SEC-16 | curl/readback script against both hosts | After the owner's Ship; one 4242 payment first (CLAUDE.local.md rule 8) |
