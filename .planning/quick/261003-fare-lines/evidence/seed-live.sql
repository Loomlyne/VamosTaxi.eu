-- Scratch stack vamos-taxi-fl only. A live price book from the repo's e2e fixture figures
-- (booking-change-price.test.ts / trip-change fixture: internal integer rappen, never a product price).
begin;
update public.vehicle_classes set name = 'Economy', passenger_capacity = 4, luggage_capacity = 4 where slug = 'economy';
update public.vehicle_classes set name = 'Business', passenger_capacity = 7, luggage_capacity = 7 where slug = 'business';
update public.vehicle_classes set name = 'Van luxury', passenger_capacity = 12, luggage_capacity = 9 where slug = 'van';

update public.distance_rates d set base_fare_rappen = 1000, per_km_rappen = 300, airport_start_rappen = 1500, max_pax = 4, available = true
  from public.vehicle_classes vc where vc.id = d.vehicle_class_id and vc.slug = 'economy';
update public.distance_rates d set base_fare_rappen = 1200, per_km_rappen = 420, airport_start_rappen = 1800, max_pax = 7, available = true
  from public.vehicle_classes vc where vc.id = d.vehicle_class_id and vc.slug = 'business';
update public.distance_rates d set base_fare_rappen = 1400, per_km_rappen = 510, airport_start_rappen = 2100, max_pax = 12, available = true
  from public.vehicle_classes vc where vc.id = d.vehicle_class_id and vc.slug = 'van';

update public.surcharges set active = false where code <> 'child_seat';
update public.surcharges set active = true, amount_rappen = 700 where code = 'child_seat';

-- A city pair Kloten <-> Zug (the Mapbox stand-in names Zurich Airport's city Kloten), one extra per class.
insert into public.service_zones (slug, zone_type, tags)
values ('fl-kloten', 'city', array['mapbox_place:city-kloten']), ('fl-zug', 'city', array['mapbox_place:city-zug']);
insert into public.fixed_routes (rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id, price_rappen, live)
select 1, (select id from public.service_zones where slug = 'fl-kloten'), (select id from public.service_zones where slug = 'fl-zug'),
       vc.id, case vc.slug when 'economy' then 800 when 'business' then 900 else 1000 end, true
  from public.vehicle_classes vc;

update public.rate_versions set status = 'live' where id = 1;
update public.settings set public_chf = true where id = 1;
commit;
