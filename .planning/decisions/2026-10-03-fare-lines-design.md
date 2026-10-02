# Separate fare lines — owner answers, 2026-10-03 ~02:50 (+04): design signed

Source: the owner's answers in the controller session's question form (session 004ad4f0), first-hand.
Design: `.planning/quick/261003-fare-lines/DESIGN.md` and `screens/` (branch design/fare-lines 0e953133).

| Question | Answer, verbatim option |
|---|---|
| U04-3: own lines for the airport pickup fee and the route extra (asked 02:05) | "Own lines, show me first (Recommended)" |
| Icons on the two new lines | "With icons (Recommended)" (plane on Airport pickup fee, pin on the route line, the site's Lucide icons) |
| Where: also the pay-link page, Manage booking and My bookings | "Everywhere (Recommended)" |
| One airport-fee wording in German and Arabic | "Flughafen-Abholgebühr (Recommended)" — German "Flughafen-Abholgebühr", Arabic "رسوم الاستقبال من المطار"; older pages change to match |

Settled by the controller, stated to the owner and not contested: bookings paid before the change keep their single Fare line (saved prices are never rewritten); the confirmation e-mail's missing voucher line is fixed in the same build.
Amounts stay CHF 000 until the owner switches prices live.

## Plan signature, 2026-10-03 ~03:10 (+04)

| Question | Answer, verbatim option |
|---|---|
| Sign the build plan (`.planning/quick/261003-fare-lines/PLAN.md`, branch feat/fare-lines e69e90b8); builds after the contact button lands | "Signed, build it" |
| Town names on the route line on the pay-link page, Manage booking and My bookings (one small read-only database change) | "Yes, with town names (Recommended)" |
| Fix the voucher line on those three pages in the same change | "Yes, fix it (Recommended)" |

Migration number reserved by the controller: `20261007230000` (fare lines read functions). Next free: `20261007240000`.
