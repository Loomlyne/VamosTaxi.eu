# Build plan — home page sections (quick 261003-home-sections)

Design signed by the owner 2026-10-03 (`DECISIONS.md`). This plan waits for his signature before any code.
Branch `design/home-sections` (worktree `.claude/worktrees/design-home-sections`), cut from `origin/main` `cd047a59`.
No database change, no migration, no new API route, no money code. Hand-over to the controller at the end.

## What a customer will see (top to bottom)

| # | Section | Change | Data |
|---|---|---|---|
| 1 | Hero + booking card | none | — |
| 2 | How it works | keep; fix the name-board overlay on card 02; the destinations block leaves this file | — |
| 3 | **Vehicle classes** (new, layout A) | three cards: photo, name, up to N passengers, up to N bags, one line on who it suits, "Price this class" scrolls to the booking card | live `GET /api/quote` idle board, already fetched once per page (`window.__vamosIdleBoard`); photo/name/seats/bags change when the owner edits a class on the dashboard |
| 4 | **Where we drive** (redo, layout C) | tabs ZRH / GVA / BSL; airport photo beside a list of routes; Davos and St. Moritz carry "Fixed route"; tapping a route fills **both From and To** in the booking card | fixed routes from the same idle board (`fixed_routes`, with mapbox ids); other rows from the existing `PLACES` list |
| 5 | **At the airport** (new) | four steps (flight tracked, name board, 60 minutes free, call/WhatsApp) and the name board; small titles in Poppins | static copy; the per-airport meeting-point line is **hidden until the owner gives the text** |
| 6 | **Services** (redo) | four photo cards: Airport transfers, City to city, Mountain and ski, Business travel; each scrolls to the booking card | static |
| 7 | **Reviews** (redo, layout C) | platform chips (Google / Trustpilot / Tripadvisor: score + count) on top, wall of full reviews below; section hidden under 3 published reviews; a chip only shows for a platform that has reviews | `GET /api/reviews` (owner connects the platforms) |
| 8 | **Why book with us** (new) | five facts; "Licensed and insured" **hidden until the owner gives the text** | static: Dietikon ZH, UID CHE-296.035.710, Stripe + TWINT, price in writing, 24 h free cancel |
| 9 | **Business travel** (new) | contact strip: Contact us (`/contact`), WhatsApp; "Receipt by email" **hidden until the owner confirms** | static |
| 10 | **FAQ** (redo, open card + topics rail) | four topics on a side rail (swipe row on phone), opened question becomes a white card with no line inside, "Still a question?" box (below the list on phone) | static copy, list below |
| 11 | **Closing call to action** (new) | charcoal band: "Your driver is waiting.", Book a transfer, WhatsApp us | static |
| 12 | Footer | none | — |

`WhyVamos` stays as it is (commented import), untouched.

## Hero rating (owner, point 1)
No code here. The owner connects the review platforms himself. Until then the five sample rows stay published on live
and the hero keeps showing "5.0 · 5 reviews" from them. **Owner step, recommended today:** unpublish the five sample rows
on the dashboard Reviews screen; the hero row and the Reviews section then hide by themselves.

## Jobs (one file set each, run in parallel; Sonnet builds, lead integrates)

Every job: build the `.dc.html` with all states (default, hover/press, focus, loading skeleton, empty, error where data
can fail), `--vt-shadow-accent:none` + `.vt-input--focus{box-shadow:none}`, logical properties only, `vt-dir-keep` on
codes and numbers, Lucide icons through `Icon`, every visible string in `app/vamos-i18n-dict.js` with de / fr / ar
(adds only its own keys), `VamosLocale.coverage(root)` empty, no sideways scroll at 390.

| Job | Creates / edits (exclusive) |
|---|---|
| J1 Vehicle classes | new `app/home/VehicleClasses.dc.html` |
| J2 Where we drive | new `app/home/WhereWeDrive.dc.html`; `app/home/HowItWorks.dc.html` (remove destinations block, fix card-02 overlay) |
| J3 At the airport + Closing band | new `app/home/AirportMeet.dc.html`, new `app/home/ClosingCta.dc.html` |
| J4 Services | `app/home/Services.dc.html`, `app/home/ServiceCard.dc.html` |
| J5 Reviews | `app/home/Reviews.dc.html` (per-platform score from published rows grouped by `source`; hide rule ≥ 3) |
| J6 Why book with us + Business travel | new `app/home/TrustFacts.dc.html`, new `app/home/BusinessTravel.dc.html` |
| J7 FAQ | `app/home/FAQ.dc.html` |
| Lead (after J1–J7) | `app/home/home.dc.html`: import order above; route pick fills From and To (extend `vamos:dest-pick` with `from` + mapbox ids, resolve through the existing `/api/geo/retrieve`); `scripts/sync-dc-mock-to-public.mjs` list if new files need it; one merge of all i18n keys |

The React home twin (`apps/web/components/home/*`) reaches no customer (live home is the DC mock) and is out of scope.

## Gates before hand-over (lead runs once)
1. `node scripts/sync-dc-mock-to-public.mjs`, static server of `apps/web/public` on a free port.
2. Chromium on `/` at 1440, 1024, 768, 390 in en, de, fr, ar: every section renders, nothing scrolls sideways,
   `VamosLocale.coverage(document.body)` returns `[]` in each language.
3. Click proof: a route row in Where we drive fills From and To; "Price this class" and every Book link reach the booking card;
   FAQ topic switch and open/close; Reviews hidden with < 3 rows (stubbed `/api/reviews`) and shown with ≥ 3.
4. Repo gates the controller lists for mock changes (i18n dict check, twin/visual tests after the sync).
5. Signing pictures of the built page (en 1440, de 768, ar 390) in `screens/built-*`, then `HANDOVER.md`.

## Copy the owner signs with this plan (English; de / fr / ar follow in the build)
FAQ, four topics. Answers reuse live wording or facts already on the site; nothing new is promised.

- **Booking and price:** Is the price I see the final price? (live answer) · Do I need an account to book? (live) ·
  How far in advance do I need to book? (live) · What payment methods do you accept? (live, plus TWINT)
- **At the airport:** Where do I meet my driver? "After customs, in the arrivals hall. Your driver holds a board with your name." ·
  What if my flight is late? "We track your flight. The pickup time moves with the real arrival, at no extra cost." ·
  How long does the driver wait? "Sixty minutes of airport waiting are included on every airport pickup." ·
  What if I can't find my driver? "Call or WhatsApp +41 79 626 70 82."
- **Luggage and seats:** How many bags fit? "Each class shows its seats and bags before you pay." ·
  Skis, bikes, child seats? (live text from the Luggage page: declare them when you book; child seats on request)
- **Changes and cancellation:** Can I cancel or change my booking? (live answer) · Until when is cancellation free? "Until 24 hours before pickup." with a link to /cancellation

Who-it-suits lines on the class cards: Economy "One to three travellers with a suitcase each." · Business "Business trips and
families with more luggage." · Van luxury "Groups, ski trips and large luggage."

## Owed by the owner (lines stay hidden until given)
1. Meeting point at ZRH, GVA and BSL.
2. Licence and insurance details for "Licensed and insured".
3. Whether a receipt is emailed to the booker (Business travel).
