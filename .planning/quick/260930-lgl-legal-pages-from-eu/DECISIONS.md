# Owner decisions in the legal-pages work session (2026-09-30)

Given by the owner through the question form in this work session. None of this text has been
read by a lawyer.

| # | Question | Answer |
|---|---|---|
| 1 | The live legal pages are `app/pages/*.dc.html` + `app/vamos-i18n-dict.js`, not the Next.js pages the brief named. Which files? | **Both**: the live mocks and the Next.js pages say the same thing |
| 2 | Standard (non-airport) waiting: 30 (list A) or 15 (live site and settings row 15)? | **30 minutes, as list A.** The live settings row (settings_versions id 15) still says `city_waiting_minutes = 15`; the owner changes it on the dashboard if he wants the two to agree. |
| 3 | The voucher-instead-of-refund text on /cancellation (the site cannot do it) | **Remove it**, both surfaces |
| 4 | UID `CHE-296.035.710`, live on /imprint since `ae9165bf` (2026-09-01), no source found | **Correct, keep it**, and put it on the Next.js page too (answers list B point 4) |
| 5 | Values live since 2026-09-01 that were never in list A (no DPO, no EU representative, log retention, payment records 10 years, Loomlyne credits, "English or German") | **Leave them live**, Next.js pages keep their gaps, list each one in the hand-over |
