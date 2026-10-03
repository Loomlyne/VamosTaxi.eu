---
quick_id: 261003-arabic-logo-check
status: complete
date: 2026-10-03
---

# Summary: no change needed — the logo is not mirrored

Checked on vamostaxi.site, read-only, 2026-10-03 18:1x-18:2x (+04), headless Chromium, cookie card hidden by script (never clicked: that writes a consent row):

- Mock pages `/ar`, `/ar/about`, `/ar/sign-in`, `/ar/manage-booking` at 1440, 768, 390: the same `wordmark-reversed.svg`, unflipped, on the right.
- React page `/ar/checkout`: wordmark at 1440; at 390 the V mark alone (`mark-reversed.svg`). A 4x clip is identical to `/checkout` in English.
- No transform, `scale` or `rotate` on the image or any parent; no matching CSS rule. The old V button (ContactFab) is removed (`6a019ac1`).

Nothing committed to the site. Seen on the way, not changed: on phones the React header shows the V mark alone while the mock
pages show the full wordmark.
