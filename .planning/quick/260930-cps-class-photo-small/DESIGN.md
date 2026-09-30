# Design: the site serves a smaller version of each class photo

Quick job 260930-cps. Owner decision 10 of 26.4.2 (2026-09-30). Branch `feat/class-photo-small`. Nothing visual changes.

## Today (read on vamostaxi.site, 2026-09-30)
- The three class photos are PNG, 1122 x 1402, 2.3 to 2.8 MB each. The home page on a laptop loads about 7.6 MB of photos.
- `/photos/<key>` hands out the file exactly as uploaded from storage (R2 bucket `PHOTOS`).
- `/_next/image` answers 404 for a `/photos/...` address on live, so Next's own resizer is not a path.
- The Worker already has the Cloudflare image tool bound (`IMAGES` in `wrangler.jsonc`). Whether it works on the live account: not verified.

## Proposed
1. `/photos/<key>?w=640` and `?w=1280` answer a WebP of that width. No other width is accepted; anything else gets the original as today.
2. The small version is made once, the first time someone asks for it, with the `IMAGES` tool, and saved in the same bucket beside the original (`<key>.w640.webp`). Every later visitor gets the saved file. The original is never changed or deleted.
3. If making it fails for any reason, the visitor gets the original. A photo never breaks.
4. Class cards on the laptop home and in checkout ask for the small version (`srcset` 640 and 1280, the browser picks). Same crop, same card, same height.
5. A new upload on the dashboard needs nothing extra: its small versions appear on first view. A replaced photo has a new address, so no stale picture.

Expected weight: about 50 to 200 KB per photo instead of 2.3 to 2.8 MB. Measured on the hand-over, not promised here.

## Cost
Two conversions per uploaded photo, ever (one per width). Cloudflare's free allowance is 5,000 a month. Expected cost: none. Not verified on his account; the first deploy shows it, and point 3 covers a refusal.

## Not in this job
Chauffeur, vehicle, review and staff photos keep the route as it is (the `?w=` works for them too, nothing asks for it yet). No change to the upload limit (5 MB) or the dashboard screens.

## Checks
Unit tests for the width rule, the saved-name rule and the fallback. A local Worker run that shows a real WebP at both widths and the saved file being reused. Visual specs for the class cards unchanged. No migration, no setting, no secret.

## Card layout (added 2026-09-30, replaces the layout signed at 11:50)

Owner, 12:55 and 13:52: photo on the side, smaller card, laptop home and checkout step 1, every size.
Options A to D were shown and refused (`screens/opt-A…D-*`). He sent his own reference, `screens/owner-reference-2026-09-30.png`: the earlier home fleet card.

**Signed: layout E, second pass** (question form, 2026-09-30, pictures `screens/opt-E-*`).
- Laptop home: three cards across. Square inset photo on the side (146 px, 120 px under 1241 px, never stretched), name, price, "7 seats · 6 bags", outlined SELECT across the text column.
- Before the trip is filled: "Fill in the trip to see prices" in the price line, SELECT pale. Loading: grey blocks for price and button.
- Checkout step 1 at every width, tablet and phone included: the same card as rows, with the round check when chosen. No SELECT button there; the card is the control.
- His two corrections on the first pass: the German card's photo was stretched upward (fixed: the photo stays square), and tablet and phone cards must follow the desktop card (done).

Built differently from the picture, on purpose: the German bags word is the dictionary's existing "Gepäckstücke" (the picture said "Koffer"); the line wraps under 1241 px and the photo stays square.
