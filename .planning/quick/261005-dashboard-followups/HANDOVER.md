# Hand-over: dashboard follow-ups (four items from the Fable 5.1 reviews of `a2a40794`)

Work session. Branch `fix/dashboard-followups`, cut from `origin/main` `16f1cfa7`; `origin/main` merged once more
(`cc0c9c6d`, planning notes only, no conflict). Worktree `.claude/worktrees/agent-a90f6822d690b12ce`.
Nothing deployed, no live write, no migration, no process killed. No new visible wording: nothing was added to
`app/vamos-i18n-dict.js` and no screen text changed. The only product file touched is `app/vamos-ops-api.js`.
Context: `.planning/quick/261005-dashboard-fixes/HANDOVER.md`. Line numbers are of this branch.

A fresh reviewer (not the builder) must read item 4: it changes what happens when a dashboard session dies
while a form is open, and item 3 sends one more answer to /login.

| # | Item | Commit | State |
|---|---|---|---|
| 1 | non-numeric reload count no longer switches the guard off | `b1da9fc9` | fixed, unit + Chromium |
| 2 | sidebar 404 at boot reloads the page | `ccb9eb15` | fixed, unit + Chromium |
| 3 | 403 `not-staff` from `/api/staff/*` goes to /login | `23e64520` | fixed, unit + Chromium |
| 4 | a refused write keeps the page; the next read, screen load or navigation goes to /login | `c5459812` | fixed, unit + Chromium; one finding, see "Finding" |
| - | Chromium tool, before/after pictures | `94df1552` | |

"You were signed out" message: not built (needs the owner's wording). Listed under Open.

## 1. Junk reload count (`app/vamos-ops-api.js` :120-:145)

- Root cause: `Number(sessionStorage.getItem("vamosOpsScreenRetryCount") || 0)` gives `NaN` for a value that is not a
  number; `NaN >= 2` is false, and the writer stored `String(NaN + 1)` = `"NaN"` again, so the slow-Auth reload came
  back every ~16 s for ever. A negative count did the same, for longer.
- Fix: `storedNumber(key)` reads a plain number above 0, else 0 (`isFinite(n) && n > 0`); the limit is written as
  `if (!(count < RETRY_MAX)) return;`. Both the count and the time mark use it. A junk value is read as 0, so the page
  gets at most two reloads and the storage holds a number again after the first.
- Tests: 11 new in `apps/web/lib/ops/ops-session-lost.test.ts` (`"abc"` gives exactly two reloads and stores 2; nine
  junk values give at most two and leave a number; a junk time mark does not stop the count). 9 fail on `16f1cfa7`.
- Chromium (`junk-count`, 53 s: the dashboard file 404s on every load, `/api/staff/me` answers alive after 15.5 s, count
  preset to `"abc"`): before 4 page loads, stored count `NaN`; after 3 loads, stored count 2.

## 2. Sidebar miss at boot (`app/vamos-ops-api.js`)

- Root cause: `OpsSidebar` is a top-level `dc-import` of `app/ops/ops.dc.html` (line 178, outside every `sc-if`), fetched
  once when the shell boots. It was classed as a nested part, so "sidebar 404, screen 200" (Auth slow for one request)
  left the dashboard without a sidebar until a hand reload. The grey empty box where the sidebar goes is
  `screens/before-sidebar-slow-auth.png`.
- Fix: the reload list `ROUTE_SCREENS` is now `SHELL_SCREENS` (`:44-:48`): the 13 route screens plus `OpsSidebar`. The same
  probe, the same counted and spaced reload (15 s apart, at most two, ten quiet minutes reset it). `ActionsMenu` (inside
  `hasBarItems`), `PlaceSearch`, `BrandSelect`, `OpsTable` and every other nested part stay out: a reload there would
  throw an edit away. Only `OpsSidebar` is a top-level import today.
- Tests: the test no longer greps a regex: `shellMounts()` reads `ops.dc.html` with a depth-counting parser
  (`sc-if` value `isX` = route switch, outside every `sc-if` = top-level import, everything else in `app/ops` = nested)
  and `RELOAD_FILES = routes + top-level`. The loop "every reload file that 404s with a live session reloads once" and
  "no nested part reloads" run over that list, so a new top-level import missing from the watcher fails. New: sidebar
  miss reloads once with one probe, a dead session on a sidebar miss goes to /login, the sidebar shares the two-reload
  limit; `ActionsMenu` is pinned as not top-level. 3 fail before.
- Chromium (`sidebar-slow-auth`: the sidebar file 404s once, the session is alive): before 1 page load and no sidebar;
  after 2 loads and the sidebar there (`screens/after-sidebar-slow-auth.png`).

## 3. `not-staff` is a dead session (`:104` `deadSessionBody`)

- Root cause: security S13 answers every `/api/staff/*` call 403 `not-staff` when the staff row is switched off while the
  token still looks fine. The watcher ignored it; the person sat on a screen with errors or nothing.
- Fix (controller decision): `deadSessionBody(status, json, path)`: 401 `no-session`, 403 `needs-mfa`, and 403
  `not-staff` only when the path starts with `/api/staff/`. Same exit as the others: flag cleared, `/login`, the 15 s loop
  guard. The `/api/staff/me` probe behind a screen-file 404 counts it too. `not-admin`, `csrf`, `staff-check-failed`
  (503) and code-less 401/403 stay ignored.
- Tests: both ways. Goes to /login: a `GET /api/staff/*` 403 not-staff; a screen 404 with `/api/staff/me` saying
  not-staff. Stays: not-staff from `/api/auth/callback`, `/api/photos/upload`, `/api/checkout/intent`; not-staff with a
  401, 404 or 500; `not-admin`, `csrf`, `staff-check-failed`, code-less 401/403 and `/api/auth`, each for GET and POST.
  2 fail before.
- Chromium: `notstaff-api` (dashboard, period switch answers 403 not-staff) and `notstaff-nav` (screen 404, `/me` says
  not-staff) end on /login with the flag cleared; before they stay (`screens/before-notstaff-nav.png`: the sidebar and an
  empty main column, the same person goes to the sign-in page after, `screens/after-notstaff-nav.png`).

## 4. A refused write keeps the page (`:35`, `:50-:92`, `:162-:218`)

- Root cause: any 401 no-session / 403 needs-mfa answer, write or read, called `endSession()` at once; for a write the
  redirect threw away the form it was sent from.
- Fix, no new words: in `inspect`, a dead answer to a POST, PUT, PATCH or DELETE sets `lostPending` and does nothing else:
  the page stays, the screen shows its own refusal as before, the sign-in flag stays. Then, with `lostPending` set:
  - the start of the next same-origin read (GET/HEAD of `/api/*` except `/api/auth`, or a `/app/ops/*.dc.html` screen
    file) calls `endSession()`, whatever that read answers;
  - `history.pushState` (the shell's own route change; every screen's `goBack`/`goTo` uses it) and `popstate` (back and
    forward) call it too (`watchNavigation`, wrapped once, `__vamosOpsWatch` guard like the fetch wrapper).
  Reads and screen loads that are dead by themselves redirect at once, as before. The 15 s loop guard still applies; a
  held-back redirect keeps the mark. `endSession` clears the mark when it redirects.
  One addition the brief did not name: a `/api/staff/*` write that goes through (2xx) clears the mark. A refresh race can
  answer one write 401 on a live session; without this a retry that works would still be followed by a redirect on the
  next poll. Say if it should go.
- Tests: 26 tests in a new `describe` plus a harness with history, popstate and a `bare` page (history, popstate, `bare` page). All four methods x
  no-session / needs-mfa / not-staff keep the page, the flag and give the screen its answer (12); the next staff read,
  screen load, `pushState` and `popstate` go to /login (the read whatever it answers); before any refused write nothing
  redirects and `pushState` passes through; other refusals (not-admin, csrf, code-less 401, 503, 500, a dropped
  connection) do not mark; not-staff from a non-staff path does not mark; many triggers are one redirect; the loop guard;
  a later staff write clears the mark; method from `init` in any case and from a Request-like input; other origins, a
  font, a photo, `.dc.html.map` do not count; double helmet run wraps `pushState` once; a page without `history`. The old
  needs-mfa test used a POST and now uses a GET. 20 fail on the code before this commit.
- Chromium (`write-keeps-form-dead|mfa|notstaff`, Settings, a typed company name, Save while the session is dead):
  after, the page stays on /settings, the typed value is still in the field, the screen's own "Could not save. Try
  again." shows (`screens/after-write-keeps-form-dead.png`), the flag is kept; pressing Customers then goes to /login with
  the flag cleared. Before (`16f1cfa7`): needs-mfa and no-session go to /login at once with the field gone
  (`screens/before-write-keeps-form-dead.png`); not-staff stays on the page and the later nav gives the blank screen.
  `write-then-read`: the next `fetch('/api/staff/bookings')` goes to /login.

### Finding (not changed): on a polling screen the hold is short

The bookings store re-reads `/api/staff/bookings` every 3 s while it is loaded (`vamos-ops-data.js` :166-:178), also
after a failed poll. OpsDetail, OpsBoard and any screen that touched bookings are therefore redirected by the next poll,
which is "the next read". Measured (`detail-poll`, OpsDetail edit with a typed note, Save while dead): the edit stays
about 1.8 s, then /login (before: 0.3 s). The screens without a poll (Settings, Pricing, Profile, Fleet, Content,
Reviews, Support, Customers) hold until the person navigates, which is the case that mattered. If the hold should last
on the polling screens too: stop scheduling the bookings poll while `VamosOpsApi` has a refused write pending (a
two-line change in `schedulePoll`, `vamos-ops-data.js`, plus the window-focus/visibility refetch). Not done: it is
outside the brief's file and changes what "the next read" means. Say if you want it.

## Checks (merged tree `01e544c4`)

| Check | Result |
|---|---|
| `apps/web/lib/ops/ops-session-lost.test.ts` | 73 tests pass (29 before this job); 31 of the 73 fail against `app/vamos-ops-api.js` of `16f1cfa7` |
| `lib/ops` + `lib/security` folders (after `node scripts/sync-dc-mock-to-public.mjs`) | 140 files pass; 3 files (`refund-by-hand`, `staff-cancel-by-hand`, `edit-request-customer`) timed out at 5 s once under parallel load (6-7 s first imports) and pass alone, 40/40 (none imports a changed file) |
| `pnpm test:unit` (full, once) | exit 0: scripts 40/40, db 14, emails 247, web 447 files and 5332 tests pass, 20 files and 41 tests skipped as before; no flake in this run |
| `pnpm typecheck` | pass |
| `pnpm lint` | 0 errors, 6 warnings (unused eslint-disable directives, none in this job's files) |
| `pnpm i18n:check` | pass (2684 keys) |
| `pnpm check:numbers` | ok |
| `pnpm check:db-fences` | 8 of 8 pass |
| Chromium `session-lost-followups.mjs` after (`apps/web/public`, `chromium.launch({ channel: "chromium" })`) | 29 PASS, 0 FAIL, plus `junk-count` 1 PASS |
| same on the before tree (`16f1cfa7` file) | 12 PASS, 17 FAIL (as intended), `junk-count` FAIL (4 loads, count `NaN`) |
| Not run, on purpose | build, live data, deploy |

## Not verified

- Against the real Supabase session on the dashboard host (needs a deploy and a real sign-out or a real staff row switched
  off). The `not-staff` end to end is proven with a Playwright stand-in answering 403; whether `/login` shows anything useful
  for that person is below.
- That the real Worker's `/api/staff/*` keeps answering the codes the watcher reads (`no-session`, `needs-mfa`,
  `not-staff`): taken from `staff-json.ts` `staffStatus` and the S13 branch, not called live.

## Open (decisions, nothing built)

1. "You were signed out" message and a return-to page: needs the owner's wording. A person who is sent from a refused
   save now lands on /login with no explanation and no way back to the typed text.
2. A switched-off staff row now goes to /login with no reason shown. The sign-in form has a `not-staff` banner, but only
   for the sign-in answer (`AuthForm.dc.html` :544-:602), not for this redirect. Also, sign-in (`/api/auth`) does not check
   the staff row (only `staff-json.ts`, the invite route and photo upload call `staffRowActive`), so that person can sign
   in again and is sent back to /login at the first staff call, at most once per 15 s. Needs the owner's wording or a
   decision on whether sign-in should refuse a switched-off row.
3. `POST /api/photos/upload` answers `{ error: "no-session" | "not-staff" }`, not `{ code }`
   (`app/[locale]/(ops)/api/photos/upload/route.ts` :32-:35), so the watcher never reads its refusals: a dead session or a
   switched-off row on a photo upload stays that screen's own message, as before. Changing the route's body is outside this
   job.
4. The polling-screen hold (Finding above).
5. The mark redirects at the start of the next read whatever it answers (the brief's wording). If a session came back in
   another tab the page still goes to /login once; a staff write that goes through clears the mark first.
6. From the earlier hand-over, still open: the server write path matches a class by name (`liveClassSlug`); `endSession` with
   blocked storage; the local-dev /login host; the old `componentWillUnmount` `_t` timer.

## Tools and pictures

- `tools/session-lost-followups.mjs <public tree> <label> <out dir>`: all offline, `/api/**` stubbed by Playwright. `ONLY=a,b`
  runs some; `junk-count` is opt-in (`ONLY=junk-count`, 53 s). `tools/before-tree.mjs <scratch>` puts `app/vamos-ops-api.js` back
  to its `16f1cfa7` text in a copy of the synced public tree. Run `node scripts/sync-dc-mock-to-public.mjs` first (the public
  tree is gitignored). Uses `../../261005-dashboard-fixes/tools/serve.mjs` and `fixtures.mjs`; `serve.mjs` gained
  `gate.failOnceFiles` (a file that answers 404 once).
- `screens/` (bare 1440 x 900 crops): `before-` / `after-` `write-keeps-form-dead`, `-mfa`, `-notstaff`, `notstaff-api`,
  `notstaff-nav`, `sidebar-slow-auth`.
