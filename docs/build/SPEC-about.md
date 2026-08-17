# About — `about.dc.html`

**Status:** built 4 Aug 2026 · **blocked on decision A1** · no source copy existed

## 1. Written from evidence, not recovered

`/about-us` was never archived and the live site is offline, so there is no legacy copy to work
from. Everything here is written from what the business demonstrably **is**: a Zurich GmbH
registered in the commercial register, a named owner, fixed pricing, airport meet & greet with
flight tracking, a partner-driver network, multilingual support.

Nothing is invented in the other direction either — **no fleet size, no ride count, no years in
business, no cities-served total, no review score.** The legacy site carried an unverifiable
"48,350+ routes" claim; nothing of that shape appears here. If a number arrives later it arrives
with a source.

Three numeric facts are stated plainly because the client confirmed them: Economy 3 passengers /
3 medium cases, Van 8 / 8, and the company number. Business capacity was never given, so it is
two tokens.

## 2. Decision A1 — both answers, one layout

The archived terms declare Vamos a pure intermediary: the transport contract forms between the
passenger and a partner carrier, and Vamos disclaims liability for the ride. The service pages
sell "our skilled drivers", "licensed, insured chauffeurs", "our driver will track your flight".
An About page cannot straddle that — it is the page where a customer decides who they are dealing
with.

**Two sentences carry the entire difference**, and they are the only two that change:

| | Carrier | Intermediary |
|---|---|---|
| Story section | "We operate the transfers ourselves and we carry the responsibility for them…" | "We arrange your transfer with a licensed carrier and stay with it from booking to arrival…" |
| Drivers section | "Your driver works for us, or for a partner carrier… your contract is with Vamos Taxi" | "Your driver works for a licensed carrier in our network… your transport contract is with that carrier" |

Both variants are written to the **same length**, so no block reflows and no card changes height
when the answer lands. Each is marked in the page with a yellow underline (`[data-a1]`), and the
review header carries a two-way switch so the client can read the page both ways before deciding.
The `operatorModel` prop sets the shipped answer.

Everything around them is deliberately answer-neutral: licensing, insurance, vetting, standards,
"named to you before pickup", "paid for the job, so a longer route earns them nothing extra" — all
true either way. The same A1 answer then fills the slots in terms 01, 05 and 13.

## 3. Structure

```
Title band + arrivals photograph      full-bleed, rounded top corners
Who we are                            founder story + founder image slot
What you are buying                   4 promise cards
The fleet                             3-class capacity list + V-Class photo + 2 image slots
Where we drive                        coverage prose + 4 cards
Our drivers                           charcoal band — the A1 section — + partner recruitment
Ride with class                       closing CTA
```

Sections alternate a `[data-split]` two-column layout with full-width card grids, so the page has
rhythm without needing a second background colour. Two backgrounds total — page and charcoal —
per the design system's rule.

## 4. Imagery

| Used | Where |
|---|---|
| `hero-arrivals.jpg` | title band, cropped to `clamp(220px,34vw,400px)` |
| `fleet-van-street.jpg` | fleet section, with a scrim caption naming it as the Van class |

Three **image slots**, dashed grey-400 on grey-100, each captioned with what the photograph must
be: founder portrait, Economy vehicle, Business vehicle. The founder slot says why a stock face is
worse than none. The vehicle slot notes that until they exist, those classes fall back to an icon
tile in the booking flow.

White type over the V-Class photo sits on `--vt-scrim-bottom`, never raw.

## 5. Voice

Second person, present tense, short sentences, no adjective doing work a fact could do. The
opening is the product in three clauses: *"You book a day ahead, you see the price before you pay,
and at the agreed time the car is already there."* Then the negative space that makes it premium:
*"No surge, no meter, no waiting to find out what it costs."*

The headline — "A Zurich operator, not a marketplace" — is the positioning the design system asks
for in §1: booked ahead, priced up front, driver waiting.

## 6. Tokens — 5 · Slots — 1 · Image slots — 3

`{BUSINESS_PAX}` `{BUSINESS_BAGS}` `{DRIVER_LANGUAGES}`, plus `{SUPPORT_LANGUAGES}` and
`{DRIVER_DETAILS_LEAD_TIME}` shared.

Slot: the definitive coverage list — cities, resorts, cross-border destinations, and which are
seasonal. It fills this section *and* the destination list in the booking flow: one list, two
places, so it must come from one answer.

## 7. Open link

The drivers band ends with **Become a partner**, which is also now in the footer. The page does
not exist and is not in V1 scope — A12. Build it or unlink it; a footer link to a missing page is
worse than neither.
