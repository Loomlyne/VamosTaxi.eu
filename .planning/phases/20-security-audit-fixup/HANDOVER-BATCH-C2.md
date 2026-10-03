# Phase 20 hand-over, batch C part 2 (F12, F16, /dev headers)

**Branch:** `fix/phase-20-batch-c2`, main merged at `95d86a32`, head `aa361b70`. Not deployed. No migration.
Needs the owner's Ship. F12 design and answers signed 2026-09-30.

## SHIP RULE — two Workers, gateway FIRST

Deploy `vamos-dashboard` (apps/web/wrangler.dashboard.jsonc) FIRST, then `vamos`.
New gateway + old vamos = dashboard works (files via the Dashboard entrypoint, headers missing until vamos deploys).
Old gateway + new vamos = dashboard login and console 404. Never deploy vamos alone.
Right after both: dashboard.vamostaxi.site/login loads; /app/ops/ops.dc.html on the dashboard 200 with CSP; on vamostaxi.site 404; /dev each header once.
Rollback: redeploy both previous versions (gateway and vamos) together.

## Commits

| Finding | Commits |
|---|---|
| F16 dashboard files off the public host | `00aa28fb`, `aa361b70` (gateway sends /app/ops/* to the Dashboard entrypoint, served from ASSETS with CSP, XFO, noindex; public 404) |
| /dev double headers | `1a073070` |
| F12 sign-in confirm screen | `1479a98c`, `57d790d6`, `58e61451` (screens), `e1e60ba3` (e2e), `d4a92cd0` (dashboard confirm refuses non-staff) |

## Checks

| Check | Result |
|---|---|
| All gates + build on `aa361b70` | exit 0 |
| Unit tests | 3278 pass, 0 fail |
| F12 e2e on a local Worker + isolated Supabase | confirm page, second-device sign-in, crafted token_hash link refused, account switch: pass. One unrelated older line (`a3` other-device, 503) failed; not re-run on a baseline |
| F16 two-Worker proof (gateway + vamos via wrangler dev) | dashboard /login 200, /app/ops files 200 with CSP/XFO/noindex, public 404; old gateway reproduces the 404 |
| Opus review | 1 blocker (dashboard break) fixed by `aa361b70`; notes in `20-C2-REVIEW.md` |

## To know

- Links already in inboxes on release day show "expired" + Request a new link (owner OK).
- Key for the sealed address is derived from SEND_EMAIL_HOOK_SECRET; rotating that secret expires links in inboxes.
- Pre-existing bug, not fixed: e-mail change cannot finish (hook mails only the old address; double confirm on). Owner question.

## NOT verified

Nothing live; real Cloudflare routing/TLS for the gateway; the dashboard magic link end to end with the passkey step; F12 non-staff refusal only with mocks.

## Owner UAT after the Ship

1. dashboard.vamostaxi.site → sign in as usual. Expected: login and console load.
2. vamostaxi.site/sign-in → request a sign-in link → open it on your phone. Expected: "You are signing in as <your e-mail>" → SIGN IN → signed in.
3. Open the same link again. Expected: "This link has expired or was already used."
4. vamostaxi.site/app/ops/ops.dc.html. Expected: not found.
