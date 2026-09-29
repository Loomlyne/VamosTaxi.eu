# Control board

Kept by the control session. One page: what is live, what is being built, what waits for
the owner, what comes next. Updated at every ship and every hand-over.
`PHASE-CLOSURE-2026-09-29.md` still wins over the ROADMAP progress table.

**Last update:** 2026-09-30 01:07 (+04)

## Live now

| Item | Value |
|---|---|
| Site | https://vamostaxi.site and https://dashboard.vamostaxi.site |
| main = origin/main | `6737f5f8` plus planning notes |
| Worker `vamos` | version `6a71df8b` |
| Rollback point | Worker `2b04648a`, git tag `backup/main-pre-ship-legal` |
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
| 9 | Legal pages from the company's own text: privacy, terms, cancellation, imprint, four languages | `6737f5f8` | waiting: 12 steps in `.planning/quick/260930-lgl-legal-pages-from-eu/HANDOVER.md` |

## Legal pages

Shipped 2026-09-30 as `6737f5f8`. The pages customers see are the mocks `app/pages/*.dc.html`
with `app/vamos-i18n-dict.js` (`apps/web/middleware.ts`), not the Next.js pages. Both were changed.
No lawyer has read the text.

| Still to build (owner answered, small follow-up) | Answer |
|---|---|
| /cancellation, cancel within 24 hours | "Our team decides the refund and tells you by email" |
| /terms, city stay fee | "shown on your quote" |
| Adviser notes on the Next.js privacy page | hidden from customers |
| "Last updated" date on each legal page | the ship day |
| /manage-booking: "Every refund is checked by our team" and "Too close to cancel here. Call us." | say what the site does (owner, 2026-09-30) |

| Known and open | Detail |
|---|---|
| Automatic refunds refuse a live Stripe key (`paid-cancel.ts:116`) | True today on test cards. Must be lifted before real launch or /cancellation becomes false. On the Phase 19 list. |
| Settings say 15 minutes standard waiting, the pages say 30 | Owner chose 30. He changes the setting on the dashboard if both should agree. |
| Values live since 2026-09-01 that nobody approved | Left live by his decision, English only in de/fr/ar. Listed in the hand-over, section 6. |
| Every gap of list C | Stays a labelled gap |

## In work

| Lane | Session | Folder under `vamos-wt/` | Branch | State |
|---|---|---|---|---|
| 26.5 account choice before payment | same session | `phase-26.5` | `gsd/phase-26.5-checkout-account` | Discuss, UI-SPEC and 7-plan plan **signed**. Plan revision 2, 8 plans, signed. The build lock is open since the 26.4 ship (2026-09-30 00:20). **Open:** Worker `vamos` has `SUPABASE_URL` but no `SUPABASE_SERVICE_ROLE_KEY` (names read 2026-09-29 23:50). Without it "Create an account" hides itself. Whether that key belongs on the public Worker is an owner decision, see below. |
| 26.0 main green | Phase 26.0 main green work session | `main-green-2` | `fix/main-green-2` | Plans 01 to 05, 07, 09 done. 06, 08, 10, 11, 12 left. |

## Ship order (owner, 2026-09-30: booking, payments, account, Meta first)

| Order | What | State |
|---|---|---|
| 1 | 26.4.2 booking feedback | Building. He signs three pictures first. |
| 2 | 26.5 account choice before payment, with the paid-only reminder | Building |
| any time | Legal follow-up | Building |
| 3 | 27 consent record | Not started |
| 4 | 28 pixel page view, 29 purchase event | The Meta wording is his since 2026-09-30 (`.planning/decisions/2026-09-30-meta-wording.md`), all three texts, four languages. Not started. |
| after | 26.0 → 26.2 → 20 → 19 | 26.0 keeps building, lands after the ones above |

**Ship mode on 2026-09-30 only:** the control session ships 26.4.2, the legal follow-up, 26.5 and
27 to 29 without asking, when every check of its own passes, and tells him right after.
Full text: `.planning/decisions/2026-09-30-priorities-and-ship-mode.md`.

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

## Migration numbers, reserved 2026-09-30

Live is at `20260930210000`.

| Lane | Numbers |
|---|---|
| 26.5 | `20261001100000` to `20261001190000` |
| Phase 27 | `20261002100000` to `20261002190000` |
| Phase 28 | `20261003100000` to `20261003190000` |
| Phase 29 | `20261004100000` to `20261004190000` |
| 26.0 and later | from `20261005100000` |

## Found by the Phase 27 session, 2026-09-30

| Finding | Effect |
|---|---|
| No customer page saves the cookie choice on the server today. The banner customers see is the mock's and saves in the browser only. Checkout, confirmation and the pay link show no banner. | Phase 27 is larger than planned: the live banner has to write to the server and the Next pages need the banner. Nothing is sent to Meta today, so no harm now. |
| The sign-in ship writes a cookie row when a new customer confirms their e-mail | Owner decision 27 D-01: no cookie row at sign-up. Phase 27 removes it and must say where the sign-up agreement is recorded. |

## Owner feedback after the 26.4 ship, 2026-09-30

Built by the 26.3 session as `fix/26.4.2-booking-feedback` (folder `fix-26.4.2`).

| # | Feedback | State |
|---|---|---|
| 1 | Phone and tablet booking becomes one page, no 4 steps; date then time; our own picker, never the phone's | Building |
| 2 | Laptop: "flight behind From" | **Not a bug.** He wants another order: Flight number, From, To. The flight field stays hidden until From is an airport, then appears before From. Same order on laptop, tablet, phone and checkout Edit trip. The address list opens upward when there is no room below; the bar no longer jumps. |
| 3 | Laptop home gets "Choose your class" back, with server prices under the bar | Building |
| 4 | Phone checkout class cards redesigned | Building |
| 5 | An unpaid booking can never be continued on another device; a paid trip can be shared | Decision recorded in `.planning/decisions/2026-09-30-unpaid-booking-other-device.md`. A pasted checkout link shows the trip only, with an empty form (26.5 D-16, four route tests). |
| 6 | Sign-off | He sees pictures of the three designs at 390, 768 and 1440 and signs before anything is handed over. |

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
