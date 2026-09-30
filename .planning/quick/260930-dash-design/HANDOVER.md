# Dashboard design and Assign — hand-over

**To:** control session. **From:** 26.2 audit session, 2026-10-01.
**Folder:** `/Users/koss/Developer/vamos-wt/phase-26.2`, branch `gsd/26.2-dash-design`, main `58b68fc1`
merged in (one conflict in `scripts/db-access-fence-allowlist.json`: main's consent-reader entry and
this branch's assign.local entry both kept). Folder clean. Not pushed yet; no deploy. The final commit
is the one that adds this file. Full record and every owner answer: `DESIGN-DRAFT.md`.

## Signed by the owner (question form and pictures, 2026-09-30 / 2026-10-01)

| # | What | Pictures |
|---|---|---|
| 1 | Booking detail: one ACTIONS menu with every valid action, Cancel last in red; Refund inside it (opens the live refund box, which also stays visible on the page, his choice); Complete and No-show only once the pickup time has passed | `actions-sheet.png`, `followup-sheet.png`, `refund-merge-sheet.png` |
| 2 | Phone and tablet up to 1080 px: one short bar (48 px) with the page's ACTIONS; the page buttons folded into it (booking detail, Pricing Publish/Discard); Profile, Settings, Sign out in the drawer | `phone-sheet.png`, `followup-sheet.png` |
| 3 | Assign: no pop-up; the booking page lists the drivers with their car and one ASSIGN DRIVER button; refusals in plain words (no car; car of another class — refused, his rule) | `assign-sheet.png` |
| 4 | Driver form: Car field again (each driver has his own car), no Class field; wherever a driver's class shows, it is his car's class | `driver-car-sheet.png`, `followup-sheet.png` |
| 5 | Every edit box of the shared table editor: Delete as red text at the start, Cancel and Save at the end; phone: Save, Cancel, Delete stacked | `overlay-buttons-sheet.png` |

## Bug fixes inside

- Assign answered every refusal as a 500 ("Could not assign"): postgres.js `begin()` rethrows a caught
  error; the mapping now sits around the wrapper (record `.planning/quick/260930-dash-assign/DEBUG.md`).
- A car in a class the owner named himself showed as "Economy".
- The booking page threw on every update, so the scroll lock behind confirm boxes never worked.

## Migration, settings

None. The chauffeur's class column stays and is no longer written by the form.

## Checks on merge `94dffdfe` (+ the test update `1e1447c0`), run once by the lead

typecheck, lint (5 old warnings), lint:css, i18n:check, check:numbers, check:db-fences,
check:public-env, check:legal-claims, seed:check, build: pass. Unit: web 3228 + 3 skipped, emails 151,
db 14. From-zero replay (123 migrations + seed) and pgTAP 90 files / 2095 tests: all pass.
**`assign.local.test.ts` run on a real Postgres** (isolated stack, Worker client options): no-vehicle,
class-mismatch, assigned once the car is the trip's class, overlap on a clash — pass.

## Not verified

- No live click. Pictures are renders of the real dashboard shell with stubbed data.
- German, French and Arabic new words were read by no native speaker.
- Playwright, types:check not run.

## Owner UAT (dashboard.vamostaxi.site, after the ship)

1. Chauffeurs: open Marco (your driver), choose his Car, Save. **Expected:** the list shows the car's class; the edit box has Delete at the start, Cancel and Save at the end.
2. A paid booking of the same class as that car: Assign section, pick Marco, press ASSIGN DRIVER. **Expected:** assigned, no error.
3. A paid booking of another class: pick Marco. **Expected:** "This driver's car is … ; the trip is …", nothing assigned.
4. Booking detail: open ACTIONS. **Expected:** one menu; Complete and No-show only on a trip whose pickup time has passed; Cancel last in red.
5. On your phone: open a booking. **Expected:** one short bar with ACTIONS; the page's buttons are inside it.

## Next

The Cars page (add and edit cars) is its own job, design first (owner said yes, 2026-10-01). Then P1.
