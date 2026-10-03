# R2-5 remove ClosingCta from home

Coder steps (after signature):
1. app/home/home.dc.html line 597: delete `<dc-import name="ClosingCta" hint-size="100%,300px"></dc-import>` (and its blank line).
2. git rm app/home/ClosingCta.dc.html. No twin in app/pages (checked). No other page imports it. About keeps its own band.
3. app/vamos-i18n-dict.js ~2434-2435: delete S["Your driver is waiting."] and S["Fixed price, booked in under a minute."] (used only by ClosingCta).
   KEEP "Book a transfer" (SiteHeader, BookingBar, BookingSheet, bookings, sign-in, account, sitemap) and "WhatsApp us" (FAQ.dc.html, pages/FaqSection, ContactButton).
   KEEP the hero h1 "Land in Zurich. Your driver is waiting." (home.dc.html:862, key home.land-in-zurich-..., different string) and pattern /^Your driver is waiting at (.+)$/.
4. Planning docs: .planning/quick/261003-home-sections/PLAN.md row 11 and HANDOVER.md line 9 list the band; add a one-line "removed 2026-10-03 by owner" note (history; i18n/J3.js and sketch-home.js are archived work files, leave).
   .planning/quick/261003-site-polish/E-AUDIT.md row "about | Ride with class CTA band ... needs a book-link prop first" becomes moot (note it).
5. Run: node scripts/sync-dc-mock-to-public.mjs. apps/web/public/app/home/ClosingCta.dc.html is gitignored sync output; sync should drop it (verify it is gone, else rm).
6. Tests: no unit/visual/spec references ClosingCta or data-cta; home.spec.ts-snapshots (home-*-component-*) are full-page/section shots: check with grep/run home.spec.ts; regenerate only if it captures the page end.
