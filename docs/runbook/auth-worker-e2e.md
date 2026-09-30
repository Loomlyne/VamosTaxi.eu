# Auth end-to-end on a local Worker

Proves sign-up, e-mail link, e-mail code, reset, unconfirmed sign-in, the
dashboard host rules, the sign-in rate limit and cookie attributes on the real
OpenNext Worker build (`wrangler dev --local`) against a real local Supabase
with the Send Email Hook switched on. `next dev` cannot prove these: cookies
set through `next/headers` attach there but not on the Worker.

Nothing here touches the live project.

1. Build a port-shifted Supabase workdir (see the `isolated-local-supabase`
   note): copy `packages/db/supabase/config.toml` with `project_id =
   "vamos-taxi-auth"` and every `543xx` port as `573xx`; symlink
   `migrations`, `tests`, `seed.sql`. Add `"http://localhost:4290/**"` to
   `additional_redirect_urls`, and append:

   ```toml
   [auth.hook.send_email]
   enabled = true
   uri = "http://host.docker.internal:4290/api/auth/email-hook"
   secrets = "<v1,whsec_ + 32 random bytes base64, kept in a local file>"
   ```

2. `supabase start --workdir <dir>`.
3. Build the tree: `pnpm --filter web exec opennextjs-cloudflare build`.
4. `apps/web/tests/e2e-worker/run.sh <tree> <supabase-workdir> <hook-secret-file> <label>`

Each line of output is `PASS | FAIL | N/A`, scenario, evidence. Mail links and
codes are parsed in-process and never printed. The script writes a JSON copy to
`apps/web/.wrangler/e2e-<label>.json`.

Result on 2026-09-29: `af93fc8e` fails 8 of 10 lines (the sign-up is rolled
back, `hook_payload_invalid_content_type`); `fix/auth-sign-in-sign-up` passes
all 9 scenarios.

### Line 3b (27 D-36)

| Line | Proves |
|---|---|
| 3b | the public-host sign-in link for an unknown address answers with the same status and body as check 3's known address, sends no mail and leaves no `auth.users` row. Checks 3 and 4 (known address A, created by check 1) still sign in |

## 26.5 other-device scenarios (D-16)

`other-device.e2e.mjs` runs right after the auth scenarios in `run.sh` (same Worker on 4290, same env).
Owner rule: a paid trip opens anywhere; an unpaid trip is never continued on another device, by pasted
link or by signing in. Each cookie jar stands for one browser. Seeding is done as `postgres` through
`docker exec psql`, local only; the raw manage and pay tokens live in the script's memory and are never
printed.

To run against a second, port-shifted stack (for example `vamos-taxi-265`, API 61321, db 61322) set
`SB_API_PORT`, `SB_DB_PORT` and `SB_DB_CONTAINER` (`supabase_db_<project_id>`) before `run.sh`; `mkcfg.mjs`
and the script read them. Set the two identity-role passwords on that container yourself (the
`local-role-passwords.mjs` script is hard-wired to 54322 and must not be used). Put a `supabase` on PATH
that runs the CLI for that workdir, because `run.sh` calls `supabase status`.

| Line | Proves |
|---|---|
| A0 | control: the browser with the `vt_manage` cookie still gets the unpaid booking back (same device) |
| a1-a3 | second browser: resume answers exactly `{"state":"none"}`; a pasted `resume=<quote>&pay=1` checkout page carries none of the first browser's contact data; an intent with a forged lock and a `supersedes` is refused and the booking stays pending |
| b1-b5 | second browser signed in as the same customer: `/api/checkout/me` is profile only, resume is still `none`, the account list and details hide the pending row (also after the claim linked it), the Data API with the customer's own token does not return it (G1) |
| c1-c3 | paid booking opens from its manage link in a fresh browser and resumes as `paid`; an unpaid booking's manage token answers 404 and sets no cookie |
| d1-d2 | a staff pay link opens with no cookie; without a Stripe test key d2 is N/A at the Stripe step only |

Known: a3 is refused with `payment_window_closed` on a stack with no settings version, which is checked before
the lock; the lock-versus-quote rule itself is pinned by `apps/web/lib/checkout/other-device.test.ts`.
Scenario 7 (rate limit) used to pass on one run and fail on the next. Cause: the local limiter (miniflare) counts in fixed
windows aligned to the wall-clock minute (`epoch = floor(now / period)`), and its counters are kept in `.wrangler/e2e`. A burst of
11 tries that crosses a minute boundary starts a new count, so the 11th answer is not 429. The scenario (and the 26.5 burst tests)
now wait for a window with at least 15 to 20 seconds left, and every run draws its own block of IP addresses.

## Ports

Another session may hold 4290/4291. `run.sh` reads `E2E_PORT`, `E2E_DASH_PORT`, `E2E_INSPECT`, `E2E_DASH_INSPECT`; the Supabase
workdir's hook uri (`host.docker.internal:<E2E_PORT>`) and its redirect list (`http://localhost:<E2E_PORT>/**`) must name the same
port. The 26.5 run used 4295/4296 and a workdir for `vamos-taxi-265` (API 61321, db 61322).

## 26.5 scenarios (plan 07)

Run by `run.sh` after the auth and other-device scenarios, on a second start of the Worker that also holds local stand-in secrets
(`mkcfg.mjs ... phase2`: a fake Stripe key, the lock secret, a fake Turnstile secret, Cloudflare's always-pass test site key).
Two outside services are replaced by `fakes.mjs` on `E2E_FAKE_PORT` (4297): `run.sh` prepends a fetch rewrite to the built
`.open-next/worker.js` (build output only, never source) so `api.stripe.com` and `challenges.cloudflare.com` reach it. The fake
Stripe stores Checkout Sessions in memory; the fake Turnstile accepts any token except `fail` and echoes action and hostname.
The e2e mints locks with the same HMAC as the quote route (`lib/crypto/hmac.ts`) and creates its own live rate version, settings
version and vehicle class `e2e265` on the local stack.

`checkout-account.e2e.mjs` (HTTP, cookie jars):

| Line | Proves |
|---|---|
| 1-3 | checkout sign-in: known and unknown e-mail give the same status and body; the unknown one creates no user and sends no mail; both wait at least 1200 ms |
| 4, 4a, 4b | an unconfirmed checkout-made user gets the `account_signin` template; the link lands on the exact checkout path and query with a session and a confirmed e-mail; the 6-digit code signs in (`type: email`) |
| 5, 6 | a provisioned account (created unconfirmed, no password) has no session and nothing linked until the link is followed; after the link the paid booking is listed; no consent_log row, no signup_consent |
| 7a-7d | PAY through the real route (fake Stripe): guest writes one `informed` record, create with the tick writes one `consent` record, create without the tick is refused, a known e-mail gets `sign_in_first`; none sets a session cookie |
| 8 | neither PAY writes a consent_log row |
| 9, 10 | switch off: guest PAY goes to Stripe with no record and no notice; switch on: Text 2 is rendered on /checkout, verbatim |
| 11a, 11b | the 6th press on one price and the 9th press from one address in a minute are refused |

`checkout-german.e2e.mjs` (Chromium via `@playwright/test`, real page, real Worker): /de sets the language, the panel and both
notices are the approved German texts, a guest PAY with the page's own button writes a record with locale `de`, sign-in by e-mail
link from the German checkout returns to the same checkout (every trip parameter) in German and signed in, /de/privacy shows
"Ihr Konto". Stubbed in the browser: the challenge script, `/api/quote` (needs Mapbox; answers with a signed lock), place lookups,
and the navigation to checkout.stripe.com.

Found by this run: on the Worker a route handler sees the request query already decoded once. A sign-in link target such as
`/checkout?from=Zurich%20Airport` reached the callback with a space, failed the return-path check and landed on /checkout with no
trip. `callbackUrl` now sends a target with a query as base64url (`nextb`).
