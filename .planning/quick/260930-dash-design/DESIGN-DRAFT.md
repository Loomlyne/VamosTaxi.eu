---
status: signed 2026-10-01 (question form); follow-ups built — nothing pushed, nothing deployed
branch: gsd/26.2-dash-design (on top of gsd/26.2-dash-assign 0c83bdd0 / 455d04f8)
created: 2026-10-01
before: origin/main 316606ee (git archive) · after: this branch
---

# Dashboard design draft — Actions menu, compact phone bar, driver's car, Assign box

Owner decisions (question form, 2026-09-30 / 2026-10-01): (1) one Actions menu on booking detail;
(2) phone: compact bar, page buttons fold into its Actions; (3) each driver has his own car —
Car field on the chauffeur form, Assign asks only for the driver, refusals in plain words, a car of
another class than the trip is refused.

## What changed, per item

### 1 · Booking detail: one Actions menu — `app/ops/OpsDetail.dc.html`, new `app/ops/ActionsMenu.dc.html`
- The row Assign driver / Reassign, Unassign, Edit booking, the "Action" dropdown (Resend voucher,
  Mark arrival, Complete), No-show, Cancel — and the Refund button of a cancelled trip — is one
  `ACTIONS` button (charcoal pill, kit `Button` + chevron). "Back to bookings" stays as it was.
- The menu lists only what is valid for that booking, in this order: Assign driver / Reassign,
  Unassign, Edit booking, Resend voucher, Mark arrival, Complete, No-show, Refund, then — after a
  hairline — Cancel booking (Remove booking for an unpaid trip) in `--vt-danger`. No glow, no tint.
- Each item runs the handler its old button ran (`pickAction` → `confirmUnassign`, `openEdit`,
  `markNoShow`, `openCancel`, `markRefund` / `openRequested`, voucher / arrival / complete as before).
  "Assign driver" / "Reassign" scrolls to the Assign box and focuses the first driver.
- `ActionsMenu.dc.html` (new component, no Menu exists in the kit): props `label`, `items
  [{value,label,icon,tone:'danger',disabled}]`, `onPick`, `tone` light|inverse, `size` sm|md.
  States: closed, hover/press (kit Button), open, keyboard (arrows, Home, End, Escape back to the
  button, Tab closes), disabled item (42 %), no items (button disabled). Rows 44 px; the list is
  fixed to the viewport, lines up with the button's end edge in LTR and RTL, opens upward when
  there is no room.

### 2 · Phone: compact bar — `app/ops/ops.dc.html`, `app/vamos-ops-bar.js` (new), `app/ops/OpsSidebar.dc.html`, `app/ops/OpsPricing.dc.html`
- Bar (≤ 899 px, where the sidebar is a drawer): one 48 px row (was 56) — menu (44 px), the page
  title or the wordmark, and at phone width (≤ 767 px) one yellow `ACTIONS` button. Booking detail
  shows its reference (VT-26-0042), Pricing its title, every other page the wordmark.
- A screen hands its title and buttons to the bar through `window.VamosOpsBar`; at ≤ 767 px the
  screen's own buttons (wrapped in `[data-ops-fold]`) are hidden and the bar lists them.
  Booking detail: its Actions. Pricing: Publish fare book, then Discard draft (danger, last).
- The avatar left the bar; on phone and tablet the drawer now shows the profile row
  (Profile, Settings, Vamos Taxi site, Sign out) as the desktop rail does.
- 768–899 px (tablet) and desktop keep the page's own buttons; only item 1 changes there.

### 3a · Chauffeur form: Car — `app/ops/OpsFleet.dc.html`, `app/vamos-ops-data.js`
- New Car select (after Licence number): No car, then every fleet car as "Class · Model · Plate".
  Written to `chauffeurs.default_vehicle_id` through the existing path
  (`chauffeurWrite` → `/api/staff/chauffeurs[/id]` → `parseChauffeurBody` → `assertChauffeurInput`
  → `updateChauffeurRow` / `insertChauffeur`, which already write `default_vehicle_id`; staff has
  CRUD on `chauffeurs` per `20260823000023_rls_staff.sql`; covered by `fleet-http.test.ts` and
  `fleet-persist.test.ts`). No migration.
- "No car" now clears the car (before, the legacy `vehicle` key brought the old car back).
- A class the owner named reads his name: `cleanVehicle` keeps `vehicleClassId`, and the Car list
  and the Assign box name the class from `VamosOps.CLASSES` (rate book) before the D-14 fallback,
  which calls every unknown slug "Economy".

### 3b/3c · Assign box and refusals — `OpsDetail.dc.html`, `apps/web/lib/ops/assign.ts`, `assign-map.ts`, assign route
- No dialog. The Assignment section uses the same grid as Passenger & trip: Driver (and Car once
  assigned); under it, while there is no driver (or after Reassign), the drivers as kit `Radio`
  rows with their car under the name, and one primary `ASSIGN DRIVER` button (Cancel appears only
  when reassigning). List at most 560 px wide; full width at ≤ 520 px.
- The button is never disabled (a 42 % yellow reads as a cream pill, law 02): without a pick the
  box says "Pick a chauffeur first." and sends nothing.
- Refusals stay on the box in `--vt-danger` with a triangle icon, until the next pick (not a toast).
- Server: `assignBooking` reads the driver's car class and the trip leg's class (one narrow
  `asStaff` read, `loadAssignClassFacts`) before `ops_assign_leg`; a different class answers
  `class-mismatch` with both class names and writes nothing. A driver without a car is left to the
  RPC (`no-vehicle`). A failed read answers `unknown`, never a 500. The route maps `class-mismatch`
  to 409 with `carClass` / `tripClass`.

## New and changed strings (OpsDetail / OpsFleet / OpsPricing copy tables)

| key | en | de (Swiss) | fr | ar |
|---|---|---|---|---|
| actions | Actions | Aktionen | Actions | الإجراءات |
| noVehicle (changed) | Give this driver a car first: Chauffeurs, then the driver, then Car. | Geben Sie diesem Fahrer zuerst ein Auto: Chauffeure, dann den Fahrer, dann Auto. | Donnez d’abord une voiture à ce chauffeur : Chauffeurs, puis le chauffeur, puis Voiture. | أعطِ هذا السائق سيارة أولًا: السائقون، ثم السائق، ثم السيارة. |
| classMismatch | This driver’s car is {car}; the trip is {trip}. | Das Auto dieses Fahrers ist {car}; die Fahrt ist {trip}. | La voiture de ce chauffeur est {car} ; la course est {trip}. | سيارة هذا السائق من فئة {car}، والرحلة من فئة {trip}. |
| car / fCar | Car | Auto | Voiture | السيارة |
| noCarYet | No car yet | Noch kein Auto | Pas encore de voiture | لا سيارة بعد |
| noDrivers | No drivers yet. Add one on Chauffeurs. | Noch keine Fahrer. Unter Chauffeure hinzufügen. | Aucun chauffeur. Ajoutez-en un sous Chauffeurs. | لا يوجد سائقون بعد. أضف سائقًا من صفحة السائقين. |
| chooseDriver (aria) | Choose the driver | Fahrer wählen | Choisir le chauffeur | اختر السائق |
| noCar (Fleet) | No car | Kein Auto | Aucune voiture | بلا سيارة |
| hCar (Fleet hint) | The car this driver drives. Assign puts it on the trip. | Das Auto, das dieser Fahrer fährt. Beim Zuweisen kommt es auf die Fahrt. | La voiture que conduit ce chauffeur. L’attribution la met sur la course. | السيارة التي يقودها هذا السائق. عند الإسناد تُسجَّل على الرحلة. |

Menu labels reuse existing four-language strings (Assign driver, Reassign, Unassign, Edit booking,
Resend voucher, Mark arrival, Complete, No-show, Refund, Cancel booking / Remove booking,
Publish fare book, Discard draft, Pick a chauffeur first.). Class names stay Latin (D-14).

## Tests (tests first; the failing line before the change)

| file | before | after |
|---|---|---|
| apps/web/lib/ops/assign-class-check.test.ts (new) | 9 failed, 1 passed — `TypeError: assignClassRefusal is not a function`; `loadAssignClassFacts is not a function`; `expected '// apps/web/app/[locale]/(ops)/api/st…' to match /code === "class-mismatch"/` | 10 passed |
| apps/web/lib/ops/ops-dc-dash-design.test.ts (new) | first run 20 red (ActionsMenu and the store set aside): `expected [] to have a length of 1 but got +0` (one ActionsMenu in the bar); `Cannot read properties of undefined (reading 'map')` (actionItems); `expected undefined to be 'Actions'`; `expected '<!DOCTYPE html>…' to contain '<script src="../vamos-ops-bar.js"></script>'`; Car tests on the old OpsFleet: `expected undefined to be defined`, `…to match object { defaultVehicleId: null …}`. Added later, each red first: owner-named class (`to match /vehicleClassId: str\(v\.vehicleClassI…/`), store loaded twice (`expected [] to have a length of 1 but got +0`), no disabled Assign (`expected true to be false`) | 22 passed |

Existing tests that pinned the old layout, changed: `apps/web/lib/ops/voucher.test.ts` (assign
dialog `sc-if dialogOpen` → Assign box `sc-if showAssignPicker`), `apps/web/lib/ops/ops-refund-review-dc.test.ts`
(`sc-if canFullRefund` button → the admin-only Refund menu item).

Gates (2026-10-01, once, at the end): `pnpm typecheck` 0; `pnpm lint` 0 errors (5 warnings, none in
touched files, pre-existing); `pnpm lint:css` 0; `pnpm i18n:check` pass; `pnpm check:numbers` ok;
`pnpm check:db-fences` 8/8 pass; `node scripts/sync-dc-mock-to-public.mjs` then 36 touched/related
test files: 427 passed, 1 skipped (`assign.local.test.ts`, needs a local stack).

## Deviations (found while building)

1. [Rule 1] OpsDetail `componentDidUpdate(prevProps, prevState)` read a `prevState` the dc-runtime
   never passes (support.js hands only prevProps): a TypeError on every update (seen in the
   "before" console), so the dialog scroll lock never ran. It now keeps its own last value.
2. [Rule 1] The shell's helmet runs `vamos-ops-bar.js` twice; the second copy dropped the bar's
   listener (the bar showed the wordmark instead of VT-26-0042). The file keeps the first store;
   the shell subscribes once the store exists.
3. [Rule 1] Chauffeur Save: "No car" could not clear a car (legacy `vehicle` key).
4. [Rule 2] Car labels: an owner-named class read "Economy" (D-14 fallback); detail now loads the
   rate book for class names (one GET `/api/staff/rate-book`).
5. Design: no disabled primary Assign button (law 02, cream pill); the box asks in words instead.
6. The kit has no Menu component; `ActionsMenu.dc.html` is composed from the kit Button, Icon and tokens.

## Pictures — `.planning/quick/260930-dash-design/screens/` (80 PNG, real shell, offline, API stubbed)

Data (made by the real presenters `mapBoardBooking`, `presentChauffeur`, `presentVehicle`): driver
Marco with an Economy car (Toyota Corolla · ZH 123 456), a Business car (Mercedes V-Class · ZH 000
000), paid Business booking VT-26-0042 unassigned, Pricing draft with one extra (no amounts:
CHF 000). Assign answers are the route's own: 409 `class-mismatch` (Economy / Business); 409
`no-vehicle` with Marco without a car.

- `actions-sheet.png` — `actions-{before|after}-{en|ar}-{1440|1024}-{closed|open}.png` (16)
- `phone-sheet.png` — `phone-detail-{before|after}-{en|ar}-{768|390}-{open|full}.png` (16),
  `phone-pricing-{before|after}-{en|ar}-390-closed.png`, `phone-pricing-after-{en|ar}-390-open.png` (6)
- `assign-sheet.png` — `assign-{before|after}-{en|ar}-{1440|390}-{empty|chosen|class|nocar}.png` (32);
  before = the old dialog and its toast ("Could not assign VT-26-0042" for the class case)
- `driver-car-sheet.png` — `driver-car-{before|after}-en-{1440|390}-form.png`, `driver-car-after-en-{1440|390}-open.png` (6)

Every picture was opened and looked at. No sideways scroll at any width (report: 0 px).

## Signed 2026-10-01

The owner signed the design (question form) and answered the six questions:

1. Refund stays inside Actions — no change.
2. Complete and No-show appear in Actions only once the pickup time has passed (Zurich). Built:
   `pickupMs` in OpsDetail uses the row's `pickupAt`, else its Zurich date and time; a row with no
   readable time keeps both (a broken row can still be closed). Mark arrival, Cancel and the rest
   are unchanged. The old handlers are untouched; only the menu hides the two items.
3. "Tablets too": the drawer, the compact bar with ACTIONS and the folded page buttons now apply
   up to 1080 px (tablet range 681–1080); above 1080 the rail and the page's own Actions stay.
   `ops.dc.html` and `OpsSidebar.dc.html` moved from 899/900 and 767 to 1080/1081.
4. Profile, Settings, Sign out in the drawer on phone and tablet — yes, no change.
5. Driver form: Class dropped, Car kept. A driver's class is his car's class. The
   `chauffeurs.vehicle_class_id` column stays (no migration); the form sends no class and the
   server keeps the stored value when the body has none (`parseChauffeurBody` → undefined,
   `UPDATE … vehicle_class_id = case when keep then vehicle_class_id else … end`, insert → null);
   an explicit empty class from another caller still clears it. Every dashboard reader of the
   driver's class now uses the car: the Chauffeurs list column (key `carClassName`), its search,
   the driver profile fact, and the Assign list (already car-based). No car: "No car yet" /
   "Noch kein Auto" / "Pas encore de voiture" / "لا سيارة بعد" (the words OpsDetail already had).
   Readers found by grep: only `app/ops/OpsFleet.dc.html` (list, search, profile) and the staff
   read in `apps/web/lib/ops/chauffeurs.ts` (still returns `vehicleClassName` from the column; no
   dashboard screen shows it any more).
6. An "Add a car" page is NOT in this job — it becomes its own job. Note: today the Car list only
   offers cars that already exist, and the dashboard has no place to add one.

### Follow-up tests (red before, green after)

| file | before | after |
|---|---|---|
| ops-dc-dash-design.test.ts (changed and new cases) | `expected [ 'assign', 'edit', 'resend', …(4) ] to not include 'complete'`; `expected '' to contain '[data-ops-fold]{display:none!importan…'` (1080 block); `…to contain 'window.matchMedia('(max-width: 1080p…'`; `expected { key: 'vehicleClassId', … } to be undefined`; `expected undefined to be 'Business'`; `expected { name: 'Marco', … } to not have property "vehicleClassId"` | 25 passed |
| chauffeur-class-keep.test.ts (new) | 3 failed — `expected null to be undefined`; `…to match /vehicle_class_id = case when \$::bool…/`; `expected [ 'Marco', … ] to include false` | 3 passed |

Existing tests changed because they pinned the old form: `fleet-http.test.ts` (a body without a
class now parses to undefined = keep), `ops-chauffeur-desk.test.ts` (fields no longer hold
`vehicleClassId`; they hold `defaultVehicleId`).

### Follow-up pictures — `screens/followup-sheet.png`

- `fu-detail-{en|ar}-{1024|768}-open.png` — tablet: compact bar, ACTIONS open, page buttons folded
- `fu-future-en-1440-open.png` (trip next week: no Complete / No-show), `fu-past-en-1440-open.png` (an hour ago: both)
- `fu-driver-form-{en|ar}-{1440|390}.png` — driver form without Class
- `fu-driver-profile-{en|ar}-1440.png`, `fu-driver-list-en-1440.png` — Class shows the car's class

Gates (2026-10-01, once, after the follow-ups): `pnpm typecheck` 0; `pnpm lint` 0 errors (the same 5
pre-existing warnings); `pnpm lint:css` 0; `pnpm i18n:check` pass; `pnpm check:numbers` ok;
`pnpm check:db-fences` 8/8; sync script then 39 touched/related test files: 444 passed, 1 skipped
(`assign.local.test.ts`, no local stack).

## Questions asked before the signature (answered above)


1. Refund (cancelled trip, admin) is now an item of the Actions menu, not its own yellow button. Keep it in the menu?
   Example: VT-… cancelled → Actions → Refund.
2. The chauffeur form keeps its Class field next to the new Car field. Drop Class, since the car carries the class?
3. The Car list shows cars that exist; there is no page to add a car (the old nested "Add a vehicle" form is still
   unreachable). Add "Add a car" at the top of the Car list?
4. Phone width is ≤ 767 px: at 768 (iPad portrait) the page keeps its own buttons and the bar shows only menu + title. Right?
5. Profile / Settings / Sign out moved from the bar's avatar into the menu drawer on phone and tablet. Right?
6. Complete and No-show are offered for any trip that is not finished (same rule as before). Keep?

## Not verified

- Nothing deployed, nothing pushed, no live click. The class check has not run against the live
  database; the owner's live car (class 87b8ede8…) will read its typed class name — not seen.
- The new `asStaff` read (bookings, booking_legs, chauffeurs, vehicles, vehicle_classes) relies on
  the staff CRUD grants of `20260823000023_rls_staff.sql`; not proven on live or on a local stack
  (`assign.local.test.ts` skipped — no local stack running).
- Pictures use stubbed API answers; the Worker build (OpenNext) was not run.
- Pre-existing, not touched: RTL "Back to bookings" chevron points left; the Arabic phone number
  reads reversed; the "catch inside an identity callback" cases listed in 260930-dash-assign/DEBUG.md.
- Follow-ups: the "keep the class" UPDATE was proven with a recorded statement, not on a database.
  The 1080 px drawer switch reads `matchMedia` at render; rotating a tablet across 1080 re-renders
  on the next update only (same as the old 899 switch).

## Merged with main (2026-10-01)

Two merge commits, nothing pushed, nothing deployed:

- `3d7cacb0` — origin/main `0881800e`: refunds by hand (`f29623da`, plan 20-10), extras part A
  (`9acfdb51`), security batch C part 1. Conflicts in two files.
- `46f1bdf4` — origin/main moved to `a8948162` while the first merge was open (booking polish 2:
  home booking sheet, German class-card words, seed). No file of this branch touched; no conflict.

### How each conflict was resolved

1. `app/ops/OpsDetail.dc.html`
   - Helpers: main's `chfText` / `isolate` / `fillAmounts` kept as they are; one driver helper,
     `assignableChauffeurs` (this branch's; main's `assignableChauffeurOptions` had no other caller).
   - `componentDidUpdate`: `publishBar()` (design), the overlay scroll lock with main's
     `_overlayWas` (cancel / decline / reject — `dialogOpen` dropped because the assign dialog is
     gone), then `syncRefund()` (main). `syncRefund` / `loadRefund` as on main; `componentDidMount`
     keeps both `publishBar()` and `syncRefund()`.
   - Layout (auto-merged, checked): the bar is the signed one — Back to bookings and one ACTIONS;
     main's old Refund button in the bar is not brought back. Main's whole refund region (Refund due,
     payment list, Full refund line, %/CHF, Confirm refund, Decline, inline errors, Try again,
     post-trip Accept / Reject) is unchanged and shows where it showed on main.
   - Refund in Actions (new wiring): the item is offered when main shows its refund panel (refund
     due, review, failed / processing), for an old cancelled row (refund_status none) and for a
     post-trip request — admin only, disabled while a refund is being sent. Picking it:
     main's panel on the page → scrolls to it and focuses its first control (nothing is sent until
     the panel's own CONFIRM REFUND / Try again); old cancelled row → main's one-press full refund
     (`markRefund`, POST `{}`), as main's button did; post-trip → main's Accept / Reject panel
     (`openRequested`), then scrolls to it. Same handler for the phone bar's ACTIONS.
   - Copy: both sets of keys kept in en / de / fr / ar (main's 20-10 keys verbatim; this branch's
     `actions`, `car`, `classMismatch`, …). Main's removal of `extraWait` kept.
2. `scripts/db-access-fence-allowlist.json`: main's `refund-by-hand.local.test.ts` entries kept; this
   branch's `assign.local.test.ts` line added; its comment sentence was already in (auto-merged).

Auto-merged and checked by reading: `app/ops/OpsPricing.dc.html` (one `componentDidUpdate`,
publishBar), `app/vamos-ops-data.js` (main's `arrivedAt` / surcharge `labelEn`, this branch's
`vehicleClassId`), `apps/web/lib/ops/ops-refund-review-dc.test.ts` (main's pins plus this branch's
Refund-in-menu pin).

### Tests

- Changed tests of main: none needed. No test of main pins the old Refund button position (the one
  pin, `sc-if canFullRefund`, was already moved to the menu on this branch and merged cleanly).
- New: `ops-dc-dash-design.test.ts` "1b · Actions → Refund opens main's refunds-by-hand panel", 8
  cases. Against the merge before the wiring: 6 failed (`expected false to be true` — no ACTIONS on a
  refund-due booking; `expected [] to deeply equal [ 'refund' ]`; `expected [] to include 'refund'`;
  `expected undefined to be true` (disabled); the scroll was never called; no `ref` on main's panels);
  after: 33 passed in the file.

Gates (after both merges, once): `node scripts/sync-dc-mock-to-public.mjs` ok; `pnpm typecheck` 0;
`pnpm lint` 0 errors (the same 5 pre-existing warnings, none in touched files); `pnpm lint:css` 0;
`pnpm i18n:check` pass; `pnpm check:numbers` ok; `pnpm check:db-fences` 8/8; `pnpm check:legal-claims`
3/3. `vitest run lib/ops/ops-dc-*.test.ts lib/ops/*refund*.test.ts lib/ops/assign*.test.ts` plus
`tests/unit/checkout-class-card-words-bp2.test.ts`: 232 passed, 2 skipped (`assign.local.test.ts`,
`refund-by-hand.local.test.ts` — no local stack). The other 15 files that read OpsDetail or were
touched by this branch: 174 passed.

### Pictures — `screens/refund-merge-sheet.png` (16 + sheet, real shell, offline, API stubbed)

`refund-merge-{before|after}-{en|ar}-{1440|390}-…`: before = origin/main `a8948162` (`page`, then
`panel` scrolled into view); after = this branch (`actions` = ACTIONS open, `panel` = after
Actions › Refund). Booking VT-26-0042 cancelled more than 24 hours ahead, two payments, refund due;
made by the real `mapBoardBooking` (byte-identical on both sides); GET …/refund answered in the
`RefundPicker` shape. Amounts are the fixture amounts of main's own 20-10 pictures (100.00 + 20.00),
not prices. Every picture opened and looked at: the panel reads exactly as on main (same controls, amounts and texts); the menu lists
only Refund; after the pick the first control (All payments) has focus; no POST was sent; 0 px
sideways at every width. The before tree logs one 404 (`{{ profilePhoto }}`, main's old bar avatar;
this branch removed that avatar).

### Not verified / open

- Nothing pushed or deployed; no live click; no refund sent; no Worker build.
- Choice made in the merge, for the owner to confirm: main's refund panel stays visible on the page
  (as on main), and Actions › Refund brings the admin to it. The alternative — panel hidden until
  Refund is picked — would hide the "inside 24 hours" review from an admin who does not open the
  menu, so it was not built.
