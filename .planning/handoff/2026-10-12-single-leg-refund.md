# Hand-over: single-leg cancel refunds the leg's own amount (2026-10-12)

Work session (Opus 5.5) for controller T3 thread `0fbbf0c1-980e-4de3-9345-e3c8fe69811b`. Branch `fix-single-leg-refund`, cut from `756a2ee9`, `origin/main` (`24c8ac80`, board note only) merged in. Nothing pushed to `main`, nothing applied to live, no deploy, no PR.

Builds `.planning/decisions/2026-10-11-single-leg-refund-own-subtotal.md`; closes GAP-3 of `04-VALIDATION.md` when it lands.

## What changed

One migration, `packages/db/supabase/migrations/20261013100000_single_leg_refund_own_subtotal.sql` (owner-assigned number), one transaction, no data change:

1. **New `app.leg_refund_basis(booking, leg_seq)`**: the leg's `price_snapshot_legs.leg_subtotal_rappen` in the booking's current snapshot (`bookings.price_snapshot_id`), minus its pro-rata share of `price_snapshots.discount_rappen`. Shares are rounded on the running total, so the legs always add up to subtotal - discount (3333 + 6667, discount 1001: 2999 + 6000). Null when the snapshot, the leg row or any leg subtotal is missing. Reads stored rows only (rule 4).
2. **New `app.compute_leg_cancellation_refund(booking, leg_seq)`**: same columns as `compute_cancellation_refund`. Hours run from that leg's own `original_scheduled_at`; the window is still `app.refund_free_window_hours`. auto_full refunds `least(leg basis, captured - greatest(owed, refunded))` (rule 3: captured counts no duplicate payments, same basis as today). If the leg is inside the window, or its amount is unknown, the result is pending_ops with a null amount (the admin decides). If nothing was captured, the result is none.
3. **`app.apply_customer_cancel`** (body of `20261007200000` with these changes): uses (2) only when `p_leg_seq` is set **and** the booking has more than one leg. On that path, owed = greatest(owed, refunded) + this leg's refund. A leg cancel that adds nothing new keeps `refund_status` and owed as they were. The event payload gains `refund_basis: "leg"` and `leg_basis_rappen`. Every other call goes through the old code path unchanged.
4. **`public.ops_refund_plan`** (body of `20261012160000` with these changes): this one is outside the brief, so check it. Without it, the dashboard Refund click on a leg-cancelled booking takes the full tier and refunds every payment in full: owed would say 6000, but Stripe would get 10000. The new rule applies to a booking with a `refund_basis = leg` cancel event that is pending_ops with owed > refunded. That booking refunds exactly owed - refunded, spread over its payments like the credit tier. No percentage other than 100 is accepted (invalid-amount). Reason is `customer_cancel`, tier is `full`, `decided_percent` is null. Every other booking runs the old code path.

`public.compute_cancellation_refund` is **not** changed. Whole-booking cancels and `ops_cancel_booking` still call it.

Grants, owners, SECURITY DEFINER and `search_path ''` match the live definitions, read on live 2026-10-12 (read-only):
- `apply_customer_cancel`: `{postgres=X}`, no grant.
- `ops_refund_plan`: `{postgres=X, vamos_system=X}`. The file re-states the same revoke and grant.
- The two new `app` functions: `revoke all from public`, no grant (same as `app.booking_paid_net`). Live gives `app` functions no service_role grant.

Also: GAP-3 row, QUOTE-11 row and sign-off line in `.planning/phases/04-quote-pricing-engine/04-VALIDATION.md`.

## Whole-booking cancel: no behaviour change

- `p_leg_seq` null: the same `compute_cancellation_refund` call, owed, status and event payload. The payload has no `refund_basis` key. Tests: 10000 auto_full, owed 10000, pending_ops inside the window from the earliest leg.
- Named leg of a **one-leg** booking: still booking-level (test: leg row 3000, 8000 captured, refund 8000).
- `ops_refund_plan` on a whole-cancelled booking: 10000, `full`, `ops_cancel`, as before (test).
- Full pgTAP suite (every existing refund, cancel, ACL and lock-order test) green.

## Live exposure (read-only SELECT, 2026-10-12)

The live database has 2 bookings, 0 bookings with more than one leg, 2 `price_snapshot_legs` rows with **null** `leg_subtotal_rappen`, and 0 `partially_cancelled` bookings. The Worker never passes `p_leg_seq`: `paid-cancel.ts` calls `manage_booking_cancel(token)` and `customer_paid_cancel(id)`. The checkout snapshot path writes no leg subtotal (`lock-to-rpc.ts`). So the new path cannot fire on live data today. When it does fire and the leg has no stored amount, the result is pending_ops (admin decides), never an automatic over-refund.

## Tests

- New `packages/db/supabase/tests/single_leg_refund_own_subtotal.test.sql`: **42 assertions, 42 pass**:
  - decision case: 8
  - rate book change, amount unchanged: 4
  - discount shared pro rata, including the uneven split: 6
  - window from leg 2's own time: 5
  - cap at captured: 2
  - two cancelled legs, sum capped: 5
  - no stored amount: 2
  - whole-booking cancel unchanged: 6
  - Refund click: 4
- Full pgTAP on own native lab stack `slr` after `db reset`: **PASS, Files=117, Tests=3478**.
- `pnpm gate:local` (once, at the end): **exit 0**. Lint 0 errors, 6 warnings (already on main). Unit: web 5969 passed / 52 skipped, emails 293, db 14. test:db-lab: db local 76, web .local 11 + 39, throwaway stack destroyed.

## Migration file

- md5 `7d91b79b617a13bcf843821ac78064df`, 729 lines. Apply verbatim after `20261012190000`. It has no dependency on `20261012320000` (REST revoke).
- `database.types.ts`: no change needed. The new functions are in `app`, and `public` signatures are unchanged.

## Risks / open points for review

1. **`ops_refund_plan` rewrite is outside the brief.** It is needed so the Refund click does not send more than the leg amount; please confirm it is wanted, or split it out.
2. **Dashboard picker (`apps/web/lib/ops/refund.ts`) not changed.** A leg-cancelled booking shows `fullTier` (it is not a credit tier, because its status is `partially_cancelled`/`cancelled`) with `dueRappen` = the leg amount. A blank Refund click (or 100 %) works: the database plans exactly the due. An exact amount smaller than a payment's remainder is refused by the TS `full-refund-only` check before it reaches the database. A safe refusal, not an over-refund.
3. **A leg inside the window (pending_ops) sets owed to null**, the same as today's semantics. If an earlier leg was owed and not yet refunded, that owed figure is cleared, and the admin decides the whole remaining refund (the event history keeps both figures). The admin's percentage in that case applies to each payment's charge, as today, not to the leg basis. This needs an owner word if the percentage should be of the leg.
4. **Leg basis = leg subtotal minus discount share only.** Booking-level surcharges or extras (if ever stored outside the leg subtotals) are not added. This follows the decision text literally.
5. **Marker is an event row.** `ops_refund_plan` detects "had a single-leg cancel" from `booking_events.payload ->> 'refund_basis' = 'leg'` (insert-only table). A whole cancel after a leg cancel sets owed = captured, as today, and is then refunded owed - refunded through the leg rule. That gives the same amount as the full tier, but a percentage other than 100 is refused.

## SQL diff of each rewritten function vs main

Comment-string lines are omitted from the diffs below; the new comments are in the file.

### `app.apply_customer_cancel` (main = `20261007200000_settle_safety.sql` lines 669-851)

```diff
--- main:apply_customer_cancel
+++ branch:apply_customer_cancel
@@ -31,6 +31,7 @@
   v_to public.booking_status;
   v_owed public.rappen;
   v_rs pg_catalog.text;
+  v_by_leg pg_catalog.bool;
 begin
   -- 261002 settle safety (P-1): the booking first, as every writer of a booking's change requests; the
   -- callers (manage_booking_cancel, customer_paid_cancel) already hold the lock, this one is defensive.
@@ -86,10 +87,23 @@
     from public.bookings as b
    where b.id = v.id;
 
-  select c.*
-    into v_comp
-    from public.compute_cancellation_refund(v.id) as c;
+  -- 20261013100000: one named leg of a booking with more than one leg refunds that leg's own amount.
+  -- Everything else (whole booking, or the only leg) is the booking-level refund, as before.
+  v_by_leg := p_leg_seq is not null
+              and (select pg_catalog.count(*)
+                     from public.booking_legs as l
+                    where l.booking_id = v.id) > 1;
 
+  if v_by_leg then
+    select c.*
+      into v_comp
+      from app.compute_leg_cancellation_refund(v.id, p_leg_seq) as c;
+  else
+    select c.*
+      into v_comp
+      from public.compute_cancellation_refund(v.id) as c;
+  end if;
+
   v_owed := v_comp.refund_rappen;
   -- 20-10: nothing goes to Stripe on a cancel. A paid booking cancelled more than 24 h
   -- ahead is left as "refund due": pending_ops with owed = captured; the team sends it.
@@ -101,6 +115,18 @@
     v_rs := 'none';
   end if;
 
+  if v_by_leg then
+    if v_comp.refund_mode = 'auto_full' and coalesce(v_comp.refund_rappen, 0) > 0 then
+      -- Rule 3: this leg's amount adds to what the booking already owes or has refunded.
+      v_owed := (greatest(coalesce(v.refund_owed_rappen, 0), coalesce(v.refunded_rappen, 0))
+                 + v_comp.refund_rappen)::public.rappen;
+    elsif v_comp.refund_mode <> 'pending_ops' then
+      -- Nothing new is owed: the booking keeps the refund state it had.
+      v_rs := v.refund_status;
+      v_owed := v.refund_owed_rappen;
+    end if;
+  end if;
+
   update public.bookings
      set refund_status = v_rs,
          refund_owed_rappen = v_owed,
@@ -160,6 +186,13 @@
       'refund_mode', v_comp.refund_mode,
       'refund_rappen', v_comp.refund_rappen
     )
+    || case
+         when v_by_leg then pg_catalog.jsonb_build_object(
+           'refund_basis', 'leg',
+           'leg_basis_rappen', v_comp.basis_rappen
+         )
+         else '{}'::pg_catalog.jsonb
+       end
   );
 
   booking_id := v.id;
@@ -180,4 +213,4 @@
 comment on function app.apply_customer_cancel(
   pg_catalog.uuid, pg_catalog.int2, pg_catalog.text, pg_catalog.text, pg_catalog.text
 ) is
```

### `public.ops_refund_plan` (main = `20261012160000_refund_ledger_mirroring.sql` lines 205-508)

```diff
--- main:ops_refund_plan
+++ branch:ops_refund_plan
@@ -29,6 +29,7 @@
   v_captured pg_catalog.int4;
   v_full pg_catalog.bool;
   v_credit pg_catalog.bool;
+  v_leg pg_catalog.bool;
   v_due_left pg_catalog.int4;
   v_tier pg_catalog.text;
   v_batch pg_catalog.uuid := pg_catalog.gen_random_uuid();
@@ -139,14 +140,26 @@
       detail = 'an exact amount needs one chosen payment';
   end if;
 
+  -- 20261013100000: a single-leg cancel left that leg's own amount due (pending_ops, owed > refunded).
+  v_leg := v_booking.refund_status = 'pending_ops'
+           and coalesce(v_booking.refund_owed_rappen, 0) > coalesce(v_booking.refunded_rappen, 0)
+           and exists (
+             select 1
+               from public.booking_events as e
+              where e.booking_id = v_booking.id
+                and e.kind = 'booking.status_changed'
+                and e.payload ->> 'refund_basis' = 'leg'
+           );
+
   -- 26.2 P1 credit: a change on a live booking left an amount due (pending_ops, owed > refunded).
-  v_credit := v_booking.refund_status = 'pending_ops'
+  v_credit := not v_leg
+              and v_booking.refund_status = 'pending_ops'
               and coalesce(v_booking.refund_owed_rappen, 0) > coalesce(v_booking.refunded_rappen, 0)
               and v_booking.status not in ('cancelled'::public.booking_status,
                                            'partially_cancelled'::public.booking_status,
                                            'refunded'::public.booking_status);
   v_due_left := case
-                  when v_credit then coalesce(v_booking.refund_owed_rappen, 0) - coalesce(v_booking.refunded_rappen, 0)
+                  when v_credit or v_leg then coalesce(v_booking.refund_owed_rappen, 0) - coalesce(v_booking.refunded_rappen, 0)
                   else 0
                 end;
 
@@ -155,13 +168,25 @@
       detail = 'a refund due from a change is an exact amount';
   end if;
 
-  v_reason := coalesce(p_reason, case when v_credit then 'modification_credit' else 'ops_cancel' end);
+  -- 100 % of a single-leg due is the due itself; any other percentage would be of the whole payment.
+  if v_leg and p_percent is not null and p_percent <> 100 then
+    raise exception 'invalid-amount' using errcode = '22023',
+      detail = 'a refund due from a single-leg cancel is an exact amount';
+  end if;
 
+  v_reason := coalesce(p_reason, case
+                                   when v_credit then 'modification_credit'
+                                   when v_leg then 'customer_cancel'
+                                   else 'ops_cancel'
+                                 end);
+
   -- Full tier: cancelled more than 24 h ahead, the whole refund is due, 100 % only.
   v_full := not v_credit
+            and not v_leg
             and v_booking.refund_status = 'pending_ops' and coalesce(v_booking.refund_owed_rappen, 0) > 0;
   v_tier := case
               when v_credit then 'credit'
+              when v_leg then 'full'
               when v_full or (p_percent is null and p_amount_rappen is null) then 'full'
               else 'decided'
             end;
@@ -194,7 +219,7 @@
     end if;
     v_any_left := true;
 
-    if v_credit then
+    if v_credit or v_leg then
       if v_due_left <= 0 then
         continue;
       end if;
@@ -233,7 +258,7 @@
     v_pct := case
                when v_credit then
                  pg_catalog.round(v_amt::pg_catalog.numeric * 100 / v_pay.charged_rappen, 2)
-               when v_full then null
+               when v_full or v_leg then null
                when p_percent is not null then p_percent
                when p_amount_rappen is not null then
                  pg_catalog.round(v_amt::pg_catalog.numeric * 100 / v_pay.charged_rappen, 2)
@@ -301,4 +326,4 @@
   pg_catalog.uuid, pg_catalog.uuid, pg_catalog.int8, pg_catalog.numeric, pg_catalog.text,
   pg_catalog.bool, pg_catalog.int4
 ) is
```

New functions (no main version): `app.leg_refund_basis`, `app.compute_leg_cancellation_refund`. They are in full at the top of the migration.

## Clean-up

Lab stack `slr` removed after the run (`lab.sh destroy slr`). No worktree build output left.
