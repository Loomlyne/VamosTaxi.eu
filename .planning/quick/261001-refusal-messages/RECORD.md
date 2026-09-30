---
quick: 261001-refusal-messages
branch: gsd/26.2-refusal-messages (cut from origin/main d79e12aa)
owner_ok: question form 2026-10-01, "Fix"
status: done on branch — not pushed, not deployed
commits: 79c1980f (red tests), 14e094c0 (fix), ce0302cd (page messages)
---

# Dashboard refusals answered instead of a 500

## The bug class

postgres.js `begin()` rethrows a query error the transaction callback already caught
(postgres@3.4.9 `cf/src/index.js` 266-267, 293: every query gets `q.catch(e => uncaughtError = e)`,
then `if (uncaughtError) throw uncaughtError` after the callback). A deferred constraint fails only
at COMMIT, also after the callback. So `try { … } catch (err) { return mapX(err) }` INSIDE an
`asSystem` / `asStaff` / `asCustomer` / … callback never returns the mapped refusal: the route
throws, the Worker answers 500 without JSON, `app/vamos-ops-api.js` turns it into `code: 'http'`,
and the page shows its generic text. Root cause recorded on 2026-09-30 in
`gsd/26.2-dash-assign:.planning/quick/260930-dash-assign/DEBUG.md`.

## How the hits were found

A type-aware scan with the TypeScript compiler over `apps/web/lib` and `apps/web/app` (tests
excluded, 2,984 program files): every `try … catch` whose try block runs a tagged-template query
or `.unsafe()` on a `TransactionSql` handle, or that sits lexically inside an identity-wrapper
callback (`asAnon`, `asSystem`, `asCheckout`, `asCustomer`, `asStaff`, `asGuest`, `asQuote`,
`withIdentity`, `.begin`, `.savepoint`), or inside a function whose `sql` / `tx` parameter is a
`TransactionSql` or `any`. A try block that wraps the wrapper call itself (the correct shape) is not
a hit. A second pass looked for `.catch(` / `.then(_, onRejected)` on a transaction query:
one result (`lib/ops/phone-booking.ts:160`), which is `.catch` on the `asSystem(...)` promise —
correct shape, not a hit. `worker.ts` and `middleware.ts` were not scanned (outside lib/app,
hands-off).

## Every hit (line numbers at d79e12aa)

| # | File:line (try / catch) | Function · RPC · wrapper | What the user saw | Done |
|---|---|---|---|---|
| 1 | `apps/web/lib/ops/bookings-write.ts:139 / 149` | `cancelBooking` · `ops_cancel_booking` · asSystem | Cancel on a finished / cancelled trip, or a booking that is gone: 500, "Could not cancel VT-…" | **Fixed** |
| 2 | `apps/web/lib/ops/bookings-write.ts:416 / 436` | `markOutcome` (`markComplete`, `markNoShow`) · `ops_mark_complete` / `ops_mark_no_show` · asSystem | Complete / No-show on a frozen trip: 500, "Could not apply edit VT-…" instead of "This trip is frozen." | **Fixed** |
| 3 | `apps/web/lib/ops/refund.ts:528 / 540` | `decideRefund` · `ops_refund_decide` · asStaff | Decline / Reject refused (not-pending, not-open, not-post-trip, not-paid, full-refund-only at the row lock, admin-only): 500, "Could not refund VT-…" | **Fixed** |
| 4 | `apps/web/lib/ops/assign.ts:240 / 259` and `306 / 320` | `assignBooking`, `unassignBooking` · `ops_assign_leg` / `ops_unassign_leg` · asSystem | "Could not assign VT-…" | Not touched here: fixed on `gsd/26.2-dash-assign` (0c83bdd0), not on main yet |
| 5 | `apps/web/lib/ops/tickets.ts:72 / 96` | `loadTickets` · read of `support_message_files` · asStaff | Only if that table were missing (42P01): the tickets list would 500 instead of listing without files. Every other error is rethrown. Dormant on a migrated database | Not fixed (not a refusal; schema fallback) |
| 6 | `apps/web/lib/ops/chauffeur-desk.ts:111, 169, 203, 216` | `loadDeskExtras`, `persistChauffeurDesk`, `persistVehicleSeats` (`sql: any`), called inside asStaff from `chauffeurs.ts:308/341/379/421`, `fleet.ts:368`, `chauffeurs-write.ts:49/76/106`, `fleet-write.ts:41/64/96` | Only if the desk columns / tables were missing (42703 / 42P01): the chauffeur or fleet screen would 500 instead of falling back. Dormant on a migrated database | Not fixed (not a refusal; schema fallback) |
| 7 | `apps/web/app/api/account/bookings/route.ts:31 / 33` | `GET /api/account/bookings` · `customer_claim_guest_bookings()` · asCustomer | **Customer path — needs owner OK.** The comment says a failed guest-booking claim must not break the list, but the catch is dead: if the claim errors, the whole read fails, the route answers 500 `list_failed`, and the signed-in customer sees "We could not load your bookings. Try again." on My bookings instead of the list. The fix would be a savepoint around the claim; not done | Not fixed |

Customer booking path (`lib/checkout/*`, `lib/quote`, `lib/pricing`, `app/api/checkout`,
`app/api/stripe`): **no hits.** The one customer hit (#7) is the account list, listed above.

`refund.ts:152 / 214` from the 09-30 record: main moved (20-10 refunds by hand). The refund press
(`refundBooking`) now maps `ops_refund_plan` around asSystem (`refund.ts:350-366`), which is correct.
Only the decision (#3) was left.

## What changed

- `apps/web/lib/ops/bookings-write.ts`: `cancelBooking` and `markOutcome` run the RPC inside
  asSystem without try/catch; a new `mapOutcomeSqlError` maps the error around asSystem
  (P0002 → not-found, `frozen` → frozen, anything else → unknown). The unnamed case is now logged
  (`ops_cancel_sql_failed` / `ops_mark_complete_sql_failed` / `ops_mark_no_show_sql_failed`, booking
  id, SQLSTATE, message), since the throw used to be its only trace. The route already answers
  409 frozen, 404 not-found, JSON 500 unknown.
- `apps/web/lib/ops/refund.ts`: `decideRefund` wraps `return await asStaff(...)` in try/catch and
  maps with `mapRefundSqlError`. The route already answers 409 / 403 / 404 with the code.
- `app/ops/OpsDetail.dc.html` (the live dashboard page):
  - Cancel: code `frozen` now shows the existing `frozen` text ("This trip is frozen.", already in
    en/de/fr/ar). Before, Cancel showed "Could not cancel VT-…" for every refusal.
  - Decline / Reject: `not-pending` and `not-open` → new `errDecided`; `not-post-trip` → new
    `errNotPostTrip`. **Two new texts, added in en / de / fr / ar:**
    - en: "This refund is no longer waiting for a decision. The page now shows where it stands." ·
      "A refund can only be rejected after a completed trip or a no-show."
    - de: "Diese Rückerstattung wartet nicht mehr auf einen Entscheid. Die Seite zeigt jetzt den
      aktuellen Stand." · "Eine Rückerstattung kann nur nach einer abgeschlossenen Fahrt oder einem
      No-show zurückgewiesen werden."
    - fr: "Ce remboursement n’attend plus de décision. La page montre maintenant où il en est." ·
      "Un remboursement ne peut être rejeté qu’après une course terminée ou une absence."
    - ar: "لم يعد هذا الاسترداد بانتظار قرار. تعرض الصفحة الآن وضعه الحالي." ·
      "لا يمكن رفض الاسترداد إلا بعد رحلة مكتملة أو عدم الحضور."
  - Already mapped, unchanged: Complete / No-show / Arrival `frozen` → "This trip is frozen.";
    Decline / Reject `full-refund-only` → errFullOnly, `not-paid` → errNotPaid.
  - Left on the generic text on purpose ("Could not cancel / apply edit / refund VT-…"): `not-found`,
    `unknown`, `not-admin` (the route checks admin before the SQL, so the SQL admin-only is near
    unreachable), `invalid-decision` (the page only sends decline / reject).

No SQL change, no migration, no seed.

## Tests

`apps/web/lib/ops/refusal-rpc-errors.test.ts` (new, always runs). asSystem / asStaff stood in with
the postgres.js `begin()` rule (rethrow after the callback caught), same as
`assign-rpc-errors.test.ts`.

| Test | Before the fix (79c1980f) | After (14e094c0) |
|---|---|---|
| cancelBooking: finished or cancelled trip → frozen | × `AssertionError: promise rejected "PostgresError: frozen { code: 'P0001' }" instead of resolving` | ✓ |
| cancelBooking: booking gone → not-found | × `promise rejected "PostgresError: not-found { code: 'P0…' }"` | ✓ |
| cancelBooking: other database error → unknown (and logged) | × `promise rejected "PostgresError: canceling statement due to… "` | ✓ |
| cancelBooking: clean run still cancels | ✓ | ✓ |
| markComplete / markNoShow: frozen → frozen | × `promise rejected "PostgresError: frozen { code: 'P0001' }"` | ✓ |
| markComplete / markNoShow: booking gone → not-found | × `promise rejected "PostgresError: not-found { code: 'P0…' }"` | ✓ |
| markComplete: clean run still marks | ✓ | ✓ |
| decideRefund: decline → not-pending | × `promise rejected "PostgresError: not-pending { code: '…' }"` | ✓ |
| decideRefund: decline at the row lock → full-refund-only | × `promise rejected "PostgresError: full-refund-only { …(1) }"` | ✓ |
| decideRefund: reject → not-post-trip, not-open, not-paid, not-found | × `promise rejected "PostgresError: not-post-trip { …(1) }"` | ✓ |
| decideRefund: SQL admin-only → not-admin | × `promise rejected "PostgresError: admin-only { code: '4…' }"` | ✓ |
| decideRefund: clean run still records | ✓ | ✓ |

Red run: 9 failed, 3 passed. Green run: 12 passed.

## Gates (2026-10-01, once, at the end)

- `pnpm typecheck` exit 0
- `pnpm lint` exit 0 — 0 errors, 5 warnings (unused eslint-disable directives, none in touched files, pre-existing)
- `pnpm i18n:check` passed (2,665 keys)
- `pnpm check:numbers` ok
- `pnpm check:db-fences` 8/8 passed (968 files)
- `node scripts/sync-dc-mock-to-public.mjs`, then `pnpm test:unit` exit 0 — apps/web 295 files
  passed, 2 skipped (2,899 tests passed, 2 skipped); packages/emails 151 passed; packages/db 13
  passed. No timeouts, no re-run needed.

## Not verified

- No live click. Nothing is pushed or deployed from this branch; the dashboard still shows the
  generic texts until the control session ships it.
- No database run: the tests use the stand-in, not a local Supabase stack (no Docker in this job).
  The RAISE names and SQLSTATEs were read from the migrations (`20261005140000_refunds_by_hand.sql`
  for cancel and decide, `20260912033121_booking_lifecycle_ops_complete.sql` for complete /
  no-show), not observed.
- The page changes were not opened in a browser (1440 / 1024 / 768 / 390, Arabic RTL). They are two
  copy keys in the existing Alert and one extra branch in the Cancel handler; `ops-detail-i18n.test.ts`
  confirms every key exists in all four languages.
- Hit #7 (customer My bookings) and the two dormant schema fallbacks (#5, #6) are unchanged.
