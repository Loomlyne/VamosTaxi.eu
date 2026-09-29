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
| 6 | UID asked again: Phase 11 and 26 tests called CHE-296.035.710 invented. Did you check it? | **Checked, it is correct.** Tests now pin exactly that number. |

## Put to the owner and answered, NOT built (brief step 4: "do not build")

| # | Question (page) | Answer | What a later job builds |
|---|---|---|---|
| 7 | Refund when cancelling less than 24 hours before pickup (/cancellation) | **Our team decides** | Replace the gap "Refund within 24 hours" with "Our team decides the refund and tells you by email", four languages, both surfaces |
| 8 | Payment methods (/terms, list B 2) | **What Stripe shows**, and the owner added: "the payment methods we use are on the footer" | Footer marks today: Visa, Mastercard, Apple Pay, Google Pay, TWINT (= the live terms line). Read Stripe's enabled methods, compare with the footer, put the result to the owner, then fill the Next.js gap "Payment methods" |
| 9 | City stay fee (/terms, list B 3) | **"Shown on your quote"** | Replace the gap "City stay fee" with "shown on your quote", four languages, both surfaces |
| 10 | PayPal, AWStats, Google Analytics (/privacy, list B 6) | **Never name them** | Nothing to build: no legal page names them today |
| 11 | More-than-15-passenger 5-day rule (/cancellation, list B 7) | **No rule** | Nothing to build: the rule is not on the pages (the 8-seat / 72-hour line was removed in this job) |
| 12 | Part payment and "My Reservations" (/terms, /cancellation, list B 8) | **The new site's way** (full payment, cancel by email link or account) | Nothing to build: that is what the pages say |
| 13 | The two adviser notes on /privacy (statutory references, transfer mechanism) | **Hide from customers** | The live mock already hides them (`[data-slot]{display:none}`); the Next.js pages still show them: hide there |
| 14 | "Last updated" date on the legal pages | **The ship day** | The control session sets the date on privacy, terms, cancellation and imprint when it deploys this job |

List B point 4 (UID) is decision 4 and 6. List B point 5 (e-mail and phone) was not asked: `CLAUDE.local.md` already fixes info@vamostaxi.site and +41 79 626 70 82, and the pages use them.

## Follow-up session (branch `docs/legal-pages-follow-up`), 2026-09-30

| # | Question | Answer |
|---|---|---|
| 15 | The approved cancel sentences also sit on /booking-detail and the /confirmation cancel box. Change them too? | **Yes, all three pages** |
| 16 | /cancellation §03 "up to 24 hours before pickup (72 hours for 8+ seats) before pickup" | First answer: "I don't want to see any TBC". Then: **no TBC on any live page** (each gap filled with what the site does, or its sentence removed, listed before ship) and §03 **without a deadline**: "can be changed before pickup, free of charge" |
