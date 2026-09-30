# Hand-over: quick 260930-cps (class cards in layout E, small class photo files)

Written 2026-09-30. Branch `feat/class-photo-small`, folder `/Users/koss/Developer/vamos-wt/class-photo-small`. origin/main is merged (merge commit `04a76bf8`).
Final commit: the one carrying this file. Folder clean. Not pushed, no PR, not deployed.

## Owner's words and signatures
- 12:55 and 13:52: photo on the side, smaller card, laptop home and checkout step 1, every size. Options A to D refused. He sent his own reference (`screens/owner-reference-2026-09-30.png`, the earlier home fleet card).
- **Layout E signed** (question form): laptop home = three cards, square photo on the side, name, price, "7 seats · 6 bags", outlined SELECT; checkout, tablet and phone = the same card as rows with the round check. His two corrections (German photo stretched; tablet and phone cards must follow the desktop card) are in the signed second pass. Pictures `screens/opt-E-*`; as built: `screens/built-home-*`, `screens/built-checkout-*`.
- Photo files: **"Made once, then kept"** signed (DESIGN.md).

## What changed
- `app/home/home.dc.html`: laptop "Choose your class" cards in layout E; photo asks for `?w=640`.
- `app/vamos-i18n-dict.js`: one pattern appended, "N seats" (de, fr, ar).
- `apps/web/app/[locale]/checkout/checkout.css`, `sections/ClassSection.tsx`: checkout class cards in layout E at every width; seats and bags in words.
- `apps/web/i18n/messages/{en,de,fr,ar}.json`: `checkout.classSeats`, `checkout.classBags`, inserted after `seatsUpTo`. `packages/db/supabase/seed.sql` regenerated (`pnpm db:seed:gen`), never hand-edited.
- `apps/web/app/photos/[key]/route.ts` (+ test), `apps/web/lib/photos/variant.ts` (+ test): `/photos/<key>?w=640|1280` answers a WebP made once with the `IMAGES` binding and kept beside the original as `<key>.w640.webp`. The original is never changed or deleted by this. If the binding is missing or refuses, the original is served with a 5-minute cache.
- `apps/web/lib/checkout/checkout-quote.ts`: one line, the class photo URL gets `?w=640` (file released by 26.5; re-checked against main after the merge).
- Specs: `home-class-cards.spec.ts`, `checkout-sections.spec.ts` updated to layout E.
- `VehicleCard.tsx`: not changed.

## Photo weight, before and after
| Class | Before (live today, as uploaded) | After, `?w=640` |
|---|---|---|
| Economy | 2,768,149 bytes, PNG 1122 x 1402 | 132,844 bytes, WebP 640 x 800: measured on a local Worker build |
| Business | 2,339,051 bytes, PNG 1122 x 1402 | not measured; same pipeline |
| Van luxury | 2,478,165 bytes, PNG 1122 x 1402 | not measured; same pipeline |
Home page photos together: about 7.6 MB before; about 0.4 MB after if the other two land near Economy.
Local Worker proof (`opennextjs-cloudflare build`, `wrangler dev --local --env staging`, Economy's live file put into local R2): first `?w=640` 200 image/webp 132,844 bytes in 1.1 s, second in 5 ms from the kept copy; `?w=1280` 274,426 bytes (capped at the original's 1122 px); `?w=641` and no `w` give the original PNG; the kept object `classes/proof/economy.png.w640.webp` exists in local R2.

## Checks
Run on the commit before the final main merge unless marked.
| Check | Result |
|---|---|
| visual home-class-cards | 14 passed (again after the merge) |
| visual home-phone-hero | 22 passed after the merge |
| visual checkout-sections | 24 passed (layout E at 390, 768, 1024, 1440; en and ar) |
| visual checkout-pay-19 | 10 passed |
| visual home-laptop-bar, home-desktop-fixes | 81, 14 passed |
| unit: app/photos, lib/photos, lib/checkout | 774 passed after the merge |
| typecheck, seed:check | pass after the merge |
| lint, lint:css, check:numbers, check:legal-claims, check:db-fences, i18n:check | pass before the merge |
| check:public-env | NOT completed here: the script hung on leftover `.next-*` test build folders in this worktree (removed since). Control session runs it in a clean clone. |
| full unit set, build | NOT re-run after the checkout commit and the merge. The build passed earlier today on this branch for the local Worker proof. Control session runs both in a clean clone. |
| pgTAP, replay, types:check | not run; only the generated seed changed under `packages/db` |

## Not verified
- The `IMAGES` binding on the live account (Workers Free). Proven only in local wrangler. If live refuses, customers get the original photo (5-minute cache) and `photo_variant_failed` appears in the Worker log; nothing breaks. Read the log after the ship.
- No real phone, no real Safari. Nothing seen on live.
- fr was not pictured (de, ar, en were); fr strings exist and coverage tests pass.
- German laptop card: the dictionary's "Gepäckstücke" is used, not "Koffer" as in the signed picture; the line wraps under 1241 px, the photo stays square.
- SELECT on the home card is 44 px high (design-system md), not 54.

## Migrations, settings, cost
No migration, no setting, no secret. Cloudflare image conversions: one per photo and width, ever. Expected cost none; not verified on his account.

## Files outside my own
`apps/web/lib/checkout/checkout-quote.ts` (26.5's folder, one line), `app/vamos-i18n-dict.js`, `apps/web/i18n/messages/*.json`, `packages/db/supabase/seed.sql` (shared; appended or generated).

## Not in this branch, new from the owner today (through the 26.2 session)
- Dashboard, Pricing: the class photo "Remove" link goes (a class always has a photo).
- A replaced class photo is deleted from storage once the change is published. This touches the rule above (small copies are kept beside the original): the small copies of a replaced photo must go with it. One question to him first; separate job.

## Owner UAT on vamostaxi.site
1. Laptop, home, fill Zurich Airport, LX 318, a hotel, a date; SELECT Business; on /checkout fill "Who is travelling", PAY, card 4242 4242 4242 4242. Expected: the confirmation page with a VT reference.
2. Laptop, home, fresh load. Expected: three small cards, each with its square photo on the side, the name, "Fill in the trip to see prices", "3 seats · 3 bags", a pale outlined SELECT.
3. Fill the trip. Expected: grey blocks for a moment, then the three prices; SELECT is clear and clickable.
4. Switch to Deutsch. Expected: the photo stays square, nothing stretched.
5. Switch to العربية. Expected: the photo is on the right, text on the left, the arrow points left.
6. /checkout on the laptop. Expected: three rows, photo at the side, name, price, "fixed price", seats and bags; the chosen class has a dark border and a round check top right.
7. Phone, /checkout. Expected: the same rows, smaller photo; tap another class, the check moves.
8. /checkout with 5 passengers. Expected: Economy greyed with "Seats up to 3", no price on it.
9. Photos load fast. Expected: the three cars appear at once, not after seconds. (The control session reads the file size on live.)
