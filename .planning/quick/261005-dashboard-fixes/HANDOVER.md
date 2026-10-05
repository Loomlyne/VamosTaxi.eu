# Hand-over: dashboard fixes (U8, U9, U10, U11)

Work session. Branch `fix/dashboard-fixes`, cut from `origin/main` `328b133c`; `origin/main` `43fba58d` merged in
(two merges, no conflicts: the purge migration and board notes, then security hardening S4-S15; the only
shared area is `apps/web/lib/ops/`, see the S13 note under U8a).
Worktree `.claude/worktrees/agent-a75f53f12dd10a4a8`. Nothing deployed, no live write, no migration.
Owner and controller answers, 2026-10-05 (recorded in `.planning/decisions/2026-10-05-dashboard-fixes.md` on main):
U11 all 26 to ghost; error toasts stay until closed; a class taken off sale shows its own name; no "You were
signed out" message in this job; the 5 s Auth timeout stays as built.
Line numbers: "was" = `328b133c`, "now" = this branch.

A fresh reviewer (not the builder) must read U8 before it ships: it changes what happens when a dashboard
sign-in dies, and the gate's Auth wait.

| Item | State |
|---|---|
| U8a dead session goes to /login | fixed, proven in Chromium |
| U8b ETag instead of no-store, Auth timeout | fixed; the ETag/304 half is proven with a stand-in only |
| U8b optional file move | not done, reasons below |
| U9 Dismiss label, Arabic chip, pickup day, error toast | fixed, proven in Chromium |
| U10 classes from the live data | fixed, proven in Chromium |
| U11 `variant="outline"` | fixed after the owner signed ghost for all 26 (own commit `fix(ops): grey outline buttons become ghost (U11)`), guard test, pictures re-taken from the real files |

---

## U8a. A dead session goes to /login, not a blank screen

- Root cause: `app/ops/ops.dc.html` loads every screen file by `fetch`. When the session is dead the gate
  answers the screen file with its private 404 (`apps/web/lib/ops/asset-gate.ts` was :74), the DC runtime
  (`app/support.js` `ensureFetched`, about :1649) logs the error and renders an empty placeholder. Staff API
  calls that answer 401/403 went back to the screen (`app/vamos-ops-api.js` was :7 `request`), each screen
  showing its own message or nothing. Nothing sent the browser to /login.
- Fix: `app/vamos-ops-api.js` (now :18-:131) wraps `window.fetch` once (the shell's helmet runs the file
  twice; `__vamosOpsWatch` guard) and looks at two things:
  - a `/app/ops/<X>.dc.html` 404: asks `GET /api/staff/me`; only a 401 `no-session` or 403 `needs-mfa` answer
    counts as dead. A 404 with a live session is a missing file and changes nothing. A probe that cannot
    reach the server changes nothing (offline is not signed out).
  - a same-origin `/api/` answer of 401 `no-session` or 403 `needs-mfa` (not `/api/auth`, not a code-less
    401 such as `/api/staff/claim-invite`, not `not-admin` / `not-staff` / CSRF): same.
  Dead means: clear the `vamosOpsAuth` flag, `location.replace("/login")`. The screen still gets its answer.
  Loop guard: one redirect per 15 s per tab (`sessionStorage vamosOpsSessionLostAt`), so a /login that
  bounces straight back cannot loop.
- Tests: `apps/web/lib/ops/ops-session-lost.test.ts` (12 tests: 404 + no-session, one redirect for several
  404s, live session stays, offline stays, 401, needs-mfa, other refusals stay, other origin ignored, double
  helmet run, loop guard, old mark does not block, ordinary traffic untouched). They fail on `328b133c`
  (no watcher) and pass now.
- Verified: unit tests; Chromium run `tools/session-lost.mjs` against the real shell with a gate model:
  dead-nav, dead-api, mfa-api end on /login with the flag cleared; missing-file stays on /customers with the
  flag kept. Before-tree: stays on a blank main column (`screens/before-dead-nav.png`), after: the sign-in page
  (`screens/after-dead-nav.png`; also `-dead-api`, `-mfa-api`, `-missing-file`).
- Security hardening S13 (on main, merged here) answers a switched-off staff row with 403 `not-staff`, and
  now needs the admin for writes (403 `not-admin`). The watcher leaves both alone on purpose: the person stays
  on the screen with its own message, as before. S7 hides `/api/staff/*` on the public host only; the
  dashboard host, where `/api/staff/me` is probed, is unchanged.
- Not verified: against the real Supabase session on the dashboard host (needs a deploy and a real sign-out in
  another tab). The redirect carries no "you were signed out" message and no return-to page: /login shows
  its normal form (see questions).

## U8b. ETag instead of no-store; Auth call timeout

- Root cause: `asset-gate.ts` was :74 sent `private, no-store` on every served file, so each screen change
  downloaded the whole file again. `apps/web/lib/ops/session.ts` was :143 `dashboardConsoleAllowed` awaited
  Supabase Auth with no limit; a stalled Auth call held every dashboard document and screen file open.
- Fix:
  - `asset-gate.ts` :70 `gatedAssetCacheControl(status)`: `private, no-cache` for 200 and 304, `private,
    no-store` for the 404. `no-cache` stores the copy in this browser only and makes it ask first: the request
    comes back through the gate, the session is checked again, and the assets binding answers 304 when the
    ETag matches. A signed-out request never gets the stored copy, it gets the 404.
  - `session.ts` :141-:170 `CONSOLE_AUTH_TIMEOUT_MS = 5000`; `dashboardConsoleAllowed(supabase, timeoutMs)`
    races the old decision (now `consoleDecision`) against a timer that answers `false`. Fails closed: the
    document door sends /login, the file door answers the 404. The timer is cleared; a late failure of the
    abandoned call is swallowed.
- Tests: `asset-gate.test.ts` (ETag stand-in answering 304 on `if-none-match`; "screen file caching"; "Supabase
  Auth that does not answer"), `session.test.ts` (3 tests on the bounded wait, including a late rejection),
  plus the source-pin tests that slice `session.ts` between `dashboardConsoleAllowed` and `getStaffClaims`
  still pass. They fail on `328b133c`.
- Not verified: a real 304 on the dashboard host. The Workers assets binding is expected to send the ETag and
  answer `If-None-Match`; the test uses a stand-in. After deploy, with a signed-in browser, the Network tab
  should show the second load of a `/app/ops/*.dc.html` as 304 with `cache-control: private, no-cache`.
  The Auth timeout does not abort the Supabase subrequest; it only stops waiting for it.
- Optional move of `/app/vamos-ops-{api,bar,data}.js` under `app/ops/`: NOT done.
  1. `vamos-ops-api.js` now carries the dead-session watcher. Behind the gate a dead session gets the 404 for
     that very script, the watcher never loads, and the blank screen is back. It would have to be allow-listed
     like `AuthForm`, which is what it is today.
  2. The three files hold code and endpoint paths only (no names, emails or phone numbers: grep is empty), so
     gating them protects little.
  3. The move touches `app/ops/ops.dc.html` script paths and the dashboard host's file routing
     (`apps/web/lib/dc-mock-urls.ts`, middleware), both off limits to this job, and `ops-write-contract.test.ts`
     reads `app/vamos-ops-api.js` by path.
  Follow-up if wanted: move `bar` and `data` only, change their two `<script src>` lines in `ops.dc.html`, the
  `dc-mock-urls` mapping and `scripts/sync-dc-mock-to-public.mjs`, then run the gate tests.

## U9. Small things

| What | Root cause | Fix | Test |
|---|---|---|---|
| Toast "Dismiss" not translated | `app/ops/OpsDetail.dc.html` was :595: the whole Toast sat in a `data-vt-no-i18n` wrapper, so the design system's `aria-label="Dismiss"` was skipped by the translator | wrapper opts out no more; only the message `<span data-vt-no-i18n>{{ toastMsg }}</span>` does (now :595) | `ops-toast-tone-dc.test.ts` markup pin; Chromium: the close button reads Schliessen / Fermer / إغلاق |
| Arabic distance chip "km 240" | was :179 `<span data-vt-no-i18n>{{ distanceChip }}</span>`: in right-to-left text the browser puts "km" first | `<span class="vt-dir-keep" data-vt-no-i18n="1">` (now :179); the design system's `[dir=rtl] .vt-dir-keep` forces left to right | `ops-dashboard-fixes-dc.test.ts` "distance chip keeps its reading order"; Chromium reads "240 km" |
| Board pickup day line (`Tue 6`) English only | `app/ops/OpsBoard.dc.html` was :504 `pickupDay(r.date)` cut the English text | now :230-:260 `DAY_LOCALE`, `pickupDay(row, lang)`, `pickupDayFull`: `Intl` in the page language, the stored Zurich calendar day (or the pickup instant read in Zurich), Latin digits in Arabic; cell and tooltip use it and opt out of the translator | `ops-dashboard-fixes-dc.test.ts` 6 tests (Fri 9 October in en/de/fr/ar, Zurich zone, fallbacks) |
| Error toast closed after 3.6 s | `OpsDetail.dc.html` was :1525 `notify` set the same timer for every tone | now :1527: a success still closes after 3.6 s; an error stays until the close button | `ops-toast-tone-dc.test.ts` "how long the toast stays" (fake timers) |

The three tone judgement calls are unchanged.
Verified in Chromium in en, de, fr, ar at 1440 and 390 (`tools/proof.mjs`, 140 PASS, 0 FAIL on the merged
tree): the chip, the toast label, the error toast still there after 5 s and closed by its button, the
success toast gone after 5 s, the pickup day line and tooltip per language.

## U10. Class names and order come from the live classes

- Root cause: a fixed list of three in several places.
  - `app/vamos-ops-data.js` was :624-:636 `VEHICLE_CLASSES = [Economy, Business, Van luxury]` and
    `cleanKlass` with `KLASS_ALIASES`: every other name became Economy (First and Studio showed as Economy).
  - `apps/web/lib/ops/bookings-map.ts` was :147 (no class and unknown slug read Economy), `class-slug.ts`
    D-14 table, `fleet-http.ts` was :60 `slugToKlass`.
  - `apps/web/lib/ops/bookings.ts` was :343 `dashboardClassOf` (the same fixed three) and `OpsDash.dc.html`
    was :172 `MONEY_IN_CLASSES`: the Money in lines had three fixed rows and put every other class on
    Economy.
  - `OpsBoard`, `OpsFleet`, `OpsReviews` carried literal class lists; the board's vehicle sort used the
    fixed order.
- Fix:
  - `app/vamos-ops-data.js` :985-:1031: `loadClassBook` reads `GET /api/staff/vehicle-classes` once;
    `VEHICLE_CLASSES` is a getter: the classes on offer (active, not hidden) in price-book order
    (`sort_order`, slug), one entry per name, then any class a booking or vehicle still carries (placed at its
    own price-book place, so First sits between Business and Van luxury), then names with no row. No list of
    names in the file, `cleanKlass` only trims. A failed answer lists only what the store's rows carry.
    Screens hear the list land through the existing classes/bookings change events.
  - `bookings-map.ts` :151-:154 `classLabel(slug, storedName)`: the class row's stored name, else the slug's
    own name (`classOwnName` in `class-slug.ts`: first reads First); no class reads empty, and the fare line is
    then "Transfer". `fleet-http.ts` `slugToKlass` the same.
  - `bookings.ts` :361 `moneyClassLines`, the `loadDashboardMoney` query (CTEs `paid`, `by_class`, then
    `vehicle_classes full join by_class order by sort_order, slug`): one line per class by its own name, in
    price-book order; income with no class row still appears as one unnamed line. `dashboardClassOf` is gone.
    `OpsDash.dc.html` renders the server's `byClass`; an unnamed line reads "Class not stated"
    (`app/vamos-i18n-dict.js`, one entry, en/de/fr/ar).
  - `OpsBoard`/`OpsFleet`/`OpsReviews`: no literal lists; the board's class filter, edit form and the sort by
    vehicle use the live list. Class names and the dashboard labels are data: `data-vt-no-i18n` (the
    dictionary would turn "Van" into Arabic).
- Tests: `ops-dashboard-fixes-dc.test.ts` (8 store tests + 2 source pins), `dashboard-money.test.ts` (rewritten for
  `moneyClassLines`), `class-labels.test.ts`, `ops-dc-finalize.test.ts`, `ops-dash-numbers.test.ts`,
  `bookings-map-extras.test.ts`. They fail on `328b133c` and pass now.
- Verified in Chromium (en, de, fr, ar; 1440 and 390): the vehicle column shows First and Studio as
  themselves; the class filter lists Economy, Business, First, Van luxury, Studio in price-book order; the sort
  by vehicle follows it; Money in has one line per class in the same order.
  Fixture amounts in the pictures are plain test numbers (CHF 1 / 2 / 3), not prices.
- Not verified: against live rows. The live `vehicle_classes` rows were not read for this job, so the order
  on the real dashboard is whatever `sort_order` holds there; look at the live Money in card after deploy.
  `VamosLocale.coverage` on board, dashboard and detail in en/de/fr/ar: no new gaps; the pickup-day strings
  left the list. It is not empty: what remains is fixture data (names, addresses, emails) and a few strings
  that were there before (for example "2 Pax").

## U11. `variant="outline"` becomes `ghost` (owner: "Yes, all 26 white with a line")

- Root cause: the design-system `Button` knows `primary`, `secondary`, `ghost`, `light`, `danger`
  (`design-system/_ds_bundle.js` :43120-:43147). There is no `outline`. A Button with `variant="outline"` gets the
  class `vt-btn--outline`, which has no rule, so Chromium drew the browser's own button face (light grey
  fill, `rgb(239 239 239)`, no border, and no hover or press look). `IconButton` and `Badge` do have `outline`.
- Fix (commit `fix(ops): grey outline buttons become ghost (U11)`): 26 Button uses to `ghost` (transparent, 1px
  `#DEDEDE` hairline, grey-50 and charcoal border on hover): 24 written `variant="outline"` in OpsBoard (4),
  OpsCalendar (1), OpsCalendarBoard (1), OpsDetail (3), OpsFleet (1), OpsNewTrip (1), OpsPricing (4), OpsProfile (1),
  OpsSettings (1), OpsSupportTicket (4), OpsTable (3), plus the 2 computed in `OpsCalendarBoard.dc.html` :386-:387
  (the Kanban / Table switch when it is not the open view). The 5 IconButton outline uses (OpsCalendar 2,
  OpsCalendarBoard 2, the row edit button in OpsTable) and the Badge `tone="outline"` in OpsFleet are real kit
  styles and are untouched. No law is touched (no glow, no tint, no new colour).
- Test: `apps/web/lib/ops/ops-button-variants-dc.test.ts` (7 tests). No `<Button>` in `app/ops` says
  `variant="outline"` (IconButton excepted); a written-out Button variant is one of the kit's five; a bound
  `variant="{{ name }}"` never gets `'outline'` for that name in its screen; the calendar switch is ghost; and the
  premise (the kit has a rule for each of the five and none for `vt-btn--outline`, while IconButton and Badge
  keep theirs). 4 of the 7 fail on the previous screens, all pass now.
- Pictures: `screens/u11-<screen>-<state>-<before|after>-<1440|390>.png`, English, bare crops, 48 in all.
  "Before" is the screens at the branch tip before this commit; "after" is shot from the real files (the synced
  public tree of this branch, nothing swapped; they are byte for byte the same as the first, scratch-copy
  pictures). `node tools/u11.mjs <before|after> apps/web/public <scratch> <out>`; `before` needs
  `U11_BEFORE_REF=<commit before U11>` and was checked to reproduce a committed before picture exactly. The
  script also counts the buttons on each page: `vt-btn--outline` x0 on all 12 screens after.
  Screens: OpsBoard (Filter, Print, paging), OpsCalendarBoard (Today, Kanban/Table), OpsNewTrip (Back),
  OpsSettings and OpsProfile (Discard, with unsaved text), OpsTable (Clear the search, delete dialog "Keep it"),
  OpsDetail (Cancel dialog "Keep it"), OpsFleet (chauffeur edit), OpsSupportTicket (Close ticket, Mail, Call,
  WhatsApp), OpsPricing (publish dialog, discard dialog).
  Not pictured: OpsDetail's class-change "Keep" and withdraw "Keep" dialogs (same Button, same change), the
  "Cancel" of OpsTable's nested edit form, OpsCalendar (not mounted anywhere).
- Found, not changed: the calendar switch's open view is `variant=''` (an empty string, also not a kit variant), so
  it draws the browser grey face while the closed one is now white with a line. That happens to show which view
  is open (before, both were the same grey), but it is an accident, not a design: see question 5.

---

## Checks (merged tree, `4bb245f9` + this branch)

- After U11: `apps/web/lib/ops` plus every other test that reads `app/ops` (`lib/security`, `lib/dc-mock-urls`,
  `tests/unit/ops-*`, `vendor-runtime-no-unpkg`, `signup-notice-mock`, `phase-26-3-laws`): 148 files, 1713 tests
  pass, 11 skipped files as before.
  Earlier, on the merged tree before U11, 4 tests of `refund-by-hand`, `staff-cancel-by-hand` and
  `edit-request-customer` timed out at 5 s on the first import of `bookings-write` while the Mac ran at load
  average 115 with the other jobs; they pass alone, and passed in the full run once the load fell.
  `bookings-write.ts` imports none of the files this job changed.
- `pnpm typecheck`: pass. `pnpm lint`: 0 errors, 6 warnings (unused eslint-disable directives, none in files of
  this job). `pnpm check:db-fences`: 8 of 8 pass. `pnpm check:numbers`: ok. `pnpm i18n:check`: pass.
- Chromium: `tools/session-lost.mjs` all passed; `tools/proof.mjs` 140 PASS, 0 FAIL.
- Not run, on purpose: full `test:unit`, build, live data, deploy.

## Pictures (`screens/`)

- `before-` / `after-dead-nav`, `-dead-api`, `-mfa-api`, `-missing-file` (U8a, 1440 x 900).
- `before-` / `after-board-<en|ar>-<1440|390>`: vehicle column and pickup day line.
- `before-` / `after-dashboard-<en|ar>-<1440|390>`: Money in lines.
- `before-` / `after-chip-<en|ar>-...`: the distance chip. `before-` / `after-toast-error-<en|ar>-...`: the error toast.
- `before-coverage.json` / `after-coverage.json`: `VamosLocale.coverage` per screen and language.
- `u11-*`: 48 pictures for U11 (`before` from the branch tip before the U11 commit, `after` from the real files).
- `tools/`: `serve.mjs` (static server over the synced public tree), `fixtures.mjs` (stub rows, classes, money),
  `before-tree.mjs`, `session-lost.mjs`, `proof.mjs`, `u11.mjs`. All offline; `/api/**` is stubbed.

## Closed by the owner / controller (2026-10-05)

- U11: all 26 to `ghost`, the 5 IconButton outlines left alone. Done.
- Error toasts stay until closed (success toasts still close after 3.6 s): keep as built.
- A class taken off sale shows its own name (First, Studio) on the board, in fleet and in Money in: keep as built.
- No "You were signed out" message or return-to page in this job.
- The 5 s Auth timeout stays as built (it stops waiting; it does not cancel the Supabase request).

## Still open

1. The write path still matches a class by name on the server (`liveClassSlug`, D-14 table): a new class name he adds
   in the price book is shown everywhere, but an edit that names it still resolves through that table. Not
   changed in this job; say if it should be.
2. A switched-off staff row (403 `not-staff`, security hardening S13) leaves the person on a screen with an error
   instead of /login. Send that to /login too?
3. The open view of the calendar's Kanban / Table switch uses `variant=''`, which is not a kit variant and draws the
   browser grey. Give it a real one (for example `secondary`, charcoal), or leave it as the grey it is?
