# Hand-over — 261002 P6 follow-ups (2026-10-02 14:05 +04)

Job session in `.claude/worktrees/p6-followups`, branch **`fix/p6-followups`**, cut from `origin/main` 7ccdcdfe,
`origin/main` b159fb06 merged in at 43f6b5b8 (clean, main won nothing because nothing conflicted). Tip: the docs
commit that adds this file (see `git log -1 fix/p6-followups`). Folder clean after that commit.

Owner signatures (question form, 2026-10-02 03:58): F1 phones, F2 refusal text, F3 e-mail font, F4 plan —
`.planning/decisions/2026-10-02-p6-followups.md`. Plan: `PLAN.md`. Pictures signed: `screens/sheet-1..4`.

## What is in it (one commit per item; item 4 has its review rounds)

| Item | Commits | What a customer / the owner sees |
|---|---|---|
| 1 seat limits on the two booking pages | none needed | Already done by P6 (D9 removed the counters). Proven: a paid 10-traveller Van luxury booking reads 10 on manage-booking and the signed-in booking page, en/de/fr/ar, 1440/1024/768/390; no 8 anywhere (`evidence/PROOF.md` P1). |
| 2 dashboard seat check | none needed | Already done by P6: PATCH with pax answers `use-change` (`apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts:28`); a party larger than the class is `class-too-small` on the server (`20261007150000_trip_change_reprice.sql:782`) and in the price step (`apps/web/lib/ops/booking-trip-change.ts:133`), message in four languages (`app/ops/OpsDetail.dc.html` errClassSmall). Proven through the Worker client: PATCH pax 13 → use-change, 13 travellers on a 12-seat class → class-too-small (`customer-request-staff-waiting.local.test.ts`). |
| 3 Arabic phone left to right | `be777004` pages, `c8edfc91` e-mails (+ F3 font) | `+41 79 626 70 82` reads left to right in Arabic on both booking pages (lookup, booking, change views) and in the confirmation, refund, contact (3) and default-footer e-mails; refund/contact/sign-up e-mails show Poppins instead of a serif fallback. |
| 4 customer request vs a staff change waiting for payment | `1181e49d`, review fixes `5152fafb`, `0d588250`, `0ff7a9e8` | While the owner's priced change waits for its difference, a customer's time request is refused (409) with the signed sentence in four languages; the toast stays centred and on screen (Arabic, 390) and errors stay 9 s. One Stripe page per change request; Withdraw works without a page; a second Accept never replaces a paid page (dashboard: "The customer has already paid the difference…", four languages). |
| 5 one mirror for arrows | `8b304058`, test `9f1a6ed5` | No visible change, except the dashboard's old → new change-row arrow, which pointed the wrong way in Arabic (flipped twice) and now points right-to-left once. |
| found on the same pages | `7ed17439` translations, `e9d8ec9b` French button | 34 lines on the two booking pages had no de/fr/ar; every reference, e-mail and flight value reads left to right; "1 passenger"; French "Demander ces modifications" no longer pushes the page sideways at 390. |

## Migration — `20261007190000_customer_request_staff_waiting.sql`

`create or replace function public.booking_edit_request_upsert(...)`: P6's body verbatim plus one refusal
(`staff-change-waiting`, P0001) after the booking lock. Safe on real paid bookings: no row inserted, updated or
deleted; only the function is replaced; it can run twice. **Ship conditions (fresh review R2/R4):**

1. Just before the apply, read-only on live — must be 0 rows (it was 0 at 13:27 +04; live then had 1 edit request):
   ```sql
   select extra_session_id, count(*) from public.booking_edit_requests
    where extra_session_id is not null group by 1 having count(*) > 1;
   ```
2. Precondition (live, read 13:27 +04): `c86124b9515b2ff7222ec9d084cfe643`.
3. Apply the file verbatim, then read back — expected `6aa5b9702982284ebea92d95c7081d63 | t | {"search_path=\"\""}`:
   ```sql
   select md5(p.prosrc), p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'booking_edit_request_upsert';
   select r.rolname, has_function_privilege(r.rolname, 'public.booking_edit_request_upsert(uuid,text,uuid,jsonb,bigint)', 'execute')
     from pg_roles r where r.rolname in ('postgres','service_role','vamos_system','anon','authenticated','vamos_edge','vamos_public') order by 1;
   ```
   Expected EXECUTE: postgres t, vamos_system t, service_role t on live (default grant; f on a from-empty stack), all others f.
4. **Apply and deploy the Worker in the same ship, nothing in between; roll back both or neither.** The live
   Worker still reuses a Stripe page across two requests; the migration with that Worker re-opens review 1's
   blocker (a paid customer refused for up to 24 h).

## Checks on the merged tip 43f6b5b8 (= the code of the tip; the docs commit adds only `.planning` + one seed test file)

| Check | Result |
|---|---|
| unit tests (`pnpm test:unit`) | web 383 files / 3886 passed, 24 skipped; emails 229; db 14 — exit 0 |
| pgTAP from empty (own stack `vamos-taxi-p6f`, `db reset` then `test db`) | 96 files, 2506 tests, PASS |
| typecheck | exit 0 |
| lint | exit 0 (0 errors; 6 warnings, none in a file of this job) |
| lint:css | exit 0 |
| check:numbers, check:legal-claims, check:public-env, check:db-fences | exit 0 each |
| i18n:check | passed |
| seed:check | exit 0 |
| types: generated with the pinned CLI (2.115.0) from the from-empty stack vs `packages/db/database.types.ts` | identical (`db:types:check` itself reads port 54322, which a job may not use) |
| build | exit 0 |
| Browser proof on the local Worker build of e9d8ec9b (all code of the tip; the merge brought only main's own files) | 145 pass, 0 fail, 1 n/a (the "Call dispatch" card no customer can reach); mirror 196 icons, 0 wrong — `evidence/PROOF.md`, 76 pictures in `screens/proof/` |
| Fresh Opus reviews of item 4 | R1 fix → R2 safe with warnings → R3 fix (blocker in R2's own change) → **R4 safe** (`REVIEW-ITEM4*.md`) |

Logs: `evidence/gates/`. Re-run of the proof: `.planning/quick/261002-p6-followups/tools/proof-run.sh all` (~22 min,
own stack and ports; `PROOF_SKIP_BUILD=1` reuses a build).

## NOT verified

- Nothing applied or deployed on live; no read-back on live.
- Stripe: the browser proof used local stand-ins; no real test-mode Stripe page for a difference was paid in a
  browser in this job. Stripe's idempotency behaviour is from its documented rules, not exercised.
- Real mail clients (Gmail, Outlook, Apple Mail) for the Arabic phone; the confirmation e-mail's island has no
  `dir` attribute (CSS only), so a client that strips `unicode-bidi` may still reverse it there.
- Mirror at 1024/768 and in German/French; React-only components (ListRow, Next DatePicker, ServiceCard) appear
  only in the dev gallery.
- GitHub Actions (blocked by billing per the board).

## For the controller's list (found, not fixed here)

Money (from fresh review R4; all older than this job, test mode only until the live key):
1. The extra settle acknowledges every SQL error except P0002, so a captured difference can go unrecorded
   (`settle.ts:351-372`) — already on the board (a4747e3c).
2. If the difference changes between two Accepts of a customer request, the new page charges the new amount but
   the settle records the first; fix in `acceptPaidEdit` (refuse when the amounts differ), no migration.
3. A staff class or trip change does not check whether the page it replaces was just paid: a second pay link, the
   first payment becomes Refund due (Withdraw already checks).
4. A difference paid after a cancel may be applied to a cancelled trip (R1 P-2) — on the board.

Customer pages (same two pages, outside this plan):
5. The signed-in booking page shows a paid booking as "Awaiting payment" and offers no Cancel:
   `app/vamos-manage-ticket.js` `fromAccount` does not map the account API's `booked`
   (`apps/web/lib/account/bookings.ts:139`).
6. Dates stay English in de/fr/ar ("Wed 7 Oct · 14:20"): the API's `dateLabel` and `formatLocal` (en-GB).
7. Arabic bag counts read "2 حقيبة" for any count: the ops pattern `^(\d+) bags$` (`app/vamos-i18n-dict.js:53`)
   wins before the correct one at :110 (shared dictionary — a dictionary job).
8. The refund line's country name stays English (`countryLabel` in `apps/web/app/api/manage/booking/route.ts`).
9. Home's time spinner reads "30 : 04" for 04:30 in Arabic.
10. The "Call dispatch / Cancel instead" fork card cannot be reached by a customer (`bookingTiming` 'late' is never set).
11. Contact e-mail: English text quoted in an Arabic e-mail shows its end punctuation on the wrong side (`dir="auto"`).
12. Local only: a slow `/api/fx` (internet) can drop a local `wrangler dev`.

Files shared with other jobs: `apps/web/tests/visual/booking-bar-states.spec.ts` and `checkout-page.spec.ts`
(item 5 asserts "mirrored once" instead of the wrapper's own transform) merged cleanly with 08ebcfc7.

## Owner UAT (numbered; on vamostaxi.site after the ship)

1. Book a trip on vamostaxi.site and pay with card 4242 4242 4242 4242. Expected: the confirmation page; the
   controller reads `booking_payments` for that booking: status `succeeded`.
2. Dashboard → that booking → Edit → Trip: move the destination farther away → confirm. Expected: "waiting for
   the difference"; the customer gets the "pay the difference" e-mail. Do not pay yet.
3. Open the customer's link from the confirmation e-mail → Change your booking → pick another time → Request
   these changes. Expected: "A change to this trip is waiting for payment. Pay the difference from our e-mail
   first, then ask for a new time." in a box centred on the screen, for about 9 seconds.
4. Switch the page to العربية and repeat step 3. Expected: the Arabic sentence; the box stays inside the screen
   on a phone.
5. Pay the difference from the e-mail with 4242 4242 4242 4242. Expected: the dashboard shows the new
   destination; repeat step 3: "Time-change requested. Pickup stays … until we confirm."
6. Dashboard: make another dearer change on the same booking, then press Withdraw change. Expected: "withdrawn";
   step 3 is accepted again.
7. On the same link in Arabic, look at "Cannot get in?" and the "A person, if you need one" box. Expected: the
   number reads +41 79 626 70 82, left to right.
8. In German, the same page. Expected: no English line ("Ein Mensch, wenn Sie einen brauchen", "Diesen Transfer
   stornieren", …).
9. On a phone in French, the change view. Expected: the yellow button fits (its label may wrap); the page does
   not move sideways.
10. Dashboard in العربية → a booking's Edit preview of a change (old → new). Expected: the arrow points from the
   old value to the new one in reading direction (to the left), once.
11. Send the contact form in Arabic. Expected: the acknowledgement e-mail ends with +41 79 626 70 82 left to right,
   in a sans-serif font.
