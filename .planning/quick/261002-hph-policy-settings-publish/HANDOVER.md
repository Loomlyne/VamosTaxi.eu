# Hand-over — policy values get a draft and a Publish

**From:** job session `vamostaxi-eu-bb`, branch `fix/policy-settings-publish`, cut from
`origin/main` `24b03555`.
**To:** the control session.
**State:** built, gates green, ready for a fresh reviewer and then the owner's Ship.

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
2. Migration **`20261007200000_policy_draft_publish.sql`** — apply verbatim, then read back
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

- `packages/db/supabase/migrations/20261007200000_policy_draft_publish.sql` (new)
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
