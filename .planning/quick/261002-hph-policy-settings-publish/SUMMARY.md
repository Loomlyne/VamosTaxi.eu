---
quick_id: 261002-hph
slug: policy-settings-publish
status: complete
branch: fix/policy-settings-publish
migration: 20261007200000_policy_draft_publish.sql
owner_decision: .planning/decisions/2026-10-02-policy-values-draft-then-publish.md
---

# The four policy boxes save and publish

**One-liner:** the dashboard's minimum advance, free cancellation, airport waiting and city
waiting boxes now keep what you type and go live through a Publish, instead of ignoring it.

## What was wrong

He tried to set the waiting time to 30 minutes and could not. Two layers were dead:

- `app/ops/OpsSettings.dc.html` bound all four boxes to empty handlers
  (`setAirportWait: () => {}`), so typing changed nothing.
- `/api/staff/settings` wrote `public.settings` only and said so in its own header (D-27);
  the four values live in `settings_versions`, which it never touched.

It was a shown control that was not live — against his first standing rule.

## What it does now

- Save keeps the four values in a new `public.settings_policy_draft` (one row).
- Publish calls `public.policy_publish_draft`, which INSERTs a superseding
  `settings_versions` row carrying every other column forward.
- Publish is admin-only and stays closed while there are unsaved changes, so he never
  publishes stored numbers while reading different ones on screen.
- The card lists what will change ("City waiting included: 15 → 30 min") and asks once.
- A box he has never touched shows the live value rather than a blank.

## Verified

- **Browser, all four languages, 9/9 each** — typing, Save, the change list, Publish,
  the confirm, the server moving, the list emptying.
  `node .planning/quick/261002-hph-policy-settings-publish/tools/drive.mjs` (`VT_LANG=de|fr|ar`).
- **pgTAP 96 files / 2470 tests pass**, including 18 new in `policy_draft_publish.test.sql`.
- **Database proof on a stack built from zero**: the draft row exists, an unchanged draft is
  refused, 30 → 45 publishes as a new row, tiers/timezone/quote lock are carried forward,
  a second publish is refused, history stays append-only (23001), out-of-range is 23514.
- Unit suite 3790 pass / 0 fail. typecheck, lint, i18n:check, check:numbers,
  check:legal-claims, check:db-fences, check:public-env, db:seed:check, db:types:check,
  db:mutation-gate (3 mutants killed) all pass.

## Two faults the proofs caught that the tests did not

1. **The buttons rendered blank.** I passed `label="…"` to the design-system `Button`, which
   takes children. Typecheck, lint and 3790 unit tests were all green with three unlabelled
   buttons on the page. Only the browser run found it.
2. **A fresh database got no draft row.** Migrations run before the seed, so the
   seed-from-live `insert … select` matched nothing, and `PATCH`'s bare `UPDATE … where id = 1`
   would have changed zero rows and reported success — the same silent Save, rebuilt. The row
   is now made unconditionally, the write is an upsert, and a missing value reads through to live.

## Not verified

- Nothing on live. No migration applied, no deploy. That is the controller's to do.
- `packages/db/test/local/consent-reader.test.ts` fails — **pre-existing**, confirmed by
  rebuilding the database without this migration and seeing the same failure.

## Noticed, not fixed (for the controller)

- A class-change difference payment records no payment method: the insert at
  `20261007140000_class_change_reprice.sql:1148` omits `payment_method_type`. VT-26-0750's
  CHF 11.84 difference has a null method while its first charge says "card".
- Live `settings_versions` labels grow by one word per price-book publish
  ("… draft draft draft draft"). The price-book publish route owns that.
- The local seed grants city waiting 30 while live grants 15, so no local test would ever
  have caught the mismatch with `/terms` §08.
