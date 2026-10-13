# Remove the five test classes and the five test reviews (Phase 30, CLS-13)

You run this yourself. An agent never runs it, and never touches the live database for it.

The script removes the classes `business`, `economy`, `first`, `van`, `mahaha` and the reviews
`rv-1` to `rv-5`, with everything attached to them, in one transaction. First it copies every row it
will delete into a backup schema `backup_p30_20261012`. If anything looks wrong it stops and
changes nothing. It never touches a booking, a payment, a price snapshot, a vehicle, a chauffeur, a
surcharge or a price book that is not about these classes.

Files: `docs/runbook/p30-remove-test-classes.sql`. It was proven on a local copy of the schema with
`scripts/p30-local-proof.sh` (never on live).

## Order: this script comes first

Decision 1 (signed 2026-10-12, alternative): you run this script FIRST, before any Phase 30 database
change and before the new site version. The script uses nothing that Phase 30 adds. The Phase 30
migration refuses to run while any of the five classes still exists (`p30-test-classes-present`), so
the order is:

- (a) the archive tag and the different-model check (steps 1 and 2),
- (b) you run the script (steps 3 to 5),
- (c) the controller's read-only check that the five are gone,
- (d) the Phase 30 migrations,
- (e) the Worker deploy.

## Steps

1. The controller exports the rows read-only and pushes them under the tag
   `archive/p30-test-classes-20261012` on GitHub. You do not do this. Do not go on until the
   controller says the tag is on GitHub.
2. A different model (the Sonnet `reviewer` agent) checks this SQL against the live facts, read-only.
   Its verdict is in the hand-over. The controller also reads the number of published reviews that are
   not `rv-1` to `rv-5` (see "What the public site shows" below) and writes it in the hand-over.
3. Open the Supabase SQL editor for project `yaumjzvylngfjhtuffqs` and start a new query.
4. Run the preview. Copy the block under "STEP 0 - PREVIEW" from the script, remove the `/*` and `*/`
   lines, and run it. Check:
   - five classes, each `active = false`, and the four columns named `must_be_0_...` are 0 in every row;
   - five reviews (`rv-1` to `rv-5`, source `manual`).
   If a number is different, stop and send it to me.
5. Paste the whole script from `begin;` to `commit;` into a new query and run it once. Change
   nothing in it.
6. Expected messages (NOTICE lines):
   - `P30: 5 classes and 5 reviews selected (match expected); no references; no surcharge attached`
   - `P30: foreign-key list is complete`
   - `P30 done: 5 classes, 5 reviews removed (... rates, ... routes, ... bands, ... city rules); backup in backup_p30_20261012; 0 rows left; triggers re-enabled`

   If you see `P30 abort: ...` nothing was changed: send me the message.
7. The copies stay in schema `backup_p30_20261012`, one table per source table. Drop that schema
   only when you say so. Do not run the script a second time: it stops at once, because the backup
   schema exists.

## Why it is safe

- The count guards: if the number of classes or reviews found differs from 5, it aborts.
- The reference guard: if any booking leg, price snapshot, vehicle or chauffeur still points at one of
  the classes, it aborts. So does a review other than `rv-1` to `rv-5` that names one of them.
- The surcharge guard: a surcharge attached to a city-to-city price rule of these classes would make
  the database refuse the delete. The script checks first and aborts. It never edits a surcharge.
- The foreign-key check: if a table that points at `vehicle_classes` is not in the script's list, it
  aborts.
- One transaction: any failed check rolls everything back, including the backup schema.
- The four frozen-price-row triggers (`distance_rates_frozen`, `fixed_routes_frozen`,
  `distance_bands_frozen`, `rate_version_rules_frozen`) are switched off by name only for the tables
  it deletes from, and switched back on inside the same transaction. The script checks that none is
  still off before it commits.
- No price is written. The session setting `session_replication_role` is not used.

## What the public site shows after rv-1 to rv-5 are gone (decision 6b, for you to sign)

This was researched read-only at planning time (2026-10-12). No page changes in this phase.

Where it comes from: the header trust bar (`app/home/SiteHeader.dc.html`, and its twin in
`app/pages/SiteHeader.dc.html`), the trust area under the booking card and the Trustpilot link in the
booking bar (`app/home/home.dc.html`), and the home Reviews section (`app/home/Reviews.dc.html`) all
read one list only: `window.VamosReviews.published()` (`app/vamos-reviews.js`). That list is loaded
from `GET /api/reviews`, which reads `public.reviews where published = true`. The score (average) and
the count are worked out in the browser from the published rows with a rating above 0. There is no
stored total, and none of these pages reads `reviews.vehicle_class_id`.

After the script, if `rv-1` to `rv-5` were every published review (the earlier decision says they are
every review in the table):

- the header trust bar shows "Guest reviews will show here once they are published." in place of the
  stars, the score and the count;
- the trust area under the booking card shows the same line, and the Trustpilot link in the booking
  bar disappears;
- the home Reviews section shows nothing (it needs at least 3 published reviews);
- no score and no count is invented.

If other published reviews exist, those alone set the score and the count. The controller reads the
number of published reviews outside `rv-1` to `rv-5` before you run the file and writes it in the
hand-over.

The line "Guest reviews will show here once they are published." stays as it is. Changing it is a
separate small job on your word (deferred).

## Photos of these classes

The SQL does not touch R2. The class photos are swept by the next owner Publish, after the 24 hour
grace, because nothing references them any more. The controller checks with
`wrangler r2 object list` afterwards.
