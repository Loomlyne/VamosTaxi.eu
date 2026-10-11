# Vehicle class lifecycle — discuss decisions (2026-10-11)

Source prompt: `.planning/prompts/12-fleet-lifecycle-discuss.md`. Signed by Koss in the question form, one decision per question.

**The word is "class", never "fleet".** Koss, verbatim intent: "I am not Uber. I have 3 types of cars (classes) and chauffeurs. A customer books a class, I filter the chauffeurs by that class, contact them, and that goes to the client. Simple."

## Facts found (live, read-only, 2026-10-11)

- Live price book is `ops-draft-from-21` (published 2026-10-08, labelled "placeholder, not owner-approved"), not version 18 as the prompt says. It holds rows for the 3 live classes only.
- The 5 old classes (`business`, `economy`, `first`, `van`, `mahaha`) are `active=false`, `hidden_at` null, and appear only in retired price books (last: `ops-draft-from-14`).
- Classes are managed on the dashboard Pricing page (`app/ops/OpsPricing.dc.html`). Delete (`:879-910` → `DELETE /api/staff/vehicle-classes` → `ops_vehicle_class_delete_or_hide`): an in-use class opens a hide dialog and is hidden; there is no unhide anywhere.
- `cloneRateVersionFrom` (`apps/web/lib/ops/rate-book.ts:691-798`) copies every class's rows forward with no `active`/`hidden_at` filter.
- Older price-book labels grew a repeated " draft" suffix on each copy (seen up to `ops-draft-from-17`).
- "Fleet" survives in the dashboard: route `/fleet/chauffeurs`, component `OpsFleet.dc.html` (copy at :146, :160 still talks about vehicles leaving "the fleet"), `OpsSoon.dc.html:32`, dict `vamos-i18n-dict.js:586`.

## Decisions

1. **Retire, never delete (from now on).** The action is "Retire": the class leaves the site, the new-trip form and every new price book, moves to a Retired list, and can be brought back. Past price books keep its rows. No hard delete from the UI, no error.
2. **States: Draft → Live → Retired.** A new class starts Draft (dashboard only, no customer sees it); "Go live" turns it on; Retired can come back as Live.
3. **Go-live list:** seats, bags and photo; a price row in the live price book.
   - 3a. **Name:** typed once in English, the same name used in en/de/fr/ar (D-14a, Latin everywhere). No translation service.
   - 3b. **Chauffeurs are not part of adding a class.** The link stays on the chauffeur side: each chauffeur has a class and a plate, the Assign screen filters chauffeurs by the booked class, and class and plate are sent to the customer when a chauffeur is assigned.
4. **New price books skip retired classes.** Draft and Live classes are copied; retired rows stay only in old books. A class brought back needs a new price before going live.
5. **Chauffeur on a retired class:** keeps the class (past trips still show class and plate); the chauffeur list says "Retired class: pick a new one" and that chauffeur cannot be assigned to a new booking until changed.
6. **The 5 old classes (business, economy, first, van, mahaha): removed for good, once**, because they were test data. Live check 2026-10-11: 0 booking legs, 0 price snapshots, 0 vehicles, 0 chauffeurs point at them; rows in retired price books: business 9/6/25, economy 7/6/25, first 9/6/20, van 10/6/25, mahaha 2/0/0 (distance rates / fixed routes / bands). Removal = one script Koss runs himself, after an `archive/*` tag of those rows on GitHub and a different-model check.
   - 6a. **Business goes too** ("its old one"). If wanted later, it is added fresh as a Draft.
   - 6b. **The 5 reviews (rv-1…rv-5) are deleted too** (test reviews). They are every review in the table, so the home Reviews section goes empty; `app/home/Reviews.dc.html` already renders nothing below 3 published rows. To check in the plan: whether the home trust bar reads anything from these rows.
7. **No fleet page.** Classes stay on the Pricing page. Remove the word "fleet" from the dashboard (route, component name, copy, dict) and the leftover vehicle wording in the chauffeur screen.
   - 7a. **Pricing page class rows get states:** each row shows Live / Draft / Retired; "Delete" becomes "Retire"; a Retired list under the table has "Bring back"; a Draft row lists what is missing (photo, seats, bags, price) beside "Go live", which works only when nothing is missing. Nothing else on the page moves.
   - 7b. **Chauffeurs address:** `/chauffeurs`; `/fleet/chauffeurs` (and `/fleet`) forward there.
8. **Rules text:** the vehicle-classes and `mahaha` lines in `CLAUDE.local.md` are rewritten to this design (done 2026-10-11).

## Next

- GSD: add the phase (`/gsd-phase`), pictures through `/gsd-ui-phase` (Pricing class rows in Live/Draft/Retired, Draft checklist, Retired list, Retire dialog; 1440 and 390; en and ar), his signature, then `/gsd-plan-phase`.
- The one-off removal script (decision 6) is its own plan: archive tag, reviewer on Sonnet, Koss runs it.
