---
quick_id: 261003-phone-header-wordmark
date: 2026-10-03
branch: fix/phone-header-wordmark
---

# Phone header: the full wordmark on the React pages, as the mock

Owner's choice (question form, 2026-10-03 18:3x): "Phone header wordmark". Below 1080 px the React `SiteHeader`
(/checkout, /confirmation and the other Next pages) showed the V mark alone; every DC page shows the full
"Vamos taxi" wordmark at 22 px (`app/home/SiteHeader.dc.html`, `data-hd-narrow`), the signed design.

Files: `apps/web/components/shell/SiteHeader.tsx` (one line), the 72 port-only header pictures at 390/768/1024 in
`apps/web/tests/visual/shell.spec.ts-snapshots/`, this folder. Proof: header visual spec before/after, pictures
from live (before) and the test lab (after) at 390 and 768 in en and ar.
