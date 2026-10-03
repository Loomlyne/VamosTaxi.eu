# Owner decisions — quick 261003-site-polish (2026-10-03, chat + question form)

Round 1
- Business travel: look A (split). Look B is removed from the code.
- Contact button: when it shows WhatsApp it is WhatsApp green EVERY time (on the page and over the footer), white WhatsApp logo, charcoal label. Call us / Email us stay charcoal on the page, yellow over the footer.

Round 2
1. Address list: the new design (kind icons + labels, bold typed letters, skeleton, empty state), on desktop dropdown AND phone/tablet sheet. Server sends `kind`. Mapbox order kept (no client re-sort). Popular picks when the field is empty: in the pictured design, kept.
2. Tablet booking card: A — the full card in two columns at 681–1080 px. Owner's word replaces 26.4 D-01 ("one bar + sheet") for tablets; phones ≤680 keep bar + sheet.
3. Where we drive rows: neither A nor B. Simpler: no hover fill, no hover effect; text stays charcoal (never brown). Keyboard focus keeps the design-system ring (accessibility; mouse users never see it).
   Colour law on home: fix the stylesheet order so laws.css wins on home like on About ("change it").
4. Reviews wall: A — columns drift slowly upward, pause on hover/focus, still under reduced motion. Starts above 6 published reviews; still (no drift) on phones ≤680; soft edge fade. One more example review in test pictures/specs only — never an invented review on the live site (owner chose "test example only").
5. ClosingCta "Your driver is waiting." removed from home; file and its two strings deleted.
