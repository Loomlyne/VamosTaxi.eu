# FAQ — `faq.dc.html`

**Shell:** its own, sharing the legal title band · **Questions:** 8 in 3 groups
**Status:** built 4 Aug 2026 · **carries the structural fix for conflict A2**

## 1. The deference rule — read this before editing an answer

The archived FAQ promised a full refund up to 24 hours before pickup. The archived terms granted
75% and retained 25%. Same customer, same moment, two promises — and the generous one is the one
they quote. That is conflict 1 on the register, and it exists because **two documents stated the
same number**.

So this page states none of them. No refund share, no cancellation window, no waiting allowance,
no baggage dimension, no fee. An answer names the concept, explains the shape of the rule in
words, and links to the page that owns the number.

That deference is a **designed component**, not a copy note:

```
[data-defer]     1px charcoal, 12px radius, 15/17 padding, sits at the foot of an answer
[data-defer-k]   11px uppercase kicker naming what lives elsewhere
[data-defer-a]   44px link, arrow-right, straight to the anchored section
```

Kickers are written to say *what* is elsewhere, not "learn more": “The deadline lives here”,
“What you get back lives here”, “Single source of truth”, “What the fare includes”, “Luggage and
seats in full”. Five of the eight answers carry one.

**If a future answer needs a number, that is a signal the number has no home page yet.** Give it
one, then defer to it. Do not paste it in.

## 2. Content — the real eight

Exactly what the archived site published, regrouped and rewritten in the brand voice. Nothing
added, nothing invented.

| Group | Questions |
|---|---|
| Booking & reservations | change a date or time · cancel a ride |
| Pricing & payment | when the confirmation arrives · what the cancellation policy is · tipping |
| Service & safety | reaching your chauffeur · own child or booster seat |

Service & safety keeps the source's intro line and its **Meet & greet** feature block — a charcoal
card with a yellow `plane-landing` tile, sitting above the cards rather than inside one, because
it is a service statement and not a question.

## 3. Why there is no search

Eight questions across three categories are faster to scan than to search, and a search field over
a set this small produces empty results that read as a broken site.

The affordance is **designed and documented, not shipped** — the review scaffold spells out the
trigger (roughly 25 questions or five categories), where it goes (the chip row, a 44px pill on the
same baseline), and what changes (chips become filters). Category headings already carry `id`s, so
nothing needs relaying out when it arrives.

## 4. Grouping, built to grow

Each category is a `<section data-grp>` with a `[data-grp-h]` heading: h2 plus a count, over a **2px
charcoal rule** — the brand's signature rule, the same one under the `PriceSummary` total.

A new category is one `<section>` and one chip. Four are already named as likely: luggage & special
items, flight delays & disruption, accounts & guest bookings, corporate & invoicing.

## 5. The accordion

Visual vocabulary is lifted verbatim from the existing `FAQ.dc.html` home section: 20px radius,
31px padding, 1px grey-300 hairline, 24px Qurova toggle, and the 50px circle straddling the
bottom-right corner — charcoal, going yellow when open. Panel animates `grid-template-rows: 0fr → 1fr`
at 200ms.

**One deliberate divergence: toggles are independent, not exclusive.** On the home teaser exclusive
is right — it is a taster of three. On a dedicated page people compare two answers, and having one
snap shut across the fold is hostile. An **Expand all / Collapse all** control sits at the end of
the chip row, which also makes browser find-in-page useful.

Grid: 1 column, 2 from 760px, 3 from 1160px. The third column arrives later than on the home
section because these cards carry deference blocks and run taller.

## 6. Print

Cards flatten to a bordered list, circles are hidden, every panel is forced open. A support agent
printing the FAQ gets all eight answers, not the one that happened to be expanded.

## 7. Tokens — 2 · Slots — 0

`{DRIVER_DETAILS_LEAD_TIME}` (shared — see below) and `{MEET_GREET_AIRPORTS}`.

The lead time appears in the terms, on this page twice, and on About. Under the token rules it
therefore moves out of `legal.terms.*` and into `common.*`. That move is the rule doing its job:
the moment a fact is stated in two places, it needs one key.
