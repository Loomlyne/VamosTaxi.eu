# Vamos Taxi security audit (read-only), 2026-09-27

Repo: /home/user/VamosTaxi.eu @ f0238bd (unshallowed, 795 commits, all branches)
Nothing in the repo was changed; the pnpm-lock.yaml is byte-identical after `pnpm install --frozen-lockfile --ignore-scripts`.

## HIGH
H1. Staff MFA (aal2) is switched off in both the app and the DB.
  - apps/web/lib/ops/session.ts:~224 `requireStaffClaims`: "MFA paused" means role is checked, aal is not
  - apps/web/lib/ops/staff-json.ts:5 comment "MFA is paused (D-37)"
  - packages/db/supabase/migrations/20260901000001_staff_invitation_acceptance_gate.sql:9-30 redefines app.is_staff()/is_admin() WITHOUT the `aal = 'aal2'` clause that 20260823000006:64-76 had
  - apps/web/middleware.ts:299-328 dashboard host gate checks role only (no aal); opsStaffGate (443-480) checks aal2, but that gate is only for localhost /ops/*
  - Result: a single phished or reused password for an admin gives full PII access (customers, bookings, contact info), refunds, pricing, and the ability to invite staff. This goes against the project's "TOTP MFA for staff" constraint.
H2. Staff can change their own password or email without re-authentication (ops/profile/actions.ts:73-100). With H1, a hijacked session can lock out the owner permanently. [Unverified: whether Supabase "Secure password change" is on]

## MEDIUM
M1. CSP is weak: script-src 'unsafe-inline' 'unsafe-eval' unpkg.com (lib/security/headers.ts:17). Any npm package on unpkg can be loaded, so the CSP gives almost no XSS protection. Needed by the .dc.html runtime (Babel in the browser, React from unpkg).
M2. Supabase auth cookies use the @supabase/ssr defaults: httpOnly:false, no Secure flag, SameSite=Lax, maxAge 400 days (node_modules/@supabase/ssr/dist/main/utils/constants.js:4-11; there is no cookieOptions override in lib/supabase/server.ts or middleware.ts). Combined with M1, any XSS can steal the staff session token.
M3. staff_daily_digests has no ENABLE ROW LEVEL SECURITY in the migrations (20260901000002_staff_daily_digest.sql:3). Grants are revoked (line 102), and the live DB may have an rls_auto_enable event trigger (function referenced in 20260919000001:5 but not defined in the migrations). [Unverified live]
M4. public.evaluate_coupon (SECURITY DEFINER) can be executed by anon (20260919000002_restore_anon_quote_rpcs.sql:10). Over PostgREST it allows coupon-code enumeration and an oracle for "has email X redeemed coupon Y" (p_contact_email). The anon key does not appear to ship to the browser, which lowers the exposure. [Unverified: whether the Data API is exposed]
M5. The `vamos_edge` login can SET ROLE vamos_staff/vamos_system and set request.jwt.claims itself (roles_and_helpers.sql:118-135). The migration documents this (F-21), so the Hyperdrive password is equivalent to service_role. Keep in mind for rotation.
M6. No automated PII retention or purge. Cron (worker.ts:66-133) only expires unpaid bookings, sends reminders, runs a health probe and a digest. stripe_events.payload holds the raw Stripe object with billing name, address and last4 indefinitely. contact_submissions, support_messages, support_inbound_events, consent_log(user_agent, ip_truncated) and bookings.contact_* are also kept indefinitely. The only erasure mechanism is the customers.erased_at column; there is no job that fills it.

## LOW
L1. The DEPLOY_ENV=ops-changes worker serves ops.dc.html with the injected `vamosOpsAuth=1` and NO auth check (middleware.ts:286-297). The worker has no routes, workers_dev:false and no DB bindings, so it is not reachable. [Unverified]
L2. Raw /app/ops/*.dc.html and other static mocks are served by the ASSETS binding without CSP or XFO (public/_headers sets only content-type; run_worker_first covers only /app/pages and /app/home). The client-settable header x-vamos-dc-asset:1 bypasses gatePublicRequest (lib/dc-mock-urls.ts:100,176). Only static mock code is exposed.
L3. Manage-token fixation: middleware.ts:519-538 sets vt_manage from any ?token= without validating it. The first request URL, with the token in it, also lands in Cloudflare invocation logs (observability enabled).
L4. Stripe settlement does not assert amount_total or currency against the booking total. Amounts are set server-side at session creation, so this is defence in depth only. [Unverified in SQL]
L5. /api/reviews/photo has no rate limit (only CSRF plus an ownership check). Storage abuse is capped at 5 MB per call.
L6. Published reviews expose booking_id (uuid) to anon (20260912000719 plus the table-wide select grant in 20260823000024:14).
L7. checkout intent contact.email is only z.string().min(1) with no email format or max length (lib/checkout/intent-schema.ts:69-73).
L8. console.error logs raw Postgres err.message (lib/checkout/intent.ts:424, app/api/checkout/intent/route.ts:38). This can carry values.
L9. Rate-limit bindings exist only in env.staging/production. Other envs fail open (lib/abuse/account-write.ts).
L10. pnpm audit --prod: 0 findings. Full audit: 5 high and 2 moderate, all dev or build tooling: fast-uri <3.1.6 (stylelint>ajv), js-yaml <4.3.2 (stylelint>cosmiconfig), qs <6.16.0 (@opennextjs/cloudflare>@opennextjs/aws>express, build-time).

## GOOD / verified
- RLS: all 29 base tables are enabled by 20260823000020, with a coverage assertion. The nine ledger tables are FORCE RLS (…19). Later tables enable RLS themselves except staff_daily_digests. Default privileges are revoked from anon, authenticated and PUBLIC, including function EXECUTE. Staff policies are RESTRICTIVE gates plus permissive ones. All 86 SECURITY DEFINER functions set search_path. The settings_public view is a curated projection.
- Service role: used only in worker.ts scheduled (lib/supabase/service.ts) and the admin-gated /api/staff/invite route (line 101). There is no NEXT_PUBLIC exposure, and the allowlist (scripts/public-env-allowlist.json) forbids SUPABASE_SERVICE_ROLE in the bundle.
- Every /api/staff/* route and every (ops) server action calls requireStaffClaims/requireAdminClaims (withStaff/withAdmin), plus an Origin check on mutations. The DB re-checks the staff row with app.is_staff().
- Account routes check CSRF Origin, apply a rate limit, run customerClaims via getUser(), and use asCustomer (RLS ownership). Manage routes use a sha256-hashed 32-byte token and asGuest.
- The auth callback's next target is allowlisted to PUBLIC_ROUTES. Origins come from trustedSiteOrigin.
- Stripe webhook: constructEventAsync on the raw body, secret required, dedupe through stripe_event_record, handled via a queue.
- Resend and Supabase email hooks are verified with standardwebhooks.
- SQL: postgres.js tagged templates only. unsafe() is used only for constants (packages/db/src/identity.ts:151,193).
- No dangerouslySetInnerHTML. No DB content reaches innerHTML in the mocks. review source_url is validated.
- Photos: MIME allowlist, magic-byte sniff, 5 MB cap, key prefix allowlist, traversal rejected.
- Turnstile is on quote, contact, reviews/submit and consent. Rate limiter bindings (8/min and 4/min) cover quote, auth, contact and account writes.
- Secrets in git history: no live secrets. The matches are sk_test_placeholder, a whsec_ test fixture (apps/web/tests/integration/email-hook.spec.ts, commit 113c345), local-dev postgres URLs with the local password, placeholder `<pw>`/`${VAR}` URLs, Stripe publishable test keys (public), and MAPBOX_TOKEN "test…" fixtures. No .env or .dev.vars files were ever committed. gitleaks is not installed locally; CI runs gitleaks.

## Price tampering test plan (not executed)
1. Get a quote and capture the lock (HMAC). Change total_rappen or lines in the intent body. Expected: 400, because the strict schema forbids those fields (intent-schema.ts FORBIDDEN_SERVER_FIELDS).
2. Change vehicle_class to a cheaper or more expensive class without re-quoting. Expected: the price is recomputed from the lock payload plus the server-side reprice.
3. Tamper with the lock payload bytes or signature. Expected: lock_invalid.
4. Replay an expired lock. Expected: payment_window_closed.
5. Remove body.extras that are in the lock. Expected: the lock extras still apply (lockHasExtra checks both).
6. Coupon: apply one past max redemptions, or race two checkouts. Expected: P0002/23514 returns coupon_no_longer_valid.
7. Reuse the same idempotency_key with a different body. Expected: the same session or a refusal.
8. Send a Stripe webhook without a valid signature, or replay an old event. Expected: 400, and dedupe.
9. Pay a Checkout Session, then call /api/checkout/return with another booking's ref. Expected: no cross-booking settlement.
10. On is_test bookings: expect capture to be refused.
