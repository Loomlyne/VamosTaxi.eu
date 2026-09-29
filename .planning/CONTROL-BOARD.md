# Control board

Kept by the control session. One page: what is live, what is being built, what waits for
the owner, what comes next. Updated at every ship and every hand-over.
`PHASE-CLOSURE-2026-09-29.md` still wins over the ROADMAP progress table.

**Last update:** 2026-09-29 18:02 (+04)

## Live now

| Item | Value |
|---|---|
| Site | https://vamostaxi.site and https://dashboard.vamostaxi.site |
| main = origin/main | `2bd05b0a` plus planning notes |
| Worker `vamos` | version `80d51730` |
| Rollback point | Worker `e885dbb6`, git tag `backup/main-pre-ship-auth` |
| Database | migrations up to `20260930210000` applied and read back |
| Who deploys | the control session, from the owner's Mac. GitHub runs checks, never deploys. |

## Shipped on 2026-09-29

| # | What | Commit | Owner test |
|---|---|---|---|
| 1 | Phase 26.3 booking flow rebuild | `af93fc8e` | VT-26-0738 paid, passed |
| 2 | Account bookings list and guest link | `34af1552` | VT-26-0736, 0737, 0738 linked after he opened his account |
| 3 | Manage-booking page: price, extras, payment method, driver | `34af1552` | owner has not reported yet |
| 4 | Dashboard New trip Save | `34af1552` | owner has not reported yet |
| 5 | Worker reads and writes lists; 16 narrow database reads for the hourly jobs | `34af1552` | VT-26-0743 paid, method recorded; VT-26-0734 cleaned at 17:27 |
| 6 | Planning rewrite of 19, 20, 26.2 | `34af1552` | signed |
| 7 | Sign-in and sign-up on the site and the dashboard | `2bd05b0a` | waiting: sign up with a fresh address, tap the link, one 4242 payment |

## In work

| Lane | Session | Folder under `vamos-wt/` | Branch | State |
|---|---|---|---|---|
| 26.4 phone bar and one form | Phase 26.3 booking flow rebuild | `phase-26.4` | `gsd/phase-26.4-one-form` | Plan 10 of 10 (final checks and hand-over) in work. Today's main merged in as `ede7f0ce`. No migration. |
| 26.4 follow-up: desktop bar | same session | same | follow-up branch, not cut yet | Owner chose picture 3: the wide bar from before 26.3 without the tabs, order From, flight (airport), To, When, Travellers, SEE PRICES. Ships right after 26.4 with its own short design signature. |
| 26.5 account choice before payment | same session | `phase-26.5` | `gsd/phase-26.5-checkout-account` | Discuss **signed** (`2d5959bb`). UI-SPEC in work. Build waits until 26.4 has shipped. |
| 26.0 main green | Phase 26.0 main green work session | `main-green-2` | `fix/main-green-2` | Plans 01 to 05, 07, 09 done. 06, 08, 10, 11, 12 left. |

## Ship order

One at a time into main. Each later branch takes main in before it hands over.

| Order | What | Why this place |
|---|---|---|
| done | Sign-in and sign-up fix | Shipped 17:47 |
| 1 | Phase 26.4 | Hand-over expected next |
| 2 | 26.4 follow-up: desktop bar | Small, right after 26.4 |
| 3 | Phase 26.5, account choice before payment | Needs the final checkout from 26.4 |
| 4 | Phase 26.0 | Shares test files with 26.4; lands after it |
| 5 | 26.2 → 20 → 19 → 27 → 28 → 29 | Signed order |

## New owner requests, 2026-09-29 17:40, not started

| # | Request | Goes to | Needs from the owner |
|---|---|---|---|
| A | Desktop home booking bar: the old one, without the one-way tabs | Follow-up right after 26.4 | Decided: picture 3. His signature on the short design note. |
| B | Before Stripe's page the customer chooses: continue as guest, sign in, or create an account | Phase 26.5 | Decided in discuss: the choice sits at the top of "Who is travelling"; a guest gets an account without a password and signs in later by e-mail link; an e-mail that already has an account must sign in first; nothing is shown until the e-mail is confirmed. Still owed by him: the consent wording in four languages. |
| C | Later, its own job: passwords off on the whole site, e-mail link or passkey only | Not scheduled | His word when to start |

## Waiting for the owner

| # | What | Where |
|---|---|---|
| 1 | Open the manage link from the VT-26-0743 e-mail and report what he sees | e-mail |
| 2 | Dashboard New trip: airport pickup without and with a flight number | dashboard.vamostaxi.site |
| 3 | Sign-in UAT, 14 steps, in `.planning/debug/auth-sign-in-sign-up-HANDOVER.md` | phone first |
| 4 | Should an unpaid booking get the 24-hour reminder? Today it does | decision |
| 5 | The remaining 26.3 UAT steps, then the test-booking delete script | vamostaxi.site |
| 6 | Legal lines in four languages for the pixel | blocks 28 and 29 |
| 7 | Cloudflare Workers Paid and the database copy | only when Phase 19 starts |
| 8 | The unsigned Lenis folder `.planning/quick/260928-q4t-…` | decision |

## Known on live, not fixed yet

| What | Fixed by |
|---|---|
| VT-26-0739 and VT-26-0742 are not in the owner's account | Not a bug: they were booked with another e-mail address |
| ROADMAP progress table is out of date | Applied when 26.4 lands, because that branch edits the same file |

## Tidy-up candidates, only on the owner's word, one at a time

Folders whose work is on main and archived as a tag: `fix-26.3-followups`, `fix-26.3-manage`,
`fix-26.3-newtrip`, `fix-26.3-arrays`, `auth-fix`, `phase-26.3`, `phase-26.1`, `phase-26.0` (old).
