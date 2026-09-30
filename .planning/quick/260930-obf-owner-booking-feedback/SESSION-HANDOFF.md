# Session hand-off — quick 260930-obf (26.4.2, owner booking feedback)

Written 2026-09-30 ~03:00 by the orchestrating session. The owner moved this work to a new session. Plain facts. "not verified" = not checked.

## Branch
- Folder: `/Users/koss/Developer/vamos-wt/fix-26.4.2`
- Branch: `fix/26.4.2-booking-feedback`. Cut from ccf74454. Last code commit is `62345fef`; the hand-off commit comes after it (see `git log -1`).
- Last main merge: a8411a40 (origin/main 520176c0).
  - origin/main is now 76b53ca8 and is NOT merged. Merge it before hand-over; main wins.
  - The earlier merge was recorded as a real merge commit, with main's diff applied on top. Main had squashed 26.4 and 26.4.1, which gave 13 add/add conflicts.
- Not pushed, no PR, not deployed. Only the control session ships.

## Built and proven (checks on commit 6c6f6f4a / b5f7234f, after the main merge)
- A. Phone and tablet (<1081): the 4-step sheet is ONE page.
  - Order: Flight (only after a Swiss-airport From) → From → To → When (date, then time below, both through the Vamos WhenPicker) → Who → one SEE PRICES.
- B. Laptop bar order: Flight → From → To → When → Travellers.
  - Flight slides in before From after an airport pick. From moves 0 px, and focus moves into Flight.
  - A non-airport From shows an optional "Add a flight number" button.
  - The address list opens upward when there is no room below.
  - Tab order equals the visual order, en + ar (test `00d9f71d`).
- Cross-browser: Chromium, Firefox and WebKit at 1081/1280/1360/1440. No overlap, list clickable, engines within 1 px.
  - Raw results: `/private/tmp/claude-501/-Users-koss-Developer-VamosTaxi-eu/3c6c6056-f11d-41a2-8b13-17a758844e5c/scratchpad/xb-keep.jsonl`. That is a temp folder; it may be gone.
- Class cards (first version, prices after the bar is filled) and quote trigger: see SUMMARY.md.
- Bug fixed: every class price was grey (`6c6f6f4a`).
- Checks passed on b5f7234f:
  - typecheck
  - unit tests (247 files / 2465 tests)
  - lint (0 errors)
  - lint:css
  - seed gen/check
  - visual specs, run one file at a time with `--workers=2`:
    - booking-sheet-states 39
    - home-booking-sheet 55
    - home-booking-box 14
    - home-laptop-bar 78
    - home-desktop-fixes 14
    - home-class-cards 12
    - checkout-sections 21
  - de/fr/ar coverage empty.

## Built after the last full check. Checks NOT re-run: not verified
- `4c8f8f20`: the When date is written in the active language (de/fr/ar) and follows a language switch.
- `e8e8f144`: laptop "Choose your class" is visible from page load.
  - Catalog comes from an idle GET /api/quote: name, seats, bags, dashboard `photo_url` only.
  - Before the bar is filled: "Fill in the trip to see prices", no price, SELECT is aria-disabled, and a click names what is missing.
  - Loading shows a skeleton on the price only.
  - No photo, or a failed photo, shows a Lucide car on grey-100 at the same height.
- `62345fef`: checkout section-1 class cards carry the class photo (phone, tablet, laptop). The photo comes only from the quote's `photo_url`. img has width/height, lazy, async, and alt = class name.
- The executor was stopped mid-step ("JS side of cc"). The step it was on is unknown and may be half done: not verified.
  - Re-run every check above on the tip before anything else.
  - Read `git show 62345fef e8e8f144` for what landed.

## Not started
- **Open bug: CheckoutForm flightBlur challenge.** From the control session; confirmed in code on main and on this branch; not seen on live.
  - Where: `apps/web/app/[locale]/checkout/CheckoutForm.tsx` flightBlur (~548-563).
  - A flight edit re-signs via `flow.resignFlight`. When the re-quote answers `turnstile_required`, the result is kind "error" with `challenge`. flightBlur only handles `kind==="error" && !challenge`, so no `[data-co-page-challenge]` mounts and the price stays on "Updating price".
  - Fix: mount the page challenge; after it is solved, re-sign once; otherwise show an error with a way forward.
  - The 26.0 test `checkout-pay-19` (flight-edit case) is KNOWN-RED under D-09 at 482fa0d6, on the 26.0 branch. It must go green. Tell the 26.0 session when this lands.
- Tests for the photo rules: no layout shift when the photo loads (card box measured before/after), and the car empty state keeps the height. Whether e8e8f144/62345fef include these: not verified.
- Served size (bytes, pixels) of the three live class photos, for the hand-over. Not measured.
- Fresh signing screenshots of the current tip.
- Merge origin/main 76b53ca8, then a final check run on the final commit.

## Owner decisions (source: OWNER-DECISIONS-2026-09-30.md)
1. Field order everywhere (laptop, phone/tablet, checkout Edit trip): Flight → From → To → When → Travellers. Flight is hidden until From is a Swiss airport, then slides in BEFORE From. Required for an airport pickup.
2. Phone/tablet booking is one page, not 4 steps.
3. When: date and time stacked, using the Vamos picker (like desktop), never the native one.
4. Laptop address list opens upward when there is no room below. The bar stays where it is.
5. Laptop home "Choose your class" is visible from page load, with a photo on each card. It is selectable only once From, To and When are filled.
6. No price before the bar is filled: no CHF figure, no "from" price, nothing that looks like a price. Prices come only from the server quote. The quote fires once per trip, debounced, respecting 4/min.
7. Class photos: only the owner's dashboard upload (`vehicle_classes.photo_path` via /photos/…). Never assets/photography/class-*.jpg, stock or generated pictures, or another class's photo.
   - No photo: Lucide car on a neutral surface, same height.
   - Fixed ratio, width/height set, lazy below the fold, alt text = class name in 4 languages.
8. Phone: classes live on /checkout section 1, with photos.
9. Date in four languages (Law 03).
10. Pasted checkout link: trip + class + extras only, empty form (26.5 D-16/D-16a).

## Signatures
- Signed: laptop bar (flight before From, list opens upward). Picture: `screens/sign-b-*.png`.
- NOT signed: class cards (laptop home + checkout), which he asked to change (photos, visible from load); and the phone/tablet one-page sheet (not objected to, not signed). Show both again from the current tip.

## Pictures
`screens/` in this folder (copies of the scratchpad `sign-*.png`, taken 02:31–02:33):
- Current: `sign-b-bar-1440-empty.png`, `sign-b-bar-1440-airport.png` and `sign-b-list-up-1440.png` (the signed laptop bar).
- Superseded:
  - `sign-a-*` (the date was still English; the layout is otherwise current).
  - `sign-c-*` and `sign-d-*` (no photos, no always-visible state).
- Prices in pictures are fixtures (CHF 111/222/333, checkout 216.20 = fixture × 1.081). Never real.

## Local database
- 26.4.2 visual tests mock the network (`page.route`). This task used no local Supabase stack as far as known: not verified.
- Stacks running at 03:00 belong to other sessions; do not use them: `vamos-taxi-mg2` (58321/58322/58324) and `vamos-taxi-auth` (57322).

## Live facts read (read-only, 2026-09-30)
- Active classes and their dashboard photo_path (all PNG):
  - saden = Economy `classes/34ac8983…/0975620a….png`
  - mercedes-benz-v-class = Business `classes/7f4a6dd2…/458aece6….png`
  - van-luxury = Van luxury `classes/66f5fbcd…/64c03f0d….png`
- Inactive rows (mahaha, economy, business, first, van) also have photos. Never show inactive classes.

## Known broken / flaky / worth knowing
- The mock's built-in demo places (e.g. "Zurich, Bahnhofstrasse 1") carry no Mapbox id, so they get no quote and no prices. Whether live shows that list: not verified.
- The previous executor stalled twice (600 s watchdog) on long Playwright runs. Run one spec file at a time, `--workers=2 --timeout=60000 --reporter=line`, piped to a log, and tail it.
- `app/pages/manage-booking.dc.html` belongs to the legal follow-up session. Do not touch it.
- `app/vamos-i18n-dict.js`, the message files, the seed and `privacy.dc.html` are shared with the legal and Meta (27–29) sessions. Edit them append-only, keep the "Legal pages from vamostaxi.eu" block intact, and regenerate the seed (`pnpm db:seed:gen` / `pnpm db:seed:check`); never hand-edit it.
- Twin tests need `node scripts/sync-dc-mock-to-public.mjs` first.
- There is no staging. After the owner signs, the control session ships to vamostaxi.site; the owner's UAT (HANDOVER.md) runs on live. After deploy: one 4242 test payment, then read booking_payments.
- HANDOVER.md still points at the scratchpad pictures and predates the photo and date commits. Update it.
- For the owner, not this job: the served mock pages carry no hreflang links (found by 26.0).
