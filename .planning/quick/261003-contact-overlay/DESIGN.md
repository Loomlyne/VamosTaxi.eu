# Contact overlay: redesign (design only, waiting for the owner's signature)

Job: design session, branch `design/contact-overlay`, 2026-10-03.
Owner's request (question form, about 01:55 +04): "let fullllllyyyyyyy redeign that overley button from scratch and fix it how it shows across mobile and desktop let me see it and apply at across all pages".

No production code in this job. The sketches are throwaway HTML that load the real design system (`design-system/styles.css` with `laws.css`, `_ds_bundle.js`) and compose `Button`, `IconButton`, `Icon` and `Logo`. The backdrops are read-only screenshots of vamostaxi.site (GET only). The current V button and the cookie card were removed from those pages in the browser, client-side. Nothing was submitted and no consent was recorded.

## 1. The problem

On a phone, the round yellow "V" contact button sits on top of the PAY button at the bottom of /checkout. Measured at 390 px: the V is at y 732–788 and the pay bar at y 737–812, so 51 of its 56 px overlap the bar. It is the same in Arabic, where both sit at the left.

## 2. What is live today

Signing sheet: `screens/sheet-now.png`. Single shots are in `screens/raw/now-*.png`.

1. **The V button is only on the Next.js pages.** Those are /checkout, /checkout/details, /checkout/trip, /checkout/payment, /checkout/pay/[token], /confirmation/[ref], /sign-up, /review and the error pages (`SiteShell.tsx` mounts `ContactFab.tsx`). The 18 public pages served from the `.dc.html` mocks have **no contact button at all**: home, about, contact, faq, terms, privacy, cookies, cancellation, imprint, sign-in, sign-in/confirm, reset-password, manage-booking, booking-detail, account, bookings, sitemap and coming-soon. The comment in `SiteHeader.dc.html` (line 49) says "Public contact is the FAB", which is true on none of them.
2. **It covers PAY on phones and tablets.** The pay bar is sticky at 1080 px and below. The button sits 24 px from the corner and does not know the bar exists.
3. **With the cookie card open, both float.** `--vt-ck-reserve` lifts the pay bar and the V to mid-screen (y 266–346), and both stay on top of the form.
4. **The menu rows pick up the site's yellow link underline** on desktop (`now-checkout-1440-open.png`). That is a tinted accent line nobody designed.
5. **There is no Call row.** The menu has Email, Contact and WhatsApp, and the WhatsApp row uses the phone icon.
6. **There is no visible keyboard focus.** `:focus-visible` sets `box-shadow:none`, which breaks design system §3 ("focus is always visible").
7. **The V mark is mirrored in Arabic**, in the button and in the header logo. Brand artwork should never flip. The header half is outside this job; it is noted here for the controller.
8. The button turns 90° when it opens. Design system §3 says "nothing springs". It is minor, but it goes in the redesign.

### Everything at the bottom of the screen the overlay can meet

| Element | Where | File |
|---|---|---|
| PAY bar (sticky, 1080 px and below) | /checkout, /checkout/details, /checkout/payment | `apps/web/app/[locale]/checkout/sections/SummaryRail.tsx`, `checkout.css` `.vt-co__bar` |
| Cookie card (phone: full width at the bottom; sets `--vt-ck-reserve`) | every DC page and every Next page | `app/{home,pages}/CookieBanner.dc.html`, `apps/web/components/consent/CookieBanner.tsx` |
| "Where to?" card in the hero (bottom 120 px of the first phone screen) | home | `app/home/home.dc.html` |
| Phone booking sheet (full screen) | home | `app/home/BookingSheet.dc.html` |
| Travellers sheet (`[data-trav-shell]`, fixed, full screen) | home | `app/home/home.dc.html` |
| On-screen keyboard while a field is focused | every form | none (browser) |
| Footer (end of page, not fixed) | every page | `SiteFooter` |

There is no clash with the sticky rails on booking-detail, manage-booking and account: they stick to the top (`top:96px`). The review "jump" panels on sign-in and bookings are switched off in production (`showJumper:false`). Ops is excluded.

## 3. The shared part: the menu and its rules

All three directions open the same menu. Only the button and where it sits change.

**Menu.** Kicker `CONTACT`, title "Talk to a person" (the /contact page's own headline), then four rows in this order:

| Row | Icon (vendored Lucide) | Title | Second line | Link |
|---|---|---|---|---|
| 1 | `message-circle`, ends with `external-link` | WhatsApp | +41 79 626 70 82 | `https://wa.me/41796267082` (new tab) |
| 2 | `phone` | Call us | +41 79 626 70 82 | `tel:+41796267082` |
| 3 | `mail` | Email | info@vamostaxi.site | `mailto:info@vamostaxi.site` |
| 4 | `file-text`, ends with `chevron-right` | Send us a message | Contact form | `/contact` (with the language prefix) |

**`ContactRow`: a new component, because it repeats four times.** It cannot be the kit's `ListRow`: that one paints the banned yellow-50 tile with a yellow-700 glyph and renders a `<button>`, not a link. It is built from tokens: 60 px tall (64 px in the phone sheet), a 40 px `--vt-grey-100` lead circle with a charcoal icon, a semibold title, and a muted 13 px second line. The number and the address sit in `.vt-dir-keep`. It has no underline. States: hover `--vt-grey-50` · press `--vt-grey-100` plus `translateY(1px)`, with the lead turning white · focus `--vt-ring` · there is no disabled state, because the channels are always there. Pictures: the "States" block on every sheet.

**How the menu opens.**
- Desktop and tablet: a white card, 344 px wide, with `--vt-radius-lg`, a `--vt-border-subtle` hairline and `--vt-shadow-xl`. It is anchored to the button and opens 12 px above it.
- Phone (680 px and below): a bottom sheet with `--vt-radius-xl` top corners, a grab bar, a 44 px close `IconButton` and the `--vt-bg-scrim` behind it. It covers PAY on purpose while it is open.
- It closes on: tapping the scrim or outside, Esc, the close button, or following a link.
- Accessibility: the button has `aria-expanded` and `aria-controls`. The sheet is a `dialog` with a focus trap, and focus goes back to the button when it closes. The desktop card is a `menu` you can move through with the arrow keys.
- Motion: it fades and rises 8 px over 200 ms (sheets take 320 ms). It does not rotate or scale. Under reduced motion it appears with no animation. It is hidden when printing.

**Rules for hiding the button (all directions):**
- It is hidden while the phone booking sheet or the travellers sheet is open.
- It is hidden while a text field has focus on a phone, because the keyboard is up.
- On the home page on a phone, it is hidden until the "Where to?" card has scrolled out of view.
- It is never shown on ops or on the dashboard host.

Each of these is a data attribute on `<html>` that the owning component sets. An IntersectionObserver handles the hero card. No scroll handler and no custom property is written from a scroll event (CLAUDE.md, "Scrolling is native").

**Copy, in four languages.** All but three strings already exist in `app/vamos-i18n-dict.js`. The number and the address are not translated.

| English | de | fr | ar | In the dictionary? |
|---|---|---|---|---|
| Contact | Kontakt | Contact | اتصل بنا | yes |
| Talk to a person | Sprechen Sie mit einem Menschen | Parlez à une personne | تحدّث إلى شخص حقيقي | yes |
| WhatsApp | WhatsApp | WhatsApp | WhatsApp | yes |
| Call us | Rufen Sie uns an | Appelez-nous | اتصل بنا | yes |
| Email | E-Mail | E-mail | البريد الإلكتروني | yes |
| Send us a message | Schreiben Sie uns | Envoyez-nous un message | أرسل لنا رسالة | yes |
| Close | Schliessen | Fermer | إغلاق | yes |
| Contact form | Kontaktformular | Formulaire de contact | نموذج التواصل | **new** |
| Open contact options (aria) | Kontaktoptionen öffnen | Ouvrir les options de contact | فتح خيارات التواصل | **new** |
| Close contact options (aria) | Kontaktoptionen schliessen | Fermer les options de contact | إغلاق خيارات التواصل | **new** |

The Next twin needs the same keys in `apps/web/i18n/messages/{en,de,fr,ar}.json`. Its `common.contact`, `common.email`, `common.whatsapp` and `common.close` exist. Call us, Talk to a person, Send us a message, Contact form and the two aria labels are new there. After adding them, run `db:seed:gen`.

Note: in Arabic, "Contact" and "Call us" both read اتصل بنا. That is fine in the menu, where the number sits under "Call us". Direction B puts "Contact" on its button and shows only the icon on phones, so the two never sit side by side there.

## 4. The three directions

Each sheet shows closed and open at 1440 and 390, /checkout with the pay bar at 390, the cookie card case, Arabic at 390, German at 1440, tablet /checkout at 768, and the states. Single frames are in `screens/frames/<A|B|C>-*.png`.

### A · Mark disc: `screens/sheet-A.png`

A 56 px charcoal disc carrying the white Vamos mark, with a 1 px white-14 % inner hairline and `--vt-shadow-lg`. The mark is never mirrored. Open, the mark becomes a white `x`. Hover is charcoal-800, press is charcoal-950 plus 1 px down, and focus is `--vt-ring`. It sits 24 px from the corner on desktop and 16 px on a phone. **When a bottom bar is on screen, it lifts 12 px above it.** Every bar publishes its height in one shared reserve, which also covers the cookie card. While the cookie card is open on a phone, it steps aside (hidden). In Arabic it sits bottom-left.

*Trade-off:* it is the smallest change and keeps the brand mark. But the mark does not say "contact", and on /checkout the lifted disc still floats over the form above the PAY bar ("Choose your class" in the picture). That is better than covering PAY, but it is still on top of content.

### B · Labelled button that docks into the pay bar: `screens/sheet-B.png`

On desktop and tablet pages with no bottom bar, a charcoal `Button` (secondary, lg, 54 px) shows a yellow `message-circle` and the label **CONTACT**. Open, it reads **CLOSE** with a yellow `x`. On a phone it is a 54 px charcoal disc with the yellow icon.

**On any page with a bottom bar (/checkout at 1080 px and below), the floating button is not drawn at all.** Instead the bar gains a 54 px outline `IconButton` (white with a hairline) between Total and PAY: `Total · [contact] · [PAY]`. PAY keeps its full height and stays the only yellow thing in the bar. With the cookie card open, the contact button rides inside the lifted bar, so nothing extra floats. In Arabic the bar mirrors: PAY at the left, contact beside it, Total at the right.

*Trade-off:* on the page that matters most, nothing floats, so nothing can ever cover PAY. The label says what the button does, in four languages: KONTAKT, CONTACT, اتصل بنا. The cost is one change to the checkout pay bar (React only, because checkout is a Next page) and a PAY button about 12 px narrower at 390.

### C · Edge tab: `screens/sheet-C.png`

A charcoal tab, 56 px tall, attached to the inline-end edge of the screen, rounded only on its inner side. On desktop it shows the yellow icon and **CONTACT** at mid-height. On a phone it is a 48 px icon-only tab at 56 % of the screen height. The menu opens beside it on desktop and as the bottom sheet on a phone. It never meets a bottom bar, so it needs no knowledge of the bars. While the cookie card is open on a phone, it steps aside.

*Trade-off:* it has the fewest moving parts. But mid-screen it sits over content. On /checkout at 390 it covers the end of the Bags stepper (+) while you scroll, and an edge tab reads less like a premium car service than a support widget.

## 5. Recommendation: B

B is the only direction where the PAY collision cannot happen by construction. The contact button lives inside the bar, so there is no reserve to keep in sync and no layer to stack. Everywhere else it is a plain labelled button from the kit. A labelled button is also clearer for a traveller at an airport than a logo disc. The phone disc keeps the bottom corner light on content pages. The extra cost over A is one slot in the checkout pay bar, which is a single component (`SummaryRail.tsx`).

## 6. What the build changes (after signature)

**DC mocks (live public pages):**
- NEW `app/pages/ContactFab.dc.html` and twin `app/home/ContactFab.dc.html` (the same pattern as `CookieBanner`, `SiteHeader` and `SiteFooter`, which exist in both folders). Props: `variant` (`float` | `docked`), `open`, `lang`. It includes the states gallery while it is in review.
- NEW `app/pages/ContactRow.dc.html` and twin `app/home/ContactRow.dc.html`.
- Mount `<dc-import name="ContactFab">` next to `<dc-import name="CookieBanner">` on all 18 pages that carry it: `app/home/home.dc.html` and `app/pages/{about, account, bookings, booking-detail, cancellation, coming-soon, cookies, contact, imprint, faq, privacy, reset-password, sitemap, sign-in-confirm, manage-booking, terms, sign-in}.dc.html`.
- `app/vamos-i18n-dict.js`: the three new strings.
- `app/home/home.dc.html`: an IntersectionObserver flag for "hero card in view", and the travellers-sheet open flag.
- `app/home/BookingSheet.dc.html`: an open flag next to the existing `overflow='hidden'` (line 356).
- `app/{home,pages}/CookieBanner.dc.html`: a "banner open" flag on `<html>`.
- `app/{home,pages}/SiteHeader.dc.html`: correct the line-49 comment.
- `scripts/sync-dc-mock-to-public.mjs`: confirm that the two new component files are copied (the page list is explicit).

**React twin (Next pages: checkout, confirmation, sign-up, review, errors):**
- Rewrite `apps/web/components/shell/ContactFab.tsx` and `ContactFab.css`. Add `ContactRow.tsx` in the same folder and export it from `shell/index.ts`.
- `apps/web/components/shell/SiteShell.tsx`: unchanged mount. It hides the float when a docked bar is present.
- `apps/web/app/[locale]/checkout/sections/SummaryRail.tsx`, `checkout.css` (`.vt-co__bar`) and `apps/web/components/checkout/checkout-parts.css`: the docked contact slot.
- `apps/web/components/consent/CookieBanner.tsx`: the open flag.
- `apps/web/lib/contact-channels.ts`: already has `PHONE_HREF` and `WHATSAPP_HREF`. No change.
- `apps/web/i18n/messages/{en,de,fr,ar}.json`: the new keys, then `db:seed:gen`.
- Tests to update:
  - `apps/web/components/consent/reserve-and-footer.test.ts` pins `calc(24px + var(--vt-ck-reserve, 0px))`.
  - `apps/web/components/consent/banner-hosts.test.ts` mocks ContactFab.
  - `apps/web/lib/checkout/checkout-comments.test.ts` expects ContactFab in the shell.
  - `apps/web/app/[locale]/confirmation/[ref]/confirmation.css` (the print comment).
- Proof before hand-over:
  - A Chromium run on the local Worker at 1440, 1024, 768 and 390, in en, de, fr and ar.
  - `VamosLocale.coverage()` returns empty on the DC pages.
  - No horizontal scroll at 390.
  - Because the pay bar changes, a 4242 test payment after deploy (rule 8).

## 7. Questions for the owner (question form, one decision each)

1. **Which contact button do you want on every page?**
   Recommended: **B, a labelled CONTACT button that sits inside the PAY bar on /checkout**. Example: on a phone at vamostaxi.site/checkout the bottom bar reads "Total · (speech-bubble button) · PAY", and nothing floats over the form.
   Other choices: A, the round V disc that lifts above the PAY bar. C, the tab on the side edge of the screen.
2. **Which four ways to reach you should the menu show, in this order: WhatsApp, Call us, Email, Send us a message?**
   Recommended: **yes, all four, in that order**. Example: tapping "Call us" on a phone dials +41 79 626 70 82 straight away. Today's menu has no Call row.
3. **On the home page on a phone, should the button wait until the "Where to?" card has scrolled away?**
   Recommended: **yes, wait**. Example: when you open vamostaxi.site on a phone, the first screen shows only the photo, the headline and "Where to?". The contact button appears once you scroll down.
4. **While the cookie card is open on a phone, should the contact button step aside?**
   Recommended: **yes, step aside** (with B it stays inside the PAY bar on /checkout). Example: on a first visit to /about on a phone you see the cookie card alone, and the button appears after you choose.
