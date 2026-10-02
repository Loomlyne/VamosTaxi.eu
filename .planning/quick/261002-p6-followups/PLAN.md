# 261002 — P6 follow-ups (plan, waits for the owner's signature)

Job session, branch `fix/p6-followups` cut from `origin/main` 7ccdcdfe (P6 `05b8f2d1` live). Worktree
`.claude/worktrees/p6-followups`. Controller: "VamosTaxi - session control". Migration number
`20261007190000` confirmed by the controller (2026-10-02 03:1x). Opus plans and reviews, Sonnet builds.

## What the five items turned out to be (read on main 7ccdcdfe)

| # | Item | Finding | Work |
|---|---|---|---|
| 1 | Seat limits on manage-booking / booking-detail | P6 (owner D9) removed class, passenger and bag counters from the customer change view. The board's lines (`manage-booking.dc.html:693`, `booking-detail.dc.html:675`) are pre-P6 (`eb9128f3`: `seats: 3/3/7`, `bump('pax',…,8)`). Today both pages only print `ticket.pax + ' passengers'` (`manage-booking.dc.html:1135`, `booking-detail.dc.html:1099`); `vamos-manage-ticket.js:83` takes `row.pax` as is. No cap left. | **Prove, no code**: a paid 10-traveller Van luxury booking reads 10 on both pages (Chromium, local Worker, en/ar). |
| 2 | Dashboard booking edit seat check | P6 already: PATCH refuses `pax`/`bags`/`klass` with `use-change` (`apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts:28`); `BookingPatch` has no pax (`lib/ops/bookings-write.ts:33`); the trip change refuses a class too small on the server (`20261007150000_trip_change_reprice.sql:782`, `class-too-small`) and in the price step (`lib/ops/booking-trip-change.ts:133`); the dashboard shows `errClassSmall` in en/de/fr/ar (`app/ops/OpsDetail.dc.html:911/1052/1196/1340`, mapped at 1867). | **Prove, no code**: Worker-client test lines for PATCH pax → `use-change` and a 13-traveller change on Van luxury (12 seats) → `class-too-small`. |
| 3 | Arabic phone numbers read left to right | Unwrapped: manage-booking 223, 472, 600; booking-detail 221, 462, 582 (driver phone at manage-booking 314 already has `vt-dir-keep`). E-mails: `packages/emails/src/ConfirmationEmail.tsx` (`dispatchPhone` line, html 244 + text 291), `refund.ts` `FOOTER` (64), `contact.ts` `CONTACT_FOOTER` (41, html 160/231, text 173/233), and the shared default footer of `layout.ts` (`layoutHtml` 19, `layoutText` 61) that every other string e-mail uses. | Code (design signed first). |
| 4 | Customer time request vs. a staff change waiting for payment | `booking_edit_request_upsert` (`20261007150000…sql:1294`) supersedes any `requested` row, so a customer's time request ends a staff change whose difference is still unpaid (the pay page is left open). P1 already has the mirror rule (`customer-request-waiting` refuses a staff change while a customer request waits, `20261007140000…sql:840`). Live: 0 rows in `booking_edit_requests` (read 2026-10-02 03:1x). | Migration + server + both pages. **Refusal** (task's default; breaks no signed decision; mirrors P1). |
| 5 | Local mirror flips the laws.css rule makes redundant | 12 wrappers excluded in `design-system/tokens/laws.css:68` (copy `apps/web/public/brand/tokens/laws.css:68`). Two are dead CSS (no element: `[data-bs-mirror]` BookingSheet 48, `[data-route-join]` home 133). The pages' date pickers do not use `.vt-dp__nav` (only the bundle's unused DatePicker does); pictures before/after identical (`screens/sheet-5`). | Code; no visible change. |

Found while making the pictures (same two pages / same e-mail files, fixed in this job):
- The toast that carries every message on manage-booking and booking-detail sits at `inset-inline-start:50%` + `translateX(-50%)`: in Arabic it is pushed off the left edge, and at 390 it is squeezed into half the screen. Fix: wrapper `inset-inline:16px`, centred, no transform.
- Lines with no de/fr/ar on both pages (English in Arabic today): "A person, if you need one", "Confirmation sent to", "Cancel this transfer", "Opened from your confirmation email…", "Payer email", "Read the cancellation and refund policy" and the "Dispatch answers the phone. Quote {ref}…" sentence (needs a pattern: it carries the reference). Full list from `VamosLocale.coverage` on the Worker build; all four languages in this job.
- E-mails: `layout.ts` and `contact.ts` put `BODY_FONT` (which holds `"Segoe UI"`) inside a double-quoted `style="…"`, so the font list breaks and those e-mails show a serif fallback. Fixed only if the owner says so (question 3).
- Not ours, reported to the controller: home's time spinner reads "30 : 04" for 04:30 in Arabic; the manage-booking "Call dispatch" fork card cannot be reached by a customer (`bookingTiming` 'late' is never set).

## Task 1 — item 4: database, server, Worker client (money/database: fresh Opus review after)

Files (exact):
- `packages/db/supabase/migrations/20261007190000_customer_request_staff_waiting.sql` (new)
- `packages/db/supabase/tests/customer_request_staff_waiting.test.sql` (new)
- `apps/web/lib/ops/edit-request-map.ts`
- `apps/web/lib/ops/edit-request-map.test.ts` (new, or the existing map test if one covers `mapEditSqlError`)
- `apps/web/lib/ops/customer-request-staff-waiting.local.test.ts` (new, uses `trip-change.local-fixture.ts` `openWorld`)
- `packages/db/database.types.ts` only if `gen types` changes it (signature is unchanged, so it should not)

Action:
1. Migration = `create or replace function public.booking_edit_request_upsert(...)` with the P6 body of
   `20261007150000_trip_change_reprice.sql:1294-1396` **verbatim** plus one block, placed after the booking
   row is locked `for update` and after the `unpaid` check, before the supersede:
   ```sql
   -- 261002 (P6 review 2): a staff change that waits for its difference to be paid is not ended by a
   -- customer's request; the customer asks again once it is paid, withdrawn or expired (mirror of P1's
   -- customer-request-waiting).
   if p_actor = 'customer' and exists (
     select 1
       from public.booking_edit_requests as r
       join public.price_snapshots as x on x.id = r.extra_snapshot_id
      where r.booking_id = v_booking.id
        and r.actor = 'staff'
        and r.status = 'requested'
        and x.expires_at > pg_catalog.now()
   ) then
     raise exception 'staff-change-waiting' using errcode = 'P0001';
   end if;
   ```
   Same signature, `security definer`, `set search_path = ''`; re-state `revoke all … from public`,
   explicit revokes from `anon`/`authenticated` as P6 review 4 did, `grant execute … to vamos_system`;
   comment updated (append the new refusal). Header: what changes, why, "safe on real paid bookings: no
   row written; live has 0 edit requests (read 2026-10-02)", rollback = re-apply P6's body. Do not edit
   `20261007150000`.
   An expired staff page (snapshot `expires_at <= now()`), a withdrawn, accepted or superseded staff
   request, and any staff request without an extra price record do **not** block (old behaviour).
2. pgTAP (from empty): customer request refused with `P0001 staff-change-waiting` while a staff request
   waits with an unexpired extra record; nothing written (staff row still `requested`, no new row); allowed
   (and supersedes) once the extra record is expired; allowed after `withdrawn`; a staff request still
   supersedes a staff request (unchanged); the earlier refusals (`customer-time-only`,
   `snapshot-mismatch`, `class-change-staff-only`, `unpaid`) still fire; function is definer, search_path
   '', EXECUTE only `vamos_system` (+ owner/service_role as live shows), no `anon`/`authenticated`.
3. `edit-request-map.ts`: `"staff-change-waiting"` in the `mapEditSqlError` list; `failStatus` → 409.
   Unit test for both.
4. Worker-client local test (real `asSystem`, `fetch_types:false`, own stack): world from `openWorld`;
   staff dearer change confirmed (request waits, Stripe page stubbed) → `requestCustomerTimeChange` as
   guest and as signed-in customer → `{ ok:false, code:"staff-change-waiting" }`, staff request still
   `requested` with its session id, no customer row; after the extra record is expired (set by SQL in the
   test's scratch rows) → the customer request is accepted. Item 2 proofs go in the same file or in
   `trip-change-patch.local.test.ts`'s style: PATCH `{pax: 13}` → 400/409 `use-change`; trip change preview
   13 travellers on Van luxury (seats 12) → `class-too-small`.
5. Types: `pnpm exec supabase gen types typescript --local --schema public --workdir <own stack>` →
   identical expected; `db:types:check` cannot read a shifted port, so compare the generated file instead.

Verify: pgTAP from empty on the own stack (all files), the new local test with `VAMOS_LOCAL_DB_PORT`,
`vitest run` of the touched unit tests, typecheck. Read-back SELECT for the hand-over:
`select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'booking_edit_request_upsert'`
(live precondition `c86124b9515b2ff7222ec9d084cfe643`, equal on the own stack before the change; expected
after = the value from the from-empty replay),
`prosecdef`, `proconfig`, and `has_function_privilege` for `vamos_system`, `anon`, `authenticated`.

Done: refusal proven in pgTAP and through the Worker client; old refusals unchanged; md5s recorded.

## Task 2 — items 3 (pages) and 4 (pages): customer pages + strings

Files (exact): `app/pages/manage-booking.dc.html`, `app/pages/booking-detail.dc.html`,
`app/vamos-i18n-dict.js` (append only), `apps/web/lib/checkout/customer-time-refused.test.ts` (new, vm-run
of the page logic like `customer-cancel-cookie.test.ts`).

Action:
1. Each of the six phone displays gets the inline span, as `cancellation.dc.html:303` does:
   Button children `<span class="vt-dir-keep">+41 79 626 70 82</span>`; fork CTA
   `<span data-fork-cta="accent"><span class="vt-dir-keep">+41 79 626 70 82</span></span>`. `href`s unchanged.
2. `confirmModify` on both pages: when `result.body.code === 'staff-change-waiting'`, say the signed text
   (tone danger), else the existing generic text. Nothing else in the handler changes.
3. Dictionary: the signed English sentence with de/fr/ar (Swiss German "ss").
4. vm test: 409 `staff-change-waiting` → the new text; any other failure → the generic text; ok → the
   existing "Time-change requested…" text (both pages).

Verify: `VamosLocale.coverage(main)` empty in de/fr/ar on both pages' booking, change and cancel views;
Chromium against the local Worker build (after `node scripts/sync-dc-mock-to-public.mjs`): guest link and
signed-in view, 1440/1024/768/390, en and ar; the Arabic number reads `+41 79 626 70 82` and stays on the
right under right-aligned text; nothing scrolls sideways at 390.

## Task 3 — item 3 (e-mails)

Files (exact): `packages/emails/src/layout.ts`, `packages/emails/src/refund.ts`,
`packages/emails/src/contact.ts`, `packages/emails/src/ConfirmationEmail.tsx`, and their existing tests in
`packages/emails` (extend; add one test file if none covers the footer).

Action:
1. HTML: the visible phone is wrapped `<span dir="ltr" style="unicode-bidi:isolate;direction:ltr;white-space:nowrap">+41 79 626 70 82</span>`
   (one small helper in `layout.ts`, reused by `refund.ts` and `contact.ts`; `ConfirmationEmail.tsx`
   splits the `dispatchPhone` message around `{phone}` and uses its existing `ltr()` node, as
   `ClassChangePayEmail.tsx` interpolates). `tel:`/`wa.me` hrefs unchanged. All locales get the span
   (it is a no-op in LTR); only Arabic changes visibly.
2. Plain-text parts, Arabic only: the phone is enclosed in U+2066 LEFT-TO-RIGHT ISOLATE … U+2069 POP
   DIRECTIONAL ISOLATE (invisible); en/de/fr text unchanged byte for byte.
3. Message texts unchanged (no new copy).

Verify: emails package tests; rendered Arabic HTML of the four e-mails opened in Chromium at 600 px
(screens), the number left to right.

## Task 4 — item 5: one mirror, everywhere

Files (exact): `design-system/tokens/laws.css` and `apps/web/public/brand/tokens/laws.css` (identical
after), `app/home/BookingBar.dc.html`, `app/home/BookingSheet.dc.html`, `app/home/Services.dc.html`,
`app/home/home.dc.html` (CSS lines only), `app/pages/BookingRow.dc.html`, `app/pages/account.dc.html`,
`apps/web/app/[locale]/checkout/checkout.css`, `apps/web/components/data/ListRow.css` (+ the comment in
`ListRow.tsx:74-77`), `apps/web/components/forms/DatePicker.css`, `apps/web/components/home/ServiceCard.css`,
`apps/web/tests/visual/data.spec.ts` (comment at 226 only, if it names the old rule).

Action:
1. Delete the 12 local `[dir="rtl"] … {transform:scaleX(-1)}` rules and their 12 entries in the
   `:not(...)` list of the law (keep `.vt-dir-keep *` and `[dir="ltr"] *`); update the law's comment.
2. Wrappers that also move on hover keep their motion forward in Arabic without a flip:
   Services `[dir="rtl"] [data-svc-cta]:hover [data-svc-cta-arrow]{transform:translateX(calc(-1 * var(--vt-space-1)))}`;
   ServiceCard `[dir="rtl"] … [data-svc-circ]{transform:translateX(-3px)}`; reduced-motion RTL rules go
   to `transform:none`.
3. Nothing else in those files changes. `home.dc.html` and `BookingSheet.dc.html` belong to no other open
   job (checked on the board 2026-10-02).

Verify (Chromium, local Worker build, `ar`, 1440 and 390): for every icon whose mask is arrow-right,
chevron-right, chevron-left, log-in or log-out on home (bar, phone sheet, services, trust row, date
picker), account, bookings list rows, manage-booking (date picker), checkout trip strip, dashboard
calendar — the product of the x-scales of the icon and all its ancestors is −1 (mirrored exactly once);
in `en` it is +1. Same check on `main` before the change: the date picker is +1 in Arabic (the bug), all
others −1. Pictures before/after of each spot.

## Task 5 — proof, gates, hand-over

1. Own Supabase stack (own `project_id` `vamos-taxi-p6f`, own port block, never 54322), pgTAP from empty.
2. Local Worker build (unusual ports, own PIDs, refuse busy ports): items 1-5 clicked in Chromium; the 409
   message appears for a real waiting staff change.
3. Fresh Opus review of Task 1 (money/database), then fix and re-review until "safe".
4. Merge `origin/main` back in; all 11 gates + build on the merged tip; push the branch (no force).
5. `.planning/quick/261002-p6-followups/HANDOVER.md`: checks with results, NOT verified, migration with
   precondition/expected md5 and read-back SELECT, numbered owner UAT (a 4242 payment first). SendMessage
   to the controller, then stop.

## Owner signature asked for (question form)
1. Phones: Arabic numbers read left to right on the two booking pages and in the Arabic e-mails (pictures
   `screens/sheet-1`, `sheet-2`).
2. The refusal text (sheet-3), four languages, and the toast kept centred and on screen.
3. The e-mail font fix (sheet-2 shows the serif fallback).
4. This plan.

Controller's order (2026-10-02 03:2x): build items 4 and 5 and the 1/2 proofs at once, one commit per item;
item 3 after the owner's signature; if it is still missing when the rest is checked, hand over without it.
