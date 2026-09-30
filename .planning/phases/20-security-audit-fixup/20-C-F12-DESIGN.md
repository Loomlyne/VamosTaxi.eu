# F12 — login CSRF with the e-mail sign-in link: design

Read-only research, 2026-09-30. Tree: `/Users/koss/Developer/vamos-wt/phase-20` at 748c5a61 (= origin/main).
Paths below are relative to that tree. No code was run; "likely" marks the one point that needs a local proof.

## 0. The short version

- Every Supabase client the site uses is PKCE: `@supabase/ssr` forces `flowType: "pkce"` after the caller's options
  (`node_modules/.pnpm/@supabase+ssr@0.12.5…/dist/main/createServerClient.js:37`; `lib/supabase/server.ts:85,123`
  and `lib/supabase/middleware.ts:33,66` pass no flowType).
- So the links as they are mailed today (GoTrue `/auth/v1/verify` → `?code=` → `exchangeCodeForSession`) are
  **browser-bound**: an attacker's link opened by a victim fails (no verifier), and the customer's own link opened on
  another device also fails.
- The hole is the **other branch of the callback**: `GET /api/auth/callback?token_hash=…&type=…` calls `verifyOtp`
  with no binding (`app/api/auth/callback/route.ts:73-77`). An attacker takes the token from their own mail, puts it in
  that URL, and sends it. Plus one link type is mailed in exactly that form today: the 26.5 "account ready" link
  (`lib/checkout/provision-account.ts:89-97`).
- Fix: every mailed link goes to a new confirm screen that shows the address and does nothing on GET; the button POSTs
  (same-origin only) to the callback, which runs `verifyOtp(token_hash)`. The GET `token_hash` branch goes away.
  `verifyOtp(token_hash)` is not browser-bound, so the laptop→phone case starts working.

## 1. Facts per link type

"Builder" = who builds the URL in the e-mail. "Received as" = what reaches `app/api/auth/callback/route.ts`.
"CSRF today" has two columns: the link as mailed, and a hand-built `…/api/auth/callback?token_hash=<token from the
mail>&type=…` (the token is in the mailed link as `token=` — `email-hook/route.ts:59`).

| # | Link | Requested at | Builder | Received as | CSRF (link as mailed) | CSRF (crafted callback URL) | Other device today |
|---|---|---|---|---|---|---|---|
| 1 | Sign-up confirmation (+ resend) | `lib/auth/run.ts:110` signUp, `run.ts:163` resend; `emailRedirectTo` = `callbackUrl()` `run.ts:70-78` | e-mail hook `app/api/auth/email-hook/route.ts:50-60` → `${supabase}/auth/v1/verify?token=…&type=signup&redirect_to=<callback>` | `?code=` (PKCE: auth-js `GoTrueClient.js:746` signUp, `:2288` resend send `code_challenge`) → `exchangeCodeForSession` `callback:72` | **No** — verifier missing → `AuthPKCECodeVerifierMissingError` (`GoTrueClient.js:1622`) → `/sign-in?error=1` (`callback:66,83-85`), AuthForm shows the "expired" banner (`app/pages/AuthForm.dc.html:361-364`) | **Yes (likely)** — `callback:73-77`; Supabase docs say token_hash + `verifyOtp` is the PKCE-compatible path | **No** — same verifier failure, customer sees "link expired" |
| 2 | Magic link / e-mail code link (public sign-in, sign-up by link) | `run.ts:145` signInWithOtp via `app/api/auth/route.ts:626-653` | e-mail hook, type `magiclink` (or `signup` for a new user) | `?code=` (`GoTrueClient.js:1866`) | No | **Yes** | No |
| 3 | "Sign in first" link at checkout (26.5-03) | `app/api/auth/route.ts:586-624` → `lib/auth/checkout-sign-in.ts` → `runOtp` (never creates users) | e-mail hook, `redirect_to` carries `nextb` (checkout return) | `?code=` | No | **Yes** — and this is the finding's exact story: victim is then signed in to the attacker and books | No (the file even notes the verifier cookie must ride on the send response, `checkout-sign-in.ts:11-13`) |
| 4 | Password reset (recovery) | `run.ts:177` resetPasswordForEmail → next `/reset-password` (`route.ts:572-584`) | e-mail hook, type `recovery` | `?code=` (`GoTrueClient.js:3761`) | No | **Yes** — victim lands on reset page signed in to the attacker | No |
| 5 | E-mail change | customer `run.ts:241`, staff `app/[locale]/(ops)/ops/profile/actions.ts:124` updateUser({email}) | e-mail hook, type `email_change` | `?code=` (`GoTrueClient.js:2869`) | No | **Yes** (completes the attacker's own change and signs the victim in) | No |
| 6 | Guest-account "account ready" (26.5) | `lib/checkout/provision-account.ts:69-97` after a paid guest booking | **the site itself**: `admin.generateLink({type:"magiclink"})` → `${origin}/api/auth/callback?token_hash=<hashed>&type=<verificationType>&next=/<loc>/account` (`:89-97`), mailed by `sendMail` (not the hook) | `token_hash` → `verifyOtp` `callback:73-77` | **Yes, as mailed** — attacker books as a guest with a fresh address and forwards the mail | Yes | **Yes** (no binding) — `tests/e2e-worker/checkout-account.e2e.mjs:120` builds it the same way |
| 7 | Staff dashboard magic link | same `runOtp` with `createUser:false` on the dashboard host (`route.ts:638,645-647`); origin = dashboard host | e-mail hook | `?code=` on `dashboard.vamostaxi.site/api/auth/callback` | No | Yes, but only with a **staff** attacker's token (insider); the console still needs role admin + aal2 (`middleware.ts:329-349`) | No |
| 8 | Staff invite | `app/[locale]/(ops)/api/staff/invite/route.ts:108` `admin.inviteUserByEmail`, `redirectTo` = `https://dashboard.vamostaxi.site/login` (`lib/ops/invite.ts:28-37`) | e-mail hook, type `invite` | admin API = implicit flow → GoTrue redirects to `/login#access_token=…`; **nothing reads the fragment** (no `location.hash`/`setSession` in `app/ops/ops-login.dc.html` or `apps/web`) → no session; the link only confirms the address | No | Yes via `type=invite` (`callback:23`), insider only | Link confirms on any device; never signs in |
| 9 | Reauthentication | `lib/auth/reauth.ts:215` | hook, code only | `verifyOtp(email, token)` `reauth.ts:230` | n/a (code the user types for their own session) | n/a | n/a |
| – | 6-digit code on the sign-in form | `app/api/auth/route.ts:538-556` `verifyOtp({email, token, type:"email"})` | user types address + code | — | Not CSRF (victim types the address themselves); social engineering only — out of scope | — | Yes |

Also true today: an attacker does not even need the site to send them a link. The anon key is public, so they can
call GoTrue `/auth/v1/otp` directly without a code challenge; the hook still mails them a `token_hash` they can drop into
the crafted callback URL. The defence must therefore sit in our callback, not in how links are requested.

Conclusion: the review's story is right in effect, but the path is the callback's GET `token_hash` branch (all types)
and the 26.5 account-ready link (as mailed), not the PKCE links as mailed. And cross-device fails today for every link
except #6.

## 2. Options: how the site knows the address before it signs anyone in

Constraints checked: mail scanners (Outlook Safe Links, Gmail) GET links before the person does (Supabase docs,
"Email prefetching" in auth-email-templates, recommend a page with a button); K100 moved secrets out of URLs; OpenNext:
`cookies().set` does not attach to a hand-built response — the callback already copies each `Set-Cookie` by hand
(`callback:58-65`, `authSetCookieHeader`); the hook must keep answering JSON with `content-type: application/json`
(`email-hook/route.ts:93-106`).

| Option | How | Scanner prefetch | Address in URL | Cookies / hooks | Size |
|---|---|---|---|---|---|
| **(a) Sealed address in the link** | Hook (has `user.email`) and provision-account (has `email`) build `https://<host>/sign-in/confirm?token_hash=…&type=…&next[b]=…&e=<sealed>`; `e` = AES-GCM(address), key from a Worker secret, `token_hash` as associated data so an address cannot be swapped onto another token. GET does nothing; the page asks the server to open `e`; the button POSTs. | Safe: GET consumes nothing | Encrypted, never plain. token_hash is already in today's URL. Page sets `Referrer-Policy: no-referrer` and wipes the query with `history.replaceState` after reading it | Cookies set only on the POST, copied by hand like today. Hook answer unchanged | Smallest; no DB |
| (b) Verify on GET, park the session in KV until the POST | Callback verifies, stores tokens in KV under a random id, shows the screen | **Broken**: scanner GET burns the one-time token; the person gets "expired" | Address not needed in URL | KV write + a second cookie-less step | Medium, and it keeps the scanner bug |
| (c) Verify without cookies, show the address, then set cookies | Same as (b) without KV — the tokens would have to travel back through the browser | Broken (same) | Tokens in the page = worse than K100 | — | Rejected |
| (d) Look the address up by token_hash | Definer function reads `auth.one_time_tokens.relates_to` for the hash, no consume | Safe | Nothing extra in URL | Reads a Supabase-managed auth table; new grant, new migration, fenced by asSystem rules | Larger; depends on an internal Supabase table |

**Recommendation: (a).**
1. Hook `verifyLink` (`email-hook/route.ts:50-60`) and `provision-account.ts:94-97` build the confirm URL on the host
   and with the `next`/`nextb` taken from the allow-listed `redirect_to` (for the hook) or known values (provision).
2. `GET /sign-in/confirm` serves a DC page; nothing is verified on GET.
3. The page POSTs `{token_hash, e}` to `/api/auth/callback` (`action: "preview"`) → server opens `e` → returns the
   address (or `expired` if `e` does not open). No token is used.
4. The button POSTs `{token_hash, type, e, next}` (`action: "confirm"`), guarded by the existing
   `csrfForbidden(request, "auth")` (`lib/security/origin.ts:41`) so a hostile page cannot auto-submit it → `verifyOtp`
   → the returned user's address must equal the opened `e` (else sign out, fail) → hand-copied `Set-Cookie` → JSON
   `{ok, target}` from `validateAuthRedirectTarget`.
5. `GET /api/auth/callback?token_hash=…` no longer verifies: it redirects to `/sign-in/confirm` with the same query
   (without `e` the screen shows "link out of date"). The `?code=` branch stays for PKCE mails already in inboxes on deploy
   day — it cannot be abused (browser-bound).
6. Works on any device: `verifyOtp(token_hash)` needs nothing from the requesting browser. Key: new Worker secret, or
   derive it with HKDF from `SEND_EMAIL_HOOK_SECRET` to avoid a new human step (question 3).

Staff dashboard: **same screen on the dashboard host** is safer. It lets us delete the GET `token_hash` branch
for both hosts (one code path, no leftover door), and the dashboard's own gates (admin role, aal2,
`refuseNonStaff`) still run after the POST. Excluding the dashboard would mean keeping a second link path alive just for
staff.

Email change (#5): `user.email` in the hook is the current address; the screen line changes to "Confirm the new
address" with the new address (the hook gets it as `user.new_email` for the new-address mail). After `verifyOtp` the
check compares with the new address.

## 3. The screen

```
Sign in to Vamos Taxi
You are signing in as
mia@example.com
Only continue if this is your e-mail address.
[ SIGN IN ]
Not you? Request a new link
```

- Where: a DC mock like the other auth pages — new `app/pages/sign-in-confirm.dc.html`, `SiteHeader variant="inverse"`
  + `SiteFooter`, served through `DC_PAGES["/sign-in/confirm"]` in `apps/web/middleware.ts:33-52`, added to
  `PRIVATE_NOINDEX_PREFIXES` (already covers `/sign-in`, `middleware.ts:397-398`) and `no-store`. A new page, not a new
  state inside `AuthForm.dc.html`, because Phase 27 rewrites AuthForm (92 lines).
- Address in Poppins, `.vt-dir-keep` so it stays LTR in Arabic; one primary Button (54px); "Request a new link" goes to
  `/sign-in` (prefilled `?email=` is NOT added — no address in URLs).
- Loading: skeleton for the address line while `preview` answers. Button shows loading after the tap.
- Expired / already used / `e` does not open / no `e`: the same card with the expired text and one button
  "Request a new link" → `/sign-in` (checkout links keep their `nextb` so the new link returns to checkout).
- Already signed in as someone else (question 4): one extra line, "You are signed in as ana@example.com. Continuing signs
  you out of that account."
- Dashboard host: same page, dashboard look (`ops-login` shell, no public header), path `/login/confirm`; "Request a new
  link" goes to `/login`.

Strings (English is the key in `app/vamos-i18n-dict.js`; Swiss German with "ss"; CTA uppercase as a device):

| en | de | fr | ar |
|---|---|---|---|
| Sign in to Vamos Taxi | Bei Vamos Taxi anmelden | Connexion à Vamos Taxi | تسجيل الدخول إلى Vamos Taxi |
| You are signing in as | Sie melden sich an als | Vous vous connectez en tant que | أنت تسجّل الدخول باسم |
| Only continue if this is your e-mail address. | Fahren Sie nur fort, wenn dies Ihre E-Mail-Adresse ist. | Continuez uniquement s'il s'agit de votre adresse e-mail. | تابع فقط إذا كان هذا عنوان بريدك الإلكتروني. |
| SIGN IN | ANMELDEN | SE CONNECTER | تسجيل الدخول |
| Not you? | Nicht Sie? | Ce n'est pas vous ? | لست أنت؟ |
| Request a new link | Neuen Link anfordern | Demander un nouveau lien | اطلب رابطًا جديدًا |
| This link has expired or was already used. | Dieser Link ist abgelaufen oder wurde bereits verwendet. | Ce lien a expiré ou a déjà été utilisé. | انتهت صلاحية هذا الرابط أو سبق استخدامه. |
| Confirm your new e-mail address | Neue E-Mail-Adresse bestätigen | Confirmez votre nouvelle adresse e-mail | أكّد عنوان بريدك الإلكتروني الجديد |
| CONFIRM | BESTÄTIGEN | CONFIRMER | تأكيد |
| You are signed in as {x}. Continuing signs you out of that account. (pattern) | Sie sind als {x} angemeldet. Wenn Sie fortfahren, werden Sie dort abgemeldet. | Vous êtes connecté en tant que {x}. Continuer vous déconnecte de ce compte. | أنت مسجّل الدخول باسم {x}. المتابعة تسجّل خروجك من هذا الحساب. |

## 4. Files and the Phase 27 overlap

Touched by the fix:
- `apps/web/app/api/auth/email-hook/route.ts` — `verifyLink` builds the confirm URL + sealed address.
- `apps/web/lib/checkout/provision-account.ts:89-97` — same URL shape for the account-ready mail.
- `apps/web/app/api/auth/callback/route.ts` — GET `token_hash` → redirect to the screen; new POST (`preview`, `confirm`)
  with `csrfForbidden`, `verifyOtp`, address check, hand-copied cookies.
- new `apps/web/lib/auth/link-seal.ts` — AES-GCM seal/open (WebCrypto, Worker-safe).
- `apps/web/middleware.ts` — `DC_PAGES` entry, dashboard-host route for `/login/confirm`, no-store/noindex.
- new `app/pages/sign-in-confirm.dc.html` (+ dashboard variant or a `host` prop), `app/vamos-i18n-dict.js`.
- `apps/web/cloudflare-env.d.ts` (or the env type) if a new secret; `docs/runbook/auth-worker-e2e.md`.
- Tests: callback + hook unit tests, `apps/web/tests/e2e-worker/checkout-account.e2e.mjs:120,132` (builds the old callback URL),
  new e2e: link requested in jar A, opened in jar B (other device), attacker token → screen shows attacker address,
  cross-site POST → 403.
- No Supabase dashboard change: `redirect_to` stays the allow-listed callback URL; GoTrue never redirects to the screen.

Phase 27 (`gsd/phase-27-consent-record`, local worktree `/Users/koss/Developer/vamos-wt/phase-27`, head f73dfd0d; the
remote branch does not exist yet — `git log origin/gsd/phase-27-consent-record` fails):
- `callback/route.ts`: 27 removes the `recordSignupConsentOnConfirm` import and call (−4 lines, lines 17 and 88-89). F12
  rewrites the rest of GET and adds POST → textual conflict likely; F12 must not re-add the consent call.
- `middleware.ts`: 27 changes `serveDcHtml` (inject the Turnstile meta on every DC page, ~line 113). F12 adds a line at
  `DC_PAGES` (~line 43) and in the dashboard block (~354) → separate hunks, low risk.
- Also shared: `app/vamos-i18n-dict.js` (27: +4 lines — append conflict), `app/pages/AuthForm.dc.html` and
  `apps/web/app/api/auth/route.ts`, `lib/auth/run.ts` (F12 avoids editing these).
- Advice: build F12 after 27 lands on main, or merge main into the F12 branch once 27 is in.

## 5. Questions for the owner

1. **Out-of-date links on the release day.** Account-ready and sign-in links already in inboxes stop signing people in
   and show "This link has expired" with a "Request a new link" button. Example: a guest who paid at 10:00 and opens the
   account mail after the 10:30 release asks for a new link once. OK?
2. **Staff dashboard.** Same confirm screen on dashboard.vamostaxi.site/login. Example: you click the dashboard link,
   you see "Sign in as koss@…?", you press Sign in, then the passkey/code step as today. OK?
3. **Secret.** The address in the link is locked with a key. Either a new secret you add once in your terminal (one
   numbered step), or I derive it from the e-mail-hook secret that is already set (no step for you). Example: new secret =
   one `wrangler secret put` you run; derived = nothing to do. Which?
4. **Already signed in as someone else.** Example: the phone is signed in as ana@…, Mia opens her link on it. Show "You
   are signed in as ana@…. Continuing signs you out of that account." and switch on Sign in — yes, or refuse and ask to sign
   out first?
5. **Staff invite.** Today the invite link only confirms the address; the new staff member then signs in on /login. With the
   screen it can sign them in straight away. Example: new dispatcher opens the invite, sees "Sign in as sam@…?", lands on the
   set-up step. Change it, or keep invite as it is (confirm only)?
