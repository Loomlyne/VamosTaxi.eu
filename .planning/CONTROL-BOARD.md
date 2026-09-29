# Control board

Kept by the control session. One page: what is live, what is being built, what waits for
the owner, what comes next. Updated at every ship and every hand-over.
`PHASE-CLOSURE-2026-09-29.md` still wins over the ROADMAP progress table.

**Last update:** 2026-09-30 00:23 (+04)

## Live now

| Item | Value |
|---|---|
| Site | https://vamostaxi.site and https://dashboard.vamostaxi.site |
| main = origin/main | `0f58ab6d` plus planning notes |
| Worker `vamos` | version `2b04648a` |
| Rollback point | Worker `df365445`, git tag `backup/main-pre-ship-26.4` |
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
| 7 | Sign-in and sign-up on the site and the dashboard | `2bd05b0a` | a second account exists since 2026-09-29 18:03; the other sign-in steps not reported yet |

## Shipped on 2026-09-30

| # | What | Commit | Owner test |
|---|---|---|---|
| 8 | Phase 26.4 one form, phone and tablet bar, and 26.4.1 laptop bar | `0f58ab6d` | waiting: look at the laptop bar, book on the phone from Zurich Airport with a child seat, 4242 payment |

## Legal pages, opened 2026-09-30

Source texts and the comparison: `docs/legal-source/vamostaxi-eu-2026-09-30/` (`MAPPING.md`).

| Item | State |
|---|---|
| Privacy page: Vercel becomes Cloudflare, "10 years years" becomes "10 years" | Approved by the owner. Not built. |
| Privacy paragraph "Your account" | **Approved** in four languages. Ships with 26.5. Text in `.planning/decisions/2026-09-30-legal-pages.md`. |
| The values of list A (company, waiting times, case size, no-show, complaint and refund days) | **Approved.** A work session fills them in four languages. Not started. |
| Refund when cancelling more than 24 hours before pickup | **Decided: 100 % back, as the site does.** The pages follow the site. No payment code changes. |
| 7 more points where the old text and the new site disagree | Each needs his decision |
| Gaps the old site does not answer | Stay labelled gaps |

## In work

| Lane | Session | Folder under `vamos-wt/` | Branch | State |
|---|---|---|---|---|
| 26.5 account choice before payment | same session | `phase-26.5` | `gsd/phase-26.5-checkout-account` | Discuss, UI-SPEC and 7-plan plan **signed**. Plan revision 2, 8 plans, signed. The build lock is open since the 26.4 ship (2026-09-30 00:20). **Open:** Worker `vamos` has `SUPABASE_URL` but no `SUPABASE_SERVICE_ROLE_KEY` (names read 2026-09-29 23:50). Without it "Create an account" hides itself. Whether that key belongs on the public Worker is an owner decision, see below. |
| 26.0 main green | Phase 26.0 main green work session | `main-green-2` | `fix/main-green-2` | Plans 01 to 05, 07, 09 done. 06, 08, 10, 11, 12 left. |

## Ship order

One at a time into main. Each later branch takes main in before it hands over.

| Order | What | Why this place |
|---|---|---|
| done | Sign-in and sign-up fix | Shipped 17:47 |
| 3 | Phase 26.5, account choice before payment | Needs the final checkout from 26.4 |
| 4 | Phase 26.0 | Shares test files with 26.4; lands after it |
| 5 | 26.2 → 20 → 19 → 27 → 28 → 29 | Signed order |

## New owner requests, 2026-09-29 17:40, not started

| # | Request | Goes to | Needs from the owner |
|---|---|---|---|
| A | Desktop home booking bar: the old one, without the one-way tabs | Follow-up right after 26.4 | Decided: picture 3. His signature on the short design note. |
| B | Before Stripe's page the customer chooses: continue as guest, sign in, or create an account | Phase 26.5 | Decided in discuss: the choice sits at the top of "Who is travelling"; a guest gets an account without a password and signs in later by e-mail link; an e-mail that already has an account must sign in first; nothing is shown until the e-mail is confirmed. Still owed by him: the consent wording in four languages. |
| C | Later, its own job: passwords off on the whole site, e-mail link or passkey only | Not scheduled | His word when to start |

## Read on live, 2026-09-29 23:35

| What | Result |
|---|---|
| Hourly clean-up | Works. VT-26-0733, 0740, 0741 deleted at 18:01, VT-26-0744 at 21:57. No unpaid booking left. |
| Reminder and resend jobs | Ran hourly since 18:00 without error |
| Sign-up | Second account since 18:03, with its customer record |
| Airport fee | Charged today for an airport pickup, saved inside the fare line (VT-26-0743) |

## Owner decisions on Phase 26.5, 2026-09-29 23:58

Full text: `.planning/decisions/2026-09-29-checkout-account-notice.md`.

| # | Decision |
|---|---|
| 1 | The service-role key is on Worker `vamos` since 2026-09-29 23:56, added by the owner in his terminal. Name read by the control session, value never. **Correction:** the control session first wrote that nothing on live reads it. That was wrong. Two older features read it and are active since then: the staff digest e-mail (daily at 06:00 Zurich time, to staff) and the dashboard staff invite. Owner decision 2026-09-30: both may keep using it (26.5 D-15); plan 08 of 26.5 moves them onto the one server-only module. |
| 2 | Both notice texts approved in four languages, as drafted. Not read by a lawyer. |
| 3 | "Create an account" needs a tick box; the tick is logged server-side. |
| 4 | "Create an account" goes live with 26.5, consent recorded from the first account. |

## Owed by the control session

| What | Why not yet |
|---|---|
| The seven ROADMAP lines from the planning rewrite (19, 20, 26.2, order) and the 26.4 / 26.4.1 rows | 26.4 has landed, so the file is free. Next planning note. |
| Read the first staff digest run | 2026-09-30 06:00 Zurich time |

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
