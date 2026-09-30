# Session hand-off — "Vamos Taxi 26.4.2 completion", end of 2026-09-30

Replaces the earlier hand-off in this file. Every job this session took is finished and handed over; nothing is half-built. "not verified" = not checked.

## Prompt for the new session

You are a Vamos Taxi work session, not the control session.
Repo `/Users/koss/Developer/VamosTaxi.eu` (main). Work only in your own folder under `/Users/koss/Developer/vamos-wt/`, on a branch cut from origin/main of that moment.
Never: push main, open a PR, deploy, change a row or a stored file on live (Supabase `yaumjzvylngfjhtuffqs`, R2 `vamos-photos-*`), invent a price, a rate or legal copy, use the stash. The owner signs design before code and UAT after. Every choice goes to him through the question form, one decision per question, with the page on vamostaxi.site and one example.
Read first: `.planning/prompts/00-common-rules.md`, `CLAUDE.local.md`, `.planning/CONTROL-BOARD.md`, the `.planning/decisions/` files of 2026-09-30, then this file.
Ask the control session what to take next; do not reopen the jobs listed below.

## Where things stand
| Job | Branch | State |
|---|---|---|
| 26.4.2 owner booking feedback | `fix/26.4.2-booking-feedback` | Live 12:22 (main `37ba5b62`) |
| Phone booking sheet repairs (scroll after close, keyboard) | `fix/phone-sheet-bugs` | Live 14:40 (`ec1beed5`); Lenis root cause fixed by the control session in `assets/lenis-boot.js` (`3d74d6a0`) |
| Phone home: Trustpilot row, full-page menu, hero behind Safari bars | `fix/phone-home` | Live 15:20 (`51b851e3`) |
| Class cards layout E + small photo files (`/photos/<key>?w=640`) | `feat/class-photo-small` | Live 16:12 (`f7a3528b`, Worker `92504970`); live photo 2,768,149 → 137,906 bytes |
| No Remove link on dashboard photos; unused class photos deleted at Publish | `feat/class-photo-replace` at `4d2f5ba0` (+ this file) | **Handed over, not live.** Control session checks and asks him for Ship. Folder `/Users/koss/Developer/vamos-wt/class-photo-replace` |

Hand-overs with checks, not-verified lists and his UAT steps: `.planning/quick/260930-obf-*/HANDOVER.md`, `260930-psb-*`, `260930-phm-*`, `260930-cps-*` (on main) and `260930-cpr-*/HANDOVER.md` (this branch).

## Owner decisions of the day not obvious from the code
- Field order everywhere Flight → From → To → When → Travellers; one-page phone booking; own date/time picker (26.4.2, signed).
- Class cards: layout E from his own screenshot (`.planning/quick/260930-cps-class-photo-small/screens/owner-reference-2026-09-30.png`), same card on home, checkout, tablet, phone.
- Class photos: small copy made once and kept; a replaced class photo and its copies deleted **at Publish**; a class deleted for good takes its photo; no Remove link on any dashboard photo. Recorded in `.planning/decisions/2026-09-30-class-photo-replace.md`.
- Phone home: Trustpilot as one row inside the bar card ("row only"); full-page menu; hero reaches behind Safari's bars (he judges the bar colour on his iPhone).

## What to do next
1. Nothing of this session is waiting on code. The control session ships `feat/class-photo-replace` on his word.
2. After that ship: the first Publish deletes old unused class photos on live R2 (irreversible). Read the Worker log for `class_photos_deleted` / `class_photo_delete_failed`.
3. Owed by the owner: UAT in each hand-over; on his iPhone, whether Safari's strips are dark and whether the full-page menu is right.

## How to work (learned today)
- Visual specs: `node scripts/sync-dc-mock-to-public.mjs` first; one spec per run, `--workers=2 --timeout=60000 --reporter=line`, sandbox off.
- After any spec that starts `next dev`: `rm -rf apps/web/.next-*`, `git checkout -- apps/web/tsconfig.json apps/web/next-env.d.ts`. Otherwise `check:public-env` hangs for half an hour. Do not chain the whole gate list in one shell call; the control session runs it in a clean clone.
- The mock header exists twice (`app/pages/SiteHeader.dc.html`, `app/home/SiteHeader.dc.html`, identical) plus the React twin `apps/web/components/shell/SiteHeader.css`.
- Dashboard screens served alone need `vamos-i18n-dict.js`, `vamos-locale.js`, `vamos-ops-api.js`, `vamos-ops-data.js` injected and `/api/staff/rate-book` stubbed; recipe in `.planning/quick/260930-cpr-class-photo-replace/zz-cpr-shots.spec.ts.txt`.
- Local Worker proof (R2, image tool): `pnpm exec opennextjs-cloudflare build` in `apps/web`, then `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgres://x:x@127.0.0.1:5/x WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_NOCACHE=postgres://x:x@127.0.0.1:5/x pnpm exec wrangler dev --local --env staging --port 4301`; objects with `wrangler r2 object put|get vamos-photos-staging/<key> --local --env staging`; stop with `pkill -f "[w]rangler dev"`.
- Playwright WebKit may need `npx playwright install webkit` (the cache was wiped once today). `/private/tmp` is emptied on restart: keep pictures in the job's `screens/`.
- When he refuses designs, ask for his screenshot or find the earlier version in git history.
- Known red on main, not ours: visual `shell` (56), `home` (4), `home-hero` (4), `error-pages` (1).

## Open small items (for the control board)
- WebKit: Back pressed within 0.8 s after closing the booking sheet with X does nothing.
- German class card says "Gepäckstücke"; his signed picture said "Koffer".
- SELECT on the home class card is 44 px, not 54.
- An empty 400 px band under the footer on the phone home (dark since the phone-home ship).
- Business and Van luxury small photo sizes not measured on live.
- The class-photo sweep was tested with a fake bucket only; the SQL read of `photo_path` is not exercised by a test.
- Main checkout `/Users/koss/Developer/VamosTaxi.eu` shows `apps/web/next-env.d.ts` and `apps/web/tsconfig.json` modified (dev-server rewrite, not from this session's commits) and the unsigned Lenis folder `.planning/quick/260928-q4t-…` untracked; left as found.
