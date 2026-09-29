# Control board

Kept by the control session. One page: what is live, what is being built, what waits for
the owner, what comes next. Updated at every ship and every hand-over.
`PHASE-CLOSURE-2026-09-29.md` still wins over the ROADMAP progress table.

**Last update:** 2026-09-30 03:01 (+04)

## Live now

| Item | Value |
|---|---|
| Site | https://vamostaxi.site and https://dashboard.vamostaxi.site |
| main = origin/main | `e27014c1` plus planning notes |
| Worker `vamos` | version `a55b2c19` |
| Rollback point | Worker `6a71df8b`, git tag `backup/main-pre-ship-legal-follow-up` |
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
| 10 | Legal follow-up: no labelled gap on a live page, cancel wording, ship date | `e27014c1` | shipped under the 2026-09-30 ship mode; waiting: 10 steps in `HANDOVER-FOLLOW-UP.md` |
| 9 | Legal pages from the company's own text: privacy, terms, cancellation, imprint, four languages | `6737f5f8` | waiting: 12 steps in `.planning/quick/260930-lgl-legal-pages-from-eu/HANDOVER.md` |

## Legal pages

Shipped 2026-09-30 as `6737f5f8`. The pages customers see are the mocks `app/pages/*.dc.html`
with `app/vamos-i18n-dict.js` (`apps/web/middleware.ts`), not the Next.js pages. Both were changed.
No lawyer has read the text.

The follow-up shipped 2026-09-30 01:35 as `e27014c1`: the five answers are built, "Last updated" reads 30 September 2026 from `app/vamos-legal-updated.js`.

| For the owner to confirm (filled from live data, not from his word) | Value on the page |
|---|---|
| /about, Business | 7 passengers, 6 medium cases (live class "Business") |
| /faq, meet and greet | Zurich (ZRH) and Geneva (GVA) (the two active airport zones) |
| /about, /faq, driver details | by e-mail when a driver is assigned and in the 24-hour reminder; no SMS |

| Still wrong on live, left by his decision | Detail |
|---|---|
| /terms section 03 | says driver details come by SMS and e-mail with a phone number; the site sends no SMS |
| /about fleet | Van row says 8 passengers, 8 cases; live "Van luxury" is 12 and 9. Business is called an executive saloon; live Business is a V-Class |

| Known and open | Detail |
|---|---|
| Automatic refunds refuse a live Stripe key (`paid-cancel.ts:116`) | True today on test cards. Must be lifted before real launch or /cancellation becomes false. Phase 19 is closed, so Phase 20 carries it (lead 5). |
| Settings say 15 minutes standard waiting, the pages say 30 | Owner chose 30. He changes the setting on the dashboard if both should agree. |
| Values live since 2026-09-01 that nobody approved | Left live by his decision, English only in de/fr/ar. Listed in the hand-over, section 6. |
| Every gap of list C | Stays a labelled gap |

## In work (sessions re-cut by the owner, 2026-09-30 02:55)

The owner closed the long sessions and starts fresh ones. Each old session committed its work,
left a `SESSION-HANDOFF.md` on its branch and stopped. Every hand-off commit is archived on GitHub.
Prompts for the new sessions: `.planning/prompts/`, with shared rules in `00-common-rules.md`.

| Job | Folder under `vamos-wt/` | Branch | Hand-off commit | State | Prompt |
|---|---|---|---|---|---|
| 26.4.2 booking feedback | `fix-26.4.2` | `fix/26.4.2-booking-feedback` | `4a3d3393` | **Running** in session "Vamos Taxi 26.4.2 completion" since 03:00. At hand-off: unfinished. Last full check on `b5f7234f`; three later commits not re-checked; flight-edit bug not started; main not merged. | `01-finish-26.4.2.md` |
| 26.5 account choice | `phase-26.5` | `gsd/phase-26.5-checkout-account` | `a468a692` | **Building** in session "Vamos Taxi build 26.5" since 2026-09-30. Owner signed plans 09, 10, 11 and the D-19 revision (`1de7e39b`). main `49c51749` merged. Migrations: `20261001100000` agreement record, `20261001110000` unpaid hidden, `20261001120000` paid-only reminder. Local stack `vamos-taxi-265`, ports 613xx. Waits for the 26.4.2 ship before it touches `/checkout` files. | `02-build-26.5.md` |
| 26.0 main green | `main-green-2` | `fix/main-green-2` | `3e19c44f` | Plans 01 to 09 done, 10 half, 11 and 12 open. 14 commits behind main. | `03-finish-26.0.md` |
| 27 consent record | `phase-27` | `gsd/phase-27-consent-record` | running | Design approved by its checker (run 2). Plan next, then his signature. Session "Meta measurement phases 27-29" keeps running. | none, running |
| 26.2 audit | `phase-26.2` | `gsd/phase-26.2-audit` | | **Running** in session "Phase 26.2 audit" since 03:00. Baseline green on `49c51749`; you agreed the changed order; 8 units build in sub-folders `phase-26.2-u*`. It tightens three check scripts (numbers, database fences, translations): these come as their own hand-over and land last, after 27 to 29. Works only in folders nobody else touches. | `04-phase-26.2-audit.md` |
| 20 security check | `phase-20` | `gsd/phase-20-security-check` | | Session "Vamos Taxi security phase". Check 20-06 done (`fb907a9d`): 3 serious, 1 conditional. Fixing F1 and F2 now. | `05-phase-20-security.md` |
| 19 surge proof | removed | removed | | **Closed by the owner, 2026-09-30** ("no need for test close it"). Nothing committed, nothing created at Cloudflare or Supabase, no paid step. Folder and branch were identical to main `49c51749` and are removed. Read on live by that session: 60 connections allowed, database 24 MB, pg_cron and pg_net not installed. | none |

Legal session: closed by the owner. Both legal ships are live. Its last commit `fe4e37a0`
(terms: driver details by e-mail, no SMS; About fleet matches the live classes) was never
handed over and is **not live**. Archived as `archive/legal-follow-up-fe4e37a0`. It is behind
main and does not merge cleanly; a session has to redo it on today's main.

## Ship order (owner, 2026-09-30: booking, payments, account, Meta first)

| Order | What | State |
|---|---|---|
| 1 | 26.4.2 booking feedback | Second round after his review of the pictures. Hand-over follows his signature. |
| 2 | 26.5 account choice before payment, with the paid-only reminder | Building |
| 3 | 27 consent record | Not started |
| 4 | 28 pixel page view, 29 purchase event | The Meta wording is his since 2026-09-30 (`.planning/decisions/2026-09-30-meta-wording.md`), all three texts, four languages. Not started. |
| after | 26.0 → 26.2 → 20 (19 is closed) | 26.0 keeps building, lands after the ones above |

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
| 26.5 | `20261001100000` to `20261001190000`: account agreement record (shared with /sign-up, D-19), unpaid bookings hidden from customer reads (D-16), paid-only reminder (D-18) |
| Phase 27 | `20261002100000` to `20261002190000` |
| Phase 28 | `20261003100000` to `20261003190000` |
| Phase 29 | `20261004100000` to `20261004190000` |
| 26.0 and later | from `20261005100000` |

## Found by the Phase 27 session, 2026-09-30

| Finding | Effect |
|---|---|
| No customer page saves the cookie choice on the server today. The banner customers see is the mock's and saves in the browser only. Checkout, confirmation and the pay link show no banner. | Phase 27 is larger than planned: the live banner has to write to the server and the Next pages need the banner. Nothing is sent to Meta today, so no harm now. |
| The sign-in ship writes a cookie row when a new customer confirms their e-mail | Owner decision 27 D-01: no cookie row at sign-up. Phase 27 removes it and must say where the sign-up agreement is recorded. |

## Phase 27: our own banner, not a library (owner asked for the shorter path, 2026-09-30)

| Option | Verdict |
|---|---|
| Keep our banner and add the server call | **Chosen.** The server route, the record table and both banners exist. Left: the mock banner posts to the server, the banner shows on every customer page, the owner's texts, a new policy version. |
| Adopt vanilla-cookieconsent 3.1.0 | Rejected. It replaces the banner only, keeps its record in the browser, needs a full restyle to the design system on two surfaces, a second signature, and leaves every server task in place. |

## Found by the 26.5 session, 2026-09-30, confirmed on live by the control session

| Finding | Detail | Fixed by |
|---|---|---|
| A signed-in customer can read their own unpaid booking straight from the database | Policy `bookings_select_own` matches by customer or by the e-mail in the sign-in, with no filter on status. Readable columns include reference, name and phone. The pages hide it; the database does not. Own data only, never another customer's. No unpaid booking exists on live right now. | 26.5 plan 10: a migration hides quotes and pending bookings without a pay link from customer reads |
| The claim function links pending bookings to the account too | Same rule of the owner: an unpaid booking never follows the customer | 26.5 plan 10 |

## Passed to Phase 20 (security check)

| Point |
|---|
| `bookings_select_own` trusts the e-mail inside the sign-in token. Safe only while sign-in requires a confirmed e-mail. |
| "This e-mail already has an account, sign in first" on checkout can reveal who is a customer. 26.5 uses neutral wording and a limit. |
| `SUPABASE_SERVICE_ROLE_KEY` is on the public Worker (owner decision). Test where it is read and that it never reaches a browser. |
| `POST /api/checkout/intent` has no limit per visitor (a lead, not confirmed). |
| Automatic refunds refuse an `sk_live_` key; to be lifted before real launch. Phase 19 is closed; this point stays here. |

## Found by the Phase 20 check, 2026-09-30 03:20, on live Worker `a55b2c19`

Findings file: branch `gsd/phase-20-security-check`, commit `fb907a9d`, `20-06-FINDINGS.md`.
Reported by that session; not yet re-checked by the control session.

| # | Finding | Weight | Goes to |
|---|---|---|---|
| F1 | A staff pay link also opens Manage booking for 24 hours, even after payment: traveller contact, driver phone, cancel, change time. No active pay link exists on live today. | Serious | Phase 20 builds migration `20261005100000`. Lands after 26.5. |
| F2 | Dashboard support ticket: the PDF preview loads pdf.js from unpkg without a pin; a crafted PDF mailed to info@ could run script in a signed-in dashboard. | Serious | Phase 20 fixes `app/ops/OpsSupportTicket.dc.html` now. 26.2 keeps off the file. |
| F3 | `POST /api/checkout/intent` has no limit per visitor: unlimited Stripe sessions from one quote. | Serious | 26.5 plan 04 (owns the file). The numbers are an owner question. |
| F4 | Account reads trust the e-mail in the sign-in without checking it is confirmed. Safe while Supabase "Confirm email" is on. | Conditional | Phase 20 asks the owner to read the switch. |
| | Service-role key: server-only, never logged or returned. Purge rule: holds. | Dismissed | |
| | Test booking VT-26-0745 TEST SECURITY, unpaid, left for the hourly clean-up (1 of 10 probes). | | |

Every Phase 20 ship needs the owner's Ship; today's ship mode does not cover it.

## Owner feedback after the 26.4 ship, 2026-09-30

Built by the 26.3 session as `fix/26.4.2-booking-feedback` (folder `fix-26.4.2`).

| # | Feedback | State |
|---|---|---|
| 1 | Phone and tablet booking becomes one page, no 4 steps; date then time; our own picker, never the phone's | Building |
| 2 | Laptop: "flight behind From" | **Not a bug.** He wants another order: Flight number, From, To. The flight field stays hidden until From is an airport, then appears before From. Same order on laptop, tablet, phone and checkout Edit trip. The address list opens upward when there is no room below; the bar no longer jumps. |
| 3 | Laptop home gets "Choose your class" back, with server prices under the bar | Building |
| 4 | Phone checkout class cards redesigned | Building |
| 5 | An unpaid booking can never be continued on another device; a paid trip can be shared | Decision recorded in `.planning/decisions/2026-09-30-unpaid-booking-other-device.md`. A pasted checkout link shows the trip only, with an empty form (26.5 D-16, four route tests). |
| 6 | Sign-off, 2026-09-30 02:50 | Laptop bar: **signed**. Class cards: **changes requested**: a photo on every class card (laptop home and checkout section 1, every width); on the laptop home "Choose your class" shows from page load and becomes selectable once the bar is filled. The When date gets de/fr/ar. The phone sheet is re-signed together with the new class pictures. `b5f7234f` is not the hand-over. |

## Found by the 26.0 session, 2026-09-30

| Finding | State |
|---|---|
| Checkout, flight edit: when Turnstile challenges the re-quote, no challenge is shown and the price stays on "Updating price" (`CheckoutForm.tsx` flightBlur) | Confirmed in code by the control session. Not reproduced on live. Sent to the 26.3 session to fix inside 26.4.2. |
| The public pages (mocks) carry no hreflang links in their HTML | For the owner. Not assigned. Search engines cannot tell the language versions apart. |

## Owed by the control session

| What | Why not yet |
|---|---|
| Read the first staff digest run | 2026-09-30 06:00 Zurich time |

## Waiting for the owner

| # | What | Where |
|---|---|---|
| 1 | Open the manage link from the VT-26-0743 e-mail and report what he sees | e-mail |
| 2 | Dashboard New trip: airport pickup without and with a flight number | dashboard.vamostaxi.site |
| 3 | Sign-in UAT, 14 steps, in `.planning/debug/auth-sign-in-sign-up-HANDOVER.md` | phone first |
| 4 | Should an unpaid booking get the 24-hour reminder? Today it does | decision |
| 5 | The remaining 26.3 UAT steps, then the test-booking delete script | vamostaxi.site |
| 8 | The unsigned Lenis folder `.planning/quick/260928-q4t-…` | decision |

## Known on live, not fixed yet

| What | Fixed by |
|---|---|
| VT-26-0739 and VT-26-0742 are not in the owner's account | Not a bug: they were booked with another e-mail address |

## Tidy-up candidates, only on the owner's word, one at a time

Folders whose work is on main and archived as a tag: `fix-26.3-followups`, `fix-26.3-manage`,
`fix-26.3-newtrip`, `fix-26.3-arrays`, `auth-fix`, `phase-26.3`, `phase-26.1`, `phase-26.0` (old).
