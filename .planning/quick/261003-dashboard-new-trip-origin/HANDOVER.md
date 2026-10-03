# Hand-over — quick 261003 dashboard New trip origin

Branch `fix/dashboard-new-trip-origin`, cut from origin/main `cd047a59`.

## Bug (live, confirmed read-only 2026-10-03 ~03:00)
dashboard.vamostaxi.site → New trip → Save: `/api/checkout/price` and `/api/checkout/intent`
answer 403 `csrf`. Both used `csrfForbidden(request)` (public Origins only).

## Fix (6b46ef90)
- `lib/security/origin.ts`: `csrfForbiddenPublicOrStaff(request, hasStaffSession)`.
  Public Origin → unchanged. Dashboard Origin → passes only when the request host is the
  dashboard host AND a gated staff session (`requireStaffClaims`) is on its cookies.
  Anything else → 403 `csrf`. `PUBLIC_CSRF_HOSTS` not widened.
- `lib/ops/staff-origin.ts`: `requestHasStaffSession` (errors → false).
- Only `/api/checkout/price` and `/api/checkout/intent` use it.

## Proof
- Unit: `lib/checkout/dashboard-new-trip-origin.test.ts`, `lib/ops/staff-origin.test.ts`.
- Chromium on the local dashboard Worker build (`evidence/nt-save.e2e.mjs`, `evidence/nt-after.json`):
  signed-out dashboard Origin → 403 csrf on both; signed-in admin → price 200, Save → intent 200,
  booking VT-26-0014 created locally, screen moves to it; staff cookie + empty body → 400 (passes CSRF).
- Live before-state is the 403 confirmed read-only (board `cd047a59`).

## Needs
Fresh security review (money + auth route) before ship. No migration.
