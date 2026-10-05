# Hand-over — security hardening (S4, S5, S7–S15)

- Branch: `fix/security-hardening`, cut from `origin/main` 328b133c, `origin/main` 9d0c8bf7 merged in (merge 0b9f3fb5, no conflict; main brought only migration 300000 + an integration spec, no file overlap).
- Source: `.planning/audits/2026-10-05-repo-investigation.md`, answers in `.planning/decisions/2026-10-05-repo-investigation-answers.md`.
- Written 2026-10-05 15:58 +04 by the work session in `.claude/worktrees/agent-ad13b0154c57285c8`.
- Touches sign-in and money paths: **a fresh reviewer must read it before it ships.**
- No migration, no SQL, no live write, no deploy, no Worker build, no test lab. Live was read with SELECT only (see S13, S14, S10).

## Per item

### S4 — `vt-auth` session cookie readable by page scripts — FIXED
- Root cause: `apps/web/lib/supabase/cookies.ts:70` `authCookieOptions()` set no `httpOnly`; `@supabase/ssr` 0.12.5 spreads `cookieOptions` over its default `httpOnly:false`.
- Proof no browser code reads it: there is no browser Supabase client; the only `document.cookie` writers set `NEXT_LOCALE` and the Meta cookies; the mocks and `AuthForm` go through `/api/auth`.
- Fix: `httpOnly: true` in `authCookieOptions` (012cfa66), `tests/unit/auth/secure-cookies.test.ts` updated (6a07749f).
- Test: `lib/supabase/cookies.test.ts` "S4" — options, `authSetCookieHeader`, and a real `createRequestSupabaseClient` + `signInWithOtp` whose `vt-auth-code-verifier` Set-Cookie must carry HttpOnly. Failed before, passes after.
- Note: cookies already in browsers stay non-HttpOnly until the next session refresh rewrites them.

### S5 — sign-up / forgot-password abuse — PARTLY FIXED (two owner questions)
- Root cause: `apps/web/app/api/auth/route.ts:208` `perAddressAllowed` had no `signup`/`forgot` kind; `:612` (forgot), `:673` (magic sign-up) and the password sign-up branch sent mail with only the per-IP limit. Turnstile runs only for checkout sign-in (`:643`).
- Fixed (49496d3c): per-address limit `auth-signup:<email>` / `auth-forgot:<email>` on `AUTH_RATE_LIMITER`, checked before the agreement record and before any mail (now `route.ts:623`, `:683`, `:739`). Answer is the existing `RATE_LIMITED` 429, no new wording.
- Test: `tests/unit/auth/mail-per-address.test.ts` — failed on the old route, passes now.
- Not fixed, needs the owner (questions 1 and 2 below):
  - Turnstile on sign-up and forgot-password needs a widget and token in `app/pages/AuthForm.dc.html` (content job's file, off limits), and the interaction-only widget can become visible to a visitor.
  - Typed name in the sign-up mail: `apps/web/app/api/auth/email-hook/route.ts:194-197` passes `user_metadata.full_name` before the address is confirmed. `packages/emails/src/messages.ts` has no generic greeting (only `email-hello: "Hello {name}."`), so the brief's "use an existing generic greeting" cannot be met.

### S7 — dashboard APIs reachable on the public host — FIXED
- Root cause: `apps/web/lib/dc-mock-urls.ts:189` `gatePublicRequest` let `/api/staff/*` and `/api/photos/upload` through on vamostaxi.site.
- Fix (f8f0749d): `isDashboardOnlyApi(path)` (`/api/staff`, `/api/staff/*`, `/api/photos`, `/api/photos/*`); off the dashboard host a document gets the 404 page, anything else an empty 404.
- Test: `lib/dc-mock-urls.test.ts` (S7 cases, failed before).

### S8 — lock-expire callable by anyone with a quote id — FIXED (deviation from the brief, see below)
- Root cause: `apps/web/app/api/checkout/lock-expire/route.ts:35-51` expired the open Stripe session for any `quote_id`, no ownership, no limit.
- Fix (901e6b38): logic moved to `apps/web/lib/checkout/lock-expire.ts` `runLockExpire`. Order: rate limit (429) → body check → open payment lookup → proof → Stripe ready → expire. Proof is **the matching `vt_manage` cookie OR the open Stripe session id** in the body (`session_id`, shape-checked with `payLinkSessionId`); otherwise 403 `not_owner`. Limit: `READ_RATE_LIMITER` key `read:lockexpire:<ip/64>`.
- Deviation: the brief says "vt_manage only". The one caller is the pay-link page (`PayClient.tsx`), whose visitor has no `vt_manage`, and its pay token has already expired when the timer fires (`checkout_pay_link_*` refuses expired tokens). vt_manage-only would silently break the pay-link timer. The session id is only known to whoever opened that checkout. `PayClient.tsx` now sends it; no visible change.
- Test: `lib/checkout/lock-expire.test.ts` (not owner → 403, session id or cookie → expires, over limit → 429); `lib/checkout/express-lock.test.ts` reads route + lib.

### S9 — a manage link overwrites a valid manage cookie for another booking — NOT FIXED (owner question 3)
- Root cause: `apps/web/app/api/manage/booking/route.ts:51` sets `vt_manage` from the link on every 200, replacing whatever was there.
- Why not fixed: every "keep the existing cookie" rule changes what a customer sees. V1 is one-way, so a return trip is a second booking; with the rule, opening the second booking's mail link would show the first booking. Writes are already pinned to the booking named on the page (409 `wrong-booking`, manage cookie note in memory), so an overwrite cannot act on the wrong booking.

### S10 — internal ids in public answers — FIXED
- Root causes:
  - `apps/web/lib/quote/respond.ts:48-49, 98-99`: `rate_version {id, slug}`, `settings_version_id`, plus each line's `source_row` and each leg's zone ids.
  - `apps/web/lib/pricing/public-board.ts:49`: class `photo_url` built from `photo_path` = the class UUID; `:192-201` route keys `<origin_zone_id>::<dest_zone_id>`.
  - `apps/web/lib/public/reviews.ts:25, 56, 75`: review row `id`.
- Fix (e6bd589d): `publicQuoteBody()` strips those fields; route keys are `<origin_slug>::<dest_slug>` (a pair with a missing zone is skipped); review `id` dropped from type, SELECT and map. Class photos are served as a sealed path `/photos/c/<base64url>.<ext>` (`apps/web/lib/photos/sealed-url.ts`: AES-GCM, IV from HMAC, keys from `QUOTE_LOCK_SECRET` via HKDF; the previous secret is still opened; only `classes/` keys can be sealed); `apps/web/app/photos/[key]/route.ts` opens it. Plain `/photos/<key>` URLs keep working. Sealed instead of a slug lookup because the RLS `active` filter would hide rows and file names repeat (`brand.jpg`).
- Tests: `lib/security/public-no-internal-ids.test.ts` new block "S10: no internal ids in public API answers" (7 tests); `lib/photos/sealed-url.test.ts`; `respond.test.ts`, `public-board.test.ts`, `public-reviews-route.test.ts` updated.
- Live read: `vehicle_classes.photo_path` holds class UUIDs, which confirms the leak.
- Left open: the signed quote lock in the answer is signed, not encrypted, so it still carries `rate_version_id` / `settings_version_id` when decoded. Encrypting it touches the money path; not done here.

### S11 — no length caps, no server e-mail check — FIXED
- Root cause: `apps/web/lib/checkout/intent-schema.ts:69` `email: z.string().min(1)`, `:80`/`:144` lock, `:43` coupon, `:89` idempotency key with no `.max()`; reviews submit took any length.
- Fix (85ad8d6e): `CHECKOUT_FIELD_MAX` (name 200, email 254, phone 40, coupon 64, idempotency key 200, lock 16384); e-mail `.max(254).refine(isCheckoutEmail)`. Reviews: `apps/web/lib/reviews/submit-caps.ts` `REVIEW_FIELD_MAX`, checked in `app/api/reviews/submit/route.ts` before Turnstile → existing 400 `invalid-input`.
- Test: `lib/security/input-caps.test.ts` (failed before).
- Visible effect: a malformed e-mail on the dashboard New trip now gets the existing "Save failed" instead of saving a bad address. No new wording.

### S12 — public database reads have no rate limit — FIXED
- Root cause: GET `app/api/checkout/status/[ref]/route.ts:21`, `app/api/checkout/resume/route.ts:14`, `app/api/manage/booking/route.ts:107`, `app/api/reviews/route.ts:25`, POST `app/api/checkout/pay-link/open/route.ts:84` read the database with no limit.
- Fix (901e6b38): `apps/web/lib/abuse/read-rate-limit.ts` — `READ_RATE_LIMITER`, key `read:<route>:<ip/64>`, 120 per 60 s; 429 `private, no-store`, `retry-after: 60`. Status answers `{visible:false}`, resume `{state:"none"}` (the shapes the pages already handle). Missing binding = allowed (warned once); limiter error = allowed (logged).
- Binding: `apps/web/wrangler.jsonc` env.staging + env.production, **namespace_id 1012** (1011 was already `TURNSTILE_ATTEMPT_LIMITER`). Next free id: **1013**. No Cloudflare step beyond the deploy.
- Test: `lib/abuse/read-rate-limit.test.ts`; `lib/cache/reviews-cache.test.ts` now passes a Request.

### S13 — staff writes as dispatcher; inactive staff row still let in — FIXED
- Root cause: `apps/web/lib/ops/staff-json.ts:103-104` `withStaff` used `requireStaffClaims` for writes; the claim is minted at sign-in, so a staff row set `active = false` kept working until the token expired. Same in `app/[locale]/(ops)/api/photos/upload/route.ts:39` and `app/[locale]/(ops)/api/staff/invite/route.ts`; `lib/ops/staff-origin.ts:27` `requestHasStaffSession` trusted the claim alone.
- Fix (14f08233): `withStaff` = staff claims for GET/HEAD, admin claims for other methods. New `apps/web/lib/ops/staff-active.ts` `staffRowActive()` runs `select app.is_staff()` under `asStaff` (role claim + active + accepted row + aal2 when enrolled); checked after CSRF in `staffResponse`, photo upload, invite, and in `requestHasStaffSession`. False → 403 `not-staff`; DB error → 503 `staff-check-failed` (new code, fail closed).
- Live read: one staff row, `role = admin`, active, accepted → the owner keeps every write. `vamos_staff` has USAGE on `app` and EXECUTE on `app.is_staff`.
- Tests: `lib/ops/staff-active.test.ts`, S13 blocks in `staff-json.test.ts` (4), `staff-origin.test.ts`; mocks added in `staff-origin-cookies.test.ts`, `fleet-http.test.ts`.
- Not covered (off-limits files): `lib/ops/asset-gate.ts` and the dashboard document gate in `lib/ops/session.ts` still trust the claim alone; the legacy server actions under `(ops)/ops/*` were not touched. Cost: one extra DB round trip per staff API request.

### S14 — draft prices to anyone on the dashboard host — FIXED
- Root cause: `apps/web/lib/quote/engine.ts:184` `preferDraft = dashboardHost && PRICING_PREVIEW === "true"` — no session check. Live: `PRICING_PREVIEW` is `"true"` on Worker `vamos` and price book row 19 is a draft, so this was reachable on live.
- Fix (04c5e423): `preferDraft` also needs `staffSession`; `lib/quote/deps.ts` `draftPreviewAllowed(env, host, isStaff)` (named dashboard host → preview on → verified staff session, errors = false). `app/api/quote/route.ts` and `app/api/quote/reprice/route.ts` memoise one staff check (also used for the dashboard Turnstile exemption) and copy refreshed auth cookies onto every answer.
- Tests: `lib/quote/engine.test.ts` (staffSession cases, `draftPreviewAllowed`), `lib/abuse/quote-turnstile-live.test.ts`.

### S15 — loser of a Pay race gets the winner's manage token — FIXED
- Proven: `apps/web/lib/checkout/intent.ts:578` — in the 23505/23001 race branch the loser loaded the winner's open payment and issued a manage token for `existingOpen.booking_id` with no ownership check, so a second browser paying the same quote got a `vt_manage` cookie for the first browser's booking.
- Fix (43b3d75b): before issuing, `deps.ownsBooking(winner.booking_id)`; not the owner → the answer carries the winner's payment but no token, no cookie, no detail write. The owner (same browser retrying) still gets its cookie.
- Test: `lib/checkout/intent.test.ts` "S15" (non-owner gets nothing; owner keeps cookie). Failed before.

## Owner questions (recommended answer first)

1. **S5 — Turnstile on sign-up and forgot-password.** It needs the check widget on the sign-in page, and the widget can show itself as a box to some visitors. Example: on vamostaxi.site/sign-in, "Create account" would sometimes show a "Verify you are human" box above the button.
   - Recommended: yes, add it (invisible for most; the per-address limit already landed covers floods to one address meanwhile). It is a content-job file, so it goes to that job.
   - Alternative: no widget; keep the per-IP + per-address limits only.
2. **S5 — name in the sign-up mail before the address is confirmed.** There is no greeting without a name in the mail copy. Example: someone types "Click here: evil.example" as their name and the confirmation mail to a stranger's address says "Hello Click here: evil.example."
   - Recommended: drop the greeting line until the address is confirmed — the same layout a sign-in mail without a name already uses, no new words.
   - Alternative: new greeting copy ("Hello."), which needs your wording in four languages.
3. **S9 — two bookings, two manage links.** Today the last link opened wins. Example: you book Zurich Airport → Basel and later Basel → Zurich Airport; opening the second mail's link shows the second booking.
   - Recommended: keep "last link wins" (writes are already locked to the booking on the page).
   - Alternative: keep the first booking and ask "Switch to this booking?" on the page — new design and four languages.

## Checks run (2026-10-05, from the worktree)

| Check | Result |
|---|---|
| `pnpm typecheck` | pass (db, emails, web, isolation-probe) |
| `pnpm lint` | 0 errors, 6 warnings, all in files this branch does not touch |
| `pnpm check:db-fences` | 8/8 pass |
| `pnpm check:numbers` | ok |
| `pnpm i18n:check` | pass (2709 keys) |
| Touched tests (22 files) after the merge | 272 pass, 2 skipped |
| Neighbouring tests of touched routes (45 files, incl. `tests/unit/auth`) | 520 pass |
| `reminder`, `paid-cancel`, `bookings-write` (timed out earlier under load ~50) | 44 pass |
| Fail-before proof | edited modules (S4, S5, S7, S10, S11, S14, S15): new tests run against the base file (`git show 328b133c:<path>`), seen failing, file restored. S8, S12, S13: tests drive new modules (`lock-expire.ts`, `read-rate-limit.ts`, `staff-active.ts`) that do not exist at base |

Known red elsewhere, not from this branch: tests that need `apps/web/public/app` synced (customers-board, ops-pricing-*, ops-chauffeur-desk, ops-live-data, phase-15-dc) fail in an unsynced worktree.

## Not verified

- No Worker build, no browser run, no test lab: the sealed class photo URL, the 429s, the HttpOnly cookie and the pay-link timer with `session_id` are proven by unit tests only. Before ship: one Worker build, home → quote shows class photos, /sign-in works, dashboard save works, pay-link page timer still expires its session.
- `READ_RATE_LIMITER` (1012) exists only after the controller's deploy.
- Full `test:unit` and the build were not run (brief).

## For the controller at ship

- Fresh reviewer read (sign-in + money).
- Deploy carries the new rate-limit binding; nothing to create by hand.
- After deploy: the checkout 4242 payment as usual (S15 and S11 touch the intent path).
