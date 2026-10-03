# Job E audit — public pages vs home sections (2026-10-03)

Not in scope: legal text pages (terms, privacy, cookies, cancellation, imprint), checkout, confirmation, account, auth pages, manage-booking, bookings, booking-detail, coming-soon, sitemap (link list). None of them shows a home-type section.

| Page | Section | What it was | Plan / result |
|---|---|---|---|
| faq | FAQ list (3 groups, 7 cards, 3-col grid, yellow circle) | own old design | DONE: new home FAQ (topics rail + open card) through `FaqSection` with prop `full` (page-only questions added, counts 6/5/3/5). |
| faq | "Included at the airport" meet & greet card | duplicate of AirportMeet | DONE: replaced by home `AirportMeet`. |
| faq | Reviews | absent | DONE: home `Reviews` above the "Still not answered?" band. |
| faq | "Still not answered?" band | page-specific (Manage a booking / Contact) | KEPT: not the home closing band (that one books a ride). |
| about | "Four things we will hold to" (4 icon cards, yellow-700 icons) | same kind as TrustFacts | DONE: home `TrustFacts`. Page copy removed; flight tracking now lives in AirportMeet, price/cancel in TrustFacts. |
| about | "Three classes" (text table + one photo + review image slots) | same kind as VehicleClasses | DONE: home `VehicleClasses`. "Price this class" has no #book here, so the page listens to `vamos:class-pick` and opens `home#book`. |
| about | "Where we drive" (3 cards + client-input slot) | same kind as WhereWeDrive | DONE: home `WhereWeDrive`; `vamos:dest-pick` is marked handled and opens `home#book` (no prefill). |
| about | Reviews | absent | DONE: home `Reviews` above the closing band. |
| about | Founder story, "Our drivers" dark panel | unique | KEPT. |
| about | "Ride with class" CTA band | same kind as ClosingCta | KEPT: home `ClosingCta` hard-codes `#book` / scroll; needs a book-link prop first (not my file). |
| contact | FAQ (4 questions, own accordion + script) | same kind as home FAQ | DONE: home FAQ (`FaqSection`, home set); own CSS and script removed. |
| contact | Reviews | absent | DONE. |
| contact | WhatsApp row | Lucide message-circle | DONE: `assets/social/whatsapp.svg` in a white tile. |
| contact | "Already have a booking?" band, form, direct channels | unique | KEPT. |

Open points for the lead
- Case-insensitive checkout: `app/pages/FAQ.dc.html` cannot sit beside `faq.dc.html` (same file on macOS). The twin is `app/pages/FaqSection.dc.html` = byte copy of `app/home/FAQ.dc.html`. Re-copy after any change to the home file (also Reviews, AirportMeet, TrustFacts, VehicleClasses, WhereWeDrive copies in app/pages; I copied them as they were at ~20:xx, jobs B/D still edit AirportMeet/Reviews).
- Home FAQ differs from before only by the WhatsApp mark (original logo) and the topic counts now render inside an inline span (`sc-interp`); no visual change.
- Tests: `apps/web/tests/visual/faq.spec.ts` rewritten for the new design (4 tests changed/added); its screenshot baselines (faq-*.png, about-*.png, contact-*.png) are stale and must be regenerated. Not run (needs next dev + Playwright browser; the shared browser cache lost the pinned version while I worked).
