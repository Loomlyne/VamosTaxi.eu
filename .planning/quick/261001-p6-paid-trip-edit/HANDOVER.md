# P6 hand-over — change the place or time of a paid trip (D1–D21)

Branch `gsd/26.2-p6-build` (worktree `.claude/worktrees/p6-paid-trip-edit` in the main folder), code verified at
**`09a97ca4`**; this hand-over is the commit after it (documents and run screenshots only), origin/main `d575917e` merged in (no conflict). Pushed, never forced. No PR, no deploy, no hosted
write (four read-only SELECTs on live: column grants, objects and rule, function md5s, function grants; results below). Decisions: `.planning/decisions/2026-10-01-p6-paid-trip-edit.md`
(D1–D19 signed 2026-10-01; **D20 and D21 answered 2026-10-02 in this session**). Earlier record: `BUILD-RECORD.md`.
Browser run: `WORKER-RUN.md`. Pictures: `screens/` (signed design) and `screens/worker-run/` (the real run).

## First: a live bug, fixed here (consider shipping it first)

**A guest cannot cancel a paid trip from the e-mailed link on vamostaxi.site today.** The middleware moves the manage
token from the link into the HttpOnly `vt_manage` cookie and strips it from the address (K100). The page then has
no token, and "Confirm cancellation" only sent a request when it had one, so it showed "Could not cancel this
booking." and sent nothing. The fix (`5dcb9e6c`, both `manage-booking` and `booking-detail`) sends the guest request
and the server reads the cookie, as the time change, flight and resend already do. The test failed first, then
passed. A Chromium click proved it on the local Worker (C7a). It changes page code only, no server code and no
migration.

## What changes, in plain words

**Dashboard → booking → Actions → Edit booking** (dashboard.vamostaxi.site)
- Trip (places, date, time, passengers, bags, class) is priced again with today's price book and confirmed in a
  second step; nothing is written before "Change the trip".
  - Dearer: the trip keeps its old places until the customer pays the difference (your D14 e-mail, 24 h Stripe page);
    "Withdraw change" works. Cheaper: written at once, "Refund due" with the full difference, refund by hand (D3).
  - Date or time only, or passengers/bags the class takes: no new price, written at once, confirmation again (D1, D5).
  - Too many people for the class: only the classes that fit are offered, one price for the whole change (D4).
  - A place the site does not book (Dubai, New York) is refused under its field (D2); the Edit accepts what the
    public form accepts, Zurich → Istanbul included (D18).
  - A driver on the trip stays and gets the update (D7, D16). If the new time clashes with another of his trips the
    box names it: **Keep** keeps him on both (D11, D17) or **Take off** unassigns him.
- Contact and note are saved at once and recorded, no e-mail (D6). Flight number is saved at once and the driver gets
  the existing flight-number e-mail (D8).
- **D21:** after a cheaper place, time or party change the Refund due panel says "The trip was changed and costs less
  now. Nothing is sent until you confirm." (de/fr/ar as approved). A class-only change keeps the class line.

**Customer pages** (vamostaxi.site)
- After a cheaper trip change: your D15 line under the status until the refund is sent (four languages).
- Cancel view: the "Move it instead" sentence is gone, title and button stay (D12).
- Signed-in booking view: "Request these changes" sends the time change (D13); flight "Save" and "Resend email"
  do the real thing (D19). A new **day** is now sent with the new time (it was dropped before).
- **D20:** on a cancelled trip, "Resend email" sends the existing cancellation e-mail again (customer only, the refund
  sentence its cancellation used), never the "Booked — VT-…" mail.
- The guest cancellation fix above.

## Fixed in this session (besides D20, D21)

| Commit | What |
|---|---|
| `8ecec60e` | **D17 bug:** with a driver kept on two overlapping trips, the *other* trip could no longer change status: "Complete", or a payment moving it to confirmed, failed with an overlap error (23P01). Fixed in the guard trigger; pgTAP red first. Proven in Chromium (O4c: Complete → 200). |
| `d8e0cb8c`, `7f5b341e` | `database.types.ts` had been ordered by hand, so CI's `db:types:check` would fail. Regenerated with the pinned CLI (2.115.0). |
| `5dcb9e6c` | Guest cancellation (above). |
| `5f582461` | The test runner killed whatever listened on its ports. On 2026-10-02 at about 01:27 it most likely stopped a local Worker that another session (`arabic-design-g23`) had on 4390. That session was told; it moved to 4777. The runner now stops only its own processes and refuses busy ports. |

`6af6b74c` (the controller's save of the previous session's work) was reviewed: it adds the booking's address to the
account list (`b.contact_email`, already in the customer column grant). It is also checked on live, read-only:
`has_column_privilege` is true for `bookings.contact_email` and `booking_legs.flight_no`.

## Migration `20261007150000_trip_change_reprice.sql`

| Kind | Objects |
|---|---|
| Table (D17) | `booking_legs.overlap_kept_range tstzrange` (nullable, no default: no rewrite); constraint `booking_legs_chauffeur_no_overlap` rebuilt with one more WHERE term; triggers `booking_legs_kept_clear`, `booking_legs_kept_guard` (functions `app.tg_leg_kept_clear`, `app.tg_leg_kept_guard`) |
| Replaced, same signature | `booking_edit_apply_payload` (from P1's body), `manage_money_for` (+ key `last_change`) |
| New (EXECUTE `vamos_system` only, SECURITY DEFINER, `search_path ''`) | `booking_staff_trip_change`, `booking_change_request_facts`, `booking_staff_contact_update`, `booking_cancel_resend_facts` (D20, read only) |
| New helper (no grant) | `app.booking_change_mint_trip_snapshot` |

**Safe on real paid bookings: yes.** No row is inserted, updated or deleted, and there is no backfill. The new column
is null on every row, so the rebuilt rule selects exactly the rows the old one did and cannot fail. If it ever did,
the whole file rolls back with the old rule in place. The rebuild holds a lock on `booking_legs` for milliseconds.

**Read on live before (read-only, 2026-10-02):** the old rule is in place; none of the P6 functions or triggers
exist; 39 legs, **0** counted by the rule (no assigned active driver). Live `booking_edit_apply_payload` has md5
`9cc40aaa…` (exactly P1's body in `20261007140000`) and `manage_money_for` has md5 `133c5928…` (exactly
`20260930190000`), so P6 replaces exactly what is live. Main's `20261007180000` (live) touches no P6 object, so
applying `150000` after it gives the same result as the from-empty order.

**Order (control session):** apply the file verbatim → read back (below) → deploy Worker `vamos` with `--env staging`.
The old Worker keeps working on the new database (same signatures; `manage_money_for` only gains a key).

**Read-back after applying, expected values from the from-empty replay of this exact file:**

```sql
select n.nspname || '.' || p.proname as fn, md5(p.prosrc) as src_md5, p.prosecdef, p.proconfig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname, p.proname) in (('public','booking_edit_apply_payload'),('public','manage_money_for'),
   ('public','booking_staff_trip_change'),('public','booking_change_request_facts'),('public','booking_staff_contact_update'),
   ('public','booking_cancel_resend_facts'),('app','booking_change_mint_trip_snapshot'),('app','tg_leg_kept_clear'),('app','tg_leg_kept_guard'))
 order by 1;
select md5(pg_get_constraintdef(c.oid)) from pg_constraint c where c.conname = 'booking_legs_chauffeur_no_overlap';
select string_agg(tgname, ',' order by tgname) from pg_trigger
 where tgrelid = 'public.booking_legs'::regclass and tgname like 'booking_legs_kept%';
select routine_name, string_agg(distinct grantee, ',' order by grantee) from information_schema.routine_privileges
 where routine_schema = 'public' and privilege_type = 'EXECUTE' and routine_name in ('booking_staff_trip_change',
   'booking_change_request_facts','booking_staff_contact_update','booking_cancel_resend_facts','booking_edit_apply_payload','manage_money_for')
 group by 1 order by 1;
select count(*) as legs, count(*) filter (where overlap_kept_range is not null) as kept from public.booking_legs;
```

| Function | md5(prosrc) |
|---|---|
| app.booking_change_mint_trip_snapshot | `b8c8719ca2350b0eaf4c0bff327f4485` |
| app.tg_leg_kept_clear | `a42bfd1de90f79fc92d1e3166a748d0c` |
| app.tg_leg_kept_guard | `e9247f21d43fe390829d54871f31ed55` |
| public.booking_cancel_resend_facts | `eca073b8be936ebd2b4b2f4d1376a7a3` |
| public.booking_change_request_facts | `5ea17121c020fbfc4429ef8ffcfd4866` |
| public.booking_edit_apply_payload | `dcc02160189371a58d6146168c92928c` |
| public.booking_staff_contact_update | `50e3257ba993273589db0bcfdd4a6a66` |
| public.booking_staff_trip_change | `ee50365ece0fe7c504b8f13136493505` |
| public.manage_money_for | `b3d2f0262d0dfd3e2744f7390dccb6a0` |

All nine: `prosecdef = true`, `proconfig = {search_path=""}`. Rule md5 `9605dc334749216579486eaa39c39a1e`. Triggers
`booking_legs_kept_clear,booking_legs_kept_guard`. EXECUTE: the four new public functions and
`booking_edit_apply_payload` → `postgres, service_role, vamos_system` on hosted (the local replay shows them without
`service_role`, Supabase's hosted default; live already shows it on `booking_edit_apply_payload`); `manage_money_for`
→ `postgres, service_role` (unchanged). Legs: `39` (or more, if new bookings arrived) and `kept = 0`.

## Checks (final tree `09a97ca4`, after `node scripts/sync-dc-mock-to-public.mjs`)

| Check | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass: 0 errors, 6 warnings, all in files this job did not touch |
| `pnpm lint:css` | pass |
| `pnpm i18n:check` | pass (2685 keys) |
| `pnpm check:legal-claims` | pass (3 checks) |
| `pnpm check:numbers` | pass |
| `pnpm check:db-fences` | pass (8 checks, 1094 files) |
| `pnpm check:public-env` | pass before the build; pass (built client bundle scanned) after the Worker build |
| `pnpm db:seed:check` | no drift (seed.sql unchanged by this job; no re-pin needed) |
| `pnpm test:unit` | pass: web 367 files / 3687 tests (9 local-database files skipped without a port), emails 14 / 179, db 2 / 14 |
| `pnpm build` | pass; `…/change/preview`, `…/change/withdraw`, `/api/manage/resend`, `/api/account/bookings/resend` in both mounts |
| From-empty replay + full pgTAP (own stack `vamos-taxi-p6b`, ports 624xx) | 128 migrations; **95 files / 2430 tests pass** (P6 file 131) |
| Types (`pnpm exec supabase` 2.115.0, `gen types --local` on that stack) = `database.types.ts` | identical (the `db:types:check` command itself targets port 54322, which this job must not use; the same command ran with `--workdir`) |
| Worker-client database tests on the same replay | 8/8: trip-change, trip-change-patch, customer-paths (now with D20 on the real database), booking-change, refund-by-hand, assign, chauffeur-delete, system-reads |
| Chromium on the local Worker build (`p6-run.sh`, nothing stubbed in the Worker; Stripe, Mapbox, Resend, Turnstile are local stand-ins) | **37 lines, 37 PASS, 0 FAIL** in one run on the merged final tree (O1–O8 dashboard, C1–C7 site, widths 390/768/1024/1440, English and Arabic RTL, no page errors). Lines and evidence: `WORKER-RUN.md` |

## Not verified

- Nothing applied on the hosted database; no real Stripe page, refund, Mapbox or Resend call (local stand-ins).
- The real payment of a difference → new place written: proven by the Worker-client test on a real database
  (`trip-change.local`), not by a browser payment.
- D14 / D15 / D21 in German, French and Arabic are your approved texts, not read by a native speaker. D21's fr and ar
  were written "in the same words" as you chose: fr "La course a été modifiée et coûte maintenant moins cher. Rien
  n’est envoyé avant votre confirmation." ar "عُدّلت الرحلة وأصبحت أرخص الآن. لا يُرسَل شيء قبل تأكيدك."
- A trip cancelled before it was ever paid (only reachable from a signed-in account) has no cancellation e-mail to
  resend: "Resend email" there answers "Could not send that request.".
- The amounts in `WORKER-RUN.md` come from the local test price book of the fixture, not from Vamos prices.

## Seen, not changed (outside P6; your call)

1. Dashboard Assign refusal prints the raw time: "Overlaps VT-… at 2026-10-01T22:59" (since phase 08).
2. After a cancel, the manage page keeps the booking view and still offers "Change this booking" (`isCancelled` is
   fixed to false; the cancelled view and its "Resend confirmation" button never show).
3. The customer's date picker opens on the current month, not the booked month.
4. The mail ledger refuses kind `flight_no` (logged, the number is still saved; open since 09-06).

## Owner UAT (after the control session applied the migration and deployed)

Use paid test bookings. The 4242 payment comes first.

1. Dashboard: open a paid test booking → ACTIONS → Edit booking → Pickup: type "Zug", pick it. Expected: "What
   changes: Pickup old → new", Paid so far, New total, DIFFERENCE TO PAY.
2. CONTINUE → "Change the trip?" → CHANGE THE TRIP. Expected: "The customer was e-mailed the link to pay CHF …. The
   trip changes when it is paid."; the booking still shows the old pickup.
3. Open the e-mail at the booking's address. Expected: subject "Your Vamos Taxi booking VT-…: pay the difference",
   "New pickup: …", new total, paid, difference, button "Pay the difference".
4. Pay with 4242 4242 4242 4242 (any future date, any CVC). Expected: within a minute the booking shows the new
   pickup and the confirmation arrives again.
5. Control session: read `booking_payments` of that booking by status. Expected: two `succeeded` rows.
6. Another paid test booking → Edit → Destination: a nearer place → CONTINUE → CHANGE THE TRIP. Expected: "Trip
   changed. Refund due: CHF …"; the Refund due panel says "The trip was changed and costs less now. Nothing is sent
   until you confirm." (D21) with exactly the difference.
7. Open that booking's manage link. Expected under the status: "Your trip has changed. The difference of CHF … comes
   back to the payment method you used; our team sends it." Switch Deutsch, Français, العربية: your D15 text.
8. Dashboard: Confirm refund. Expected: exactly the difference refunded; after reload the customer line is gone.
9. A paid test booking with a driver → Edit → Time two hours later → CONTINUE → CHANGE THE TRIP. Expected: "No new
   price…", then "Trip changed…"; the driver gets the time-change e-mail.
10. Give that driver a second test trip one hour later; Edit the first to overlap it. Expected: "… has another trip at
    that time — VT-…" with Keep / Take off. Pick **Keep** → CHANGE THE TRIP. Expected: both trips keep the driver.
11. On the *other* trip of step 10 press Complete. Expected: it completes (this failed before the D17 fix).
12. Edit → Mobile and Note → SAVE CHANGES. Expected: "Saved. The change is in the history."; no e-mail.
13. Airport pickup with a driver → Edit → Flight number → SAVE CHANGES. Expected: the driver gets the flight-number
    e-mail.
14. vamostaxi.site, open a paid test booking from its e-mailed link (not signed in) → Cancel this transfer → Confirm
    cancellation. Expected: the booking is cancelled (before the fix: "Could not cancel this booking.").
15. Same page → Resend email. Expected: "Sent. Check … in a minute or two." and the **cancellation** e-mail ("Booking
    VT-… is cancelled") arrives, not "Booked — VT-…" (D20).
16. Signed in → a test booking → flight Save, Resend email, Change this booking → another day and time → Request these
    changes. Expected: "Flight number saved.", "Sent. Check …", "Time-change requested." with the new day.

UAT and Ship are your word.

## State at hand-over

Local Supabase stack `vamos-taxi-p6b` stopped (`--no-backup`). Workers and stand-ins stopped; `.dev.vars` removed;
build output removed. The worktree folder stays for the controller to remove after the ship.
