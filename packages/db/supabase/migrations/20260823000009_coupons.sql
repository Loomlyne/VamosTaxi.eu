-- 20260823000009_coupons.sql
--
-- DATA-01 / QUOTE-06: discount codes with a window and usage caps.
--
-- D-29 (U7, ADR-014 §6): coupon_redemptions is NOT in this file. An abandoned quote does not
-- burn a coupon use — redemption is consumed at PAYMENT, so coupon_redemptions FKs a
-- booking_payments row and lands as `...15_coupon_redemptions.sql`, after
-- `...14_payments_refunds.sql` in the migration order (packages/db/README.md's numbering
-- table). A soft KV reservation for the checkout window is Phase 7 work, not a schema concern.

create table public.coupons (
  id             bigint generated always as identity primary key,
  code           text not null unique check (code = upper(code)),
  kind           coupon_kind not null default 'percent',
  percent        numeric(5,2) check (percent between 0 and 100),
  amount_rappen  rappen check (amount_rappen >= 0),
  valid_from     timestamptz,
  valid_until    timestamptz,
  global_limit   integer check (global_limit >= 0),      -- NULL = unlimited
  per_user_limit integer check (per_user_limit >= 0),     -- NULL = unlimited
  active         boolean not null default true,
  note           text not null default '',
  created_at     timestamptz not null default now(),
  -- NULL is legal here, exactly as it is on `surcharges`: a discount value is part of the
  -- owner's unlanded CHF matrix (the mock seeds WELCOME / CORPORATE / SKI with value '00',
  -- app/vamos-ops-data.js:234-236). Requiring a number here would mean the only way to
  -- register a code before the discount is agreed is to invent one — the thing D-34 forbids
  -- outright. The non-NULL requirement lives where it belongs: the quote engine refuses to
  -- APPLY an unpriced coupon, and redemption re-checks it.
  constraint coupons_kind_field check (
       (kind = 'percent' and amount_rappen is null)
    or (kind = 'amount'  and percent is null)
  ),
  constraint coupons_window check (valid_until is null or valid_from is null or valid_until > valid_from)
);
comment on table public.coupons is 'Discount codes with a window and usage caps (QUOTE-06). The mock stored value as a string; here it is percent or rappen by kind.
D-29: redemptions consume at payment, in coupon_redemptions (Plan 02-06).';
