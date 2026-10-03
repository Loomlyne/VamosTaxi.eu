---
quick_id: 261003-phone-header-wordmark
status: complete
date: 2026-10-03
---

# Summary: phones and tablets show the full wordmark on the React pages

`apps/web/components/shell/SiteHeader.tsx`: the `data-hd-narrow` logo is `form="wordmark" height={22}` (was the V mark
at 30), exactly the mock's `SiteHeader.dc.html`. Affects /checkout, /confirmation, /account and the other Next pages
below 1080 px. The DC pages already showed it. No string, no CSS, no other file.

## Verified (2026-10-03 18:3x-18:5x +04)

- Header visual spec on unchanged main: 123 pass, 9 skipped, 0 fail. After the change 72 port-only pictures at
  390/768/1024 differed; two diffs opened (ar 390, en 390): the logo only. Re-taken; rerun 123 pass, 0 fail; no 1440
  picture changed.
- `shell.spec.ts` + `error-pages.spec.ts` on main and on this branch fail the same pre-existing pictures (SiteFooter
  default x4, the fr 404 at 1440) — not this change.
- Pictures `screens/before-*.png` (live) and `screens/after-*.png` (test lab build of this branch), en and ar at 390
  and 768: wordmark in, Arabic on the right with the menu disc on the left, nothing mirrored.
- `lab.sh gates`: typecheck, eslint, i18n, numbers, db fences, legal claims, vitest related all PASS.

## Not verified

- The 404 page at 390: its spec times out starting its own server (90 s beforeAll), on main too; its picture was
  not compared.
- No live deploy (controller).
