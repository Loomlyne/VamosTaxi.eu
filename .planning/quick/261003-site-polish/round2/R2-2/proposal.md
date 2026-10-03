# R2-2 — tablet booking card (681–1080 px)

Today at 681–1080: the card is hidden; a "Where to?" bar (max 640, one line) + trust row sits in the hero, and tapping opens a full-screen sheet with one 560 px column
(at 1024x768 the "Who" block is under the footer CTA, so the sheet scrolls).

## A (recommended): the booking card returns at 681–1080, two-column grid
- optA.css is the whole style change. Code change: `NARROW()` (home.dc.html ~l.1158) and the two `matchMedia('(max-width:1080px)')` sites (~l.1376) move from 1080 to 680;
  `[data-bookcard]{display:none!important}` and the `@media (max-width:1080px)` bar block (l.291-308) become `max-width:680px`; the `#book` ≤1079 rules (l.211, l.241) become ≤680.
- 681–899: rows  From swap To / When + Travellers / SEE PRICES (full width) / notes.  900–1080: From swap To / When, Travellers, SEE PRICES on one row / notes.
- Flight row (when present) is full width on top, then From. One-way only, 54 px fields and CTA, field order unchanged. Phone (≤680) untouched.
- The hero trust line (`[data-trust]`) shows again under the card (rule `[data-trust][data-in-bar="1"]` must be scoped to ≤680).

## B: keep bar + sheet, redesign both
- optB.css + optB.js. Bar becomes one 54 px strip: From | To | When | SEE PRICES; any tap opens the sheet (BookingBar gets `variant="strip"`; dock follows it).
- Sheet becomes two columns from 681: Where | When, Who full width below with Passengers | Bags side by side. Footer CTA widens to 880.
- Needs new strings? No: From, To, Pickup address, Drop-off address, Add date and time, See prices all exist in the dictionary.
