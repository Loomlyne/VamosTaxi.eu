# Phase 30 lab brief: result

Brief: `../30-TEST-BRIEF.md`. Run by `vamos-tester` (Sonnet) on 2026-10-13, lab `p30c`, from a clean clone of the branch (`/Users/koss/.vamos-scratch/p30-clean`, own lockfile install). The Phase 30 worktree cannot build the lab Worker: its `node_modules` are links into the main checkout and the OpenNext bundle fails on `sharp` (the same branch builds in the clean clone). A lab run is never proof for live.

Runs:
- Run 1 (17:16-17:50 +04, commit c23c7800): all 18 rows; `lab/` folder (`results.json`, `s9-metrics.json`, `s10-metrics.json`, 112 + 65 screenshots).
- Run 2 (about 17:55, c23c7800): Pricing flow again after the lead fixed the setup (trip snapshots on the live book); `lab/run2/`.
- Run 3 (about 18:05-18:14, 0064cfbc: Go live dialog re-reads the class rows): Pricing flow again with the seed classes given a lab photo path; `lab/run3/`.
- Run 4 (about 18:22 +04, 63940216, lead's own one-step script `lab/run4/focus.mjs`): GO LIVE focus return after fix 774be80a; `lab/run4/`.

Harness notes: `dashboardSignIn` in `scripts/test-lab/lab-browser.mjs` waits for a password field the dashboard login has not shown since 2026-10-08 (email link only); the brief signs in by posting to `/api/auth` from the page instead. One dashboard Worker drop in run 3 (down/up, only the cut steps rerun).

## Verdict per row (final)

| id | verdict | evidence (run) |
|---|---|---|
| S1 | PASS | Steppers "—" before save; row DRAFT with "—" seats and bags; DB `null, null, false, null`; not on `/about`, not in `GET /api/quote` (runs 1, 2; run 3 lost its first reads to the Worker drop, its fresh-load read-back matches) |
| S2 | PASS | "Before this class goes live"; Photo, Seats, Bags, Price in the live price book all missing; why-line "Add a photo first" above the buttons; GO LIVE disabled, EDIT CLASS enabled (runs 1-3) |
| S2b | PASS after fix | Run 2 FAILED: the dialog kept the page-load state after a save (defect in 30-08, fixed in e115ec8e: the dialog re-reads the class rows when it opens and after Publish). Run 3, same page, no reload: after the photo "Add the seats first", after seats "Add the bags first", GO LIVE disabled both times |
| S12 | PASS (read with decision 5) | Seed draft discarded; draft copied from the live book; Publish 200 with Lab Draft Class unpriced. The live book lists business, economy, van as available, plus Lab Draft Class as a parked row (`available = false`, no amounts): that is decision 5 as signed (the empty row is parked and never holds up Publish). The brief's select did not filter on `available` (run 3; lead's read-back of draft 3: `business t`, `economy t`, `lab-draft-class f`, `van t`) |
| S13 | PASS | Stand-in `0.01` start fare and per km for Lab Draft Class, Publish (version 4 live): all four done, no why-line, GO LIVE enabled (run 3) |
| S3 | PASS after fix | GO LIVE: badge LIVE, DB `active = true, hidden_at null`, `/about` shows the card. Focus went to `<body>`, not the row (run 3): defect in 30-08, fixed in 774be80a (focus retries while the table re-renders). Run 4: after GO LIVE `document.activeElement` is the LIVE badge of the same class (`data-class-id` equal), DB `active = true` |
| S3b | PASS | The seat stepper stops at 1 on a Live class and cannot reach "—" (there is no free text field to clear). The DB shows 1 only because the tester saved at the floor (run 3) |
| S15 | PASS | en 1440: "1 chauffeur is on this class", then "1 paid trip ahead has no chauffeur yet", in that order, no last-Live warning; ar 390 `dir=rtl`: same order, "رحلة واحدة مدفوعة قادمة بلا سائق بعد"; CANCEL keeps Business Live (run 1) |
| S4 | PASS | Retire with "No longer offered": row leaves, Retired count 1 to 2, focus on the Retired head, DB `true, No longer offered` (runs 1-3; run 3 on a class that was Live) |
| S5 | PASS | Two rows with reasons and BRING BACK; chevron down to up (runs 1-3) |
| S14 | PASS | Bring back: DRAFT again, out of the Retired list; Price in the live price book missing although the live book still had its 0.01 price; after a stand-in Publish (version 5) Price done, GO LIVE enabled (run 3) |
| S6 | PASS | `/fleet/chauffeurs` and `/fleet`: 307 to `/chauffeurs` (run 1) |
| S7 | PASS | Lab Old Driver flagged "Retired class: pick a new one" in red; others no flag; WITH A CLASS "2 / 3" (run 1) |
| S8 | PASS | Lab-old trip: picker offers no chauffeur; "1 chauffeur left out: retired class"; no "No chauffeur has the class" (run 1) |
| S16 | NOT VERIFIED in the browser | The lab setup trip has no saved price record, so the date change stops earlier with the existing "The saved price of this trip cannot be worked out again…" line; nothing was moved (`scheduled_at` unchanged). The retired-class refusal on a trip with a saved price is pinned by `apps/web/lib/ops/trip-change-retired-class.test.ts` (preview refused `class-not-sold`, confirm refused, nothing written) (run 1) |
| S9 | PASS with notes | 112 captures, 4 widths x 4 languages x 7 views: no sideways scroll, `dir` right, dialogs fit. `coverage()` on dashboard pages lists only labels already in the target language (sidebar labels translated by their own component, "Erledigt"/"Fait"), and data (admin name); no English left; About 0. Badge wraps under long names at 390, never clipped. Older finding, not Phase 30: on booking detail in Arabic the reference `VT-26-…` has no bidi isolation (run 1) |
| S10 | PASS | No pale yellow or cream anywhere; no glow on hover or press; on keyboard focus only the design-system `--vt-ring` (3px spread, no blur), which the project rules allow (run 1, read against the corrected row) |
| S11 | PASS | Dashboard `/chauffeurs` 200 with the Chauffeurs screen; public `/chauffeurs` 404 (run 1) |

## Defects found and fixed in this task

1. 30-08: Go live dialog showed stale rows after a save (S2b). Fixed e115ec8e, proven in run 3.
2. 30-08: focus fell to `<body>` after GO LIVE (S3). Fixed 774be80a, proven in run 4 (`PASS | S3-focus | focus on the class row's LIVE badge`).

## Not verified here

- S16 in the browser (see the row).
- Anything on live or staging; the 4242 payment after deploy; Koss's UAT in Hermes.
- Screenshots were saved, not looked at by the lead (PNG reading is not allowed in this session): the visual judgement at 1440/1024/768/390 is Koss's at UAT.
