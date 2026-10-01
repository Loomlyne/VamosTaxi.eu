# Hand-over · 261001-arabic-design-g23 · G23 and the five Arabic and design-system findings

- **Branch:** `fix/arabic-design-g23` (pushed, never forced), worktree `.claude/worktrees/arabic-design-g23`
- **Code tip:** `9ed114c7` (merge of `origin/main` `dace2b1f` into the branch; no conflicts, main
  brought only planning notes and one pgTAP file). Code commits: `03714426`, `f22cccd3`, `f572548a`.
  The hand-over commit sits on top of the code tip.
- **Migration:** none. **Seed:** `seed.sql` values only (6 lines), counts unchanged.
- **Signed:** 2026-10-02 01:09 +04 by the owner in this session (question form, all four
  recommended options). Pictures: `screens/01…04` (before = main `e38026ff`, after = this branch).
- **C (the 19 canvas problems): not started.** The canvas holds screenshots only and the repo has
  no list; the owner was asked to drop `vamos-design-system-handover.md` into `.planning/`.

## Each item and its fix

| Item | Fix | Files |
|---|---|---|
| A · G23 | `maps.googleapis.com` removed from CSP `connect-src`; test now asserts it is absent. Nothing calls Google Maps (grep of apps/web, app/, packages). | `apps/web/lib/security/headers.ts`, `headers.test.ts` |
| B1 · Arabic phone backwards | Number in an inline `<span class="vt-dir-keep">`: /imprint ×3, /cancellation ×2 (the in-sentence one also `white-space:nowrap`), /account ×1. U+200E marks around the number in Arabic `checkout.emptyBody` and `checkout.quoteGeneric`, like the other Arabic phone lines | `app/pages/{imprint,cancellation,account}.dc.html`, `apps/web/i18n/messages/ar.json` |
| B2 · arrows not mirrored | One law-03 rule: in `[dir="rtl"]`, Icon spans whose mask is arrow-right, chevron-right, chevron-left, log-in or log-out get `scaleX(-1)`, except inside `.vt-dir-keep`, `[dir="ltr"]` and the 12 wrappers that already mirror their own icon (listed in the rule). Covers site, account, checkout and dashboard | `design-system/tokens/laws.css` = `apps/web/public/brand/tokens/laws.css` |
| B3 · pale disabled yellow | Law-02 rule: disabled primary button = `--vt-grey-100` fill, `--vt-text-muted` text, opacity 1, also on hover/press | same two laws.css |
| B4 · Arabic typo | انتطار → انتظار in Awaiting payment, Awaiting live Stripe data, Waiting airport, Waiting city | `app/vamos-i18n-dict.js`, `ar.json`, `seed.sql` (regenerated) |
| B5 · hint grey 4.45:1 | `--vt-text-muted` = `color-mix(in oklab, var(--vt-grey-500) 60%, var(--vt-charcoal-600))` under `@supports` (old browsers keep grey-500): measured #686B6A, 5.38:1 on white | `design-system/tokens/colors.css` = `apps/web/public/brand/tokens/colors.css` |
| Tests | New `apps/web/lib/arabic-design-g23.test.ts` (16 tests): law rules in both copies and identical, muted rule, phone spans, no انتطار anywhere, U+200E before every Arabic +41 | |

## Checks (run 2026-10-02 01:16-01:36 +04 on the branch before the main merge; the merge changed no product code)

| Gate | Result |
|---|---|
| typecheck | pass |
| lint | pass, 0 errors (6 warnings, all in files this job did not touch) |
| lint:css | pass |
| i18n:check | pass (2685 keys) |
| check:legal-claims | pass (3 checks) |
| check:numbers | pass |
| check:public-env | pass, built client bundle scanned |
| check:db-fences | pass (8 checks, 1072 files) |
| db:seed:check | pass, no drift |
| test:unit | first full run: web 3 failed (`lib/ops/refund-by-hand.test.ts` ×2, `lib/quote/lock-secret.test.ts` ×1: 5 s timeouts while another session's tests loaded the Mac); the two files alone 37/37; full web rerun **355 files, 3528 passed, 5 skipped, 0 failed**; db 14/14; emails 165/165 |
| build | `opennextjs-cloudflare build` complete (runs `next build`) |

Click-through on the **local Worker build** (`wrangler dev --local`, no database behind it, `/api/*`
answered in the browser), evidence in `evidence/`:

- CSP header on `/imprint`: `connect-src 'self' challenges.cloudflare.com api.mapbox.com events.mapbox.com cloudflareinsights.com`.
- `tools/worker-check.mjs`: /imprint, /cancellation, /terms, /faq, /sign-in × en/de/fr/ar × 1440/1024/768/390:
  **257 pass**, 0 phone, arrow or sideways-scroll failures (80 phone checks, 80 directional-icon checks:
  mirrored in Arabic only). 48 failures are all `VamosLocale.coverage` lines, and
  `tools/coverage-compare.mjs` shows every one exists on main too (no new gap; list in
  `evidence/worker-signin-and-coverage.txt`).
- `tools/worker-signin.mjs`: sign-in code step, 4 languages × 4 widths: disabled SIGN IN
  `rgb(236,236,236)` opacity 1, hint `rgb(104,107,106)` 5.38:1. **16/16 pass.**

## NOT verified

1. C, the 19 canvas problems (no list).
2. /account phone line and the dashboard calendar arrows: checked in the static mock renders with
   stubbed APIs (signing sheets), not on the Worker with a real signed-in session or staff sign-in.
3. Arabic checkout error lines (`quoteGeneric`, `emptyBody`): unit test and a text render only; the
   Worker's checkout needs a real place lookup before it asks for a price.
4. No pgTAP or database run (no migration; seed values only).
5. Safari / iPhone not checked. `color-mix` needs Safari 16.2+; older browsers keep the old grey.
6. No test payment (checkout logic untouched; only two Arabic strings changed).

## For the controller

1. Live `content_strings` still holds انتطار in `ops.awaiting-payment`,
   `ops.awaiting-live-stripe-data`, `common.waiting-airport`, `common.waiting-city`, and the two
   Arabic checkout lines without the U+200E marks. The Next app reads these rows only when
   `CONTENT_SOURCE=db` (`apps/web/lib/content/messages.ts`); `wrangler.jsonc` sets no
   `CONTENT_SOURCE`, so the bundled `ar.json` wins unless the live Worker has that variable set in
   Cloudflare. Please confirm; if it is `db`, the six rows need updating (a live data write: your call).
   The DC pages and the dashboard read `app/vamos-i18n-dict.js`, which this branch fixes.
2. Files this job may not touch, same fix needed: `app/pages/manage-booking.dc.html` lines ~235,
   533, 661 and `app/pages/booking-detail.dc.html` lines ~233, 523, 643 (bare `+41 79 626 70 82`).
   From code reading, not rendered: the Arabic e-mails put the bare number in an RTL body
   (`packages/emails/src/refund.ts` FOOTER, `contact.ts` CONTACT_FOOTER, `ConfirmationEmail.tsx` dispatchPhone).
3. Later cleanup (one job): the 12 local wrapper flips named in the mirror rule can go together
   with their exclusions.
4. Deploy changes every page's tokens (laws.css, colors.css): muted grey is a little darker everywhere.

## Owner UAT (after deploy, on vamostaxi.site)

1. Open `/ar/imprint`. Telephone and WhatsApp rows and the call button read `+41 79 626 70 82`, left to right.
2. Open `/ar/cancellation`. The sentence and the call button read `+41 79 626 70 82`; on the phone the number stays on one line.
3. Sign in, open `/ar/account`. The phone line reads `+41 79 626 70 82`.
4. On any `/ar` page, look at the yellow احجز رحلتك button in the header. Its arrow points left. Open the phone menu: the arrow points left, the sign-out icon is mirrored.
5. Open `/ar/terms` (bottom button تواصل معنا) and `/ar/faq` (arrow links). The arrows point left.
6. Open the same pages in English. The arrows still point right.
7. Open `/sign-in`, tap Email me a link instead, type your e-mail, send. Under "6-digit code" the SIGN IN button is light grey, not pale yellow, and the hint line under the field is a darker grey.
8. Dashboard in Arabic, Calendar. Previous (on the right) points right, next (on the left) points left. The Awaiting payment filter reads بانتظار الدفع (with ظ).
