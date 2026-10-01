# Plan: booking confirmation page redesign (vamostaxi.site/confirmation/VT-…)

Owner request 2026-10-01: "not easy to use, not easy to see, and not easy to manage … a lot of
buttons and things on top of each other, and I couldn't do anything with this."
Design and wording signed: `.planning/decisions/2026-10-01-confirmation-page.md`.
Build runs on the owner's Mac (GSD, `CLAUDE.local.md`). No migration, no setting, no API change.

## What is wrong today (read on main `9ef6df61`)

- Cancel booking, Request time change, Save flight number call `/api/account/bookings/*`, which
  answer 401 without a signed-in account (`time-change/route.ts:27-28`, `paid-cancel/route.ts:40-41`).
  A guest who just paid is not signed in, so Cancel does nothing (`ConfirmationClient.tsx:551`
  returns silently) and the other two say "failed".
- The time and flight fields are bare browser inputs with the label text repeated on the button.
- Eight buttons stacked: Cancel, Request time change, Save flight number, Manage booking, Book another,
  phone, WhatsApp; plus a green tinted alert and a charcoal alert side by side.
- "Booked" twice (kicker and badge). Fact labels (When, Travellers, Class, Flight) do not show at 1440.
- "By continuing you accept the terms and the cancellation policy." after the payment is done.
- "What happens next" promises an e-mail the evening before and a reminder two hours before; the site
  sends `assignmentCustomer` and `reminder24h` only.

## Files (this job owns them)

| File | Change |
|---|---|
| `apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx` | Booked page (S4) as signed: head (disc + StatusBadge in one row, H1, reference and e-mail line; no kicker); trip card (RouteSummary, 2×2 labelled facts, PriceSummary, presentment line kept); action row MANAGE BOOKING (primary, `pencil`) + DOWNLOAD VOUCHER (secondary, `printer`, `window.print()`); hint line; "What happens next" card with three steps; help line with `tel:` and WhatsApp links; ghost "Book another transfer". Remove: the time/flight block (`data-time-change`), `requestTimeChange`, `saveFlightNumber`, the cancel slot, the cancel `Dialog` and `confirmPaidCancel`, `HelpRow`, both alerts, the legal line in `BookedCard`. Loading, failed, hidden, cancelled, refunded, completed and unpaid states keep their heads; they lose the same removed parts and get the same action row (Finish payment stays primary when unpaid). |
| `apps/web/app/[locale]/confirmation/[ref]/confirmation.css` | Layout for the above with logical properties only; 54 px buttons; `minmax(0,1fr)` 2-column facts; print rules hide header, footer, actions, help, ContactFab. Tokens only, no glow, no tint. |
| `apps/web/i18n/messages/{en,de,fr,ar}.json` | Append keys under `checkout`: `nextAssignTitle`, `nextAssignBody`, `nextReminderTitle`, `nextReminderBody`, `nextCancelTitle` (`{hours}`), `nextCancelBody`, `manageHint`, `helpLine` (rich: `<phone>`, `<wa>`). English verbatim from the decision file; de (Swiss, "ss"), fr, ar drafted. Old keys stay (append-only). |
| `apps/web/tests/…` | Unit test for the booked page: no `data-time-change`, no cancel button, exactly two action buttons, the three steps, hours from props, `data-tok` when hours are null. Update `tests/visual/confirmation.spec.ts` and any spec asserting the removed parts. |

## Checks before the hand-over

1. MANAGE BOOKING on /confirmation opens this booking directly for a guest (cookie `vt_manage`), not the
   lookup gate. If it opens the gate, pass the reference in the link; prove it with a test.
2. Laptop 1440, tablet 1024 and 768, phone 390, in en, de, fr, ar; nothing scrolls sideways at 390;
   Arabic right to left; `VamosLocale.coverage`-equivalent: no English left in de/fr/ar.
3. Print preview shows the trip card and prices only.
4. Full check set once, then merge origin/main and write `HANDOVER.md` here.

## Owner UAT (after the ship)

1. vamostaxi.site: book as a guest, pay with 4242 4242 4242 4242. Expected: the new page, two buttons, three steps.
2. Press MANAGE BOOKING. Expected: your booking opens, with time, flight and cancel there.
3. Press DOWNLOAD VOUCHER. Expected: a print view with the trip and prices only.
4. Switch to Deutsch, Français, العربية. Expected: every line translated, Arabic right to left.
5. Phone: nothing overlaps; the round contact button does not cover the buttons.
