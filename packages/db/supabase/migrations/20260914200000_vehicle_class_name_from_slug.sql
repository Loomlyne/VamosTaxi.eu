-- 20260914200000_vehicle_class_name_from_slug.sql
--
-- Existing live classes had null name after 20260914191000. Publish 409'd
-- on empty name. Backfill display name from the kebab slug. Do not invent
-- photos. Never SET public_chf. Never restore onto yaumjzvylngfjhtuffqs.

update public.vehicle_classes
   set name = initcap(replace(slug, '-', ' '))
 where nullif(btrim(name), '') is null
   and nullif(btrim(slug), '') is not null;
