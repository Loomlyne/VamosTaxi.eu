# Hand-over: dashboard follow-ups (four items from the Fable 5.1 reviews of `a2a40794`)

Work session. Branch `fix/dashboard-followups`, cut from `origin/main` `16f1cfa7`; `origin/main` merged once more
(`cc0c9c6d`, planning notes only, no conflict). Worktree `.claude/worktrees/agent-a90f6822d690b12ce`.
Nothing deployed, no live write, no migration, no process killed. No new visible wording: nothing was added to
`app/vamos-i18n-dict.js` and no screen text changed. The product files touched are `app/vamos-ops-api.js` (items 1-4) and
`app/vamos-ops-data.js` (4b, the poll hold: three small edits).
Context: `.planning/quick/261005-dashboard-fixes/HANDOVER.md`. Line numbers are of this branch.

A fresh reviewer (not the builder) must read item 4: it changes what happens when a dashboard session dies
while a form is open, and item 3 sends one more answer to /login.

| # | Item | Commit | State |
|---|---|---|---|
| 1 | non-numeric reload count no longer switches the guard off | `b1da9fc9` | fixed, unit + Chromium |
| 2 | sidebar 404 at boot reloads the page | `ccb9eb15` | fixed, unit + Chromium |
| 3 | 403 `not-staff` from `/api/staff/*` goes to /login | `23e64520` | fixed, unit + Chromium |
| 4 | a refused write keeps the page; the next read, screen load or navigation goes to /login | `c5459812` | fixed, unit + Chromium |
| 4b | the 3 s bookings poll and the focus refetch are held while a refused write waits (controller, on the finding) | `0dcf5db5` | fixed, unit + Chromium |
| 4c | review F1 (the hold ends after 60 s) and F3 (a time mark in the future is no mark) | see tip | fixed, unit + Chromium; F2 left open |
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
    file) calls `endSession()`, whatever that read answers (the store's own automatic reads, the bookings poll and the focus
    refetch, are held while the mark is set: 4b);
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

## 4b. The bookings poll is held while a refused write waits (controller decision on the finding below)

Finding, as first reported: the bookings store re-reads `/api/staff/bookings` every 3 s while it is loaded (also after a
failed poll) and on window focus. OpsDetail, OpsBoard and any screen that touched bookings were therefore redirected by
that automatic read, "the next read": measured on OpsDetail (edit with a typed note, Save while dead) the edit stayed
about 1.8 s. Controller: fix it.

- `app/vamos-ops-api.js` (end of file): `window.VamosOpsApi.sessionLostPending()`, a read-only function that returns the
  mark `lostPending` item 4 sets. The file's last line no longer replaces `VamosOpsApi` on the helmet's second run: the first
  run owns the watcher and its mark, and a second object would answer for a mark nothing sets (a test fails if it does).
- `app/vamos-ops-data.js` (`writeRefused()`, `schedulePoll`, `onVisible`): the poll tick and the window-focus /
  visibility refetch ask `writeRefused()` first. While it is true they send no request: the tick looks again in 3 s, so the
  poll resumes by itself within one tick of the mark clearing (a staff write that goes through). The hold is bounded to
  60 s from the latest refused write (4c). Everything else is as
  built: a navigation (`pushState`, `popstate`), a screen load and a manual read (`bookings.reset()`, a screen's own
  reload) are still "the next read" and still go to /login. No other collection polls.
- Tests: new `apps/web/lib/ops/ops-poll-hold.test.ts` (9 tests; 6 fail on the code before): both real files in one vm with a
  fake clock, a stub fetch, history and focus. The premise (without a refusal the store reads every 3 s and on focus);
  OpsDetail: a refused save, then 10 s in 1 s steps: no booking read, no other request, no redirect, then `pushState` goes
  to /login; focus and visibility changes are held too; `reset()` and a screen load still go to /login; the poll resumes
  after a staff write goes through; the helmet's double run (fails if the second run replaces the API object);
  `sessionLostPending` is false at first; a source pin.
- Chromium (`detail-poll`, OpsDetail edit, Save while dead): after, the page and the typed note are still there 10 s later,
  0 booking reads in those 10 s, and pressing Customers goes to /login (`screens/after-detail-poll.png`). On the tip
  before this change (`8756fd1a`, `BEFORE_REF=8756fd1a node tools/before-tree.mjs <dir>`): /login after 1.9 s and 1
  booking read (FAIL x2).

## 4c. Review fixes F1 and F3 (Fable 5.1 on `0dcf5db5`: SHIP AFTER FIXES)

- **F1 (high), the hold was unbounded.** `OpsCalendarBoard.dc.html` :309-316 fires `upsert` for a card drag and ignores the
  answer, and `afterWrite` (`vamos-ops-data.js` :305-308) snaps the card back silently. After a session death that left
  the mark set with nobody looking at it: the poll and the focus refetch sent nothing for ever, new bookings never appeared
  and nothing sent him to /login until he clicked a route. Fix (`app/vamos-ops-api.js`): `lostPendingAt` is recorded where
  the mark is set (each refused write sets it again, so a person who keeps saving keeps the form); `sessionLostPending()`
  is true only while the mark is set and `0 <= age < HOLD_MS` (60 s); a clock that went back reads as expired. After the
  window the store's poll tick or focus refetch is an ordinary read: it finds the page marked and goes to /login. The
  internal mark is not windowed: navigation, screen load and manual read still go at once, inside or outside the window.
  Tests (`ops-poll-hold.test.ts`, 7 new, all fail before): inside 57 s every tick is held, the tick at 60 s sends the read and
  goes to /login; a page back from the background after 61 s goes to /login; window focus inside the window is held, after
  it redirects; a second refused write starts the window again; a navigation inside the window still goes at once; a clock
  set back is no hold; a write that goes through clears the mark and nothing redirects after 90 s. Chromium (`hold-ends`,
  opt-in, ~65 s, nobody touches the page after Save while dead): still held at 50 s with 0 booking reads, /login at 61.9 s.
- **F3 (low), future time marks.** `storedNumber` accepted a mark in the future, so `now - last` was negative and read as
  "just now" for as long as the clock stayed behind it: the 15 s guards held back every reload and every redirect. New
  `storedTime(key, now)` reads a mark that has not happened as no mark. Used for the reload mark (`reloadOnce`) and, the same
  flaw, for the death mark in `endSession` (a death mark in the future held every redirect back; not named in the review).
  Tests (`ops-session-lost.test.ts`, 4 new; 2 fail before): a reload mark in the future is read as no mark, the page reloads
  (counted, at most two) and the mark becomes the real time; a mark 14 s in the past still holds the page back; a death mark
  in the future and junk death marks do not hold the redirect back.
- **F2, left open on purpose** (a tab that holds a refused-write mark while he signs in again in another tab): that tab
  still goes to /login at its next read or navigation (within ~63 s on a screen that polls, since the hold ends at 60 s)
  although the session is alive again, and nothing in it sees the new session. See Open 5.

## Checks (tip after 4c, `origin/main` `cc0c9c6d` merged)

| Check | Result |
|---|---|
| `apps/web/lib/ops/ops-session-lost.test.ts` | 77 tests pass (29 before this job); 33 of the 77 fail against `app/vamos-ops-api.js` of `16f1cfa7` (31 + the 2 F3 ones) |
| `apps/web/lib/ops/ops-poll-hold.test.ts` | 16 tests pass (9 for 4b, 7 for F1); 6 + 7 fail against the files before them |
| `lib/ops`, `lib/security` and `tests/unit` folders (after `node scripts/sync-dc-mock-to-public.mjs`) | 192 files, 2039 tests pass, 12 files skipped as before |
| `pnpm test:unit` (full), run once on the tip before 4b | exit 0: scripts 40/40, db 14, emails 247, web 447 files and 5332 tests pass, 20 files and 41 tests skipped as before. Earlier the same day a parallel folder run saw `refund-by-hand`, `staff-cancel-by-hand` and `edit-request-customer` time out at 5 s on first import (load flakes; they pass alone, 40/40) |
| `pnpm typecheck` | pass |
| `pnpm lint` | 0 errors, 6 warnings (unused eslint-disable directives, none in this job's files) |
| `pnpm i18n:check` | pass (2684 keys) |
| `pnpm check:numbers` | ok |
| `pnpm check:db-fences` | 8 of 8 pass |
| Chromium `session-lost-followups.mjs` after (`apps/web/public`, `chromium.launch({ channel: "chromium" })`) | 31 PASS, 0 FAIL (incl. `detail-poll` 3 checks), plus the opt-in `hold-ends` 2 PASS (61.9 s) and `junk-count` 1 PASS (run before 4b; item 1 is untouched by it) |
| same on the before tree (`16f1cfa7` file) | 12 PASS, 17 FAIL (as intended), `junk-count` FAIL (4 loads, count `NaN`); `detail-poll` on the `8756fd1a` files: 2 FAIL, 1 PASS |
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
4. (closed by 4b: the polling-screen hold.)
5. (Review F2.) The mark redirects at the start of the next manual read whatever it answers (the brief's wording), and
   at the first poll tick after the 60 s hold. If a session came back in another tab (he signed in again elsewhere) this
   tab still goes to /login once, and nothing in it sees the new session; a staff write that goes through clears the mark
   first. Not fixed: it would need the tab to ask `/api/staff/me` before leaving.
6. From the earlier hand-over, still open: the server write path matches a class by name (`liveClassSlug`); `endSession` with
   blocked storage; the local-dev /login host; the old `componentWillUnmount` `_t` timer.

## Tools and pictures

- `tools/session-lost-followups.mjs <public tree> <label> <out dir>`: all offline, `/api/**` stubbed by Playwright. `ONLY=a,b`
  runs some; `junk-count` is opt-in (`ONLY=junk-count`, 53 s). `tools/before-tree.mjs <scratch>` puts `app/vamos-ops-api.js` and `app/vamos-ops-data.js` back
  to their `16f1cfa7` text (or `BEFORE_REF=<ref>`) in a copy of the synced public tree. Run `node scripts/sync-dc-mock-to-public.mjs` first (the public
  tree is gitignored). Uses `../../261005-dashboard-fixes/tools/serve.mjs` and `fixtures.mjs`; `serve.mjs` gained
  `gate.failOnceFiles` (a file that answers 404 once).
- `screens/` (bare 1440 x 900 crops): `before-` / `after-` `write-keeps-form-dead`, `-mfa`, `-notstaff`, `notstaff-api`,
  `notstaff-nav`, `sidebar-slow-auth`, `detail-poll` (after: the edit still there after 10 s; `before-hold-detail-poll.png`:
  the page on /login after 1.9 s, the tip before 4b).
