-- 26.1-class-names.sql
--
-- Owner applies in the SQL editor after the migration 20260928160000_vehicle_class_delete_or_hide.sql.
-- Data only. Safe to run twice.
--
-- 26.1-19 (D-14, D-14a). The three classes are Economy, Business, Van luxury. Only the
-- display names change: slugs stay, because bookings, snapshots and rate rows reference the
-- ids and the inactive `economy` / `business` slugs already exist. Names are product names
-- and stay in Latin letters in every language (ADR-012).
--
--   saden                  "Saden"      -> "Economy"
--   mercedes-benz-v-class  "Van"        -> "Business"
--   van-luxury             "Van luxury"    unchanged
--
-- First and mahaha are not touched here. The owner removes them through the dashboard after
-- Ship (26.1-28): a class nothing references is deleted; a referenced one asks for a reason
-- and is hidden everywhere (D-15).

update public.vehicle_classes set name = 'Economy'  where slug = 'saden'                 and name is distinct from 'Economy';
update public.vehicle_classes set name = 'Business' where slug = 'mercedes-benz-v-class' and name is distinct from 'Business';

-- Read-back (read-only).
select slug, name, active, hidden_at
  from public.vehicle_classes
 order by sort_order;
