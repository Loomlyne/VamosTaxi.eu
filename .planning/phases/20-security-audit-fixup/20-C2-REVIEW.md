# Review: Phase 20 batch C part 2 (fix/phase-20-batch-c2)

Read-only review, 2026-10-01. Tree `/Users/koss/Developer/vamos-wt/phase-20`, HEAD e1e60ba3, merge base ec4920ec.
Nothing was run except two live GETs to dashboard.vamostaxi.site.

## Verdicts

| # | Point | Verdict |
|---|---|---|
| 1 | Sealed address | PASS WITH NOTES |
| 2 | Session-creating paths | PASS WITH NOTES |
| 3 | Link builders | PASS WITH NOTES |
| 4 | Preview route | PASS WITH NOTES |
| 5 | Confirm page | PASS WITH NOTES (e-mail change is wrong, see N6) |
| 6 | e2e scripts | PASS WITH NOTES |
| 7 | F16 worker/guard | **FAIL: BLOCKER B1** |
| 8 | /dev headers | PASS |

## BLOCKER

### B1: F16 breaks the whole staff dashboard (login and console)

- `apps/web/dashboard-gateway.ts:74-76` (not changed on this branch): the gateway sends every path where
  `isApexAssetPath` is true (`lib/security/pin-sni.ts:80`, which includes `/app/ops/*`) to `env.PUBLIC`.
  That is the **default** entrypoint of `vamos`, with the host changed to `vamostaxi.site`.
- `apps/web/wrangler.jsonc:14` now makes `/app/ops/*` run the Worker first. So that request enters
  `worker.ts:76-77` with `surfaceFromEnv` = `"public"` (`VAMOS_SURFACE: "public"`, wrangler.jsonc:69).
  `pinRequestToSurface` keeps the apex host. `guardOpsAsset` (`lib/dc-mock-urls.ts:257-263`, called at
  `worker.ts:48`) then answers **404**.
- Live today, `dashboard.vamostaxi.site/app/ops/support.js` answers 200 straight from the asset layer. It has no
  security headers, which shows the path is gateway → PUBLIC → assets.
- Every `/app/ops/*` load on the dashboard goes through that path:
  - `middleware.ts:160-161` `serveOpsDc` does a global `fetch("https://dashboard.vamostaxi.site/app/ops/ops.dc.html" | "ops-login.dc.html")`.
    Because `global_fetch_strictly_public` is on (wrangler.jsonc:6), that fetch goes out to the internet and
    back through the gateway to PUBLIC, and gets a 404. So `/login` and `/` on the dashboard return a 404
    status with an empty page.
  - `/app/ops/support.js` (ops-login `./support.js` under `<base href="/app/ops/">`), `/app/ops/AuthForm.dc.html`
    and all `/app/ops/Ops*.dc.html` screens (dc-import) also get a 404.
  - Not affected: `/app/support.js`, `/app/vamos-*.js`, `/_ds/*`, `/assets/*`, `/photos/*` (not under `/app/ops/`),
    and `/login/confirm`, which loads from `/app/pages/*`.
- The unit test `lib/security/ops-assets.test.ts` builds a request with the host already set to the dashboard
  host. The local e2e runs a second Worker with `VAMOS_SURFACE=auto` and no gateway. Neither covers the real
  route (gateway → PUBLIC).
- **Smallest fix:** send `/app/ops/*` to the `Dashboard` entrypoint, not to PUBLIC. In
  `dashboard-gateway.ts`, before the `isApexAssetPath` branch:
  `if (path === "/app/ops" || path.startsWith("/app/ops/")) return env.APP.fetch(request);`
  - A named entrypoint skips the asset layer. So in `worker.ts` `handleFetch`, when `opsAsset` is true, answer
    `withOpsAssetHeaders(await env.ASSETS.fetch(inbound))` directly. Do not rely on the OpenNext handler
    finding the file.
  - Deploy `vamos-dashboard` together with `vamos`. It is a second Worker deploy.
  - Prove it on a local build with both Workers (gateway + service binding), or read it back on live right
    after the deploy: `/login` 200, `/app/ops/ops.dc.html` 200 with CSP on dashboard, and 404 on the apex.

## Notes (no blocker)

**Point 1: sealed address** (`lib/auth/sealed-address.ts`)
- Checked and correct:
  - The key is HKDF-SHA-256 over the raw `SEND_EMAIL_HOOK_SECRET` string, with its own info label (:10, :36-46).
  - Each seal gets a random 96-bit IV (:57).
  - `token_hash` is the associated data (:61, :90).
  - The hook (`email-hook/route.ts:143` → `mailedLink`), the callback, the preview and provision-account
    (`sealSecretFrom`, :14-17) all use the **same raw bytes**, including the `v1,whsec_` prefix. Only the
    webhook verifier strips the prefix (`hookVerifySecret`, route.ts:90-92). So seal and open agree.
  - HKDF with its own label against HMAC use of the same secret is sound key separation.
  - Parsing is safe: the base64url regex rejects bad characters, a length-1-mod-4 input throws and is caught,
    and there is a length cap and a minimum length.
  - Nothing is logged except reason codes, and GCM tag checking is constant-time.
- N1: `type`, `next` and `nextb` are not in the associated data. Low risk, because `next` is validated on the POST
  and GoTrue checks the type against the token. Optionally add `type` to the associated data.
- N2: rotating the hook secret expires every link already mailed. Put this in the runbook.

**Point 2: session paths** (`app/api/auth/callback/route.ts`)
- The GET `?code=` branch is unchanged (:82-95).
- The GET `?token_hash=` branch only sends the visitor on to `confirmPathFor(host)` on the trusted origin with
  a 302 (:58-67). No `verifyOtp` runs on a GET anywhere.
- The only session creators left are callback :83 (PKCE), callback :164 (POST), and `api/auth/route.ts:544`
  (the typed code, which is CSRF-guarded at :160).
- The POST checks, in this order:
  1. `csrfForbidden` first (:113).
  2. The rate limit.
  3. The seal opens for this `token_hash`, else "expired" (:147).
  4. If a different user is signed in, sign them out (:160-162).
  5. `verifyOtp`.
  6. The verified address must match, else sign out and "expired" (:171-178).
  7. Cookies are copied by hand, last value per name (:104-109, :130).
- Attack cases:
  - The attacker's own link shows the attacker's address (accepted by design; e2e step 7).
  - A POST from another site gets 403.
  - The attacker's token with a victim-address `e` is refused, because the seal is bound to another token
    and the key is unknown.
  - A `token_hash` link with `e` stripped shows "expired".
  - The dashboard host goes to `/login/confirm`.
- Accepting `new_email`: the seal is always the requesting account's own current `user.email`, so the
  `new_email` clause (:171) cannot bring in someone else's address. No abuse.
- N3: on the dashboard host the POST does not call `refuseNonStaff`, so an existing customer can get a
  dashboard-host session. That matches the old `?code=` path, and the console still gates on admin + aal2.
  For parity with password and code sign-in, refuse non-staff there.
- N4: when the verified address does not match, the token is already spent (`verifyOtp` runs first). This is
  expected, and the e2e notes it.

**Point 3: link builders**
- Hook `CONFIRM_TYPES` covers signup, magiclink, email_otp→`email`, recovery and email_change
  (`email-hook/route.ts:65-88`). The invite and reauthentication links are unchanged (`verifyLink`, :77).
- `provision-account.ts` builds the confirm link with the fixed target `/<loc>/account`. It fails closed when
  there is no secret.
- The origin comes only from `trustedSiteOrigin(redirect_to host)`, and falls back to vamostaxi.site
  (`lib/auth/confirm-link.ts:21-30`). This is stricter than before.
- `next`/`nextb` go into the link as they arrive, and are validated by `validateAuthRedirectTarget` on the
  POST (callback :153, :180). The page also accepts only a single-slash target (ConfirmCard :165).
  No open redirect.
- The hook still answers JSON with `content-type: application/json`. A failed seal gives 500 JSON.
- N5: `trustedSiteOrigin` accepts `localhost` (http). If the live GoTrue allow-list contains localhost, a
  requested link can point at the recipient's own localhost. This is harmless, and it was already true of the
  `redirect_to` allow-list.

**Point 4: preview** (`app/api/auth/confirm/preview/route.ts`)
- It returns only `{ok, email}` or `{ok:false, code:"expired"}`, with no-store.
- It is rate-limited, never calls Supabase (so it cannot be used to enumerate), uses up no token and sets no
  cookie.
- An invalid token and a valid token without a valid `e` get the same answer.
- N7: it uses the same `AUTH_RATE_LIMITER` "auth" bucket as sign-in, so each page view costs one sign-in
  attempt for that IP.
- N8: `token_hash` and `e` are in a GET query, so they reach the Worker observability logs. The page URL itself
  has the same exposure, and the old callback GET did too, so this is parity. A POST would keep it out of logs.

**Point 5: page** (`app/pages/sign-in-confirm.dc.html`, `app/pages/ConfirmCard.dc.html`)
- Checked and correct:
  - `history.replaceState` runs on mount (ConfirmCard :130).
  - `<meta name="referrer" content="no-referrer">` is in the static head, before any script. The header policy
    is `strict-origin-when-cross-origin`, which sends no query string off-site anyway.
  - The only fetches are same-origin.
  - SiteHeader, SiteFooter and CookieBanner are on the site variant. The dashboard variant uses the ops-login
    shell (design section 3).
  - Every visible string is in `app/vamos-i18n-dict.js` with de, fr and ar, including the "signed in as"
    pattern, the SEO titles, the ops note and the alt text.
  - The address is inside `.vt-dir-keep dir=ltr translate=no`, and the layout uses logical properties.
  - `/sign-in/confirm` is no-store and noindex (the `/sign-in` prefix).
- **N6 (e-mail change, correctness, not a session risk):**
  - The design said the screen would show the **new** address and the new-address mail would carry the link.
    The build seals and mails `user.email` (the current address, `email-hook/route.ts:83`, `:205`), under the
    heading "Confirm your new e-mail address". So it shows the old address under a "new address" heading.
  - `packages/db/supabase/config.toml:236` has `double_confirm_changes = true` (secure e-mail change). Supabase
    then expects two mails, one per token (`token_hash` and `token_hash_new`).
  - The hook's schema drops `token_hash_new` and mails only `user.email`. The new address never gets a link,
    so the change can never finish. This was true before F12 too.
  - Supabase's hook docs, as I remember them, say the pairing is reversed for backward compatibility:
    `token_hash` goes with the new address and `token_hash_new` with the current one. Prove this locally
    before relying on it.
  - So "left as today (user.email)" is **not correct** for secure change. Fix it in a follow-up:
    1. Parse `token_new` and `token_hash_new`.
    2. Send two mails, each with its own confirm link.
    3. Seal the recipient's own address into each link.
    4. Show that address on the screen.
- N9: minor design notes:
  - `:focus-visible` uses a literal `rgb(253 194 11/.45)` (sign-in-confirm :54, ConfirmCard :61), copied from
    the other auth pages rather than a token.
  - The decorative checker image uses `right:0` (sign-in-confirm :91), also a copy.
  - The address inside the "signed in as" sentence (`otherLine`) is not wrapped in `.vt-dir-keep`. It relies on
    `unicode-bidi:plaintext`.

**Point 6: e2e**
- `confirm-link.e2e.mjs` does assert what it claims:
  - The crafted old link is refused: step 6 checks for a 302 to `/sign-in/confirm`, no cookie and no session.
  - The second device signs in: step 4 uses a fresh jar and checks POST 200, a session and `sb-*` cookies.
  - Step 3 covers the cross-site POST (403), no Origin (403), no `e` (400) and a foreign seal (400, no session
    cookie).
  - Step 5 covers one use only, and step 8 covers switching accounts.
- `auth-worker`, `other-device` and `checkout-account` now follow the confirm page and press its button.
  `checkout-account` builds its link the way `provision-account.ts` does.
- N10: step 2's cache check defaults to passing when the header is missing:
  `?? "private, no-store"` (:50). The "noindex" in its title is never asserted.
- N11: there is no dashboard-host confirm-link case, and the local setup cannot catch B1 (it has no gateway).

**Point 8: /dev headers**
- `middleware.ts:639` and `:663` pass `false`, so only the security pairs are skipped.
- `X-Robots-Tag` is still set by `applyStagingNoindex` (:446-452).
- The `next.config.ts:128` `{ source: "/:path*" }` catch-all puts the security headers on the `/__vamos_gone`
  answer.
- The duplicate headers that the commit fixed show that `headers()` does reach this rewrite on OpenNext.
  Nothing is left without headers.

**Branch hygiene (owner rule 3)**
- N12: the merge base is ec4920ec, but `origin/main` is now 1c8fd7e3 (it has moved). Merge main into the branch
  before handing it over.
- Phase 27: the callback does not bring back `recordSignupConsentOnConfirm`. Correct.
