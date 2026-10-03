# Contact button: build plan (direction B, signed 2026-10-03)

Branch `feat/contact-overlay` from `origin/main` b869237b. Signed answers: `.planning/decisions/2026-10-03-contact-overlay-answers.md`. Visual reference: `origin/design/contact-overlay` f897e9fd, `sketches/gallery.html` and `screens/frames/B-*.png` (states: `B-states.png`). Planning only in this step: no code, no deploy, no live database.

## 1. The component

**`ContactButton.dc.html`** (button + menu + states), with **`ContactRow.dc.html`** for the menu row (it repeats four times; the kit's `ListRow` is tinted and renders a `<button>`). Both files exist as byte-identical twins in `app/home/` and `app/pages/` (same pattern as `CookieBanner`), and a unit test pins the twins as identical. React twin: `apps/web/components/shell/ContactButton.tsx` + `ContactRow.tsx` + `ContactButton.css`. The old `ContactFab.tsx` and `ContactFab.css` are deleted.

`data-props`: `variant` (`float` | `docked`), `open` (boolean, for the gallery), `gallery` (boolean, default off; shows every state side by side for review).

States, all from the kit (`Button` secondary lg 54 px, `IconButton`, `Icon`) and `--vt-*` tokens:
- **Pill (float, above 680 px):** charcoal, yellow `message-circle`, label CONTACT. Hover charcoal-800, press charcoal-950 + `translateY(1px)`, focus `--vt-ring`. Open: label CLOSE, yellow `x`.
- **Round (float, 680 px and below):** 54 px charcoal disc, yellow icon, same hover/press/focus/open.
- **Docked (PAY bar, 1080 px and below on /checkout):** 54 px outline `IconButton`, white with hairline, between Total and PAY. PAY keeps its height and stays the only yellow thing in the bar.
- **Menu:** desktop/tablet: 344 px white card, `--vt-radius-lg`, `--vt-border-subtle`, `--vt-shadow-xl`, 12 px above the button. Phone: bottom sheet, `--vt-radius-xl` top corners, grab bar, 44 px close `IconButton`, `--vt-bg-scrim`.
- **ContactRow:** 60 px (64 px in the sheet), 40 px `--vt-grey-100` lead circle, charcoal icon, no underline. Hover `--vt-grey-50`, press `--vt-grey-100` + 1 px down, focus `--vt-ring`. No disabled state.

Rows: WhatsApp `https://wa.me/41796267082` (new tab) · Call us `tel:+41796267082` · Email `mailto:info@vamostaxi.site` · Send us a message `/contact` with the language prefix. The number and address sit in `.vt-dir-keep` + `data-vt-no-i18n`. React reads `PHONE_HREF`/`WHATSAPP_HREF` from `apps/web/lib/contact-channels.ts` (unchanged).

Laws: `:root{--vt-shadow-accent:none}` and `.vt-input--focus{box-shadow:none}` in both helmets; no glow, no yellow-50…300 or -600/-700; position with `inset-inline-end` / `inset-block-end` only (Arabic: bottom-left, the bar mirrors to PAY · contact · Total); motion is a 200 ms fade + 8 px rise (sheet 320 ms), no rotate or scale; `prefers-reduced-motion` = no animation; hidden in print.

Strings (`app/vamos-i18n-dict.js`):

| English | In dict | de / fr / ar (new ones are drafts, UI copy) |
|---|---|---|
| Contact, Talk to a person, WhatsApp, Call us, Email, Send us a message, Close | yes | existing |
| Contact form | **new** | Kontaktformular / Formulaire de contact / نموذج التواصل |
| Open contact options | **new** | Kontaktoptionen öffnen / Ouvrir les options de contact / فتح خيارات التواصل |
| Close contact options | **new** | Kontaktoptionen schliessen / Fermer les options de contact / إغلاق خيارات التواصل |

Next messages: new namespace `contactButton` in `apps/web/i18n/messages/{en,de,fr,ar}.json` with all ten strings (the old `common.*` keys stay; other pages use them). Live serves the JSON (`CONTENT_SOURCE` default `json`), so no live database step; `db:seed:gen` regenerates the local seed only.

## 2. Where it goes

**DC pages (what the customer sees for these 18 routes):** a direct `<dc-import name="ContactButton" variant="float">` on the line after `<dc-import name="CookieBanner">` in `app/home/home.dc.html` and `app/pages/{about, account, bookings, booking-detail, cancellation, coming-soon, contact, cookies, faq, imprint, manage-booking, privacy, reset-password, sign-in, sign-in-confirm, sitemap, terms}.dc.html`. `/sign-up` serves `sign-in.html`, so it is covered.
Why there and not in `SiteFooter`/`SiteHeader`: `coming-soon` has neither, while `CookieBanner` is on all 18 already. A unit test walks `DC_PAGES` in `middleware.ts` and fails if any public page lacks the import, so a new page cannot miss it. `scripts/sync-dc-mock-to-public.mjs` copies all of `app/`, so the new files ship with no list change (checked).

**Next pages (only routes the middleware does not hand to a DC mock):** `/checkout`, `/checkout/pay/[token]`, `/confirmation`, `/confirmation/[ref]`, `/review`, the 404 (`[...rest]`) and `error.tsx`, all through `SiteShell.tsx` (one mount, swap `ContactFab` → `ContactButton`). The Next copies of about/faq/legal/home are not reached by customers and need no work.

**PAY bar:** the customer's /checkout is the Next page (`checkout.dc.html` is in `SKIP_PUBLIC` and never served). The docked button goes inside `components/checkout/PayBar.tsx` when `variant === "bar"` (row: Total · contact · PAY) with styles in `components/checkout/checkout-parts.css`. `SummaryRail.tsx` is not touched (the fare-lines job will edit it). On /checkout at 1080 px and below the float is not rendered; above 1080 the float shows and the rail keeps its own PAY. The pay-link page has no bottom bar, so it gets the float.

Ops and the dashboard host: excluded (SiteShell already returns early; no ops `.dc.html` gets the import; a test pins it).

## 3. Behaviour rules

Each rule is a data attribute on `<html>` set by the component that owns the state; CSS hides the float. No scroll handler, no custom property written on scroll.
1. Cookie card open on a phone (≤ 680 px): `data-vt-ck-open` set by both `CookieBanner.dc.html` twins and `components/consent/CookieBanner.tsx` → float hidden. The docked button is never hidden by this; it rides in the lifted bar.
2. Phone booking sheet or travellers sheet open: `data-vt-sheet-open` set in `app/home/BookingSheet.dc.html` (next to the `overflow='hidden'` line) and `app/home/home.dc.html` (travellers shell) → hidden.
3. Keyboard up: on ≤ 680 px, a text field with focus (`focusin`/`focusout` listener inside ContactButton) → hidden.
4. Home on a phone: shown at once (owner's answer). See question 1 about the "Where to?" card.
5. Esc, outside click/tap, the close button or following a link close the menu; focus returns to the button.
6. Roles: the button has `aria-expanded`, `aria-controls`, `aria-label` "Open/Close contact options". The menu is `role="dialog"` labelled by "Talk to a person"; the phone sheet is `aria-modal="true"` with a focus trap, the desktop card is non-modal. Rows are plain links in a list.
7. Nothing scrolls sideways at 390 (sheet is full width inside the viewport; no fixed widths over 344 px).

## 4. Tasks (one job; these files belong to it alone)

1. **Strings.** `app/vamos-i18n-dict.js` (three keys, one block of our own lines only), `apps/web/i18n/messages/{en,de,fr,ar}.json`, `packages/db/supabase/seed.sql` (`db:seed:gen`), `packages/db/supabase/tests/seed_idempotent.test.sql` (re-pin counts).
2. **DC component.** New `app/{home,pages}/ContactButton.dc.html`, `app/{home,pages}/ContactRow.dc.html`, with the states gallery.
3. **DC mounts and flags.** The 18 page files in §2; `app/{home,pages}/CookieBanner.dc.html`; `app/home/BookingSheet.dc.html`; `app/home/home.dc.html` (one flag, same file as the mount); `app/{home,pages}/SiteHeader.dc.html` (correct the "Public contact is the FAB" comment only).
4. **React twin.** New `apps/web/components/shell/{ContactButton.tsx, ContactRow.tsx, ContactButton.css}`, new `apps/web/lib/contact-button.ts` (pure logic: channel list per locale, hide rules); delete `ContactFab.tsx`/`ContactFab.css`; edit `shell/index.ts`, `shell/SiteShell.tsx`, `shell/SiteHeader.tsx` (comment), `components/consent/CookieBanner.tsx`, `components/checkout/PayBar.tsx`, `components/checkout/checkout-parts.css`, `app/[locale]/confirmation/[ref]/confirmation.css` (print comment).
5. **Tests and proof** (§5). Merge `origin/main` back in, write `HANDOVER.md` here, stop.

**Conflicts.** `fix/legal-lines-imprint` (local, 0 commits ahead today) will touch `app/vamos-i18n-dict.js` and the legal pages (terms, privacy, cookies, cancellation, imprint). We add only our three dict keys in one contiguous block, and on those pages only the one import line after `CookieBanner`; nothing else in them changes, so a merge is line-local. The fare-lines build (not started) will touch `SummaryRail.tsx`, the dict and the messages JSON: it should start after this job lands, or add its own keys in its own block. `fix/settle-safety`, `gsd/phase-28-pixel-pageview`, `gsd/phase-26.2-u13`: no shared files (checked).

## 5. Tests

- **New unit** `apps/web/lib/contact-button.test.ts`: every `DC_PAGES` file imports ContactButton, no ops file does; twins identical; four hrefs exact; laws (no `--vt-shadow-accent` use, no tinted yellow, no `left`/`right`, both law lines in helmets); hide-rule selectors present; ARIA attributes present; `contact-button.ts` logic (locale prefix on /contact, hide states). A vm-run test of the DC logic class (open, Esc, outside click, focus target), as `manage-cookie` does.
- **Existing tests that change:** `components/consent/reserve-and-footer.test.ts` (line 45 pins `ContactFab.css` `calc(24px + var(--vt-ck-reserve, 0px))` → pin the same rule in `ContactButton.css` for the tablet pill); `components/consent/banner-hosts.test.ts` (mock path → `@/components/shell/ContactButton`); `lib/checkout/checkout-comments.test.ts` (reads `ContactFab.tsx`, expects `ContactFab` in the shell → `ContactButton`). Plus `i18n:check`, `db:seed:check`, typecheck, lint, the full unit suite once.
- **Chromium proof** `apps/web/tests/e2e-worker/contact-button-browser.e2e.mjs`, on the synced public mocks (`node scripts/sync-dc-mock-to-public.mjs`) and the local Worker build on a free unusual port (refuse a busy port, kill only what it started, by port). All 18 DC pages + /checkout + /confirmation stub + /review + 404, at 1440/1024/768/390 in en/de/fr/ar: button present or hidden per rule; menu opens, Esc closes, focus returns; four hrefs; `scrollWidth ≤ innerWidth` at 390; `VamosLocale.coverage()` empty; /checkout ≤ 1080: order Total · contact · PAY and `elementFromPoint` at PAY's centre is PAY, also with the cookie card open; Arabic mirrored. Screenshots to `evidence/`.
- **Visual.** Add `stylePath` (`tests/visual/hide-contact-button.css`, `[data-contact-btn]{visibility:hidden}`) in `playwright.config.ts`, so the 26 existing snapshot folders (about, home*, legal-*, shell, error-pages, confirmation…) do not change and the SiteHeader/SiteFooter pictures stay as they are (header gets a comment edit only). New `tests/visual/contact-button.spec.ts` renders the states gallery with `stylePath: []` and owns new darwin baselines, made with `--update-snapshots` on that spec only and each picture looked at. Checkout specs have no committed pictures; their geometry assertions update if the bar's PAY width is pinned.
- **After deploy (controller):** one 4242 test payment, then `booking_payments` by status (rule 8: the PAY bar changed).

## 6. Risks and not in scope

- Risk: on the home first phone screen the 54 px disc can sit over the end of the "Where to?" card (question 1).
- Risk: on a short laptop (1280 × 720) the float pill may meet the rail's PAY on /checkout; checked in the Chromium run, offset raised if so.
- Risk: the DC runtime's `dc-import` wrapper must not create a containing block for `position:fixed`; checked on the first mounted page before mounting the rest.
- Not in scope: the header V logo mirrored in Arabic. It is SiteHeader artwork, and fixing it changes every header picture. Recommended: a separate small job right after this one (question 2). The new button carries no V mark, so it has no mirroring issue.
- Not in scope: `checkout.dc.html` / `confirmation.dc.html` (never served), ops, the Next copies of DC routes.

## 7. Owner UAT on vamostaxi.site

1. Desktop, open /about. Expected: a charcoal CONTACT button bottom-right.
2. Click it. Expected: a white card "Talk to a person" with WhatsApp, Call us +41 79 626 70 82, Email info@vamostaxi.site, Send us a message; the button reads CLOSE.
3. Press Esc. Expected: the card closes and the button keeps the keyboard focus ring.
4. Switch the language to Deutsch. Expected: KONTAKT; open it: "Sprechen Sie mit einem Menschen", "Kontaktformular" under the last row.
5. Phone, open vamostaxi.site (first visit). Expected: the cookie card alone, no contact disc. Tap NECESSARY ONLY. Expected: the round charcoal disc appears bottom-right.
6. Tap the disc. Expected: a sheet from the bottom with the four rows. Tap Call us. Expected: the phone offers to dial +41 79 626 70 82.
7. Phone, home, tap "Where to?". Expected: the booking sheet opens and the disc is gone; close the sheet, the disc is back.
8. Phone, get a quote and continue to /checkout. Expected: the bottom bar reads Total · (speech bubble) · PAY; nothing floats over the form; tap the bubble, the sheet opens.
9. Phone, tap a field on /checkout or /contact. Expected: with the keyboard up, no floating disc.
10. Phone, switch to العربية on /about. Expected: the disc at bottom-left; on /checkout the bar reads PAY · bubble · Total from left to right.
11. Open /terms, /sign-in, /coming-soon, /confirmation link from an email. Expected: the button on each.
