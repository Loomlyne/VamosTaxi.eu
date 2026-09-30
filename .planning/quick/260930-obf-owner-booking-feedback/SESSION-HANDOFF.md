# Session hand-off — quick 260930-obf (26.4.2, owner booking feedback)

Written 2026-09-30 by the "26.4.2 completion" session. Replaces the 03:00 hand-off. "not verified" = not checked.

## Prompt for the new session

You are a Vamos Taxi work session, not the control session.
Repo `/Users/koss/Developer/VamosTaxi.eu` (main). This job's folder: `/Users/koss/Developer/vamos-wt/fix-26.4.2`, branch `fix/26.4.2-booking-feedback`.
Never: push main, open a PR, deploy, change a row on Supabase `yaumjzvylngfjhtuffqs`, invent a price or legal copy, use the stash. The owner signs discuss, design, plan and UAT. Every choice goes to him through the question form.
Read first: `.planning/prompts/00-common-rules.md` on main, `CLAUDE.local.md`, `.planning/CONTROL-BOARD.md`, then this file and `HANDOVER.md` beside it.
26.4.2 is finished and live. Do not rebuild it. Your work is only what "What to do next" lists, and only when the owner or the control session asks.

## Where things stand

- **Live.** 26.4.2 shipped 2026-09-30 12:22 by the control session: main `37ba5b62`, Worker `59c18372`, rollback `a55b2c19` (control board, ship order row 1).
- Branch tip with product code: `58eb48c7`. The control session ran its own full check of it in a clean clone before shipping.
- Done in this session, with proof:
  - Flight-edit challenge bug (`6e415f97`): `checkout-pay-19` 10 of 10 green; the flight-edit case was red with the old `CheckoutForm.tsx`; a new case proves one re-quote with the solved token.
  - Class photo crop (`cfab7b34`): laptop home photo 3:2, `object-position: 50% 72%` on both surfaces.
  - Checks on `c2e9ed47`: typecheck, unit, lint, lint:css, check:numbers, check:legal-claims, check:public-env, check:db-fences, i18n:check, seed:check, build, eight visual files. Table in `HANDOVER.md`.
  - WebKit, Firefox, Chromium at 1081, 1280, 1360, 1440: raw results in `scratch/xb-results.jsonl`.
- Signed by the owner: laptop bar (02:50), class cards and the one-page phone sheet (11:50). Pictures `screens/sign2-*.png`.
- Not verified by this session: anything on live, real Turnstile, a payment, real Safari or a real phone.

## Owner decisions (OWNER-DECISIONS-2026-09-30.md, items 8 to 10)

- Class cards: signed. One-page phone and tablet booking: signed.
- Photo weight: the site serves a smaller version of every class photo. Follow-up job, on the control board, not started, not assigned.

## What to do next

1. Nothing in this branch. It is on main; the folder is a tidy-up candidate, on the owner's word only.
2. Owed by the owner: the 15 UAT steps in `HANDOVER.md`, the 4242 payment first. Then the control session reads `booking_payments`.
3. If asked to build "site serves smaller class photos": it is a new job, a new branch from origin/main, design signed first. Facts: the three photos are PNG, 1122 x 1402, 2.3 to 2.8 MB, served from `/photos/classes/...` with a one-year immutable cache. Cloudflare is on Workers Free (no paid image resizing assumed: ask). Open question for him: make the small version at upload in the dashboard, or on the fly.
4. Tell the 26.0 session if it has not merged main yet: `checkout-pay-19.spec.ts` now mocks `/api/quote/reprice` and its `test.fail` on the flight-edit case must go.

## How to work

- Visual specs: `node scripts/sync-dc-mock-to-public.mjs` first, then one file at a time from `apps/web`: `npx playwright test tests/visual/<file>.spec.ts --workers=2 --timeout=60000 --reporter=line`, output to a log, sandbox off. `checkout-sections` takes about 11 minutes.
- `next dev` inside a spec rewrites `apps/web/tsconfig.json` and `next-env.d.ts`. Restore both with `git checkout --` before committing.
- `/private/tmp` is emptied when the Mac restarts. Keep pictures and raw results in the repo.
- Signing pictures: copy `scratch/zz-sign-obf.spec.ts.txt` to `apps/web/tests/visual/zz-sign-obf.spec.ts`, fix the three paths at the top (OUT, PHD, XB), download the three class photos into PHD as `economy.png`, `business.png`, `van-luxury.png`, run with `--project=component-1440 --workers=1`, then remove the spec. It also holds the three-engine laptop bar pass.
- The home mock's own demo places carry no Mapbox id and get no quote. In fixtures pick the stub option by its address text, not by name.
- A field's accessible name is translated by the locale runtime. In de/fr/ar tests find fields by id, not by the English name.
- The Read tool's hook timed out several times on PNG files around 04:15; a retry later worked.

## Open small items

- The challenge text and widget after a flight edit were never seen with real Turnstile.
- `:has()` fallback on browsers older than Safari 15.4, Chrome 105, Firefox 121: not tested.
- Old pictures `screens/sign-a-*`, `sign-c-*`, `sign-d-*` are superseded by `sign2-*`; left in place.
