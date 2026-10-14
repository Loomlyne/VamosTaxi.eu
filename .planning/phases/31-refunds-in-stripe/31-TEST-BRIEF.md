---
worktree: /Users/koss/.t3/worktrees/VamosTaxi.eu/phase-31-refunds-in-stripe
branch: phase-31-refunds-in-stripe
commit: 89e68ca8 (merge of origin/main; the tip at dispatch adds only docs, this brief and the refund-mail footer fix: `git -C <worktree> log --oneline -3`)
lab: p31-refunds
evidence: /Users/koss/.t3/worktrees/VamosTaxi.eu/phase-31-refunds-in-stripe/.planning/phases/31-refunds-in-stripe/evidence
---

# Test brief: Refund in Stripe on the dashboard, signed refund lines on the customer pages (Phase 31)

Written by the lead (Opus); run by `vamos-tester` (Sonnet). Run it exactly; reply with PASS / FAIL / BLOCKED per step; the lead saves the reply as `RESULT.md` in the evidence folder.

## What changed

Refunds move to Stripe. On the dashboard booking detail (`app/ops/OpsDetail.dc.html`, inside the console shell `app/ops/ops.dc.html`) an admin on a paid booking gets **Actions > Refund in Stripe**: disabled until `GET /api/staff/bookings/{id}/stripe-payments` answers, then one payment opens its Stripe page in a new tab, several show a "Which payment?" list of OPEN IN STRIPE links, none shows "This booking has no Stripe payment to open.". A cancelled paid booking with no recorded refund shows the neutral note "Refund to check" until Stripe records a refund or the pickup has passed; there is no Confirm / Decline refund and the page sends no refund. Customers (`app/pages/manage-booking.dc.html`, `app/pages/booking-detail.dc.html`, `app/vamos-manage-ticket.js`, `app/vamos-i18n-dict.js`) read one signed line in the cancel sheet and one in the Refund row, with no amount and no "Stripe".

## Gates

`scripts/test-lab/lab.sh gates`. The lead runs the full `pnpm gate:local` separately; do not run it.

## Setup beyond the lab

Lab copy only (p31-refunds, its own native stack on 127.0.0.1); never live, never a hosted database.

1. `scripts/test-lab/lab.sh up p31-refunds` from the worktree (rebuilds the Worker if the tip is newer). Then `eval "$(scripts/test-lab/lab.sh env p31-refunds)"`. `<PUB>` = `$LAB_BASE`, `<DASH>` = `$LAB_DASH`. Dashboard admin: `$LAB_ADMIN_FILE` (never print the password).
2. Fixtures (a)-(f): save the SQL below as `<evidence>/setup.sql` and run `"$LAB_PSQL" "$LAB_DB_URL" -X -v ON_ERROR_STOP=1 -f <evidence>/setup.sql`. It runs twice safely. The last statement prints six rows; check them against this table before any step:

   | fixture | reference | status / refund_status | pickup | payments (succeeded / pi_) | refunds |
   |---|---|---|---|---|---|
   | (a) one pi_ payment | VT-99-31301 | confirmed / none | +72 h | 1 / 1 | 0 |
   | (b) trip + extra, two pi_ payments | VT-99-31302 | confirmed / none | +72 h | 2 / 2 | 0 |
   | (c) payment without a pi_ id | VT-99-31303 | confirmed / none | +72 h | 1 / 0 | 0 |
   | (d) cancelled, refund pending, pickup ahead | VT-99-31304 | cancelled / pending_ops | +72 h | 1 / 1 | 0 |
   | (e) cancelled, refund pending, pickup passed | VT-99-31305 | cancelled / pending_ops | -2 h | 1 / 1 | 0 |
   | (f) cancelled, refund recorded | VT-99-31306 | cancelled / refunded | +72 h | 1 / 1 | 1 |

   Payment intent ids: (a) `pi_lab_p31_a`, (b) `pi_lab_p31_b` and `pi_lab_p31_b_extra`, (d) `pi_lab_p31_d`. Manage link for (a): raw token `MTIzNDU2Nzg5Ojs8PT4_QEFCQ0RFRkdISUpLTE1OT1A` (`<PUB>/manage-booking?token=<raw>`).

   ```sql
    -- Phase 31 test brief fixtures. LAB COPY ONLY (p31-refunds, 127.0.0.1 own stack); never live.
    -- Six bookings VT-99-31301..31306 = fixtures (a)..(f). Amounts are 1-3 rappen stand-ins, never prices.
    -- Runs twice safely: a second run finds VT-99-31301 and changes nothing (except (d)'s contact e-mail, below).
    -- (d) carries the lab customer's e-mail: the account booking view matches lower(contact_email), not customer_id.
    begin;
    set local session_replication_role = replica;  -- fixtures only: skip the quote-clock and status triggers
    do $$
    declare
      f record; b uuid; s bigint; s2 bigint; p bigint; p2 bigint;
      vc uuid := (select id from public.vehicle_classes where slug = 'economy');
      rv bigint := (select id from public.rate_versions where status = 'live' order by id desc limit 1);
      sv bigint := (select id from public.settings_versions order by id desc limit 1);
    begin
      if exists (select 1 from public.bookings where reference = 'VT-99-31301') then
        raise notice 'p31 fixtures already there'; return;
      end if;
      for f in select * from (values
          ('a', 'VT-99-31301', 'confirmed', 'none',        0, interval '72 hours'),
          ('b', 'VT-99-31302', 'confirmed', 'none',        0, interval '72 hours'),
          ('c', 'VT-99-31303', 'confirmed', 'none',        0, interval '72 hours'),
          ('d', 'VT-99-31304', 'cancelled', 'pending_ops', 0, interval '72 hours'),
          ('e', 'VT-99-31305', 'cancelled', 'pending_ops', 0, interval '-2 hours'),
          ('f', 'VT-99-31306', 'cancelled', 'refunded',    3, interval '72 hours')
        ) as t(k, ref, st, rs, refunded, at)
      loop
        insert into public.bookings (reference, contact_name, contact_email, status, locale, refund_status, refunded_rappen)
        values (f.ref, 'Lab ' || upper(f.k),
                case when f.k = 'd' then 'lab-p31-cust@vamos.local' else 'lab-p31-' || f.k || '@vamos.local' end,
                f.st::public.booking_status, 'en', f.rs, f.refunded)
        returning id into b;
        insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text, scheduled_at,
                                         scheduled_local, original_scheduled_at, vehicle_class_id, status, pax, bags)
        values (b, 1, 'outbound', 'Zurich Airport', 'Zug', now() + f.at,
                to_char((now() + f.at) at time zone 'Europe/Zurich', 'YYYY-MM-DD"T"HH24:MI'), now() + f.at,
                vc, (case when f.st = 'cancelled' then 'cancelled' else 'confirmed' end)::public.booking_status, 2, 1);
        insert into public.price_snapshots (quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
                                            engine_version, pax, bags, lines, policy, subtotal_rappen, surcharges_rappen,
                                            discount_rappen, total_rappen, expires_at, quote_lock_expires_at, booking_id, source,
                                            distance_km, duration_min)
        values (gen_random_uuid(), vc, rv, true, sv, 'quote-engine@p31-lab', 2, 1,
                '[{"seq":1,"leg_seq":1,"code":"distance_fare","kind":"fare","i18n_key":"price.line.transfer","amount_rappen":2},
                  {"seq":2,"leg_seq":1,"code":"vat","kind":"vat","i18n_key":"price.line.vat","params":{"vatRateBps":81},"amount_rappen":1}]'::jsonb,
                jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24, 'airport_waiting_minutes', 60,
                                   'city_waiting_minutes', 15, 'settings_version_id', sv, 'modification_deadline_hours', 24,
                                   'min_advance_minutes', 180, 'policy_doc', 'test', 'extras', '[]'::jsonb),
                3, 0, 0, 3, now() - interval '1 day', now() - interval '1 day', b, 'web', 31.4, 40)
        returning id into s;
        update public.bookings set price_snapshot_id = s, price_total_rappen = 3 where id = b;
        -- (c) has a succeeded payment without a pi_ id; every other fixture has one pi_ payment.
        insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
        values (b, s, case when f.k = 'c' then 'lab_nopi_p31_c' else 'pi_lab_p31_' || f.k end, 3, 'succeeded', now() - interval '3 hours')
        returning id into p;
        if f.k = 'b' then  -- (b) second payment: an extra fare paid through an accepted change request
          insert into public.price_snapshots (quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
                                              engine_version, pax, bags, lines, policy, subtotal_rappen, surcharges_rappen,
                                              discount_rappen, total_rappen, expires_at, quote_lock_expires_at, booking_id, source,
                                              distance_km, duration_min)
          select gen_random_uuid(), vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id, engine_version, pax, bags,
                 lines, policy, 2, 0, 0, 2, expires_at, quote_lock_expires_at, booking_id, source, distance_km, duration_min
            from public.price_snapshots where id = s
          returning id into s2;
          insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
          values (b, s2, 'pi_lab_p31_b_extra', 2, 'succeeded', now() - interval '1 hour')
          returning id into p2;
          insert into public.booking_edit_requests (booking_id, actor, payload, quote_snapshot_id, extra_snapshot_id, status,
                                                    extra_payment_id, accepted_at)
          values (b, 'customer', '{}'::jsonb, s2, s2, 'accepted', p2, now() - interval '1 hour');
        end if;
        if f.k = 'f' then  -- (f) the refund Stripe recorded
          insert into public.booking_refunds (booking_id, snapshot_id, payment_id, reason, basis_rappen, refund_percent,
                                              refund_rappen, tier_applied, hours_before, stripe_refund_id)
          values (b, s, p, 'stripe_dashboard', 3, 100, 3, '{}'::jsonb, 72, 're_lab_p31_f');
        end if;
      end loop;
      -- manage link for (a): raw token MTIzNDU2Nzg5Ojs8PT4_QEFCQ0RFRkdISUpLTE1OT1A
      insert into public.booking_access_tokens (booking_id, token_hash, purpose, expires_at)
      select id, decode('fbc974481bd2003e2d7b74f87e5e7ac36b2ef340492ec827703b415c662b5840', 'hex'), 'manage', 'infinity'
        from public.bookings where reference = 'VT-99-31301'
      on conflict do nothing;
    end $$;
    -- (d) on a database made by an earlier version of this file: same e-mail, idempotent.
    update public.bookings set contact_email = 'lab-p31-cust@vamos.local'
     where reference = 'VT-99-31304' and contact_email is distinct from 'lab-p31-cust@vamos.local';
    commit;
    select b.reference, b.status, b.refund_status, b.refunded_rappen,
           (select min(l.scheduled_at) > now() from public.booking_legs l where l.booking_id = b.id) as pickup_future,
           (select count(*) from public.booking_payments p where p.booking_id = b.id and p.status = 'succeeded') as payments,
           (select count(*) from public.booking_payments p where p.booking_id = b.id and p.stripe_payment_intent_id like 'pi\_%') as pi_payments,
           (select count(*) from public.booking_refunds r where r.booking_id = b.id) as refunds
      from public.bookings b where b.reference like 'VT-99-313%' order by b.reference;
   ```

3. Customer account for (d) (C3, C4, C7, C8): make the user through the lab stack's admin API exactly as `lab.sh make_admin` does (service key and API URL from `$LAB_STATE/sb.env`): email `lab-p31-cust@vamos.local`, a password you generate, `email_confirm: true`; on 422 (already there) set a new password on that user with PUT. Keep the password in `$LAB_STATE/customer.txt` (chmod 600) and never print it. The sign-up trigger makes the `public.customers` row. Then link (d): `update public.bookings set customer_id = (select id from public.customers where email = 'lab-p31-cust@vamos.local') where reference = 'VT-99-31304';` and check `select customer_id is not null, contact_email from public.bookings where reference = 'VT-99-31304'` = `t | lab-p31-cust@vamos.local` (the account booking view matches bookings on `lower(contact_email)` = the signed-in e-mail, `apps/web/app/api/account/bookings/route.ts` and `.../details/route.ts`, not on `customer_id`; `setup.sql` sets the e-mail). Sign in on `<PUB>/sign-in` with email and password; the account booking view is `<PUB>/booking-detail?ref=VT-99-31304`.
4. Dashboard: sign in at `<DASH>/login` with the admin from `$LAB_ADMIN_FILE`; a booking opens at `<DASH>/bookings/<reference>` (the real console shell, not OpsDetail alone). Record every request of each dashboard page (Playwright `page.on('request')`) for D9.
5. Languages: switch with the page's own language control or `VamosLocale.setLang(lang)` in the page; never reload to apply a language. Width checks: `document.documentElement.scrollWidth === document.documentElement.clientWidth`.

## Steps

Expected strings are quoted exactly; the dashboard strings are the `T` tables of `app/ops/OpsDetail.dc.html` (en line ~811, de ~928, fr ~1029, ar ~1149), the customer strings are `.planning/decisions/2026-10-12-refund-wording-signed.md` W1 and W2. Screenshot every step as `<id>.png` in the evidence folder.

| id | viewport | language | action in plain words | expected result |
|---|---|---|---|---|
| D1 | 1440 | en | Dashboard, open (a) VT-99-31301. Open Actions right away and read the Refund in Stripe item; wait for the `/stripe-payments` response, open Actions again, click Refund in Stripe | before the `/stripe-payments` response the item is disabled (`aria-disabled="true"` or `disabled`); after it, the click opens exactly one new page (Playwright `context.waitForEvent('page')`) whose URL starts with `https://dashboard.stripe.com/` and contains `pi_lab_p31_a`; the booking page stays open and shows no "Which payment?" |
| D2 | 1440 | en | Dashboard, open (b) VT-99-31302, wait for `/stripe-payments`, Actions > Refund in Stripe | "Which payment?" visible; `[data-ops-stripe-row]` count = 2; every OPEN IN STRIPE link in those rows has `target="_blank"` and a `rel` containing `noopener`; their `href`s start with `https://dashboard.stripe.com/` and contain `pi_lab_p31_b_extra` and `pi_lab_p31_b` |
| D3 | 1440 | en | Dashboard, open (c) VT-99-31303, wait for `/stripe-payments`, Actions > Refund in Stripe | the text "This booking has no Stripe payment to open." is visible; no new page opened |
| D4 | 1440 | en | Dashboard, open (d) VT-99-31304 | "Refund to check" visible; page text contains neither "Confirm refund" nor "Decline refund" (case-insensitive) |
| D5 | 1440 | en | Dashboard, open (e) VT-99-31305 | "Refund to check" absent from the page text |
| D6 | 1440 | en | Dashboard, open (f) VT-99-31306 | "Refund to check" absent; "Refund issued" visible (the existing success Alert, OpsDetail `refundedTitle`) |
| D7 | 390 | ar | Dashboard at 390, Arabic, open (b), wait for `/stripe-payments`; open the top-bar menu (`[data-ops-fold]`) and click the Refund in Stripe item there (`الاسترداد في Stripe`) | the item sits in the top-bar menu (not a separate on-page Actions button); the list "أي دفعة؟" shows 2 `[data-ops-stripe-row]`; in each row the OPEN IN STRIPE link's top is below the row text's bottom or the row text wraps (rows wrap, no clipping); `scrollWidth === clientWidth` |
| D8 | 1440 | ar | Dashboard, Arabic, open (d) | visible text contains `استرداد للمراجعة` and `أُلغي الحجز وعليه دفعة مسجّلة. إذا كانت سياسة الإلغاء تتيح استردادًا، فنفّذه في Stripe. تعرضه هذه الصفحة بمجرد أن يسجّله Stripe.`; `document.dir === 'rtl'` |
| D9 | — | — | Read the request log of D1-D8 | no request path ends in `/refund` or `/refund-decision` (any method); at least one `GET` ends in `/stripe-payments` |
| D10 | 1024 | de | Dashboard at 1024, German, open (b), wait for `/stripe-payments`, open Actions | the menu item reads `In Stripe rückerstatten`; click it: "Welche Zahlung?" visible, 2 `[data-ops-stripe-row]`, the row buttons read `In Stripe öffnen` (any case); `scrollWidth === clientWidth` |
| D11 | 768 | en | Dashboard at 768, open (a), wait for `/stripe-payments`; find Refund in Stripe (in Actions, or in the top-bar menu if the page folds at this width) and click it; then open (d) | the click opens one new page whose URL starts with `https://dashboard.stripe.com/` and contains `pi_lab_p31_a`; on (d) "Refund to check" visible; `scrollWidth === clientWidth` on both |
| D12 | 1440 | de, fr, ar | Dashboard (real shell), for each of de, fr, ar: `VamosLocale.setLang(lang)`; on (b) with the list open run `VamosLocale.coverage(document.querySelector('[data-ops-refund-region]'))` and, with the Actions menu open, `VamosLocale.coverage(<the open Actions menu element>)`; on (d) run `VamosLocale.coverage(<the Alert holding the Refund to check note>)`; that note sits in an Alert outside `[data-ops-refund-region]`, so coverage is called on the Alert | every call returns an empty list (9 calls; report each result) |
| C1 | 1440 | en | Open `<PUB>/manage-booking?token=MTIzNDU2Nzg5Ojs8PT4_QEFCQ0RFRkdISUpLTE1OT1A` (booking (a), paid, inside the free window); open "Cancel this transfer" so the cancel sheet shows; do not confirm | the sheet contains "This trip will be cancelled. Any refund follows the cancellation policy."; the sheet text contains no "CHF" and no "Stripe" |
| C2 | 390 | ar | Same link at 390 in Arabic, open the cancel sheet | the sheet contains `ستُلغى هذه الرحلة. يخضع أي استرداد لسياسة الإلغاء.`; no "CHF", no "Stripe" in the sheet; `scrollWidth === clientWidth` |
| C3 | 1440 | en | Signed in as `lab-p31-cust@vamos.local`, open `<PUB>/booking-detail?ref=VT-99-31304` | the Refund row reads "Refund follows the cancellation policy" |
| C4 | 390 | ar | Same page at 390 in Arabic | the Refund row reads `الاسترداد وفق سياسة الإلغاء`; `scrollWidth === clientWidth` |
| C5 | — | — | Read the page text of every customer step (C1-C4, C6-C8) | no step's page text contains "Stripe" (case-insensitive) |
| C6 | 1024 | de | Manage link of (a) at 1024 in German, open the cancel sheet | the sheet contains `Diese Fahrt wird storniert. Eine allfällige Rückerstattung richtet sich nach den Stornierungsbedingungen.`; no "CHF" in the sheet; `scrollWidth === clientWidth` |
| C7 | 768 | en | Signed in, `<PUB>/booking-detail?ref=VT-99-31304` at 768 | the Refund row reads "Refund follows the cancellation policy"; `scrollWidth === clientWidth` |
| C8 | 1440 | de, fr, ar | For each of de, fr, ar (`VamosLocale.setLang(lang)`): on manage-booking of (a) with the cancel sheet open, `VamosLocale.coverage(<the open cancel sheet root>)`; on booking-detail of (d), `VamosLocale.coverage(<the Refund row element>)` | every call returns an empty list (6 calls; report each result) |

## Out of scope

Design judgement, prices and amounts, the live site, Stripe's own pages (the new tab is only checked by its URL; do not sign in to Stripe), other pages and other dashboard actions. Do not cancel or refund anything, do not edit product code, tests or this brief.

## Stop conditions

Report BLOCKED instead of continuing when: the lab does not come up after one retry; `setup.sql` fails or its six rows differ from the table above (paste the psql error or the rows); the customer user cannot be made (paste the HTTP status, never the password); the Worker drops twice; a step cannot be run as written (say which part). When done: `scripts/test-lab/lab.sh down p31-refunds` (keep the stack; do not destroy).
