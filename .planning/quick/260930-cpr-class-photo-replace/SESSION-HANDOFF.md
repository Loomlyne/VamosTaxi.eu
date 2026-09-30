# Session hand-off — quick 260930-cpr (class photo: Remove link goes, replaced photo deleted at publish)

Written 2026-09-30 about 16:30 by the session "Vamos Taxi 26.4.2 completion". The session is long; this job is handed to a fresh one. "not verified" = not checked.

## Prompt for the new session

You are a Vamos Taxi work session, not the control session.
Repo `/Users/koss/Developer/VamosTaxi.eu` (main). Your folder: `/Users/koss/Developer/vamos-wt/class-photo-replace`, branch `feat/class-photo-replace`, cut from origin/main `adb7b322`. Nothing is built; this file is the only commit.
Never: push main, open a PR, deploy, change a row or a stored file on live (Supabase `yaumjzvylngfjhtuffqs`, R2 `vamos-photos-*`), invent a price or legal copy, use the stash. The owner signs design before code and UAT after. Every choice goes to him through the question form.
Read first: `.planning/prompts/00-common-rules.md`, `CLAUDE.local.md`, `.planning/CONTROL-BOARD.md`, `.planning/decisions/2026-09-30-class-photo-replace.md`, then this file, then the 26.2 finding:
`git -C /Users/koss/Developer/vamos-wt/phase-26.2 show gsd/phase-26.2-audit-2:.planning/phases/26.2-codebase-audit-bug-fix-simplify/26.2-BP-B.md` (row B8).

## Where things stand
- Not started. No picture, no plan, no code.
- Earlier jobs of the same session, all live and closed: 26.4.2 (main `37ba5b62`), phone sheet repairs (`ec1beed5`), phone home (`51b851e3`), class cards layout E with small photo files (`f7a3528b`, Worker `92504970`). Their hand-overs are on main under `.planning/quick/260930-*`. Do not reopen them.
- Owed by the owner on those: his UAT steps in each HANDOVER.md; on his iPhone, whether Safari's top and bottom strips are dark now.

## Owner decisions (recorded in `.planning/decisions/2026-09-30-class-photo-replace.md`)
1. His words (through the 26.2 session): the Remove link goes; a class always has a photo; you replace it by choosing another. A small markup change, screenshots for his signature.
2. Question form, this session: **"Delete both at publish"**: after a replaced class photo is published, the old photo and its small copies (`<key>.w640.webp`, `<key>.w1280.webp`) are deleted from storage for good.
3. Same day, about deleted extras: "anything deleted should be deleted completely".

## What to do next
1. Pictures first: the class photo field on dashboard /pricing without the Remove link, at 1440, 1024, 768, 390, English plus one of de/ar. One question, his signature. Then code.
2. The Remove link: `app/ops/OpsTable.dc.html` line 360 (the link), 1619 (`clearLabel`), 1635 (`clearPhoto`). The photo editor is shared (chauffeurs, vehicles, reviews use `editor:'photo'` too): add a field option (for example `noClear`) and set it on the class photo field in `app/ops/OpsPricing.dc.html` line 1433. Do not fork the component, do not remove the link for the other screens unless he says so (ask if unsure). Strings `clearPhoto` in four languages stay for the other screens.
3. The save bug found by 26.2 (Remove then Save brings the old photo back) disappears with the link for classes. Check the same bug on the other photo fields and report it to the control session; do not fix it here.
4. Plan the delete before writing it. It must name every place that can still point to an old class photo: `vehicle_classes.photo_path`, rate-book draft and published versions and any saved snapshot (`apps/web/lib/ops/rate-book.ts`, `lib/pricing/rateBook.ts`, `lib/pricing/public-board.ts`), quotes and bookings (does a booking or a price snapshot store the photo path or only the class id: not verified), e-mails already sent (`packages/emails`: grep found no photo path there, not verified by reading), the confirmation and manage pages, inactive class rows (mahaha, economy, business, first, van also have photos).
5. Rule for the delete: only after the publish commits; only a key that no class row, draft or published, points to any more; never the key that is published now; delete the original and both small copies; a failed delete is logged and the publish still stands. The small-copy names come from `apps/web/lib/photos/variant.ts` (`variantKey`).
6. `apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts` and `apps/web/lib/ops/rate-book.ts`: WAIT for the control session's word that 26.2 hand-over 2 is on main. `OpsTable.dc.html`, `OpsPricing.dc.html` and `apps/web/lib/ops/photos.ts` are free now. Tell the control session the exact files before editing under `(ops)` or `lib/ops`.
7. Tests first for the delete: replaced and published removes three objects; replaced but not published removes nothing; the published key is never removed; a key still used by another class row is kept; R2 failure does not fail the publish. Test through the Worker's client options if the database is involved.
8. Hand-over file as in `00-common-rules.md`; UAT for him on the dashboard, no payment step unless checkout is touched.

## Unanswered by the owner
- Whether the Remove link also goes on chauffeur, vehicle and review photos. His words were about the class photo only.
- Whether old photos of inactive class rows are deleted too. Not asked.

## How to work
- Visual specs: `node scripts/sync-dc-mock-to-public.mjs` first; one spec file per run, `--workers=2 --timeout=60000 --reporter=line`, sandbox off.
- After any spec that starts `next dev`: `rm -rf apps/web/.next-*` and `git checkout -- apps/web/tsconfig.json apps/web/next-env.d.ts`. Otherwise `pnpm check:public-env` hangs for half an hour.
- Do not chain the whole gate list in one shell call; run the touched specs and unit tests, the control session runs the full set in a clean clone.
- Keep pictures in the job's `screens/` folder; `/private/tmp` is emptied on restart.
- Local Worker proof for R2 and the image tool: `pnpm exec opennextjs-cloudflare build` in `apps/web` (about 5 minutes), then `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgres://x:x@127.0.0.1:5/x WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_NOCACHE=postgres://x:x@127.0.0.1:5/x pnpm exec wrangler dev --local --env staging --port 4301`; put and read objects with `wrangler r2 object put|get vamos-photos-staging/<key> --local --env staging`. Stop it with `pkill -f "[w]rangler dev"`.
- Known red and not yours: visual `shell` (56), `home` (4), `home-hero` (4), `error-pages` (1): harness and React-home failures on main, 26.0's list.
- The owner designs by reference: if he refuses a picture, ask for his screenshot or find the earlier version in git history.

## Open small items from the earlier jobs (for the control board, not for this branch)
- WebKit: a Back pressed within 0.8 s after closing the booking sheet with the X does nothing.
- German class card says "Gepäckstücke", the signed picture said "Koffer".
- SELECT on the home class card is 44 px, not 54.
- An empty 400 px band sits under the footer on the phone home page (dark since the phone-home ship).
- Business and Van luxury small photo sizes were not measured; the control session read Economy on live (137,906 bytes).
