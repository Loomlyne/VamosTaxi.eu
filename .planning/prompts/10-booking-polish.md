You run the booking polish job for Vamos Taxi.

Read `.planning/prompts/00-common-rules.md` on main first and follow it.

Folder `/Users/koss/Developer/vamos-wt/booking-polish`, branch `fix/booking-polish`, cut from
origin/main. Five small items, two hand-overs.

HAND-OVER 1: THE DISTANCE (owner request, 2026-09-30 16:30)
His words: in the booking flow, after he chooses From and To, later on checkout or anywhere he
does not see how many km the trip is, especially on the phone.
Found by the control session on main: `/checkout` shows no distance at all. Only the booking
voucher does (`components/booking/BookingVoucher.tsx`, message key `distanceKm`, "{km} km").
The quote already carries the distance from the server.
- Show the trip distance on `/checkout` next to the route, at every width, and on the home
  class cards once prices are shown, if it fits the signed card layout E without changing it.
  The number is the server's quote distance, never computed in the browser, shown as the
  design system writes figures ("18.4 km").
- Pictures first: 390, 768, 1024, 1440, English, German, Arabic. His signature, then code.
- Say in the note every other place a customer sees a trip and whether it shows the distance:
  confirmation, manage booking, account booking list and detail, the e-mails. Do not change
  them here; he decides.

HAND-OVER 2: FOUR SMALL ITEMS (owner, 16:30: "I don't know those, you decide"; decided by the
control session)
1. German class card: "Koffer", as in the picture he signed, not "Gepäckstücke". Check French
   and Arabic against the signed pictures too.
2. SELECT on the home class card is 44 px high; primary booking buttons are 54 px by the
   project rule. Make it 54 if the signed layout E holds; if it does not fit, show him one
   picture and ask.
3. The empty dark band of about 400 px under the footer on the phone home page goes.
4. Safari: a Back pressed within a second after closing the phone booking page with the X does
   nothing. Test first, red before.

FILES
`app/home/home.dc.html`, `app/home/BookingSheet.dc.html`, `apps/web/app/[locale]/checkout/*`,
`components/transfer/*`, the dictionary and the message files. Other jobs near you: native
scrolling (removes Lenis from every mock, ships before you; merge main after it), Phase 27 (adds
the cookie banner mount to checkout and the mocks), 26.2 extras (tick boxes on checkout). Main
wins a conflict. After any spec that starts `next dev`: remove `apps/web/.next-*` and restore
`apps/web/tsconfig.json` and `apps/web/next-env.d.ts`.

Hand-over 1 touches checkout, so the owner's 4242 payment is its first UAT step.
