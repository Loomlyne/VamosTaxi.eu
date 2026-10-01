---
quick_id: 261001-arabic-design-g23
branch: fix/arabic-design-g23
base: origin/main e38026ff
signed: 2026-10-02 01:09 +04 (owner, question form, all four recommended options)
---

# G23 and the five Arabic and design-system findings

Scope from the controller's job prompt: A = G23, B = five live findings, C = the 19 canvas
problems (list not found on the canvas or in the repo; owner asked to drop
`vamos-design-system-handover.md` into `.planning/`; C is not in this plan).

## Signed design (screens/01…04)

| # | Finding | Owner's choice |
|---|---|---|
| B1 | Arabic phone reads backwards | Fix as shown: inline `<span class="vt-dir-keep">` on /imprint, /cancellation, /account; LRM marks on two Arabic checkout lines |
| B4 | Arabic typo انتطار | Fix as shown: انتظار in four strings |
| B2 | Arrows not mirrored in Arabic | Flip everywhere (site, account, checkout, dashboard) with one rule in the laws |
| B3 | Disabled yellow button pale | Grey fill `--vt-grey-100`, muted text |
| B5 | Hint grey 4.45:1 | `color-mix(in oklab, var(--vt-grey-500) 60%, var(--vt-charcoal-600))`: 5.4:1 white, 5.0:1 page grey, 4.6:1 inset |

## Files this job may touch (parallel jobs own the rest)

Allowed: `apps/web/lib/security/headers.ts`, `apps/web/lib/security/headers.test.ts`,
`design-system/tokens/laws.css`, `design-system/tokens/colors.css`,
`apps/web/public/brand/tokens/laws.css`, `apps/web/public/brand/tokens/colors.css`,
`app/pages/imprint.dc.html`, `app/pages/cancellation.dc.html`, `app/pages/account.dc.html`,
`app/vamos-i18n-dict.js` (four typo values only), `apps/web/i18n/messages/ar.json` (four typo
values and two checkout values only), `packages/db/supabase/seed.sql` (regenerated only),
new test `apps/web/lib/arabic-design-g23.test.ts`.

Never: `app/ops/**`, `app/pages/booking-detail.dc.html`, `app/pages/manage-booking.dc.html`,
`apps/web/lib/{checkout,ops,account}/**`, `packages/emails/**`, `app/home/BookingSheet.dc.html`,
`app/home/home.dc.html`.

## Task 1 · G23: drop maps.googleapis.com from CSP connect-src

- `apps/web/lib/security/headers.ts`: remove ` maps.googleapis.com` from `connect-src`. Nothing
  calls Google Maps (grep of apps/web, app/, packages: only `fonts.googleapis` checks and two
  `maps.google.com` review-source test strings, unrelated).
- `apps/web/lib/security/headers.test.ts` line ~69: `expect(csp).toMatch(/maps\.googleapis\.com/)`
  becomes `expect(csp).not.toMatch(/maps\.googleapis\.com/)`.
- verify: `pnpm --filter web exec vitest run lib/security/headers.test.ts`
- done: CSP connect-src is `'self' challenges.cloudflare.com api.mapbox.com events.mapbox.com cloudflareinsights.com`.

## Task 2 · Laws and tokens (B2, B3, B5)

Both copies of each file get the same text (`design-system/tokens/*` and
`apps/web/public/brand/tokens/*` are byte-identical today; keep them so: `diff -q` both).

laws.css, at the end of section 02 (after the `:root{--vt-yellow-…}` block):

```css
/* A disabled primary button is a grey fill with muted text. The kit fades
   every disabled button to 42% opacity, which turns #FDC20B into the pale
   cream tint this law bans. Same grey as a disabled field (.vt-input--disabled). */
.vt-btn.vt-btn--primary:is([disabled],[aria-disabled="true"]),
.vt-btn.vt-btn--primary:is([disabled],[aria-disabled="true"]):is(:hover,:active){opacity:1;background:var(--vt-grey-100);color:var(--vt-text-muted);transform:none}
```

laws.css, section 03, right after the `.vt-dir-keep` line:

```css
/* A glyph that points along the reading line (next, back, open, sign out)
   points the other way in Arabic. Icon is a CSS-mask span, so the glyph is
   found by its file name. It keeps its direction inside .vt-dir-keep or
   dir="ltr". The wrappers listed after them already mirror their own icon;
   they are left out so that icon never flips twice. */
[dir="rtl"] :is([style*="/arrow-right.svg"],[style*="/chevron-right.svg"],[style*="/chevron-left.svg"],[style*="/log-in.svg"],[style*="/log-out.svg"]):not(.vt-dir-keep *,[dir="ltr"] *,[data-bb-mirror] *,[data-bs-mirror] *,[data-svc-cta-arrow] *,[data-svc-circ] *,[data-route-join] *,[data-bt-go] *,[data-bk-go] *,[data-ac-more-go] *,.vt-dp__nav *,.vt-row__chevron *,.vt-co__strip-back *,.vt-co__strip-arrow *){transform:scaleX(-1)}
```

Why each exclusion: each is an existing local `[dir="rtl"] X{transform:scaleX(-1)}` on a wrapper
of an Icon (BookingBar, BookingSheet, Services, React ServiceCard, home.dc.html ×2, BookingRow,
account, React DatePicker, ListRow, checkout TripStrip). Do not edit those files.

colors.css, after the closing `}` of the `:root` block:

```css
/* Muted text (field hints, captions) must reach 4.5:1. --vt-grey-500 alone is
   4.45:1 on white and 4.11:1 on --vt-bg-page. A 60/40 mix toward
   --vt-charcoal-600 reads 5.4:1 on white, 5.0:1 on the page grey and 4.6:1 on
   --vt-bg-inset, and stays a step lighter than --vt-text-secondary (7.3:1).
   Browsers without color-mix keep --vt-grey-500. */
@supports (color:color-mix(in oklab,red,blue)){
  :root{--vt-text-muted:color-mix(in oklab,var(--vt-grey-500) 60%,var(--vt-charcoal-600))}
}
```

- verify: `diff -q design-system/tokens/laws.css apps/web/public/brand/tokens/laws.css`, same for
  colors.css; the new test file (Task 3) asserts the three blocks in both copies.

## Task 3 · Phone, typo, checkout lines, tests (B1, B4)

- `app/pages/imprint.dc.html`: the three `>+41 79 626 70 82<` (tel row, WhatsApp row, call
  Button) become `><span class="vt-dir-keep">+41 79 626 70 82</span><`.
- `app/pages/cancellation.dc.html`: the call Button the same; the sentence link
  (`Call <a href="tel:+41796267082">…`) gets `<span class="vt-dir-keep" style="white-space:nowrap">`
  so the number never breaks across lines at 390.
- `app/pages/account.dc.html`: the phone link text after the Icon gets the same span.
- `app/vamos-i18n-dict.js`: in the `ar` values of 'Awaiting payment', 'Awaiting live Stripe data',
  'Waiting, airport', 'Waiting, city': ط → ظ (انتطار → انتظار). Nothing else.
- `apps/web/i18n/messages/ar.json`: the same four values (`ops.awaiting-payment`,
  `ops.awaiting-live-stripe-data`, `common.waiting-airport`, `common.waiting-city`); and
  `checkout.emptyBody`, `checkout.quoteGeneric`: `+41 79 626 70 82` → `‎+41 79 626 70 82‎`
  (the same LRM marks `checkout.need-something-unusual-…` and `header.call-…` already carry).
- `pnpm db:seed:gen`, then `pnpm db:seed:check` (values change, counts do not; if the seed
  header counts change, re-pin `packages/db/supabase/tests/seed_idempotent.test.sql`).
- New `apps/web/lib/arabic-design-g23.test.ts` (vitest, source-level like contact-source.test.ts):
  1. both laws.css copies contain the mirror rule and the disabled-primary rule, and are identical;
  2. both colors.css copies contain the `@supports` color-mix muted rule and are identical;
  3. imprint (3), cancellation (2), account (1) wrap every `+41 79 626 70 82` text in vt-dir-keep
     (no `>+41 79 626 70 82<` left in those three files);
  4. no `انتطار` in `app/vamos-i18n-dict.js`, `apps/web/i18n/messages/ar.json`, `packages/db/supabase/seed.sql`;
  5. every `+41` inside an `ar.json` value is preceded by U+200E;
  6. CSP has no `maps.googleapis.com` (or leave this to headers.test.ts).
- verify: `pnpm --filter web exec vitest run lib/arabic-design-g23.test.ts lib/contact-source.test.ts lib/security/headers.test.ts`, `pnpm i18n:check`.

## Task 4 · Lead verification (not the executor)

`node scripts/sync-dc-mock-to-public.mjs`; local Worker build click-through in Chromium at
1440/1024/768/390, en and ar (imprint, cancellation, account, terms, faq, sign-in code step,
header menu, checkout, dashboard calendar); `VamosLocale.coverage(document.body)` empty in
en on touched pages; gates: typecheck, lint, lint:css, i18n:check, check:legal-claims,
check:numbers, check:public-env, check:db-fences, db:seed:check, test:unit, build.

## For the controller (files this job may not touch)

- `app/pages/manage-booking.dc.html` lines ~235, 533, 661 and `app/pages/booking-detail.dc.html`
  lines ~233, 523, 643: bare `+41 79 626 70 82` (Button and fork link) reads backwards in Arabic;
  same span fix.
- Live `content_strings`: the four typo rows (`ops.awaiting-payment`,
  `ops.awaiting-live-stripe-data`, `common.waiting-airport`, `common.waiting-city`) still hold
  انتطار until the seed values reach the live table.
- After this ships, the local wrapper flips listed in the mirror rule can be deleted together
  with their exclusions (one cleanup job; home.dc.html and BookingSheet are owned by other jobs).
