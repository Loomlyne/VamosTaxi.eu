-- 20260914191000_vehicle_class_any_photo.sql
--
-- Phase 18 restart D-29 D-30. Any kebab slug on vehicle_classes. Typed display
-- name and R2 photo_path on the class. quote_rate_book.classes is to_jsonb(c)
-- so the new columns appear on the live book after owner apply.
--
-- Hosted apply is owner-gated (18-07). Agent never apply_migration, never
-- supabase db push, never restore onto yaumjzvylngfjhtuffqs. Never default
-- public_chf true. Do not SET public_chf = true.

alter table public.vehicle_classes
  drop constraint if exists vehicle_classes_slug_check;

alter table public.vehicle_classes
  add constraint vehicle_classes_slug_kebab
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

alter table public.vehicle_classes
  add column if not exists name text,
  add column if not exists photo_path text;

comment on column public.vehicle_classes.name is
  'Display name typed in /pricing (D-29). Not an i18n key.';

comment on column public.vehicle_classes.photo_path is
  'R2 object key under classes/ (D-30). Null is incomplete — Publish 409.';

comment on column public.vehicle_classes.slug is
  'Unique kebab slug. Four-name CHECK dropped (D-29).';
