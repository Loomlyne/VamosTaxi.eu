-- 20260914210000_vehicle_class_brand_photos.sql
--
-- Seed each existing class with the brand photograph it already had
-- (assets/photography/class-{slug}.jpg), stored on R2 under classes/.
-- Completeness (D-30) requires photo_path. Never SET public_chf.
-- Never restore onto yaumjzvylngfjhtuffqs.

update public.vehicle_classes
   set photo_path = 'classes/' || id::text || '/brand.jpg'
 where slug in ('economy', 'business', 'first', 'van')
   and (
        photo_path is null
     or photo_path <> ('classes/' || id::text || '/brand.jpg')
   );
