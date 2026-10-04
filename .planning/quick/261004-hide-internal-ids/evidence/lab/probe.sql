select id, status from public.bookings order by created_at limit 3;
select booking_id, id from public.price_snapshots limit 3;
select count(*) from public.booking_payments;
select count(*) from public.reviews;
