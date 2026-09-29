You finish quick task 26.4.2, the owner's booking feedback, for Vamos Taxi.

Read `.planning/prompts/00-common-rules.md` on main first and follow it.

YOUR JOB
Take over branch `fix/26.4.2-booking-feedback` in `/Users/koss/Developer/vamos-wt/fix-26.4.2`.
An earlier session built most of it and leaves
`.planning/quick/260930-obf-owner-booking-feedback/SESSION-HANDOFF.md` on that branch. Read it,
then `OWNER-DECISIONS-2026-09-30.md`, `PLAN.md`, `HANDOVER.md` and `SUMMARY.md` beside it.
If SESSION-HANDOFF.md is missing, tell the control session and wait.

WHAT THE OWNER DECIDED
- Field order everywhere: Flight number, From, To, When, Travellers. The flight field is hidden
  until From is an airport, then appears in front of From, focus moves into it, a screen reader
  announces it, Tab order equals the visual order in LTR and RTL.
- Phone and tablet: one page, no steps. Date, then time below it. Our own picker, never the
  phone's.
- Laptop: the wide bar is signed. The address list opens upward when there is no room below.
  The bar keeps its height when the flight field appears.
- "Choose your class" on the laptop home shows from page load with a photo on every card and
  becomes selectable once the bar is filled. Before that: no price, no "from", no placeholder
  number; the card says "Fill in the trip to see prices". Prices come only from the server quote.
- Class cards carry a photo on the laptop home and in checkout section 1 at every width. The
  photo is the one uploaded for that class in the dashboard. All three active classes have one
  (PNG uploads). A class without a photo shows the design-system empty state; the card keeps
  its height.
- The date reads in en, de, fr, ar.
- A pasted checkout link carries trip, class and extras only.

STILL OPEN
1. Finish the class cards with photos on both surfaces. State the served size of each photo in
   the hand-over; if one is heavy, put the choice to the owner (he uploads smaller, or the site
   serves a smaller version).
2. Bug: `apps/web/app/[locale]/checkout/CheckoutForm.tsx`, `flightBlur`. When the re-sign answers
   with a challenge nothing is shown and the price stays on "Updating price". Mount the page
   challenge, re-sign once after it is solved. The 26.0 test checkout-pay-19 (flight-edit case)
   must go green.
3. Run WebKit and Firefox at 1081, 1280, 1360 and 1440. Name the oldest browser `:has()` supports.
4. Show the owner the class cards and the phone page as pictures at 390, 768 and 1440. He signs
   both. Then hand over.

Phase 26.5 starts from main after this has shipped. Do not start it.
