-- Chauffeur dialog stores the class the chauffeur has.
-- default_vehicle_id stays a vehicles FK. Do not write a class id there.

alter table public.chauffeurs
  add column if not exists vehicle_class_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chauffeurs_vehicle_class_id_fkey'
  ) then
    alter table public.chauffeurs
      add constraint chauffeurs_vehicle_class_id_fkey
      foreign key (vehicle_class_id)
      references public.vehicle_classes(id)
      on delete set null;
  end if;
end $$;

comment on column public.chauffeurs.vehicle_class_id is
  'Class this chauffeur has. Null when none. Not default_vehicle_id.';
