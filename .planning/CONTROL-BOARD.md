# Control board

Kept by the control session. One page: what is live, what is being built, what waits for
the owner, what comes next. Updated at every ship and every hand-over.
`PHASE-CLOSURE-2026-09-29.md` still wins over the ROADMAP progress table.
Rewritten short on 2026-09-30 14:25; the long version is in git history (`8230227c`).

**Last update:** 2026-09-30 14:25 (+04)

## Live now

| Item | Value |
|---|---|
| Site | https://vamostaxi.site and https://dashboard.vamostaxi.site |
| main = origin/main | `ec1beed5` plus planning notes |
| Worker `vamos` | version `04a64c26` |
| Rollback point | Worker `64be5312`, git tag `backup/main-before-psb-0c34961b` |
| Database | migrations up to `20260930210000`, plus `20261005100000` and `20261005110000` (Phase 20), applied and read back |
| Who deploys | the control session, from the owner's Mac. GitHub runs checks, never deploys. |

## Shipped

| Day | Time | What | main | Worker |
|---|---|---|---|---|
| 09-29 | | 26.3 booking flow; account list and guest link; manage booking; dashboard New trip; hourly jobs; sign-in and sign-up | `2bd05b0a` | |
| 09-30 | 00:16 | 26.4 one form, 26.4.1 laptop bar | `0f58ab6d` | |
| 09-30 | 01:35 | Legal pages from the company's text, and the follow-up | `e27014c1` | `a55b2c19` |
| 09-30 | 12:22 | 26.4.2 booking feedback: one-page phone booking, flight before From, class cards with photos, flight-edit fix | `37ba5b62` | `59c18372` |
| 09-30 | 12:38 | Phase 20 batch A (security), two migrations | `e8aaad0b` | `a0d38f64` |
| 09-30 | 12:46 | SEO: head, favicon, share picture, sitemap, one address per language | `5b394833` | `64be5312` |
| 09-30 | 14:40 | Repair of 26.4.2: the phone booking page releases the page scroll on close and covers the screen with the keyboard open | `ec1beed5` | `04a64c26` |

## Ship order from here

Owner's order: booking, payments, account, Meta first.

| # | Job | State | Needs |
|---|---|---|---|
| 1 | Phone sheet bugs | **Live 14:40.** Live read at 390: the sheet covers the screen, scrolling works again after closing. Real iPhone and keyboard: the owner's check | |
| 1a | Scroll lock never released on any page (`assets/lenis-boot.js`): phone menu and dialogs still stop scrolling until a reload | SEO session builds `fix/scroll-lock-release` | Owner's Ship |
| 1b | Support e-mail button | Handed over `a9fee250`; held until 26.5 is in | Ships on the control session's checks (owner's word 14:32) |
| 2 | **26.5 account choice before payment** | All build plans committed; final check (plan 07) running since 13:55 | Hand-over, control check, ship under the day's ship mode |
| 3 | 26.2 audit, hand-over 1 (17 bug fixes, dashboard, mails, helpers; no checkout) | Checked green by the control session at `bda1c151`; addendum at `8305d795` | 26.5 on main, re-check, owner's Ship. Proposed grant migration `20261007100000` |
| 4 | SEO follow-up (dashboard robots, first view in the stored language) | `c864061f`, parked | 26.5 on main, owner's Ship, and his word for deploying Worker `vamos-dashboard` |
| 5 | Class cards: layout E (signed), small photo files | Home side built (`1c9d4aba`); checkout side waits for 26.5 | Hand-over, owner's Ship |
| 6 | 27 consent record | Plans 01 to 12 built (`84ac72ec`), owner signed design and plan; plan 13 (sign-up tick box) waits for 26.5's account record on main | Then hand-over. `CONSENT_POLICY_VERSION` follows the ship day |
| 7 | 28 pixel page view, 29 purchase event | Not started. Meta wording is the owner's (`.planning/decisions/2026-09-30-meta-wording.md`) | After 27. Two switches in Meta Events Manager first |
| 8 | Phase 20 batch B | Waits | After 26.5. Includes refunds by hand (F11): signed plan first |
| 9 | Phase 20 batch C | Waits | After 27. Sign-in confirm screen (F12), dashboard files off the public address (F16), Arabic font from our own host (F17) |
| 10 | Phone home design (Trustpilot block, full-page menu, hero height) | Pictures first | Owner's signature |
| 11 | Scroll and speed | Measuring on live | A plan for the owner's signature |
| 12 | 26.0 main green | No session. 9 of 12 plans done, 35 behind main | Prompt `03-finish-26.0.md` |
| 13 | 26.2 gate scripts (stricter checks) | On `gsd/phase-26.2-u13` | Last, after 27 to 29 |

**Main is frozen since 14:42 until the 26.5 hand-over is in** (owner: fastest way to finish 26.5). No other ship, no heavy check run on this Mac meanwhile.

**Ship mode on 2026-09-30 only:** the control session ships 26.4.2 (and its repairs), 26.5 and
27 to 29 without asking, when every check of its own passes, and tells him right after.
Everything else, and everything from 2026-10-01, needs his Ship.
Full text: `.planning/decisions/2026-09-30-priorities-and-ship-mode.md`.

## Sessions and folders on this Mac

Disk free: 11.4 GB in the morning, 47.6 GB at 14:16. Rule: after a ship the branch goes to GitHub
as a branch, then the folder, its Docker stack and build output are removed the same day.

| Session | Folder under `vamos-wt/` | Branch | State |
|---|---|---|---|
| Vamos Taxi build 26.5 | `phase-26.5` (+ `.sb265`) | `gsd/phase-26.5-checkout-account` | running; stack `vamos-taxi-265` |
| Vamos Taxi 26.4.2 completion | `class-photo-small`; new: `phone-sheet-bugs`, `phone-home` | `feat/class-photo-small`, `fix/phone-sheet-bugs`, `fix/phone-home` | running |
| Vamos Taxi SEO and browser settings | `site-speed`, `seo-head-2` | `fix/site-speed`, `fix/seo-head-followup` | running / parked |
| Meta measurement phases 27-29 | `phase-27` | `gsd/phase-27-consent-record` | running; stack `vamos-taxi-270` stopped |
| Phase 26.2 audit | `phase-26.2`, `phase-26.2-u13` | `gsd/phase-26.2-audit`, `gsd/phase-26.2-u13` | waiting for 26.5; stack `vamos-taxi-262` stopped |
| Vamos Taxi security phase | `phase-20` (slimmed, reinstall needed) | `gsd/phase-20-security-check` | idle; stack `vamos-taxi-20` stopped |
| none (26.0) | `main-green-2` (slimmed, reinstall needed) | `fix/main-green-2` | idle; stack `vamos-taxi-mg2` stopped |

Removed on 2026-09-30, every tip on GitHub as a branch or an `archive/*` tag: 13 shipped folders,
7 unit folders of 26.2, `fix-26.3-followups` (its two research notes committed, branch pushed),
the old app worktree, 4 Docker stacks and 4 leftover volume sets. Docker stack `twenty-crm` is
another product and is never touched. Left for the owner in the main checkout: `brag-output`
1.3 GB, `.pnpm-store` 0.9 GB.

Prompts for sessions: `.planning/prompts/`, shared rules in `00-common-rules.md`.

## Owner requests, 2026-09-30

| Time | Request | Goes to | State |
|---|---|---|---|
| 12:55 | Class cards: photo on the side, card smaller, on laptop home and step 1 of /checkout | 26.4.2 session, `feat/class-photo-small` | Layout E signed; home built; checkout after 26.5 |
| 12:55 | Scrolling glitches everywhere; the site must be faster | SEO session, `fix/site-speed`, prompt `07-site-speed.md` | Measuring |
| 14:19 | **Bug:** after opening and closing the booking page on the phone, the home page no longer scrolls until a reload | 26.4.2 session, `fix/phone-sheet-bugs` | First, test first |
| 14:19 | **Bug:** with the iPhone keyboard open the booking page shrinks and the home page shows through under SEE PRICES | same | Same |
| 14:22 | Trustpilot block under the phone bar: smaller, redesigned, inside the white area | 26.4.2 session, `fix/phone-home` | Pictures, signature |
| 14:22 | Phone menu opens as a full page, not a side panel (shared header, every page) | same | Same |
| 14:22 | Hero fills the screen; no white strips at the top and bottom of Safari | same | Same |
| 14:27 | Support e-mail button must open the exact e-mail in the mail app he is signed in to, and his answer must stay in that thread. Today it is a plain new mail to the customer | Security session, `fix/support-open-in-mail` | Owner answered 14:32: always the mail of that ticket's customer, never mixed; mail app automatic for now, admin choice if cheap; build it; **ship when the control session's checks pass** (his word, this job only) |
| 09-29 | Later, its own job: passwords off on the whole site, e-mail link or passkey only | Not scheduled | His word when to start |

## Security (Phase 20)

Findings file: `20-06-FINDINGS.md`, live re-probe `20-09-LIVE.md`, branch `gsd/phase-20-security-check`.
The owner decided every finding F1 to F14. Every Phase 20 ship needs his Ship.

| Batch | When | What |
|---|---|---|
| A | **Live 12:38** | Pay link no longer opens Manage booking (F1). Dashboard Support read-only (F2). Confirmation read derives the customer from the session (F5). Resend job cut-off (F10). Page engine from our own host (F13). Re-probed on live from outside: all hold |
| with 26.5 | | Pay-button limit (F3): 5 presses per quote, 8 per minute per visitor |
| B | After 26.5 | Limit on the payment return address (F6), F8, rest of F14, **refunds by hand (F11)**: customer cancels, booking shows "Refund due", admin presses Refund. Signed plan and a check of every refund promise on /cancellation, /terms, FAQ and mails first. The refusal of a live Stripe key goes with it |
| C | After 27 | Sign-in confirm screen (F12), dashboard screen files off the public address (F16), Arabic font from our own host (F17), double headers on /dev |
| Owner decision | With Phase 27's cookie table | Cloudflare Web Analytics script is blocked by our own header, so it collects nothing (F15): switch off, or allow and say so on /cookies |
| New rows from 26.2 | In the Phase 20 queue | The staff ticket route still sends a reply when called directly (staff only); about 30 more rows in the 26.2 review files |
| Accepted, no work | | F4 ("Confirm email" is on), F7, F9. 41 dependency alerts on GitHub: all build tooling, none in the Worker |

## Migration numbers

| Lane | Numbers |
|---|---|
| 26.5 | `20261001100000` agreement record, `110000` unpaid hidden, `120000` paid-only reminder, `130000` pay-press cap |
| Phase 27 | `20261002100000` to `190000` |
| Phase 28 | `20261003100000` to `190000` |
| Phase 29 | `20261004100000` to `190000` |
| Phase 20 | `20261005100000`, `110000` (live) |
| Class photos | `20261006100000` to `190000` |
| 26.2 | `20261007100000` to `190000` |

## Decisions that stand

Full texts in `.planning/decisions/`.

| Decision | File |
|---|---|
| Service-role key on Worker `vamos`; read by staff digest, staff invite and, with 26.5, account creation, through one server-only module | `2026-09-29-checkout-account-notice.md` |
| Checkout account notice texts and the tick box, four languages | same |
| Legal pages: list A values; refund above 24 hours is 100 %; privacy paragraph "Your account" | `2026-09-30-legal-pages.md` |
| An unpaid booking never continues on another device; a paid trip can be shared | `2026-09-30-unpaid-booking-other-device.md` |
| Priorities and the one-day ship mode; the reminder goes to paid bookings only | `2026-09-30-priorities-and-ship-mode.md` |
| The three Meta texts, four languages | `2026-09-30-meta-wording.md` |
| SEO titles and descriptions; one address per language | `2026-09-30-seo-head-text.md` |
| Phase 19 (surge test) is closed | memory, PHASE-CLOSURE |
| Phase 27 keeps our own banner, no library; 27 is held until 26.5 is live (27 D-21, D-34) | Phase 27 context |

## Known on live, not fixed yet

| What | Carried by |
|---|---|
| The two phone booking bugs above | `fix/phone-sheet-bugs` |
| /terms section 03 mentions SMS; /about fleet numbers differ from the live classes (archived work `archive/legal-follow-up-fe4e37a0`, never shipped) | 26.2 list, not assigned |
| Settings say 15 minutes standard waiting, the pages say 30 | Owner changes the setting if both should agree |
| The airport fee is saved inside the fare line, not as its own line | 26.2 list |
| Tests in 26.0's folder that expect `/de/about` to redirect are stale since the SEO ship; one screenshot test expects gaps the legal ship removed | 26.0 |
| One unit test (`bookings-write.test.ts`) can time out at 5 seconds on a busy machine | 26.0 |
| Class photos are 2.3 to 2.8 MB each | `feat/class-photo-small` |
| VT-26-0739 and VT-26-0742 are not in the owner's account | Not a bug: booked with another e-mail address |

## Owner checks passed, 2026-09-30 14:27

| What | Result |
|---|---|
| 4242 payment on the current version | Passed. VT-26-0746, 14:24, confirmed, payment succeeded, method card, CHF 35.56, linked to his account, confirmation mail claimed (read on live by the control session) |
| 26.4.2 UAT | He works through it with the 26.4.2 session; what is left is design |
| Dashboard Support read-only | Accepted, with one requirement (next table) |
| Tab title, icon, share preview, language addresses | Approved |

## Waiting for the owner

| # | What | Where |
|---|---|---|
| 5 | Signatures as they come: phone home pictures, scroll and speed plan, refunds-by-hand plan | the sessions |
| 6 | Two switches in Meta Events Manager before Phase 28 (Automatic advanced matching off; Track events automatically without code off) | Meta |
| 7 | Older UAT not reported: manage link of VT-26-0743, dashboard New trip, sign-in 14 steps | e-mail, dashboard, phone |
| 8 | The unsigned Lenis folder `.planning/quick/260928-q4t-…` (feeds the scroll and speed plan) | decision |
| 9 | Empty the Trash; `brag-output` and `.pnpm-store` in the main checkout | his click |

## Owed by the control session

| What | When |
|---|---|
| Tell the 26.5 session's waiters when 26.5 is on main: 26.2, SEO, class cards, Phase 27, Phase 20 | At the 26.5 ship |
| Remove `phase-26.5`, `.sb265` and stack `vamos-taxi-265` | Same day as the 26.5 ship |
