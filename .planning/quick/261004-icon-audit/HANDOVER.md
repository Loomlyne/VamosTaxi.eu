# 261004 icon audit — hand-over to the controller

Job session, branch `fix/icon-audit`, cut from `origin/main` `6c240d4b`, merged with `origin/main` `4c17e43c` (route icon live) at 19:08 +04.
Files added: `apps/web/lib/icons/icon-references.ts` (the scan), `apps/web/lib/icons/dynamic-icon-bindings.ts` (hand-read values of dynamic names), `apps/web/lib/icons/icon-files-exist.test.ts` (the guard). Removed: `apps/web/tests/unit/dc-icons-vendored.test.ts` (see "Folded"). No icon added, renamed or redrawn; no screen changed; nothing downloaded.

## The three lists

Mocks = the live site and the dashboard (`app/**/*.dc.html`, `app/*.js`), drawn from `assets/icons/<name>.svg`. 72 `.svg` files there. The design-system bundle's own icons count with them.

### Present: 64 names, all have a file

arrow-left-right 8, arrow-right 61, arrow-up 6, banknote 27, bed 3, bell 3, briefcase 12, bus 2, calendar 29, calendar-days 14, car 29, car-front 22, check 36, chevron-down 30, chevron-left 22, chevron-right 32, chevron-up 16, circle-alert 19, circle-check 19, clock 41, credit-card 9, ellipsis 2, external-link 17, eye 9, eye-off 9, file-text 16, funnel 7, globe 33, grip-vertical 1, image 3, info 21, layout-dashboard 9, list 6, loader-circle 1, log-out 9, luggage 17, mail 61, map 3, map-pin 49, menu 6, message-circle 47, minus 11, navigation 10, pencil 11, phone 58, plane 17, plane-landing 26, plus 57, printer 9, receipt 20, route 1, search 17, settings 25, shield-check 30, snowflake 9, star 24, ticket 26, train-front 3, trash-2 5, triangle-alert 15, user 42, user-plus 2, users 32, x 55.
(The number is how many places ask for it. `route` has its file since `d2fc3310`.)

### Missing: 4 names, no file (each is blank on screen today)

| name | where it asks (file:line) | what the owner sees | Lucide has that exact name |
|---|---|---|---|
| `arrow-down` | `app/ops/OpsSupportTicket.dc.html:710` (`sortIcon`), drawn at `:181` | Dashboard Support board: the sort button in every column header is blank in its default state (newest first); `arrow-up` exists, so only the other state draws | yes |
| `tag` | `app/ops/OpsPricing.dc.html:1519` (extras form field list) | Dashboard Pricing, Extras: the "Extra name" field has no lead icon | yes |
| `sun` | `app/ops/OpsFleet.dc.html:427` (vehicle field list) | Fleet: the "Morning" chauffeur select in the nested vehicle form. That form (`nestedFields`, line 612) opens only from an "add vehicle" button on a select; no chauffeur field offers one today, so it looks unreachable under the "no cars" rule. Check before spending a download | yes |
| `moon` | `app/ops/OpsFleet.dc.html:428` | same form, "Night" select | yes |

### Unused vendored files in `assets/icons`: 8 (no mock draws them)

- `baby`, `plane-takeoff`, `facebook`, `instagram`: only listed in the helmet resource list of `app/home/home.dc.html` (lines 11, 45, 28, 32), never drawn. The mock footer draws its social marks as inline data images.
- `lock`, `log-in`, `upload`, `youtube`: not named anywhere in the mocks.
- All 8 are in the React copy's `IconName` union; `lock`, `log-in`, `facebook`, `instagram`, `youtube` are drawn by React pages. Harmless; nothing removed.

### React app (separate copy, `apps/web/public/brand/icons`, 68 files)

`IconName` union has 68 names, all 68 have a file; 59 distinct names are written as literals, none missing. 9 files are never written as a literal (`bus`, `ellipsis`, `funnel`, `grip-vertical`, `image`, `layout-dashboard`, `list`, `plane-takeoff`, `upload`): they are in the union, so they may be passed by a variable; harmless. `Button icon` / `iconEnd` in React render an empty `data-vt-icon` span (`Button.tsx:83`, `:85`) and no CSS in `apps/web` draws it, so a name given there shows nothing, with or without a file. Found, not changed, not tested.

### Other sources

- Design-system bundle (`design-system/_ds_bundle.js`): 18 fixed names (banknote, calendar, car-front, check, chevron-down/left/right, circle-check, clock, info, luggage, minus, plus, receipt, triangle-alert, user, users, x). All present. The bundle's mobile Rolic glyph set is inline SVG and never reads `assets/icons`.
- E-mail templates (`packages/emails/src`): no icon file named; mails carry the logo image only.
- Helmet `ext-resource-dependency` lines: 52, all name an existing file.
- CSS `mask` / `url()` into `assets/icons` or `brand/icons`: none (only the `--vt-icon-base` base path). Every public page file sets `--vt-icon-base`; dashboard screens inherit it from `ops.dc.html`.
- The sync copies the whole `assets/` folder: after `node scripts/sync-dc-mock-to-public.mjs`, `apps/web/public/assets/icons` has the same 72 `.svg` files (checked, and now a test case).

## Dynamic names

65 places bind an icon name (`name="{{ … }}"`, `icon="{{ … }}"`), 53 distinct (file, expression) pairs. All 53 are resolved by reading the code and listed with their values in `dynamic-icon-bindings.ts` (44 rows; the home/pages copies of a component share a row). Unresolved: none. Limits to know: values passed by position, e.g. `card('Today', …, 'car-front', …)` in `OpsBoard`, are not icon-keyed, so the scan cannot find them by itself; they are in the hand-read table and the test checks each listed value is still a quoted name somewhere in `app/`. The dashboard table editor (`OpsTable`) takes its field icons from other screens' field lists; its rows list the union of those.

## What the test enforces (`pnpm test` in `apps/web`, 9 cases)

1. The scan is not empty (counts floor: a broken pattern cannot pass as zero names).
2. Every name asked for by the mocks, the bundle and the hand-read table has `assets/icons/<name>.svg`, unless it is in `WAITING_FOR_DOWNLOAD` (the four names above, each with where it shows and "waiting for the owner's download approval").
3. A name on that list that now has a file, or is no longer asked for, fails the test: the list only shrinks.
4. A `{{ … }}` icon binding that is not in the table fails ("read where its value comes from"); a table row whose binding is gone fails.
5. Every listed dynamic value is still a quoted name in the `app/` sources.
6. React: the `IconName` union and every literal icon prop / `<Icon name>` have a file in `public/brand/icons` (allow-list empty).
7. E-mail templates name no icon file.
8. `route.svg` is the Lucide route icon (carried over, see below).
9. After the sync, `public/assets/icons` equals `assets/icons` (skipped locally without a sync, fails in CI, same pattern as `public-no-internal-ids.test.ts`).

Mutation checks (each reverted, tree clean afterwards): a made-up `name="made-up-icon"` on an Icon tag, a made-up `icon: 'made-up-two'` in a page script, a made-up `url(/assets/icons/made-up-url.svg)`, a made-up `icon="made-up-bundle"` in the bundle, a made-up `icon="made-up-react"` in React, a new `name="{{ newThing }}"`, deleting `check.svg`, and copying a file in as `route.svg` (before the merge): every one failed the test with the name and file:line.

## Folded

`fix/ops-toast-tone` is on main (`d2fc3310`), so `route` is off the allow-list. Its test `apps/web/tests/unit/dc-icons-vendored.test.ts` is deleted: its literal-name check is a narrower version of case 2 (mine also reads script values, the bundle, React, the helmet list and bound names), and its `route.svg` shape check moved into case 8 unchanged. One guard, not two.

## Checks on the final tip

Run in the worktree on the tip after the merge of `origin/main` `4c17e43c`.

- install: `pnpm install --frozen-lockfile`: exit 0.
- sync: `node scripts/sync-dc-mock-to-public.mjs`: 20 pages synced, `public/assets/icons` 73 entries (72 svg + the map json), same as `assets/icons`.
- typecheck: `pnpm typecheck`: exit 0 (emails, db, isolation-probe, web).
- lint: `pnpm lint`: exit 0, 0 errors, 6 warnings, all older "unused eslint-disable" notes in other files, none in the new ones.
- new test `lib/icons`: 9 passed, 0 skipped (synced).
- existing asset/icon tests run with it: `public-no-internal-ids`, `dc-mock-urls`, `ops-toast-tone-dc`: together with the new file 4 files, 100 tests passed; `node --test scripts/sync-prune.test.mjs`: 4 passed.
- Not run: full `test:unit` (told not to).

## NOT verified

- No browser look at any screen; "what the owner sees" for the four missing names is read from the code, not seen. In particular whether the nested vehicle form (`sun`, `moon`) can be opened on live.
- Lucide having `arrow-down`, `tag`, `sun`, `moon` is judged from the names only; nothing was fetched.
- The scan finds names by key (`icon`, `iconEnd`, `*Icon`, `glyph`, `chevron`, `*_ICONS`) and by tag attribute. A name handed to an icon through a differently named variable, with no literal in an icon-keyed place, would be missed by the scan; the hand-read table covers every bound name today, and a new bound name fails case 4.
- React `Button icon` never drawing (above) was read from the component and a grep for CSS, not seen in a browser.

## For the owner, one line each (the controller asks, one download at a time)

1. `arrow-down` — Dashboard Support board, column sort button (blank in the default state) — Lucide has it: yes.
2. `tag` — Dashboard Pricing, Extras form, "Extra name" field lead icon — Lucide has it: yes.
3. `sun` — Fleet nested vehicle form, "Morning" select (form looks unreachable; confirm first) — Lucide has it: yes.
4. `moon` — same form, "Night" select — Lucide has it: yes.

When a file lands: delete its line from `WAITING_FOR_DOWNLOAD` in `apps/web/lib/icons/icon-files-exist.test.ts` (the test tells you which), and add the same file to `apps/web/public/brand/icons` only if React also needs it.
