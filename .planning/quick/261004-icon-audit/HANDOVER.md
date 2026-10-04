# 261004 icon audit — hand-over to the controller

Job session, branch `fix/icon-audit`, cut from `origin/main` `6c240d4b`, merged with `origin/main` `4c17e43c` (route icon live) at 19:08 +04.

Files added: `apps/web/lib/icons/icon-references.ts` (the scan), `apps/web/lib/icons/dynamic-icon-bindings.ts` (hand-read values of dynamic names), `apps/web/lib/icons/icon-files-exist.test.ts` (the guard), and here `tools/`, `screens/`, `shoot-result.txt` (the headless pictures). Removed: `apps/web/tests/unit/dc-icons-vendored.test.ts` (see "Folded"). No icon renamed or redrawn; no screen changed.

**Update 19:19 +04: the four missing icons are vendored.** The owner approved all four downloads (question form, about 19:12). The controller fetched them from github.com/lucide-icons/lucide `main`, `icons/<name>.svg` (ISC), and converted them to the vendored format; the converter reproduces the existing `map-pin.svg` and `route.svg` byte for byte (checked again here with `cmp`). This job copied `arrow-down.svg`, `tag.svg`, `sun.svg`, `moon.svg` into `assets/icons/` byte for byte (`cmp` identical) in one commit, `6930505c`. The allow-list in the guard is empty now (the mechanism stays). The "Missing" list is empty; its old table is kept as the record of what was asked and where.

## The three lists

Mocks = the live site and the dashboard (`app/**/*.dc.html`, `app/*.js`), drawn from `assets/icons/<name>.svg`. 76 `.svg` files there now (72 before the four downloads). The design-system bundle's own icons count with them.

### Present: 68 names, all have a file (64 at first audit, plus the four downloaded)

arrow-left-right 8, arrow-right 61, arrow-up 6, banknote 27, bed 3, bell 3, briefcase 12, bus 2, calendar 29, calendar-days 14, car 29, car-front 22, check 36, chevron-down 30, chevron-left 22, chevron-right 32, chevron-up 16, circle-alert 19, circle-check 19, clock 41, credit-card 9, ellipsis 2, external-link 17, eye 9, eye-off 9, file-text 16, funnel 7, globe 33, grip-vertical 1, image 3, info 21, layout-dashboard 9, list 6, loader-circle 1, log-out 9, luggage 17, mail 61, map 3, map-pin 49, menu 6, message-circle 47, minus 11, navigation 10, pencil 11, phone 58, plane 17, plane-landing 26, plus 57, printer 9, receipt 20, route 1, search 17, settings 25, shield-check 30, snowflake 9, star 24, ticket 26, train-front 3, trash-2 5, triangle-alert 15, user 42, user-plus 2, users 32, x 55.
(The number is how many places ask for it, counted at first audit. `route` has its file since `d2fc3310`. The four downloaded names are asked for in `OpsSupportTicket` for `arrow-down`, in `OpsPricing`, `OpsTable` and `BrandSelect` for `tag`, and in `OpsFleet`, `OpsTable` and `BrandSelect` for `sun` and `moon`.)

### Missing: 0 names now (at first audit 4 had no file; all four approved and vendored)

Record of what was asked:

| name | where it asked (file:line) | what the owner saw | Lucide has that exact name |
|---|---|---|---|
| `arrow-down` | `app/ops/OpsSupportTicket.dc.html:710` (`sortIcon`), drawn at `:181` | Dashboard Support board: the sort button in every column header was blank in its default state (newest first); `arrow-up` exists, so only the other state drew | yes |
| `tag` | `app/ops/OpsPricing.dc.html:1519` (extras form field list) | Dashboard Pricing, Surcharges & extras: the "Name" field had no lead icon | yes |
| `sun` | `app/ops/OpsFleet.dc.html:427` (vehicle field list) | Fleet: the "Morning" chauffeur select in the nested vehicle form. That form (`nestedFields`, line 612) opens only from an "add vehicle" button on a select (`f.startNested` in `OpsTable`); no field in the Fleet screen has an `addLabel`, so it is unreachable today (the "no cars" rule). Vendored anyway on the owner's approval | yes |
| `moon` | `app/ops/OpsFleet.dc.html:428` | same form, "Night" select | yes |

### Unused vendored files in `assets/icons`: 8 (no mock draws them; unchanged by the four downloads)

- `baby`, `plane-takeoff`, `facebook`, `instagram`: only listed in the helmet resource list of `app/home/home.dc.html` (lines 11, 45, 28, 32), never drawn. The mock footer draws its social marks as inline data images.
- `lock`, `log-in`, `upload`, `youtube`: not named anywhere in the mocks.
- All 8 are in the React copy's `IconName` union; `lock`, `log-in`, `facebook`, `instagram`, `youtube` are drawn by React pages. Harmless; nothing removed.

### React app (separate copy, `apps/web/public/brand/icons`, 68 files)

`IconName` union has 68 names, all 68 have a file; 59 distinct names are written as literals, none missing. 9 files are never written as a literal (`bus`, `ellipsis`, `funnel`, `grip-vertical`, `image`, `layout-dashboard`, `list`, `plane-takeoff`, `upload`): they are in the union, so they may be passed by a variable; harmless. The four new icons are not in the React copy: React does not ask for them (add them there, and to the `IconName` union, only if React needs one). `Button icon` / `iconEnd` in React render an empty `data-vt-icon` span (`Button.tsx:83`, `:85`) and no CSS in `apps/web` draws it, so a name given there shows nothing, with or without a file. Found, not changed, not tested.

### Other sources

- Design-system bundle (`design-system/_ds_bundle.js`): 18 fixed names (banknote, calendar, car-front, check, chevron-down/left/right, circle-check, clock, info, luggage, minus, plus, receipt, triangle-alert, user, users, x). All present. The bundle's mobile Rolic glyph set is inline SVG and never reads `assets/icons`.
- E-mail templates (`packages/emails/src`): no icon file named; mails carry the logo image only.
- Helmet `ext-resource-dependency` lines: 52, all name an existing file.
- CSS `mask` / `url()` into `assets/icons` or `brand/icons`: none (only the `--vt-icon-base` base path). Every public page file sets `--vt-icon-base`; dashboard screens inherit it from `ops.dc.html`.
- The sync copies the whole `assets/` folder: after `node scripts/sync-dc-mock-to-public.mjs`, `apps/web/public/assets/icons` has the same 76 `.svg` files plus the map json (77 entries; checked, and a test case).

## Dynamic names

65 places bind an icon name (`name="{{ … }}"`, `icon="{{ … }}"`), 53 distinct (file, expression) pairs. All 53 are resolved by reading the code and listed with their values in `dynamic-icon-bindings.ts` (44 rows; the home/pages copies of a component share a row). Unresolved: none. Limits to know: values passed by position, e.g. `card('Today', …, 'car-front', …)` in `OpsBoard`, are not icon-keyed, so the scan cannot find them by itself; they are in the hand-read table and the test checks each listed value is still a quoted name somewhere in `app/`. The dashboard table editor (`OpsTable`) takes its field icons from other screens' field lists; its rows list the union of those.

## What the test enforces (`pnpm test` in `apps/web`, 9 cases)

1. The scan is not empty (counts floor: a broken pattern cannot pass as zero names).
2. Every name asked for by the mocks, the bundle and the hand-read table has `assets/icons/<name>.svg`, unless it is in `WAITING_FOR_DOWNLOAD` (empty now; an entry reads `name: "where it shows, waiting for the owner's download approval"`).
3. A name on that list that now has a file, or is no longer asked for, fails the test: the list only shrinks.
4. A `{{ … }}` icon binding that is not in the table fails ("read where its value comes from"); a table row whose binding is gone fails.
5. Every listed dynamic value is still a quoted name in the `app/` sources.
6. React: the `IconName` union and every literal icon prop / `<Icon name>` have a file in `public/brand/icons` (allow-list empty).
7. E-mail templates name no icon file.
8. `route.svg` is the Lucide route icon (carried over, see "Folded").
9. After the sync, `public/assets/icons` equals `assets/icons` (skipped locally without a sync, fails in CI, same pattern as `public-no-internal-ids.test.ts`).

Mutation checks at first audit (each reverted, tree clean afterwards): a made-up `name="made-up-icon"` on an Icon tag, a made-up `icon: 'made-up-two'` in a page script, a made-up `url(/assets/icons/made-up-url.svg)`, a made-up `icon="made-up-bundle"` in the bundle, a made-up `icon="made-up-react"` in React, a new `name="{{ newThing }}"`, deleting `check.svg`, and copying a file in as `route.svg` (before the merge): every one failed the test with the name and file:line.

Mutation checks on the final tip (19:17 +04, each reverted, tree clean afterwards): `tag` put back on the allow-list fails "the waiting list shrinks" (`remove these from WAITING_FOR_DOWNLOAD: [ 'tag' ]`); `icon:'tag'` changed to `icon:'tag-x'` in `OpsPricing.dc.html:1519` fails the file check (`tag-x: app/ops/OpsPricing.dc.html:1519 (script)`) and the hand-read-table check.

## Folded

`fix/ops-toast-tone` is on main (`d2fc3310`), so `route` is off the allow-list. Its test `apps/web/tests/unit/dc-icons-vendored.test.ts` is deleted: its literal-name check is a narrower version of case 2 (mine also reads script values, the bundle, React, the helmet list and bound names), and its `route.svg` shape check moved into case 8 unchanged. One guard, not two.

## Fence fix (the controller's control check of `aa295815`)

`pnpm run check:db-fences` failed on `apps/web/lib/icons/icon-references.ts:27`: `const SKIP_DIRS = new Set([...])` at module scope trips the U31/ISOL-08 fence (no module-scope Map/Set/WeakMap/WeakSet under `apps/web/app` and `apps/web/lib`; test files are exempt by the fence, which is why the test file's own Sets pass). `SKIP_DIRS` is a plain array now (`.includes`). The other files in `apps/web/lib/icons/` were checked with the fence's own pattern (`^(export )?(const|let) x = new (Map|Set|WeakMap|WeakSet)(`): no other hit; `dynamic-icon-bindings.ts` holds arrays and objects only. Commit `8f9c7d16`.

## Pictures (headless Chromium, bare crops, 1440 wide, English and Arabic)

From the real dashboard shell (`apps/web/public` after the sync, served the way the dashboard host does: `ops.html` with its base href and the sign-in flag), every `/api/**` answer stubbed (`tools/stubs.mjs`), nothing reaches a server. The static server uses a free port and is closed by the script; no process was killed. Run: `node .planning/quick/261004-icon-audit/tools/shoot.mjs .planning/quick/261004-icon-audit/screens` (after `node scripts/sync-dc-mock-to-public.mjs`). Result log: `shoot-result.txt` (54 PASS, 0 FAIL).

- `screens/sort-en.png`, `screens/sort-ar.png`: the header of the "New" column on the Support board (`/support`): toggle chevron, ticket count, and the sort arrow `arrow-down` (default, newest first). English: arrow after the count at the right end; Arabic mirrored, arrow at the left (the reading end).
- `screens/extras-en.png`, `screens/extras-ar.png`: Pricing, tab "Surcharges & extras", "Add surcharge" form, first field "Name" (Arabic: الاسم) with the `tag` icon at the reading start, the field's own hint under it.
- Per picture: the icon names its file; the file answered 200; no 4xx or 5xx on any `/assets/icons/*` request (16 icon files requested on the support page, none failed); the icon paints pixels (166 px for the arrow); Arabic is right to left; nothing scrolls sideways; no page error, no console error, no failed request.
- Control runs: with `arrow-down.svg` and `tag.svg` answered 404, the check "the icon paints nothing" holds (0 px), so the paint check can fail.
- `sun` and `moon`: the nested vehicle form cannot be reached in the Fleet screen (see the table), so there is no picture. Their files are decoded and drawn on a canvas from the served path instead: `sun.svg` 502 px, `moon.svg` 539 px of stroke at 48 px, no page error. The guard covers the file existing.

## Checks on the final tip

Run in the worktree between 19:15 and 19:19 +04, on the tip before the commit that carries this file (this commit adds only hand-over, pictures and picture tools; no source or test change).

- install: `pnpm install --frozen-lockfile`: exit 0 (first run; lockfile and `package.json` untouched since).
- sync: `node scripts/sync-dc-mock-to-public.mjs`: 20 pages synced, 115 files stripped; `public/assets/icons` 77 entries (76 svg + the map json).
- typecheck: `pnpm typecheck`: exit 0 (emails, db, isolation-probe, web).
- lint: `pnpm lint`: exit 0, 0 errors, 6 warnings (older "unused eslint-disable" notes in other files, none in this job's files, the picture tools included).
- check:db-fences: `pnpm run check:db-fences`: all 8 checks passed, 1194 files scanned (it was red on `aa295815`).
- test:scripts: `pnpm run test:scripts`: exit 0, 30 tests, 30 pass, 0 fail.
- icon test `lib/icons/icon-files-exist.test.ts`: 9 passed, 0 skipped (synced), allow-list empty.
- with it, `lib/ops/ops-toast-tone-dc.test.ts` and `lib/security/public-no-internal-ids.test.ts`: 3 files, 79 tests passed.
- other gates run on the way (the earlier pass, before the downloads; no code they read has changed since): `check:public-env`, `check:numbers`, `check:legal-claims`, `i18n:check`: all pass.
- headless pictures: 54 PASS, 0 FAIL (above).
- Not run: full `test:unit` (told not to).

## NOT verified

- Nothing on live: the pictures are the local sync served offline with stubbed `/api/**` in headless Chromium; the deploy is the controller's.
- `sun` and `moon` have no picture; that the Fleet vehicle form cannot be opened is read from the code (`addLabel` / `startNested`), not clicked through.
- The four icon files came from the controller; this job fetched nothing and compared them with nothing upstream, only `cmp` against the controller's converted copies.
- The scan finds names by key (`icon`, `iconEnd`, `*Icon`, `glyph`, `chevron`, `*_ICONS`) and by tag attribute. A name handed to an icon through a differently named variable, with no literal in an icon-keyed place, would be missed by the scan; the hand-read table covers every bound name today, and a new bound name fails case 4.
- React `Button icon` never drawing (above) was read from the component and a grep for CSS, not seen in a browser.

## Owner's downloads: recorded

All four approved by the owner through the question form, about 19:12 +04 on 2026-10-04: `arrow-down`, `tag`, `sun`, `moon`. Source github.com/lucide-icons/lucide `main` `icons/<name>.svg` (ISC), fetched and converted by the controller; vendored in `6930505c`. Nothing waits for approval.

When a new icon is asked for with no file: the guard names it with file:line. Put it in `WAITING_FOR_DOWNLOAD` in `apps/web/lib/icons/icon-files-exist.test.ts` with a one-line reason while the owner decides; the test tells you to remove the line once the file lands.
