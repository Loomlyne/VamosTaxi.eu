# Proof run: 261002-p6-followups

Written by `tools/proof-report.mjs` from the files in this folder; `tools/proof-run.sh all` makes the whole run again (one command).

## What ran

- Tree: `43f6b5b8` Merge remote-tracking branch 'origin/main' into fix/p6-followups; 3 path(s) uncommitted at report time.
- Built from: `e9d8ec9b fix(p6-followups): the change view's buttons may wrap, so French fits at 390` with 0 tracked file(s) modified and uncommitted at build time.
- Build: `pnpm --filter web exec opennextjs-cloudflare build` after `node scripts/sync-dc-mock-to-public.mjs`; `.open-next/worker.js` written 2026-10-02T09:47:46.270Z.
- Workers: the built bundle on `wrangler dev` (public :4790, dashboard `dashboard.localhost:4791`), the local stand-ins for Stripe, Mapbox, Resend and Turnstile on :4797 (fetch rewrite of the built worker.js only), own Supabase stack `vamos-taxi-p6f` (API 61621, DB 61622). Nothing stubbed in the Worker or in the page.
- Seed: `apps/web/lib/ops/p6-followups-browser.local-seed.test.ts` (three paid bookings of one customer: `van10` Van luxury 12 seats with 10 travellers and 6 bags; `waiting` with the owner's dearer change waiting for its difference; `plain`). Amounts are synthetic rappen (paid CHF 0.83).
- Browser: Playwright Chromium; one context per case with its own client address (the write limiter is 4 a minute per address). Guest = the e-mailed manage link `/manage-booking?token=`; signed in = `/booking-detail?ref=` with the customer's session (the route `/account/bookings/<ref>` does not exist; the account booking page is `/booking-detail`).

## Result of the browser run (2026-10-02T09:54:34.213Z)

| group | PASS | FAIL | n/a |
|---|---|---|---|
| S0 | 1 | 0 | 0 |
| S1 | 1 | 0 | 0 |
| P1 | 32 | 0 | 0 |
| P3 | 31 | 0 | 1 |
| P4 | 57 | 0 | 0 |
| COV | 21 | 0 | 0 |
| ERR | 1 | 0 | 0 |
| BAN | 1 | 0 | 0 |

No check failed.

### Every check

| id | result | what | evidence |
|---|---|---|---|
| S0 | PASS | the local stack accepts the customer's password (admin API) | customer 200 |
| S1 | PASS | the customer signs in at /sign-in with a password (state reused by the signed-in checks) | cookies 3, session signedIn=true |
| P1 guest en 1440 | PASS | van10 reads 10 travellers, no 8 | line "10 passengers" (expected "10 passengers") x1; 8-line present: false; dir ltr; Van luxury shown: true; scrollWidth 1440/1440 |
| P1 guest en 1024 | PASS | van10 reads 10 travellers, no 8 | line "10 passengers" (expected "10 passengers") x1; 8-line present: false; dir ltr; Van luxury shown: true; scrollWidth 1024/1024 |
| P1 guest en 768 | PASS | van10 reads 10 travellers, no 8 | line "10 passengers" (expected "10 passengers") x1; 8-line present: false; dir ltr; Van luxury shown: true; scrollWidth 768/768 |
| P1 guest en 390 | PASS | van10 reads 10 travellers, no 8 | line "10 passengers" (expected "10 passengers") x1; 8-line present: false; dir ltr; Van luxury shown: true; scrollWidth 390/390 |
| P1 guest de 1440 | PASS | van10 reads 10 travellers, no 8 | line "10 Passagiere" (expected "10 Passagiere") x1; 8-line present: false; dir ltr; Van luxury shown: true; scrollWidth 1440/1440 |
| P1 guest de 1024 | PASS | van10 reads 10 travellers, no 8 | line "10 Passagiere" (expected "10 Passagiere") x1; 8-line present: false; dir ltr; Van luxury shown: true; scrollWidth 1024/1024 |
| P1 guest de 768 | PASS | van10 reads 10 travellers, no 8 | line "10 Passagiere" (expected "10 Passagiere") x1; 8-line present: false; dir ltr; Van luxury shown: true; scrollWidth 768/768 |
| P1 guest de 390 | PASS | van10 reads 10 travellers, no 8 | line "10 Passagiere" (expected "10 Passagiere") x1; 8-line present: false; dir ltr; Van luxury shown: true; scrollWidth 390/390 |
| P1 guest fr 1440 | PASS | van10 reads 10 travellers, no 8 | line "10 passagers" (expected "10 passagers") x1; 8-line present: false; dir ltr; Van luxury shown: true; scrollWidth 1440/1440 |
| P1 guest fr 1024 | PASS | van10 reads 10 travellers, no 8 | line "10 passagers" (expected "10 passagers") x1; 8-line present: false; dir ltr; Van luxury shown: true; scrollWidth 1024/1024 |
| P1 guest fr 768 | PASS | van10 reads 10 travellers, no 8 | line "10 passagers" (expected "10 passagers") x1; 8-line present: false; dir ltr; Van luxury shown: true; scrollWidth 768/768 |
| P1 guest fr 390 | PASS | van10 reads 10 travellers, no 8 | line "10 passagers" (expected "10 passagers") x1; 8-line present: false; dir ltr; Van luxury shown: true; scrollWidth 390/390 |
| P1 guest ar 1440 | PASS | van10 reads 10 travellers, no 8 | line "10 ركاب" (expected "10 ركاب") x1; 8-line present: false; dir rtl; Van luxury shown: true; scrollWidth 1440/1440 |
| P1 guest ar 1024 | PASS | van10 reads 10 travellers, no 8 | line "10 ركاب" (expected "10 ركاب") x1; 8-line present: false; dir rtl; Van luxury shown: true; scrollWidth 1024/1024 |
| P1 guest ar 768 | PASS | van10 reads 10 travellers, no 8 | line "10 ركاب" (expected "10 ركاب") x1; 8-line present: false; dir rtl; Van luxury shown: true; scrollWidth 768/768 |
| P1 guest ar 390 | PASS | van10 reads 10 travellers, no 8 | line "10 ركاب" (expected "10 ركاب") x1; 8-line present: false; dir rtl; Van luxury shown: true; scrollWidth 390/390 |
| P1 account en 1440 | PASS | van10 reads 10 travellers, no 8 | line "10 passengers" (expected "10 passengers") x1; 8-line present: false; dir ltr; Van luxury shown: false; scrollWidth 1440/1440 |
| P1 account en 1024 | PASS | van10 reads 10 travellers, no 8 | line "10 passengers" (expected "10 passengers") x1; 8-line present: false; dir ltr; Van luxury shown: false; scrollWidth 1024/1024 |
| P1 account en 768 | PASS | van10 reads 10 travellers, no 8 | line "10 passengers" (expected "10 passengers") x1; 8-line present: false; dir ltr; Van luxury shown: false; scrollWidth 768/768 |
| P1 account en 390 | PASS | van10 reads 10 travellers, no 8 | line "10 passengers" (expected "10 passengers") x1; 8-line present: false; dir ltr; Van luxury shown: false; scrollWidth 390/390 |
| P1 account de 1440 | PASS | van10 reads 10 travellers, no 8 | line "10 Passagiere" (expected "10 Passagiere") x1; 8-line present: false; dir ltr; Van luxury shown: false; scrollWidth 1440/1440 |
| P1 account de 1024 | PASS | van10 reads 10 travellers, no 8 | line "10 Passagiere" (expected "10 Passagiere") x1; 8-line present: false; dir ltr; Van luxury shown: false; scrollWidth 1024/1024 |
| P1 account de 768 | PASS | van10 reads 10 travellers, no 8 | line "10 Passagiere" (expected "10 Passagiere") x1; 8-line present: false; dir ltr; Van luxury shown: false; scrollWidth 768/768 |
| P1 account de 390 | PASS | van10 reads 10 travellers, no 8 | line "10 Passagiere" (expected "10 Passagiere") x1; 8-line present: false; dir ltr; Van luxury shown: false; scrollWidth 390/390 |
| P1 account fr 1440 | PASS | van10 reads 10 travellers, no 8 | line "10 passagers" (expected "10 passagers") x1; 8-line present: false; dir ltr; Van luxury shown: false; scrollWidth 1440/1440 |
| P1 account fr 1024 | PASS | van10 reads 10 travellers, no 8 | line "10 passagers" (expected "10 passagers") x1; 8-line present: false; dir ltr; Van luxury shown: false; scrollWidth 1024/1024 |
| P1 account fr 768 | PASS | van10 reads 10 travellers, no 8 | line "10 passagers" (expected "10 passagers") x1; 8-line present: false; dir ltr; Van luxury shown: false; scrollWidth 768/768 |
| P1 account fr 390 | PASS | van10 reads 10 travellers, no 8 | line "10 passagers" (expected "10 passagers") x1; 8-line present: false; dir ltr; Van luxury shown: false; scrollWidth 390/390 |
| P1 account ar 1440 | PASS | van10 reads 10 travellers, no 8 | line "10 ركاب" (expected "10 ركاب") x1; 8-line present: false; dir rtl; Van luxury shown: false; scrollWidth 1440/1440 |
| P1 account ar 1024 | PASS | van10 reads 10 travellers, no 8 | line "10 ركاب" (expected "10 ركاب") x1; 8-line present: false; dir rtl; Van luxury shown: false; scrollWidth 1024/1024 |
| P1 account ar 768 | PASS | van10 reads 10 travellers, no 8 | line "10 ركاب" (expected "10 ركاب") x1; 8-line present: false; dir rtl; Van luxury shown: false; scrollWidth 768/768 |
| P1 account ar 390 | PASS | van10 reads 10 travellers, no 8 | line "10 ركاب" (expected "10 ركاب") x1; 8-line present: false; dir rtl; Van luxury shown: false; scrollWidth 390/390 |
| P3 control | PASS | the probe sees an unwrapped number in Arabic as reversed (so a pass below means something) | +41@1413.9 79@1390.8 626@1357 70@1333.9 82@1310.3 ltr=false |
| P3 guest ar 1440 lookup | PASS | lookup view: the phone reads left to right | button "+41 79 626 70 82" +41@444.7 79@474.5 626@496.4 70@528.3 82@550.4 ltr=true; scrollWidth 1440/1440 |
| P3 guest ar 1440 booking | PASS | booking view: the phone reads left to right | button "+41 79 626 70 82" +41@396.3 79@426.2 626@448 70@479.9 82@502 ltr=true |
| P3 guest ar 1440 change | PASS | change view: the phone reads left to right | button "+41 79 626 70 82" +41@396.3 79@426.2 626@448 70@479.9 82@502 ltr=true; scrollWidth 1440/1440 |
| P3 guest ar 1024 lookup | PASS | lookup view: the phone reads left to right | button "+41 79 626 70 82" +41@248.3 79@278.1 626@300 70@331.8 82@354 ltr=true; scrollWidth 1024/1024 |
| P3 guest ar 1024 booking | PASS | booking view: the phone reads left to right | button "+41 79 626 70 82" +41@208.7 79@238.5 626@260.4 70@292.3 82@314.4 ltr=true |
| P3 guest ar 1024 change | PASS | change view: the phone reads left to right | button "+41 79 626 70 82" +41@208.7 79@238.5 626@260.4 70@292.3 82@314.4 ltr=true; scrollWidth 1024/1024 |
| P3 guest ar 768 lookup | PASS | lookup view: the phone reads left to right | button "+41 79 626 70 82" +41@530.7 79@560.6 626@582.4 70@614.3 82@636.4 ltr=true; scrollWidth 768/768 |
| P3 guest ar 768 booking | PASS | booking view: the phone reads left to right | button "+41 79 626 70 82" +41@530.7 79@560.6 626@582.4 70@614.3 82@636.4 ltr=true |
| P3 guest ar 768 change | PASS | change view: the phone reads left to right | button "+41 79 626 70 82" +41@530.7 79@560.6 626@582.4 70@614.3 82@636.4 ltr=true; scrollWidth 768/768 |
| P3 guest ar 390 lookup | PASS | lookup view: the phone reads left to right | button "+41 79 626 70 82" +41@171.1 79@201 626@222.8 70@254.7 82@276.8 ltr=true; scrollWidth 390/390 |
| P3 guest ar 390 booking | PASS | booking view: the phone reads left to right | button "+41 79 626 70 82" +41@171.1 79@201 626@222.8 70@254.7 82@276.8 ltr=true |
| P3 guest ar 390 change | PASS | change view: the phone reads left to right | button "+41 79 626 70 82" +41@171.1 79@201 626@222.8 70@254.7 82@276.8 ltr=true; scrollWidth 390/390 |
| P3 guest en 1440 lookup | PASS | lookup view: the phone reads left to right | button "+41 79 626 70 82" +41@871.4 79@901.3 626@923.1 70@955 82@977.1 ltr=true; scrollWidth 1440/1440 |
| P3 guest en 1440 booking | PASS | booking view: the phone reads left to right | button "+41 79 626 70 82" +41@919.8 79@949.6 626@971.5 70@1003.4 82@1025.5 ltr=true |
| P3 guest en 1440 change | PASS | change view: the phone reads left to right | button "+41 79 626 70 82" +41@919.8 79@949.6 626@971.5 70@1003.4 82@1025.5 ltr=true; scrollWidth 1440/1440 |
| P3 account ar 1440 lookup | PASS | lookup view: the phone reads left to right | button "+41 79 626 70 82" +41@444.7 79@474.5 626@496.4 70@528.3 82@550.4 ltr=true; scrollWidth 1440/1440 |
| P3 account ar 1440 booking | PASS | booking view: the phone reads left to right | button "+41 79 626 70 82" +41@396.3 79@426.2 626@448 70@479.9 82@502 ltr=true |
| P3 account ar 1440 change | PASS | change view: the phone reads left to right | button "+41 79 626 70 82" +41@396.3 79@426.2 626@448 70@479.9 82@502 ltr=true; scrollWidth 1440/1440 |
| P3 account ar 1024 lookup | PASS | lookup view: the phone reads left to right | button "+41 79 626 70 82" +41@248.3 79@278.1 626@300 70@331.8 82@354 ltr=true; scrollWidth 1024/1024 |
| P3 account ar 1024 booking | PASS | booking view: the phone reads left to right | button "+41 79 626 70 82" +41@208.7 79@238.5 626@260.4 70@292.3 82@314.4 ltr=true |
| P3 account ar 1024 change | PASS | change view: the phone reads left to right | button "+41 79 626 70 82" +41@208.7 79@238.5 626@260.4 70@292.3 82@314.4 ltr=true; scrollWidth 1024/1024 |
| P3 account ar 768 lookup | PASS | lookup view: the phone reads left to right | button "+41 79 626 70 82" +41@530.7 79@560.6 626@582.4 70@614.3 82@636.4 ltr=true; scrollWidth 768/768 |
| P3 account ar 768 booking | PASS | booking view: the phone reads left to right | button "+41 79 626 70 82" +41@530.7 79@560.6 626@582.4 70@614.3 82@636.4 ltr=true |
| P3 account ar 768 change | PASS | change view: the phone reads left to right | button "+41 79 626 70 82" +41@530.7 79@560.6 626@582.4 70@614.3 82@636.4 ltr=true; scrollWidth 768/768 |
| P3 account ar 390 lookup | PASS | lookup view: the phone reads left to right | button "+41 79 626 70 82" +41@171.1 79@201 626@222.8 70@254.7 82@276.8 ltr=true; scrollWidth 390/390 |
| P3 account ar 390 booking | PASS | booking view: the phone reads left to right | button "+41 79 626 70 82" +41@171.1 79@201 626@222.8 70@254.7 82@276.8 ltr=true |
| P3 account ar 390 change | PASS | change view: the phone reads left to right | button "+41 79 626 70 82" +41@171.1 79@201 626@222.8 70@254.7 82@276.8 ltr=true; scrollWidth 390/390 |
| P3 account en 1440 lookup | PASS | lookup view: the phone reads left to right | button "+41 79 626 70 82" +41@871.4 79@901.3 626@923.1 70@955 82@977.1 ltr=true; scrollWidth 1440/1440 |
| P3 account en 1440 booking | PASS | booking view: the phone reads left to right | button "+41 79 626 70 82" +41@919.8 79@949.6 626@971.5 70@1003.4 82@1025.5 ltr=true |
| P3 account en 1440 change | PASS | change view: the phone reads left to right | button "+41 79 626 70 82" +41@919.8 79@949.6 626@971.5 70@1003.4 82@1025.5 ltr=true; scrollWidth 1440/1440 |
| P3 fork | N/A | the 'Call dispatch' fork card (third phone spot) | not reachable by a customer today (bookingTiming 'late' is never set), so it is not on a page a customer can open; its markup carries vt-dir-keep (read in the file) |
| P4 guest en 1440 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/manage/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 510..930 of 1440 (width 420, centre offset 0); scrollWidth 1440/1440 |
| P4 guest en 1024 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/manage/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 302..722 of 1024 (width 420, centre offset 0); scrollWidth 1024/1024 |
| P4 guest en 768 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/manage/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 174..594 of 768 (width 420, centre offset 0); scrollWidth 768/768 |
| P4 guest en 390 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/manage/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 16..374 of 390 (width 358, centre offset 0); scrollWidth 390/390 |
| P4 guest de 1440 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/manage/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 510..930 of 1440 (width 420, centre offset 0); scrollWidth 1440/1440 |
| P4 guest de 1024 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/manage/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 302..722 of 1024 (width 420, centre offset 0); scrollWidth 1024/1024 |
| P4 guest de 768 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/manage/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 174..594 of 768 (width 420, centre offset 0); scrollWidth 768/768 |
| P4 guest de 390 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/manage/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 16..374 of 390 (width 358, centre offset 0); scrollWidth 390/390 |
| P4 guest fr 1440 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/manage/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 510..930 of 1440 (width 420, centre offset 0); scrollWidth 1440/1440 |
| P4 guest fr 1024 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/manage/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 302..722 of 1024 (width 420, centre offset 0); scrollWidth 1024/1024 |
| P4 guest fr 768 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/manage/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 174..594 of 768 (width 420, centre offset 0); scrollWidth 768/768 |
| P4 guest fr 390 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/manage/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 16..374 of 390 (width 358, centre offset 0); scrollWidth 390/390 |
| P4 guest ar 1440 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/manage/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 510..930 of 1440 (width 420, centre offset 0); scrollWidth 1440/1440 |
| P4 guest ar 1024 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/manage/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 302..722 of 1024 (width 420, centre offset 0); scrollWidth 1024/1024 |
| P4 guest ar 768 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/manage/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 174..594 of 768 (width 420, centre offset 0); scrollWidth 768/768 |
| P4 guest ar 390 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/manage/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 16..374 of 390 (width 358, centre offset 0); scrollWidth 390/390 (ar 390) |
| P4 guest ar 390 close | PASS | the toast's own close button closes it | status 409; closed after click: true |
| P4 guest ar 390 timing | PASS | the toast is still there at 8 s and gone by 10 s | status 409; visible at 8 s: true; gone at 10 s: true |
| P4 guest en 1440 close | PASS | the toast's own close button closes it | status 409; closed after click: true |
| P4 guest en 1440 timing | PASS | the toast is still there at 8 s and gone by 10 s | status 409; visible at 8 s: true; gone at 10 s: true |
| P4 account en 1440 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/account/bookings/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 510..930 of 1440 (width 420, centre offset 0); scrollWidth 1440/1440 |
| P4 account en 1024 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/account/bookings/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 302..722 of 1024 (width 420, centre offset 0); scrollWidth 1024/1024 |
| P4 account en 768 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/account/bookings/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 174..594 of 768 (width 420, centre offset 0); scrollWidth 768/768 |
| P4 account en 390 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/account/bookings/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 16..374 of 390 (width 358, centre offset 0); scrollWidth 390/390 |
| P4 account de 1440 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/account/bookings/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 510..930 of 1440 (width 420, centre offset 0); scrollWidth 1440/1440 |
| P4 account de 1024 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/account/bookings/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 302..722 of 1024 (width 420, centre offset 0); scrollWidth 1024/1024 |
| P4 account de 768 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/account/bookings/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 174..594 of 768 (width 420, centre offset 0); scrollWidth 768/768 |
| P4 account de 390 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/account/bookings/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 16..374 of 390 (width 358, centre offset 0); scrollWidth 390/390 |
| P4 account fr 1440 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/account/bookings/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 510..930 of 1440 (width 420, centre offset 0); scrollWidth 1440/1440 |
| P4 account fr 1024 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/account/bookings/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 302..722 of 1024 (width 420, centre offset 0); scrollWidth 1024/1024 |
| P4 account fr 768 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/account/bookings/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 174..594 of 768 (width 420, centre offset 0); scrollWidth 768/768 |
| P4 account fr 390 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/account/bookings/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 16..374 of 390 (width 358, centre offset 0); scrollWidth 390/390 |
| P4 account ar 1440 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/account/bookings/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 510..930 of 1440 (width 420, centre offset 0); scrollWidth 1440/1440 |
| P4 account ar 1024 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/account/bookings/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 302..722 of 1024 (width 420, centre offset 0); scrollWidth 1024/1024 |
| P4 account ar 768 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/account/bookings/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 174..594 of 768 (width 420, centre offset 0); scrollWidth 768/768 |
| P4 account ar 390 | PASS | waiting staff change: 409 staff-change-waiting, the owner's sentence, toast on screen and… | /api/account/bookings/time-change 409 {"ok":false,"code":"staff-change-waiting"}; toast = the signed sentence; box 16..374 of 390 (width 358, centre offset 0); scrollWidth 390/390 (ar 390) |
| P4 account ar 390 close | PASS | the toast's own close button closes it | status 409; closed after click: true |
| P4 account ar 390 timing | PASS | the toast is still there at 8 s and gone by 10 s | status 409; visible at 8 s: true; gone at 10 s: true |
| P4 account en 1440 close | PASS | the toast's own close button closes it | status 409; closed after click: true |
| P4 account en 1440 timing | PASS | the toast is still there at 8 s and gone by 10 s | status 409; visible at 8 s: true; gone at 10 s: true |
| P4 db | PASS | after every refused request: the staff change still waits, no customer row was written | staff request before requested/true, after requested/true; customer rows 0 |
| P4 plain guest en 1440 | PASS | no waiting change: the time request is accepted (200) | /api/manage/time-change 200 {"ok":true,"requestId":"30fa67bd-4cb0-4bf2-af8f-94f8b1876761","bookingId":"429f8063-035c-48fa-b0ee-9086302cbbee","status":"requested"}; toast "Time-change requested. Pickup stays Fri 9 Oct · 14:20 unti… |
| P4 plain guest en 390 | PASS | no waiting change: the time request is accepted (200) | /api/manage/time-change 200 {"ok":true,"requestId":"f46dbf09-67f5-435a-b031-2a27d2e7ede3","bookingId":"429f8063-035c-48fa-b0ee-9086302cbbee","status":"requested"}; toast "Time-change requested. Pickup stays Fri 9 Oct · 14:20 unti… |
| P4 plain guest de 1440 | PASS | no waiting change: the time request is accepted (200) | /api/manage/time-change 200 {"ok":true,"requestId":"a04b1ee6-1ae2-47c2-86ff-106bdec6d41a","bookingId":"429f8063-035c-48fa-b0ee-9086302cbbee","status":"requested"}; toast "Zeitänderung angefragt. Abholung bleibt Fri 9 Oct · 14:20,… |
| P4 plain guest de 390 | PASS | no waiting change: the time request is accepted (200) | /api/manage/time-change 200 {"ok":true,"requestId":"9e4800bf-0322-4b54-b6de-39cba62e60b1","bookingId":"429f8063-035c-48fa-b0ee-9086302cbbee","status":"requested"}; toast "Zeitänderung angefragt. Abholung bleibt Fri 9 Oct · 14:20,… |
| P4 plain guest fr 1440 | PASS | no waiting change: the time request is accepted (200) | /api/manage/time-change 200 {"ok":true,"requestId":"21a47f37-0424-44ae-acd0-8299e8d9296f","bookingId":"429f8063-035c-48fa-b0ee-9086302cbbee","status":"requested"}; toast "Changement d’heure demandé. La prise en charge reste Fri 9… |
| P4 plain guest fr 390 | PASS | no waiting change: the time request is accepted (200) | /api/manage/time-change 200 {"ok":true,"requestId":"58be569e-22da-44db-834a-0eacaadc65d9","bookingId":"429f8063-035c-48fa-b0ee-9086302cbbee","status":"requested"}; toast "Changement d’heure demandé. La prise en charge reste Fri 9… |
| P4 plain guest ar 1440 | PASS | no waiting change: the time request is accepted (200) | /api/manage/time-change 200 {"ok":true,"requestId":"f5be388f-7e88-4e2f-a768-bb332a2e5206","bookingId":"429f8063-035c-48fa-b0ee-9086302cbbee","status":"requested"}; toast "طُلب تغيير الوقت. تبقى الانطلاقة Fri 9 Oct · 14:20 حتى نؤك… |
| P4 plain guest ar 390 | PASS | no waiting change: the time request is accepted (200) | /api/manage/time-change 200 {"ok":true,"requestId":"9b516ffc-fd75-45c0-89b7-6f5958ea196d","bookingId":"429f8063-035c-48fa-b0ee-9086302cbbee","status":"requested"}; toast "طُلب تغيير الوقت. تبقى الانطلاقة Fri 9 Oct · 14:20 حتى نؤك… |
| P4 plain account en 1440 | PASS | no waiting change: the time request is accepted (200) | /api/account/bookings/time-change 200 {"ok":true,"requestId":"7b67ded2-757c-48b8-9248-7ebb92d3ec90","bookingId":"429f8063-035c-48fa-b0ee-9086302cbbee","status":"requested"}; toast "Time-change requested. Pickup stays Fri 9 Oct · … |
| P4 plain account en 390 | PASS | no waiting change: the time request is accepted (200) | /api/account/bookings/time-change 200 {"ok":true,"requestId":"bca2fdf1-a10c-40ec-baa6-41a79af64221","bookingId":"429f8063-035c-48fa-b0ee-9086302cbbee","status":"requested"}; toast "Time-change requested. Pickup stays Fri 9 Oct · … |
| P4 plain account de 1440 | PASS | no waiting change: the time request is accepted (200) | /api/account/bookings/time-change 200 {"ok":true,"requestId":"4dec25bd-0f6a-44a1-b5a2-4a3b498cdd31","bookingId":"429f8063-035c-48fa-b0ee-9086302cbbee","status":"requested"}; toast "Zeitänderung angefragt. Abholung bleibt Fri 9 Oc… |
| P4 plain account de 390 | PASS | no waiting change: the time request is accepted (200) | /api/account/bookings/time-change 200 {"ok":true,"requestId":"6d1310ca-1ecc-4e87-8276-dc13dfdf6c2f","bookingId":"429f8063-035c-48fa-b0ee-9086302cbbee","status":"requested"}; toast "Zeitänderung angefragt. Abholung bleibt Fri 9 Oc… |
| P4 plain account fr 1440 | PASS | no waiting change: the time request is accepted (200) | /api/account/bookings/time-change 200 {"ok":true,"requestId":"b196f3f9-7728-4b71-8141-2fd123412a1b","bookingId":"429f8063-035c-48fa-b0ee-9086302cbbee","status":"requested"}; toast "Changement d’heure demandé. La prise en charge r… |
| P4 plain account fr 390 | PASS | no waiting change: the time request is accepted (200) | /api/account/bookings/time-change 200 {"ok":true,"requestId":"b620df69-0419-47f5-8ba5-82e51d42c86f","bookingId":"429f8063-035c-48fa-b0ee-9086302cbbee","status":"requested"}; toast "Changement d’heure demandé. La prise en charge r… |
| P4 plain account ar 1440 | PASS | no waiting change: the time request is accepted (200) | /api/account/bookings/time-change 200 {"ok":true,"requestId":"512e075f-09c8-4d91-861e-d7a23409fa63","bookingId":"429f8063-035c-48fa-b0ee-9086302cbbee","status":"requested"}; toast "طُلب تغيير الوقت. تبقى الانطلاقة Fri 9 Oct · 14:… |
| P4 plain account ar 390 | PASS | no waiting change: the time request is accepted (200) | /api/account/bookings/time-change 200 {"ok":true,"requestId":"aa0ac1a8-7247-495e-9011-de247942f67d","bookingId":"429f8063-035c-48fa-b0ee-9086302cbbee","status":"requested"}; toast "طُلب تغيير الوقت. تبقى الانطلاقة Fri 9 Oct · 14:… |
| COV guest de lookup | PASS | VamosLocale.coverage(main): no page copy without a translation | count 0; page copy 0; data/built-in-code (not copy) 0 |
| COV guest de booking | PASS | VamosLocale.coverage(main): no page copy without a translation | count 5; page copy 0; data/built-in-code (not copy) 5: "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct", "Mehrwertsteuer 8.1 %" |
| COV guest de change | PASS | VamosLocale.coverage(main): no page copy without a translation | count 5; page copy 0; data/built-in-code (not copy) 5: "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct", "Mehrwertsteuer 8.1 %" |
| COV guest de cancel | PASS | VamosLocale.coverage(main): no page copy without a translation | count 6; page copy 0; data/built-in-code (not copy) 6: "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct", "Zurich Oerlikon → Zurich Airport", "Mehrwertsteuer 8.1 %" |
| COV account de lookup | PASS | VamosLocale.coverage(main): no page copy without a translation | count 0; page copy 0; data/built-in-code (not copy) 0 |
| COV account de booking | PASS | VamosLocale.coverage(main): no page copy without a translation | count 4; page copy 0; data/built-in-code (not copy) 4: "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct" |
| COV account de change | PASS | VamosLocale.coverage(main): no page copy without a translation | count 4; page copy 0; data/built-in-code (not copy) 4: "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct" |
| COV guest fr lookup | PASS | VamosLocale.coverage(main): no page copy without a translation | count 0; page copy 0; data/built-in-code (not copy) 0 |
| COV guest fr booking | PASS | VamosLocale.coverage(main): no page copy without a translation | count 5; page copy 0; data/built-in-code (not copy) 5: "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct", "TVA 8.1 %" |
| COV guest fr change | PASS | VamosLocale.coverage(main): no page copy without a translation | count 5; page copy 0; data/built-in-code (not copy) 5: "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct", "TVA 8.1 %" |
| COV guest fr cancel | PASS | VamosLocale.coverage(main): no page copy without a translation | count 6; page copy 0; data/built-in-code (not copy) 6: "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct", "Zurich Oerlikon → Zurich Airport", "TVA 8.1 %" |
| COV account fr lookup | PASS | VamosLocale.coverage(main): no page copy without a translation | count 0; page copy 0; data/built-in-code (not copy) 0 |
| COV account fr booking | PASS | VamosLocale.coverage(main): no page copy without a translation | count 4; page copy 0; data/built-in-code (not copy) 4: "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct" |
| COV account fr change | PASS | VamosLocale.coverage(main): no page copy without a translation | count 4; page copy 0; data/built-in-code (not copy) 4: "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct" |
| COV guest ar lookup | PASS | VamosLocale.coverage(main): no page copy without a translation | count 0; page copy 0; data/built-in-code (not copy) 0 |
| COV guest ar booking | PASS | VamosLocale.coverage(main): no page copy without a translation | count 5; page copy 0; data/built-in-code (not copy) 5: "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct", "ضريبة القيمة المضافة 8.1 %" |
| COV guest ar change | PASS | VamosLocale.coverage(main): no page copy without a translation | count 5; page copy 0; data/built-in-code (not copy) 5: "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct", "ضريبة القيمة المضافة 8.1 %" |
| COV guest ar cancel | PASS | VamosLocale.coverage(main): no page copy without a translation | count 6; page copy 0; data/built-in-code (not copy) 6: "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct", "Zurich Oerlikon → Zurich Airport", "ضريبة القيمة المضافة 8.1 %" |
| COV account ar lookup | PASS | VamosLocale.coverage(main): no page copy without a translation | count 0; page copy 0; data/built-in-code (not copy) 0 |
| COV account ar booking | PASS | VamosLocale.coverage(main): no page copy without a translation | count 4; page copy 0; data/built-in-code (not copy) 4: "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct" |
| COV account ar change | PASS | VamosLocale.coverage(main): no page copy without a translation | count 4; page copy 0; data/built-in-code (not copy) 4: "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct" |
| ERR | PASS | no uncaught page errors in any context | none |
| BAN | PASS | the cookie banner stayed down on its own (the 'necessary only' state was reused) | never visible |

### Translation coverage (`VamosLocale.coverage(main)`)

Raw count and the entries that are page copy without a de/fr/ar line. Entries that are the booking's own data (date label, place names, as the server sends them) or the VAT line (built in the active language in code) are listed apart: they are not page copy.

| page | lang | view | raw count | page copy without translation | data / built in code |
|---|---|---|---|---|---|
| manage-booking | de | booking | 5 | none | "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct", "Mehrwertsteuer 8.1 %" |
| manage-booking | de | change | 5 | none | "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct", "Mehrwertsteuer 8.1 %" |
| manage-booking | de | cancel | 6 | none | "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct", "Zurich Oerlikon → Zurich Airport", "Mehrwertsteuer 8.1 %" |
| manage-booking | fr | booking | 5 | none | "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct", "TVA 8.1 %" |
| manage-booking | fr | change | 5 | none | "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct", "TVA 8.1 %" |
| manage-booking | fr | cancel | 6 | none | "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct", "Zurich Oerlikon → Zurich Airport", "TVA 8.1 %" |
| manage-booking | ar | booking | 5 | none | "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct", "ضريبة القيمة المضافة 8.1 %" |
| manage-booking | ar | change | 5 | none | "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct", "ضريبة القيمة المضافة 8.1 %" |
| manage-booking | ar | cancel | 6 | none | "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct", "Zurich Oerlikon → Zurich Airport", "ضريبة القيمة المضافة 8.1 %" |
| booking-detail | de | booking | 4 | none | "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct" |
| booking-detail | de | change | 4 | none | "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct" |
| booking-detail | fr | booking | 4 | none | "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct" |
| booking-detail | fr | change | 4 | none | "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct" |
| booking-detail | ar | booking | 4 | none | "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct" |
| booking-detail | ar | change | 4 | none | "Wed 7 Oct · 14:20", "Zurich Oerlikon", "Zurich Airport", "Wed 7 Oct" |
| manage-booking | ar | lookup | 0 | none | none |
| booking-detail | ar | lookup | 0 | none | none |
| manage-booking | de | lookup | 0 | none | none |
| manage-booking | fr | lookup | 0 | none | none |
| booking-detail | de | lookup | 0 | none | none |
| booking-detail | fr | lookup | 0 | none | none |

### Notes from the run

- COV account de: no cancel fork on the booking view (button[data-fork] x1), the cancel view cannot be opened
- COV account fr: no cancel fork on the booking view (button[data-fork] x1), the cancel view cannot be opened
- COV account ar: no cancel fork on the booking view (button[data-fork] x1), the cancel view cannot be opened

### Screenshots (76), `.planning/quick/261002-p6-followups/`

- p1-guest (8): `screens/proof/p1-guest-en-1440.png` ... `screens/proof/p1-guest-ar-390.png`
- p1-account (8): `screens/proof/p1-account-en-1440.png` ... `screens/proof/p1-account-ar-390.png`
- p3-guest (6): `screens/proof/p3-guest-ar-1440-lookup.png` ... `screens/proof/p3-guest-ar-390-change.png`
- p3-account (6): `screens/proof/p3-account-ar-1440-lookup.png` ... `screens/proof/p3-account-ar-390-change.png`
- p4-guest (24): `screens/proof/p4-guest-en-1440-refused.png` ... `screens/proof/p4-guest-ar-390-accepted.png`
- p4-account (24): `screens/proof/p4-account-en-1440-refused.png` ... `screens/proof/p4-account-ar-390-accepted.png`

## Mirror check on the Worker (`tools/mirror-check.mjs`, `tools/proof-mirror.mjs`)

| spot | lang | width | icons | result | mirror product (ar must be -1, en +1) |
|---|---|---|---|---|---|
| home | ar | 1440 | 3 | PASS | arrow-right -1 |
| home | ar | 390 | 3 | PASS | chevron-right -1, arrow-right -1 |
| home | en | 1440 | 3 | PASS | arrow-right +1 |
| home | en | 390 | 3 | PASS | chevron-right +1, arrow-right +1 |
| home-sheet | ar | 390 | 4 | PASS | chevron-right -1, arrow-right -1 |
| home-sheet | en | 390 | 4 | PASS | chevron-right +1, arrow-right +1 |
| home-bar-trip | ar | 390 | 3 | PASS | arrow-right -1 |
| home-bar-trip | en | 390 | 3 | PASS | arrow-right +1 |
| home-picker | ar | 1440 | 5 | PASS | chevron-left -1, chevron-right -1, arrow-right -1 |
| home-picker | ar | 390 | 6 | PASS | arrow-right -1, chevron-left -1, chevron-right -1 |
| home-picker | en | 1440 | 5 | PASS | chevron-left +1, chevron-right +1, arrow-right +1 |
| home-picker | en | 390 | 6 | PASS | arrow-right +1, chevron-left +1, chevron-right +1 |
| account | ar | 1440 | 10 | PASS | arrow-right -1, log-out -1, chevron-right -1 |
| account | ar | 390 | 8 | PASS | arrow-right -1, chevron-right -1, log-out -1 |
| account | en | 1440 | 10 | PASS | arrow-right +1, log-out +1, chevron-right +1 |
| account | en | 390 | 8 | PASS | arrow-right +1, chevron-right +1, log-out +1 |
| bookings | ar | 1440 | 5 | PASS | arrow-right -1, chevron-right -1 |
| bookings | ar | 390 | 4 | PASS | chevron-right -1, arrow-right -1 |
| bookings | en | 1440 | 5 | PASS | arrow-right +1, chevron-right +1 |
| bookings | en | 390 | 4 | PASS | chevron-right +1, arrow-right +1 |
| manage-picker | ar | 1440 | 7 | PASS | arrow-right -1, chevron-left -1, chevron-right -1 |
| manage-picker | ar | 390 | 6 | PASS | chevron-left -1, arrow-right -1, chevron-right -1 |
| manage-picker | en | 1440 | 7 | PASS | arrow-right +1, chevron-left +1, chevron-right +1 |
| manage-picker | en | 390 | 6 | PASS | chevron-left +1, arrow-right +1, chevron-right +1 |
| ops-calendar | ar | 1440 | 3 | PASS | chevron-left -1, chevron-right -1 |
| ops-calendar | ar | 390 | 2 | PASS | chevron-left -1, chevron-right -1 |
| ops-calendar | en | 1440 | 3 | PASS | chevron-left +1, chevron-right +1 |
| ops-calendar | en | 390 | 2 | PASS | chevron-left +1, chevron-right +1 |
| ops-bookings | ar | 1440 | 3 | PASS | chevron-left -1, chevron-right -1 |
| ops-bookings | ar | 390 | 2 | PASS | chevron-left -1, chevron-right -1 |
| ops-bookings | en | 1440 | 3 | PASS | chevron-left +1, chevron-right +1 |
| ops-bookings | en | 390 | 2 | PASS | chevron-left +1, chevron-right +1 |
| checkout-strip | ar | 1440 | 3 | PASS | chevron-left -1, arrow-right -1, log-in -1 |
| checkout-strip | ar | 390 | 3 | PASS | chevron-left -1, arrow-right -1, log-in -1 |
| checkout-strip | en | 1440 | 3 | PASS | chevron-left +1, arrow-right +1, log-in +1 |
| checkout-strip | en | 390 | 3 | PASS | chevron-left +1, arrow-right +1, log-in +1 |
| booking-detail-picker | ar | 1440 | 7 | PASS | arrow-right -1, chevron-left -1, chevron-right -1 |
| booking-detail-picker | ar | 390 | 6 | PASS | chevron-left -1, arrow-right -1, chevron-right -1 |
| booking-detail-picker | en | 1440 | 7 | PASS | arrow-right +1, chevron-left +1, chevron-right +1 |
| booking-detail-picker | en | 390 | 6 | PASS | chevron-left +1, arrow-right +1, chevron-right +1 |
| ops-change-arrow | ar | 1440 | 3 | PASS | chevron-left -1, arrow-right -1 |
| ops-change-arrow | ar | 390 | 2 | PASS | chevron-left -1, arrow-right -1 |
| ops-change-arrow | en | 1440 | 3 | PASS | chevron-left +1, arrow-right +1 |
| ops-change-arrow | en | 390 | 2 | PASS | chevron-left +1, arrow-right +1 |

196 icon(s) in 12 spot(s); 0 icon(s) outside the rule; 0 spot run(s) that did not run.

Dashboard change row (`[data-ops-chg-arrow]`, the old to new arrow of the Edit preview): ar 1440px product -1 (aside[data-lenis-prevent] > button[data-rail-toggle] > span); ar 1440px product -1 (div[data-ops-bar-nav] > button.vt-btn > span); ar 1440px product -1 (span[data-ops-chg-v] > span[data-ops-chg-arrow] > span); ar 390px product -1 (div[data-ops-bar-nav] > button.vt-btn > span); ar 390px product -1 (span[data-ops-chg-v] > span[data-ops-chg-arrow] > span); en 1440px product +1 (aside[data-lenis-prevent] > button[data-rail-toggle] > span); en 1440px product +1 (div[data-ops-bar-nav] > button.vt-btn > span); en 1440px product +1 (span[data-ops-chg-v] > span[data-ops-chg-arrow] > span); en 390px product +1 (div[data-ops-bar-nav] > button.vt-btn > span); en 390px product +1 (span[data-ops-chg-v] > span[data-ops-chg-arrow] > span).

Raw lines (`evidence/mirror-worker.txt`):

```
admin API: customer 200, admin 200
signed in customer: 3 cookie(s), landed /account/transfers
signed in dashboard admin: 3 cookie(s), landed /dashboard
ok       ar 1440  home  /  div[data-bx] > button.vt-btn > span  arrow-right  -1  flip:self
ok       ar 1440  home  /  span[data-svc-cta-btn] > span[data-svc-cta-arrow] > span  arrow-right  -1  flip:self
ok       ar 1440  home  /  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  -1  flip:self
ok       ar  390  home  /  button[data-bb] > span[data-bb-icon] > span  chevron-right  -1  flip:self
ok       ar  390  home  /  span[data-svc-cta-btn] > span[data-svc-cta-arrow] > span  arrow-right  -1  flip:self
ok       ar  390  home  /  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  -1  flip:self
ok       en 1440  home  /  div[data-bx] > button.vt-btn > span  arrow-right  +1
ok       en 1440  home  /  span[data-svc-cta-btn] > span[data-svc-cta-arrow] > span  arrow-right  +1
ok       en 1440  home  /  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  +1
ok       en  390  home  /  button[data-bb] > span[data-bb-icon] > span  chevron-right  +1
ok       en  390  home  /  span[data-svc-cta-btn] > span[data-svc-cta-arrow] > span  arrow-right  +1
ok       en  390  home  /  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  +1
ok       ar  390  home-sheet  /  button[data-bb] > span[data-bb-icon] > span  chevron-right  -1  flip:self
ok       ar  390  home-sheet  /  span[data-svc-cta-btn] > span[data-svc-cta-arrow] > span  arrow-right  -1  flip:self
ok       ar  390  home-sheet  /  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  -1  flip:self
ok       ar  390  home-sheet  /  div[data-bs-next] > button.vt-btn > span  arrow-right  -1  flip:self
ok       en  390  home-sheet  /  button[data-bb] > span[data-bb-icon] > span  chevron-right  +1
ok       en  390  home-sheet  /  span[data-svc-cta-btn] > span[data-svc-cta-arrow] > span  arrow-right  +1
ok       en  390  home-sheet  /  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  +1
ok       en  390  home-sheet  /  div[data-bs-next] > button.vt-btn > span  arrow-right  +1
ok       ar  390  home-bar-trip  /  span#vtbb1-1 > span[data-bb-icon] > span  arrow-right  -1  flip:self
ok       ar  390  home-bar-trip  /  span[data-svc-cta-btn] > span[data-svc-cta-arrow] > span  arrow-right  -1  flip:self
ok       ar  390  home-bar-trip  /  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  -1  flip:self
ok       en  390  home-bar-trip  /  span#vtbb1-1 > span[data-bb-icon] > span  arrow-right  +1
ok       en  390  home-bar-trip  /  span[data-svc-cta-btn] > span[data-svc-cta-arrow] > span  arrow-right  +1
ok       en  390  home-bar-trip  /  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  +1
ok       ar 1440  home-picker  /  div[data-wp-row] > div[data-wp-cal] > span  chevron-left  -1  flip:self
ok       ar 1440  home-picker  /  div[data-wp-row] > div[data-wp-cal] > span  chevron-right  -1  flip:self
ok       ar 1440  home-picker  /  div[data-bx] > button.vt-btn > span  arrow-right  -1  flip:self
ok       ar 1440  home-picker  /  span[data-svc-cta-btn] > span[data-svc-cta-arrow] > span  arrow-right  -1  flip:self
ok       ar 1440  home-picker  /  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  -1  flip:self
ok       ar  390  home-picker  /  span#vtbb1-1 > span[data-bb-icon] > span  arrow-right  -1  flip:self
ok       ar  390  home-picker  /  span[data-svc-cta-btn] > span[data-svc-cta-arrow] > span  arrow-right  -1  flip:self
ok       ar  390  home-picker  /  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  -1  flip:self
ok       ar  390  home-picker  /  div[data-wp-row] > div[data-wp-cal] > span  chevron-left  -1  flip:self
ok       ar  390  home-picker  /  div[data-wp-row] > div[data-wp-cal] > span  chevron-right  -1  flip:self
ok       ar  390  home-picker  /  div[data-bs-next] > button.vt-btn > span  arrow-right  -1  flip:self
ok       en 1440  home-picker  /  div[data-wp-row] > div[data-wp-cal] > span  chevron-left  +1
ok       en 1440  home-picker  /  div[data-wp-row] > div[data-wp-cal] > span  chevron-right  +1
ok       en 1440  home-picker  /  div[data-bx] > button.vt-btn > span  arrow-right  +1
ok       en 1440  home-picker  /  span[data-svc-cta-btn] > span[data-svc-cta-arrow] > span  arrow-right  +1
ok       en 1440  home-picker  /  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  +1
ok       en  390  home-picker  /  span#vtbb1-1 > span[data-bb-icon] > span  arrow-right  +1
ok       en  390  home-picker  /  span[data-svc-cta-btn] > span[data-svc-cta-arrow] > span  arrow-right  +1
ok       en  390  home-picker  /  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  +1
ok       en  390  home-picker  /  div[data-wp-row] > div[data-wp-cal] > span  chevron-left  +1
ok       en  390  home-picker  /  div[data-wp-row] > div[data-wp-cal] > span  chevron-right  +1
ok       en  390  home-picker  /  div[data-bs-next] > button.vt-btn > span  arrow-right  +1
ok       ar 1440  account  /account  div[data-hd-row] > div[data-hd-wide] > span  arrow-right  -1  flip:self
ok       ar 1440  account  /account  a.vt-btn > span  arrow-right  -1  flip:self
ok       ar 1440  account  /account  nav[data-ac-nav] > button[data-ac-signout] > span  log-out  -1  flip:self
ok       ar 1440  account  /account  div.vt-card > a.vt-btn > span  arrow-right  -1  flip:self
ok       ar 1440  account  /account  span[data-bk-actions] > span[data-bk-go] > span  chevron-right  -1  flip:self x3
ok       ar 1440  account  /account  a[data-ac-more] > span[data-ac-more-go] > span  arrow-right  -1  flip:self
ok       ar 1440  account  /account  span[data-ac-act] > button.vt-btn > span  log-out  -1  flip:self
ok       ar 1440  account  /account  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  -1  flip:self
ok       ar  390  account  /account  a.vt-btn > span  arrow-right  -1  flip:self
ok       ar  390  account  /account  div.vt-card > a.vt-btn > span  arrow-right  -1  flip:self
ok       ar  390  account  /account  span[data-bk-actions] > span[data-bk-go] > span  chevron-right  -1  flip:self x3
ok       ar  390  account  /account  a[data-ac-more] > span[data-ac-more-go] > span  arrow-right  -1  flip:self
ok       ar  390  account  /account  span[data-ac-act] > button.vt-btn > span  log-out  -1  flip:self
ok       ar  390  account  /account  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  -1  flip:self
ok       en 1440  account  /account  div[data-hd-row] > div[data-hd-wide] > span  arrow-right  +1
ok       en 1440  account  /account  a.vt-btn > span  arrow-right  +1
ok       en 1440  account  /account  nav[data-ac-nav] > button[data-ac-signout] > span  log-out  +1
ok       en 1440  account  /account  div.vt-card > a.vt-btn > span  arrow-right  +1
ok       en 1440  account  /account  span[data-bk-actions] > span[data-bk-go] > span  chevron-right  +1  x3
ok       en 1440  account  /account  a[data-ac-more] > span[data-ac-more-go] > span  arrow-right  +1
ok       en 1440  account  /account  span[data-ac-act] > button.vt-btn > span  log-out  +1
ok       en 1440  account  /account  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  +1
ok       en  390  account  /account  a.vt-btn > span  arrow-right  +1
ok       en  390  account  /account  div.vt-card > a.vt-btn > span  arrow-right  +1
ok       en  390  account  /account  span[data-bk-actions] > span[data-bk-go] > span  chevron-right  +1  x3
ok       en  390  account  /account  a[data-ac-more] > span[data-ac-more-go] > span  arrow-right  +1
ok       en  390  account  /account  span[data-ac-act] > button.vt-btn > span  log-out  +1
ok       en  390  account  /account  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  +1
ok       ar 1440  bookings  /bookings  div[data-hd-row] > div[data-hd-wide] > span  arrow-right  -1  flip:self
ok       ar 1440  bookings  /bookings  span[data-bk-actions] > span[data-bk-go] > span  chevron-right  -1  flip:self x3
ok       ar 1440  bookings  /bookings  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  -1  flip:self
ok       ar  390  bookings  /bookings  span[data-bk-actions] > span[data-bk-go] > span  chevron-right  -1  flip:self x3
ok       ar  390  bookings  /bookings  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  -1  flip:self
ok       en 1440  bookings  /bookings  div[data-hd-row] > div[data-hd-wide] > span  arrow-right  +1
ok       en 1440  bookings  /bookings  span[data-bk-actions] > span[data-bk-go] > span  chevron-right  +1  x3
ok       en 1440  bookings  /bookings  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  +1
ok       en  390  bookings  /bookings  span[data-bk-actions] > span[data-bk-go] > span  chevron-right  +1  x3
ok       en  390  bookings  /bookings  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  +1
ok       ar 1440  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-hd-row] > div[data-hd-wide] > span  arrow-right  -1  flip:self
ok       ar 1440  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-noprint] > button[data-back] > span  chevron-left  -1  flip:self
ok       ar 1440  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-mb-grid] > div[data-noprint] > span  arrow-right  -1  flip:self
ok       ar 1440  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-wp-row] > div[data-wp-cal] > span  chevron-left  -1  flip:self
ok       ar 1440  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-wp-row] > div[data-wp-cal] > span  chevron-right  -1  flip:self
ok       ar 1440  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-mb-acts] > button.vt-btn > span  arrow-right  -1  flip:self
ok       ar 1440  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  -1  flip:self
ok       ar  390  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-noprint] > button[data-back] > span  chevron-left  -1  flip:self
ok       ar  390  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-mb-grid] > div[data-noprint] > span  arrow-right  -1  flip:self
ok       ar  390  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-wp-row] > div[data-wp-cal] > span  chevron-left  -1  flip:self
ok       ar  390  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-wp-row] > div[data-wp-cal] > span  chevron-right  -1  flip:self
ok       ar  390  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-mb-acts] > button.vt-btn > span  arrow-right  -1  flip:self
ok       ar  390  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  -1  flip:self
ok       en 1440  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-hd-row] > div[data-hd-wide] > span  arrow-right  +1
ok       en 1440  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-noprint] > button[data-back] > span  chevron-left  +1
ok       en 1440  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-mb-grid] > div[data-noprint] > span  arrow-right  +1
ok       en 1440  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-wp-row] > div[data-wp-cal] > span  chevron-left  +1
ok       en 1440  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-wp-row] > div[data-wp-cal] > span  chevron-right  +1
ok       en 1440  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-mb-acts] > button.vt-btn > span  arrow-right  +1
ok       en 1440  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  +1
ok       en  390  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-noprint] > button[data-back] > span  chevron-left  +1
ok       en  390  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-mb-grid] > div[data-noprint] > span  arrow-right  +1
ok       en  390  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-wp-row] > div[data-wp-cal] > span  chevron-left  +1
ok       en  390  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-wp-row] > div[data-wp-cal] > span  chevron-right  +1
ok       en  390  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-mb-acts] > button.vt-btn > span  arrow-right  +1
ok       en  390  manage-picker  /manage-booking?token=SjKdipokIyLqnp-SnZRwjTq9E2vEZyYwrWCMVPxHRz0  div[data-ft-band-actions] > a.vt-btn > span  arrow-right  +1
ok       ar 1440  ops-calendar  /calendar  aside[data-lenis-prevent] > button[data-rail-toggle] > span  chevron-left  -1  flip:self
ok       ar 1440  ops-calendar  /calendar  main[data-vt-cal] > button.vt-iconbtn > span  chevron-left  -1  flip:self
ok       ar 1440  ops-calendar  /calendar  main[data-vt-cal] > button.vt-iconbtn > span  chevron-right  -1  flip:self
ok       ar  390  ops-calendar  /calendar  main[data-vt-cal] > button.vt-iconbtn > span  chevron-left  -1  flip:self
ok       ar  390  ops-calendar  /calendar  main[data-vt-cal] > button.vt-iconbtn > span  chevron-right  -1  flip:self
ok       en 1440  ops-calendar  /calendar  aside[data-lenis-prevent] > button[data-rail-toggle] > span  chevron-left  +1
ok       en 1440  ops-calendar  /calendar  main[data-vt-cal] > button.vt-iconbtn > span  chevron-left  +1
ok       en 1440  ops-calendar  /calendar  main[data-vt-cal] > button.vt-iconbtn > span  chevron-right  +1
ok       en  390  ops-calendar  /calendar  main[data-vt-cal] > button.vt-iconbtn > span  chevron-left  +1
ok       en  390  ops-calendar  /calendar  main[data-vt-cal] > button.vt-iconbtn > span  chevron-right  +1
ok       ar 1440  ops-bookings  /bookings  aside[data-lenis-prevent] > button[data-rail-toggle] > span  chevron-left  -1  flip:self
ok       ar 1440  ops-bookings  /bookings  div.vt-card > button.vt-btn > span  chevron-left  -1  flip:self
ok       ar 1440  ops-bookings  /bookings  div.vt-card > button.vt-btn > span  chevron-right  -1  flip:self
ok       ar  390  ops-bookings  /bookings  div.vt-card > button.vt-btn > span  chevron-left  -1  flip:self
ok       ar  390  ops-bookings  /bookings  div.vt-card > button.vt-btn > span  chevron-right  -1  flip:self
ok       en 1440  ops-bookings  /bookings  aside[data-lenis-prevent] > button[data-rail-toggle] > span  chevron-left  +1
ok       en 1440  ops-bookings  /bookings  div.vt-card > button.vt-btn > span  chevron-left  +1
ok       en 1440  ops-bookings  /bookings  div.vt-card > button.vt-btn > span  chevron-right  +1
ok       en  390  ops-bookings  /bookings  div.vt-card > button.vt-btn > span  chevron-left  +1
ok       en  390  ops-bookings  /bookings  div.vt-card > button.vt-btn > span  chevron-right  +1
ok       ar 1440  checkout-strip  /checkout?from=Zurich%20Airport&to=Zermatt&when=2026-10-09T08:15&pax=2&bags=1  span.vt-co__strip-back > button[data-co-back] > span  chevron-left  -1  flip:self
ok       ar 1440  checkout-strip  /checkout?from=Zurich%20Airport&to=Zermatt&when=2026-10-09T08:15&pax=2&bags=1  div.vt-co__strip-copy > p[data-co-route] > span.vt-co__strip-arrow  arrow-right  -1  flip:self
ok       ar 1440  checkout-strip  /checkout?from=Zurich%20Airport&to=Zermatt&when=2026-10-09T08:15&pax=2&bags=1  span.vt-check__text > span[data-acct-title] > span  log-in  -1  flip:self
ok       ar  390  checkout-strip  /checkout?from=Zurich%20Airport&to=Zermatt&when=2026-10-09T08:15&pax=2&bags=1  span.vt-co__strip-back > button[data-co-back] > span  chevron-left  -1  flip:self
ok       ar  390  checkout-strip  /checkout?from=Zurich%20Airport&to=Zermatt&when=2026-10-09T08:15&pax=2&bags=1  div.vt-co__strip-copy > p[data-co-route] > span.vt-co__strip-arrow  arrow-right  -1  flip:self
```

## Notes

Read these with the tables above. They are what the lead needs beyond PASS and FAIL. Nothing here was fixed by the proof job (it changes no product code).

### Failed checks: none in the last run (145 pass, 0 fail, 1 n/a)

The run on build `0d588250` had 2 failures (P4 guest fr 390 and P4 account fr 390): in French at 390 the change view's primary button "Demander ces modifications" (nowrap, 350 px wide, ending at page x 393) pushed the page 3 px sideways. The string is old (`app/vamos-i18n-dict.js` line 1403, from the first import of the mocks), so it was not caused by this job. `e9d8ec9b` ("the change view's buttons may wrap, so French fits at 390") fixes it; the run on build `e9d8ec9b` passes both lines (scrollWidth 390/390). The only n/a is the "Call dispatch" fork card, which no customer can reach today.

### What the proof shows

- **P1 (item 1)**: a paid Van luxury booking of 10 travellers and 6 bags reads "10 passengers" (de "10 Passagiere", fr "10 passagers", ar "10 ركاب") on both pages, in 4 languages x 4 widths, guest link and signed in. No "8 passengers" line in any of them. No cap anywhere.
- **P3 (item 3)**: in Arabic the number is drawn `+41 79 626 70 82` left to right in the lookup view, the booking view and the change view of both pages, at 1440, 1024, 768 and 390 (x of the digit groups strictly increasing). A control shows the probe can tell: the same number put into an Arabic page with no isolation is drawn reversed (`82 70 626 79 41`). The third spot in the plan (the "Call dispatch" fork card) is not on any page a customer can open today.
- **P4 (item 4)**: with the owner's dearer change waiting for its difference, the customer's time request answers 409 `staff-change-waiting` on both doors (`/api/manage/time-change`, `/api/account/bookings/time-change`); the toast carries the owner's sentence word for word in en, de, fr and ar; the box lies inside the viewport with 16 px gutters and is centred (ar 390: 16..374 of 390); its close button closes it; it is still there at 8 s and gone at 10 s. Afterwards the database still holds the staff request as `requested` with its Stripe page id and no customer row. The same request on a booking with nothing waiting answers 200 and the page says "Time-change requested..." in each language.
- **COV**: no page copy without a translation in de, fr or ar on any view that can be opened. What `VamosLocale.coverage` still lists is the booking's own data (the date label "Wed 7 Oct" and the place names, as the server sends them) and the VAT line, which the page builds in the active language in code. The English date label inside the German, French and Arabic pages (and inside the success toast: "Pickup stays Fri 9 Oct · 14:20") comes from the API's `dateLabel`; it is not part of this job.
- **Mirror (item 5)**: 196 icons on the Worker (home bar, phone sheet, services, trust row, date pickers, /account, /bookings, the manage link and signed-in booking page with their date picker, the checkout trip strip, the dashboard calendar and bookings list): every one is mirrored exactly once in Arabic (-1) and not in English (+1). **The dashboard's old to new change-row arrow** (`[data-ops-chg-arrow]` in the Edit preview of a booking): `ar` -1, `en` +1, at 1440 and 390 (flipped by the icon only, no second flip).

### Found while making the proof (not ours, nothing changed)

- **Signed-in booking page shows a paid booking as "Awaiting payment".** `app/vamos-manage-ticket.js` `fromAccount` maps `unpaid`, `new` and `confirmed` but the account list API sends `booked` for a paid upcoming booking (`apps/web/lib/account/bookings.ts:139`), so the badge falls back to the awaiting-payment look while the same page says "Paid in full". The same function gives `canCancel: false`, so the signed-in page offers no Cancel (the manage link does). Same code on `main`.
- **`/account/bookings/<ref>` is not a route**: the signed-in booking page is `/booking-detail?ref=<ref>`, the list is `/bookings`. The proof uses those.
- **`/api/fx` can drop the local Worker runtime**: the Worker fetches the FX rate from the internet, and a slow answer ended `wrangler dev` twice during this proof (no crash report, `proof-supervisor.log`). The proof answers `/api/fx` in the browser (503 "unavailable", the pages fall back to CHF) and a small supervisor in `proof-run.sh up` restarts a Worker that stops answering.
- The seed's fare is rewritten to synthetic rappen (paid CHF 0.83) because the manage page prints "What you paid" whatever the `public_chf` flag says; the fixture's own fare (CHF 112.69) read like a real price.

### How to run it again

`.planning/quick/261002-p6-followups/tools/proof-run.sh` (mode `all`: sync, build, up + seed, browser proof, mirror check, report, down; `PROOF_SKIP_BUILD=1` reuses the build; `build`, `up`, `browser`, `mirror`, `report`, `down` run one step; `PROOF_ONLY=P4` limits the browser part and writes `proof-browser-partial.json`). It needs the own Supabase stack running (never started, stopped or reset by it) and free ports 4790, 4791, 4797, 9791, 9792 (override with `E2E_PORT`, `E2E_DASH_PORT`, `E2E_FAKE_PORT`, `E2E_INSPECT`, `E2E_DASH_INSPECT`). The two database login roles get their local password only while it runs and are made passwordless again at `down` (the pgTAP files expect that). Only the PIDs it recorded are stopped, never by port.

