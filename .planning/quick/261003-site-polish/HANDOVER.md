# Hand-over — site polish (quick 261003-site-polish)

For the control session. Branch `design/site-polish`, worktree `.claude/worktrees/site-polish`, cut from `origin/main` `7c01f962`,
`origin/main` `fddfae18` merged in. Not pushed, no PR, not deployed. Work session `cf90a3da`.
Owner signed every design through chat and the question form (2026-10-03): `DECISIONS.md`. Pictures: `screens/`.
No migration, no database change, no money or sign-in code. One API change: `/api/geo/suggest` adds `kind` to each suggestion.

## What changed (customer-facing; the live home and pages are the DC mocks)
1. Hero (phone/tablet ≤1080): `calc(100svh - 88px - env(safe-area-inset-bottom))`, so the booking card clears Safari's floating address bar.
2. Design system: third-party brand marks rule (§5 readme + CLAUDE.md); `assets/social/whatsapp{,-white}.svg`; `laws.css` (+ public copy)
   `--vt-accent-press` = hover step — a pressed primary button was charcoal on charcoal on every page where law 02 is live.
3. Reviews: each platform's own rating look (Trustpilot boxes, Google stars, Tripadvisor bubbles); hero + phone Trustpilot rows use
   Trustpilot boxes; wall drifts upward above 6 reviews (CSS only; still on phones and reduced motion; pause on hover/focus).
4. Contact button: cycles WhatsApp us / Call us / Email us; WhatsApp step WhatsApp green; yellow over the footer; WhatsApp logo row.
5. WhatsApp logo on every WhatsApp control (mocks + React twins).
6. Business travel: charcoal ground, branded V-Class photo (look A only).
7. FAQ / About / Contact use the new home sections (FAQ full set by prop, AirportMeet, TrustFacts, classes, routes, Reviews).
8. Address list: icon + label from Mapbox kind, bold typed letters, skeleton, empty state, Popular picks; Mapbox order kept.
   Lucide `bed`, `train-front`, `map` added.
9. Tablet 681–1080: full booking card in two columns; bar + sheet phone only (≤680). Owner's word replaces 26.4 D-01 for tablets.
10. Where we drive rows: no hover/press; text charcoal; Arabic arrow points to the destination. Home stylesheet order fixed so laws.css wins.
11. ClosingCta removed (file + two strings).
Strings: merged into `app/vamos-i18n-dict.js` (Email us, kind labels, Popular, Search results, hint, "No places found" pattern).

## Checked
See `VERIFY-CODE.md` (single verifier, 2026-10-04): every owner item PASS; i18n check pass; coverage empty de/fr/ar on faq/about/contact
(home lists the same 5–6 hero strings as clean origin/main); 32/32 no sideways scroll; laws; twins byte-identical; tsc 0 code errors;
eslint/stylelint on changed files pass; unit 413 files (2 branch failures fixed); Playwright 10 specs × 4 widths: 306 passed.
Clean rerun 2026-10-04 14:26 +04 (load 9, tip a7912899+): full unit suite 415 files / 4764 tests passed, 0 failed; `tsc --noEmit -p apps/web` exit 0.

## Not checked / owed
- Full-page screenshot baselines stale (already red on clean origin/main): `faq` (en/de/fr/ar), `home`, `about`, `contact`,
  `legal-cancellation-imprint` × 4 widths — regenerate in the clean clone; wait for the 19 FAQ questions before the faq shot.
- Not seen on the local Worker build or on a real iPhone (hero vs Safari bar is judged on his phone).
- React twins (not customer-facing) only unit/static checked.

## Owner UAT after deploy (vamostaxi.site)
1. iPhone Safari, open the home page. Expected: photo, headline and the white booking card all visible without scrolling.
2. iPad (or 768–1080 wide). Expected: the full booking card in two columns (From, To / When, Travellers / SEE PRICES), no "Where to?" bar.
3. Type "zur" in From. Expected: Zurich Airport first with a plane and AIRPORT; a station shows a train, a hotel a bed.
4. Empty From field, tap it. Expected: Popular — Zurich, Geneva, Basel airports and Zurich HB.
5. Watch the round contact button for 10 seconds. Expected: it opens to WHATSAPP US (green), CALL US, EMAIL US and closes between.
6. Scroll to the footer. Expected: the button turns yellow (green on the WhatsApp step), never disappears.
7. Hover a Where we drive row. Expected: nothing changes; the text stays charcoal.
8. Scroll to Business travel. Expected: charcoal section with the Vamos van photo; WhatsApp button with the green logo.
9. End of the home page. Expected: FAQ then the footer; no "Your driver is waiting." band.
10. Open /app/pages/faq.dc.html. Expected: the topics list and white answer card like the home FAQ, 19 questions.
11. Switch to العربية on home. Expected: everything right-to-left, route arrows point left, nothing scrolls sideways.
12. Reviews: with more than 6 published reviews the wall drifts slowly upward and stops under the mouse.
