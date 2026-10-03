# Hand-over — policy values get a draft and a Publish

**From:** job session `vamostaxi-eu-bb`, branch `fix/policy-settings-publish`, cut from
`origin/main` `24b03555`.
**To:** the control session.
**State:** built, gates green, ready for a fresh reviewer and then the owner's Ship.

## Migration number — read this first

This branch originally used **`20261007200000`** and was pushed with it at 13:29. At 14:15 the
controller reserved that same number for the settle-safety job (`3978fda9` on main), which had
not written its file yet. **I moved rather than argue the timestamp**: this branch is now
**`20261007210000_policy_draft_publish.sql`**, and `20261007200000` is left free for settle
safety exactly as the board says. Every gate was re-run after the renumber and after merging
`origin/main`.

Next free after this one is **`20261007220000`**.

## Why it exists

The owner tried to set the waiting time to 30 minutes on 2026-10-02 and the dashboard box
saved nothing. Decision and the full reasoning:
`.planning/decisions/2026-10-02-policy-values-draft-then-publish.md`. He chose "make them
save, with Publish" through the question form.

**This reverses D-27 for four values.** Say that out loud in review: `lib/ops/settings.ts`
used to open with "publishing a new policy version is a migration, not a console action".
It still holds for every other column of `settings_versions`.

## This is a money-adjacent, database change

Per the control rule it needs **a fresh reviewer, not the builder**, before it ships.
It changes what customers are promised (waiting time, free cancellation, minimum advance).

## Order to apply

1. Review in a clean clone: merge, install from the lockfile, all gates, the build.
2. Migration **`20261007210000_policy_draft_publish.sql`** — apply verbatim, then read back
   and compare with the local file. It creates one table, one function, grants to
   `vamos_staff` only. It does not touch any existing row and does not change
   `settings_versions`' shape.
3. Deploy Worker `vamos` with `--env staging`.
4. Read back on live:
   - `select count(*) from public.settings_policy_draft;` → 1
   - the draft's four values equal live policy row 15 (airport 60, city 15, cancel 24, advance 180)
5. Then the owner on dashboard → Settings → Booking policy: set **city waiting to 30**,
   Save, Publish. Read back the new `settings_versions` row and confirm `/terms` §08 and the
   database finally agree.

## The number that is actually wrong on live

Live policy row 15 grants **city waiting 15 minutes**. `/terms` §08 — his signed legal text —
promises **30 minutes** for every non-airport pickup (airport is 60 in both). The site has
been promising twice what the database grants. This change is the control that fixes it; the
legal copy is not touched, the database moves to it.

## Files

- `packages/db/supabase/migrations/20261007210000_policy_draft_publish.sql` (new)
- `packages/db/supabase/tests/policy_draft_publish.test.sql` (new, 18 tests)
- `packages/db/database.types.ts` (regenerated, +31 lines)
- `apps/web/lib/ops/settings.ts`, `apps/web/lib/ops/settings.test.ts`
- `apps/web/app/[locale]/(ops)/api/staff/settings/route.ts`
- `apps/web/app/[locale]/(ops)/api/staff/settings/policy-publish/route.ts` (new) + its mount
- `app/ops/OpsSettings.dc.html` (+ the synced copy under `apps/web/public`, gitignored)
- `.planning/decisions/2026-10-02-policy-values-draft-then-publish.md`
- `.planning/quick/261002-hph-policy-settings-publish/` (plan, summary, this file, `tools/`)

No file here is touched by the four other running jobs (p6 follow-ups, account phone,
Linux checkout reds, stripe events JSON).

## Gates

Green: typecheck · lint (6 pre-existing warnings, none in these files) · i18n:check ·
check:numbers · check:legal-claims · check:db-fences · check:public-env · test:unit
(3790 pass) · pgTAP 96 files / 2470 tests · db:seed:check (no drift) · db:types:check ·
db:mutation-gate (3 mutants killed) · browser click-through 9/9 in en, de, fr and ar.

Red, pre-existing and not mine: `packages/db/test/local/consent-reader.test.ts` — confirmed
by rebuilding the database without this migration and seeing the same failure.

## Not done on purpose

- `STATE.md`'s quick-task table is not edited, to avoid colliding with the other sessions.
  The controller adds the row `261002-hph` when this lands.
- Nothing applied to live, nothing deployed, `main` untouched.

## Two things for the queue, found on the way

1. A class-change difference payment stores no payment method —
   `20261007140000_class_change_reprice.sql:1148` omits `payment_method_type`. VT-26-0750's
   CHF 11.84 difference reads as no method while its first charge reads "card".
2. `settings_versions.label` on live grows by a word every price-book publish
   ("Staging matrix — placeholder, not owner-approved draft draft draft draft …").
   That belongs to the price-book publish route, not here.

## Review fixes 2026-10-03

Branch merged with `origin/main` 33c9b994 first (merge 872defe6, no conflicts; git combined
`packages/db/database.types.ts` itself — it holds main's `booking_cancel_change_pages` and this
branch's `settings_policy_draft` / `policy_publish_draft`). Lockfile changed, installed frozen.
Fixes in d82489b2, all in `app/ops/OpsSettings.dc.html`:

- a. Minimum advance is `min_advance_minutes`: box suffix, placeholder, "Live now" line and the
  change list say minutes. Stored value unchanged. Other boxes checked: Cancel window =
  `free_cancel_hours` (hours, right), airport and city waiting = `*_waiting_minutes` (minutes, right).
- b. Publish dialog Cancel: `variant="light"` (`ghost-inverse` is not in the bundle).
- c. Refused Save is shown: a refusal that names a box (`settings-error-min-advance`,
  `-free-cancel`, `-airport-wait`, `-city-wait`, or `settings-error-policy-number` pinned on the
  first box that is not a whole number) goes under that box through the kit Input's `error`
  prop: "Check the value: a whole number from 0 to {max}." Any other refusal goes in the header
  bar (`role="alert"`, `--vt-danger`, same span pattern as the Security pane). Also in the bar
  when he is on another pane. Cleared when a box changes, on Discard, or on a good save.
- d. Publish hint shows once, next to Publish. Change list heading: "Changes to publish".
- e. Change list: Lucide `arrow-right` through the kit `Icon`, outside `vt-dir-keep` so
  `laws.css` mirrors it in Arabic; old/new numbers inside `vt-dir-keep` (same shape as OpsDetail).
- f. "Live now": the number is an inline `vt-dir-keep` span. The unit stays outside it on
  purpose: an Arabic unit inside an LTR isolate reads reversed ("دقيقة 120").
- New strings `policyChangesTitle`, `policySaveCheck`, `policySaveWhole` in en/de/fr/ar.

Gates run in this worktree (2026-10-03 00:39 +04): vitest `lib/ops/settings.test.ts` +
`lib/ops/ops-dc-settings.test.ts` 51/51 pass (9 new; all 9 fail against the pre-fix page) ·
typecheck · lint (6 pre-existing warnings, none in these files) · lint:css · i18n:check ·
check:numbers · check:db-fences — all exit 0.

Not verified: full `test:unit`, pgTAP, db gates (controller runs them); a browser run of the
card (Arabic arrow mirror, error under the box, header line) on the local Worker; the change
list and live line at 390 px.
