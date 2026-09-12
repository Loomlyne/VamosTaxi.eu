-- 20260912000719_booking_lifecycle_reviews.sql
--
-- 09-03: reviews.booking_id + star columns + submit_review RPCs.
-- Hosted apply is 09-04, not this plan. Charge gate untouched. No CHF.

alter table public.reviews
  add column booking_id uuid references public.bookings(id) on delete restrict,
  add column rating_company smallint,
  add column rating_chauffeur smallint,
  add column rating_overall smallint,
  add column photo_path text,
  add constraint reviews_booking_id_key unique (booking_id),
  add constraint reviews_rating_company_check
    check (rating_company is null or rating_company between 1 and 5),
  add constraint reviews_rating_chauffeur_check
    check (rating_chauffeur is null or rating_chauffeur between 1 and 5),
  add constraint reviews_rating_overall_check
    check (rating_overall is null or rating_overall between 1 and 5);

comment on column public.reviews.booking_id is
  '09-03 D-21: unique one customer review per booking. Null for imported seed. ON DELETE RESTRICT.';
comment on column public.reviews.rating_company is
  '09-03 D-19: 1–5 required on customer submit; null for imported seed.';
comment on column public.reviews.rating_chauffeur is
  '09-03 D-19: 1–5 required on customer submit; null for imported seed.';
comment on column public.reviews.rating_overall is
  '09-03 D-19: 1–5 required on customer submit; null for imported seed. Copied onto rating for home.';
comment on column public.reviews.photo_path is
  '09-03 D-19: optional R2 object key. Upload is 09-12.';
comment on column public.reviews.published is
  'D-20: imported seed defaults true; customer submit_review inserts false. Ops publish/hide unchanged.';
