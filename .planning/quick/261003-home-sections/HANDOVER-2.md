# Hand-over 2 — phone route tap fix (quick 261003-home-sections)

For the control session. Follows the ship `412ac19b` (live, Worker `0069e954`).

## The bug on live (read-only check, 2026-10-03 ~19:20 +04)
On a phone or tablet (≤1080 px), tapping a row in **Where we drive** opens the booking sheet with **From and To empty**.
Cause: `bookClick` in `app/home/home.dc.html` catches every `/#book` link at ≤1080, calls `stopPropagation`, and exempts only
the old HowItWorks chips (`[data-dest-tile],[data-dest-row]`, which no longer exist). The row's own handler never runs.
Live `https://vamostaxi.site/app/home/home.dc.html` still has the old selector. Desktop is not affected.

## The fix (branch `design/home-sections`, tip after merging `origin/main` `041b56df`)
Diff against `origin/main` is exactly two files:
- `app/home/home.dc.html`: the exemption selector becomes `[data-ww-row]` (comment updated). 2 lines.
- `apps/web/tests/visual/home-booking-sheet.spec.ts`: "a destination chip opens the sheet with To pre-filled" targets
  `[data-ww-row]` (the Services "Mountain and ski resorts" card also names Zermatt and was being clicked) and also expects
  From "Zurich Airport".
Merge note: `app/home/Reviews.dc.html` conflicted with the review-link restore; resolved to `origin/main` (main wins, nothing of ours there).

## Checked (merged tree)
- `tests/visual/home-booking-sheet.spec.ts`, all projects: 73 passed, 27 skipped, 0 failed (the chip test fails without the fix: To "").
- `service-links-264` + `home-one-form-264` unit: 29 passed.
- Pre-existing reds, proven identical on a clean `git archive origin/main` copy (23 failed there too): `home-hero` "en empty"
  (old baseline), `home-why-vamos` "support-on-driven" (progress bar), `home.spec` "screenshot en" (cookie banner stays after
  "Necessary only" on the Next dev server, which then skips the rest of the file), `home-sheet-history-bp2` webkit (a)/(b).
  Because of the cookie-banner red, the `home.spec` full-page baselines could not be regenerated on either tree.

## Owner UAT after deploy
1. On a phone open https://vamostaxi.site, scroll to Where we drive, tap "Zurich Airport → Zermatt".
   Expected: the booking sheet opens with From "Zurich Airport" and To "Zermatt".
