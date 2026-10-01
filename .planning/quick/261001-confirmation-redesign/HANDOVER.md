# Hand-over: booking confirmation page redesign (2026-10-01)

Branch `claude/project-thread-wmr715` (cut from the plan branch `claude/project-thread-ii4fuh`,
which is main `9ef6df61` plus the signed decision, plan and pictures).
Code commit: `0ce96336`. Merge of origin/main `ea75a7b7`: `247a5f12` (no conflict).
Gate fixes after the merge: `0ee3e417`. This hand-over is the commit after that.

No migration. No setting. No API route changed. One Worker (`vamos`); the dashboard gateway is untouched.

## What changed

- `/confirmation/VT-…` booked page as signed (`screens/proposed-en-*.png`): disc and BOOKED badge in one
  row, heading, reference and e-mail line; trip card with route, four labelled facts
  (When, Travellers, Class, Flight number) and the money rows; two buttons, MANAGE BOOKING (yellow) and
  DOWNLOAD VOUCHER (charcoal, prints); the hint line; "What happens next" with three steps; the help line
  with phone and WhatsApp links; BOOK ANOTHER TRANSFER.
- Removed from the page: Cancel booking and its dialog, Request time change, Save flight number, the two
  alerts, the phone/WhatsApp button row, the "By continuing you accept…" line, the repeated "Booked" kicker.
- MANAGE BOOKING goes to `/manage-booking` when the page read the booking through the guest cookie
  (`vt_manage`), which opens that booking straight away. It goes to `/booking-detail?ref=VT-…` when the
  page read it through a signed-in customer's session only (an older trip opened from the account list,
  where the cookie can belong to another booking). `apps/web/lib/checkout/confirmation-manage-href.ts`.
- Cancelled, refunded, completed: own heading kept, the same two buttons, no hint, no steps.
  Unpaid: FINISH PAYMENT alone (Manage booking refuses unpaid bookings and there is no voucher yet).
- Free-cancel hours come from settings; if settings cannot be read, the number is a `data-tok`
  "free cancel window TBC" gap.
- Print (DOWNLOAD VOUCHER): heading, reference and the trip card with prices only
  (`screens/built-print-en-1440.png`).
- New lines under `checkout` in en/de/fr/ar: `nextAssignTitle`, `nextAssignBody`, `nextReminderTitle`,
  `nextReminderBody`, `nextCancelTitle`, `nextCancelBody`, `manageHint`, `helpLine`. English is the
  approved text word for word (the unit test reads it from the decision file). German (Swiss, "ss"),
  French and Arabic are drafts for you to read at UAT. Old keys untouched.
- `packages/db/supabase/seed.sql` regenerated (local seed only: the 8 new lines; not the live database).

Pictures of the build: `screens/built-en-1440.png`, `built-en-390.png`, `built-de-768.png`,
`built-fr-1024.png`, `built-ar-1440.png`, `built-ar-390.png`, `built-print-en-1440.png`.
They are local renders without a database, so the date shows as 2026-10-12, Class and Flight are absent
and the hours show the TBC gap; on live they show the real date, class, flight and hours.

## Checks (run once on `0ee3e417`, after the merge)

| Check | Result |
|---|---|
| pnpm typecheck | pass |
| pnpm lint | pass |
| pnpm lint:css | pass (after `0ee3e417`: logical border property) |
| pnpm i18n:check | pass, 2684 keys (after `0ee3e417`: reminder line's fixed "24" listed in `$meta.noParamKeys`) |
| pnpm check:legal-claims | pass |
| pnpm check:numbers | pass |
| pnpm check:public-env | pass |
| pnpm check:db-fences | pass |
| pnpm db:seed:check | pass (after `0ee3e417`: seed regenerated) |
| pnpm test:unit | pass: web 3450 passed, 5 skipped; emails 165; db 14 |
| pnpm build | pass |
| New unit test `components/checkout/confirmation-booked.test.tsx` | 10/10: two buttons, no time/flight/cancel, approved English verbatim, hours from settings and TBC gap, de/fr/ar have no missing line, unpaid and cancelled states, the three Manage booking links |
| Visual `tests/visual/confirmation.spec.ts` (Mac) | pass; the four `booked-en-*` pictures refreshed, the loading and "payment received" pictures unchanged |
| Rendered at 1440, 1024, 768, 390 in en, de, fr, ar | 16 renders: nothing scrolls sideways, buttons 54 px, Arabic right to left, three steps, no time/flight form |

## Not verified

- No payment was made and nothing ran against the live database or Stripe. The page was only rendered
  locally without bookings data (facts from the browser draft).
- MANAGE BOOKING opening the guest's booking was proven from the code path (`/api/manage/booking`
  reads the `vt_manage` cookie; the manage page loads it without the lookup form), not by a click on live.
- The signed-in path (`/booking-detail?ref=`) was not clicked; it uses the existing account read.
- The German, French and Arabic drafts are not approved yet.
- Linux visual pictures were not regenerated (the spec only has Mac pictures).

## Your test steps (after the ship)

1. On vamostaxi.site, book any trip as a guest and pay with card 4242 4242 4242 4242, any future date, any CVC.
   Expected: after the short loading screen, the new page: BOOKED badge, "You're booked, <your first name>.",
   the trip card, two buttons, the line under them, three steps, the help line.
2. Press MANAGE BOOKING.
   Expected: your booking opens straight away (no "Open your booking" form), with time, flight and cancel there.
3. Go back and press DOWNLOAD VOUCHER.
   Expected: the print window shows the heading, reference and trip card with prices only.
4. Switch the language to Deutsch, then Français, then العربية.
   Expected: every line is translated; Arabic reads right to left. Tell me any wording you want changed.
5. On your phone, open the same page and scroll to the end.
   Expected: nothing scrolls sideways; the two buttons are stacked full width; after scrolling a little,
   the round V button covers no button.
6. Sign in, open Your bookings, open an older paid trip, press MANAGE BOOKING.
   Expected: that trip (not your newest one) opens.
