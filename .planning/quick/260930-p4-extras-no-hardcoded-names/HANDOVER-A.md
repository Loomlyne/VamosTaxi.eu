# P4 extras — hand-over, part A: the row decides, never the name

**To:** control session. **From:** 26.2 audit session, 2026-10-01.
**Folder:** `/Users/koss/Developer/vamos-wt/phase-26.2`, branch `gsd/26.2-p4-extras`, main merged in
(no conflict left; one resolved in `rate-versions/[id]/publish/route.ts`, both main's photo sweep and
this job's name prune kept). Folder clean. Not pushed, no deploy. The final commit is the one that adds
this file. Plan signed 2026-09-30; every screen change signed on pictures (below).

## What changes for the owner and the customer

| # | Before | After |
|---|---|---|
| 1 | An extra named "Ski" or "Waiting" could not be saved; "Night", "Weekend", "Holiday" saved but were never offered and blocked Publish | Every name saves as typed and is an ordinary tick box at the price he sets |
| 2 | The dashboard stored an extra's rule in a wrong form; the live child seat was a tick box only by accident of that | The rule is stored correctly ("chosen by the customer"); the old wrong form is read the same way, so the live child seat is unchanged |
| 3 | Name lists and renaming in the code (`lib/ops/surcharge-codes.ts`), leftover automatic-waiting code in the fare engine | Deleted |
| 4 | A deleted extra's four-language names stayed forever | Deleted once no live or draft book uses that extra (after delete, discard, publish) |
| 5 | Pricing > Extras: a "Type" column and old words about meet and greet, free wait, extra wait | Gone, four languages; the empty list says "Add an extra. Customers choose it at checkout." |
| 6 | Booking detail: an "Extra wait" tag (never visible on live) | Gone, with the query behind it |
| 7 | After Mark arrival nothing showed and Mark arrival stayed in the menu | "Arrived 08:40" shows; Mark arrival leaves the menu |
| 8 | Pricing > Extras showed the code "child-seat" | Shows "Child seat", or his German/French/Arabic name on those pages |
| 9 | Extras search said "Type or name" | "Search by name", four languages |

## Migration

`20261007110000_extra_labels_prune.sql` (number from the control session): new function
`staff_extra_labels_prune()`, admin only; deletes name rows of extras no live or draft book uses.
**Safe on real paid bookings:** no booking, payment or price row is touched; a booking keeps its
extras' names inside its own price record. pgTAP `extra_labels_prune.test.sql` 8/8.
**Order at ship:** apply the migration before the Worker deploy. If the Worker runs first, the prune
call fails, is logged and changes nothing (best effort); no write is undone.

## Checks on this branch, run once by the lead

typecheck, lint (5 old warnings), lint:css, i18n:check, check:numbers, check:db-fences,
check:public-env, check:legal-claims, seed:check, build: pass. Unit: web 2890 + 1 skipped, emails
151, db 13. From-zero replay of 119 migrations plus seed and pgTAP: 86 files, 1944 tests, **all pass**
(isolated stack `vamos-taxi-262`, stopped).
Run against a real Postgres with the Worker client options: the new write stores the rule as an
object; the old write stored the JSON string that live has (record, "Lead review").

## Not verified

- Nothing was clicked on the live dashboard; screens are proven by renders of the real dashboard
  shell with stubbed data (pictures) and by tests on the page scripts.
- The new German, French and Arabic words were read by no native speaker.
- Playwright suites and types:check were not run.
- One extra-rule write path (Save of an extra on Pricing) was proven on the stand-in and the
  Postgres run above, not through the Worker.

## Owner UAT (dashboard.vamostaxi.site, after the ship)

1. Pricing, open the draft (or the live book, which forks a draft). Add an extra named `Ski` with a price. **Expected:** it saves; the list shows "Ski" and the price; no Type column.
2. vamostaxi.site: book a trip; on /checkout, **Expected:** "Child seat" and "Ski" (once published) are tick boxes; the price rises only when ticked. Pay with 4242 4242 4242 4242. **Expected:** the confirmation lists the ticked extra.
3. Delete "Ski" in the draft, then Publish. **Expected:** it is gone from the Pricing list and from /checkout.
4. Pricing > Extras in German. **Expected:** "Nach Name suchen", your German names.
5. A paid booking: press Mark arrival. **Expected:** "Arrived HH:MM" shows; Mark arrival is no longer in the Action menu.

## For the class-photo job (you asked what changed in `rate-book/route.ts`)

Surcharge save only: imports (`checkoutExtraKindFromRappen` from `lib/ops/rappen`, `MANUAL_PREDICATE`
from `lib/pricing/types`, `pruneExtraLabels` from `lib/ops/rate-book`); `parseSurchargeInput` lost the
type-to-code mapping and the renaming; the surcharge update/insert is one update and one insert that
always write `predicate = tx.json({kind:"manual"})` and `quantity_source = null`; the `free_wait`
minutes write is gone; `surchargeTypeFromCode` and the payload's `type`/`hours` are gone; DELETE of a
surcharge calls `pruneExtraLabels` after its transaction. Class, distance and photo code untouched.

## Pictures signed by the owner

`screens/a5-sheet.png`, `a5-empty-sheet.png`, `a4-direct-sheet.png` (signed 2026-09-30),
`arrived-sheet.png`, `names-sheet.png` (signed 2026-10-01).

## Next in P4

Part D (remove the extra stop), then B (free extras "included") and C (a number per extra), each
with its own pictures and hand-over.
