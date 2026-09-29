-- 20260930140000_extra_labels.sql
--
-- Plan 26.3-07 Task 3 (D-44, T-26.3-07-06): per-language display names for surcharges ("extras"),
-- keyed by surcharge code. Surcharges are frozen on a live rate version, so a name must not
-- live there: this table is independent of rate versions, and a name change never needs a
-- republished price book. Read is public (the checkout shows the names); write is admin only.

create table public.extra_labels (
  id bigint generated always as identity primary key,
  code text not null unique check (code ~ '^[a-z0-9_-]{1,64}$'),
  label_en text not null check (length(label_en) between 1 and 80),
  label_de text check (label_de is null or length(label_de) <= 80),
  label_fr text check (label_fr is null or length(label_fr) <= 80),
  label_ar text check (label_ar is null or length(label_ar) <= 80),
  machine_langs text[] not null default '{}'
    check (machine_langs <@ array['de', 'fr', 'ar']::text[]),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.extra_labels enable row level security;
revoke all on table public.extra_labels from public, anon, authenticated;

create trigger audit_extra_labels
  after insert or update or delete on public.extra_labels
  for each row execute function public.tg_audit_row();

comment on table public.extra_labels is
  'D-44: per-language extra names keyed by surcharge code. Independent of rate versions. Read through extra_labels_read(); write through staff_extra_label_upsert() (admin).';

create or replace function public.extra_labels_read()
returns setof public.extra_labels
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.extra_labels order by code
$$;

revoke all on function public.extra_labels_read() from public;
grant execute on function public.extra_labels_read()
  to anon, authenticated, vamos_checkout, vamos_system, vamos_staff;

create or replace function public.staff_extra_label_upsert(
  p_code text,
  p_en text,
  p_de text,
  p_fr text,
  p_ar text,
  p_machine_langs text[]
) returns public.extra_labels
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.extra_labels;
begin
  if not app.is_admin() then
    raise exception 'staff_extra_label_upsert: admin only' using errcode = '42501';
  end if;

  insert into public.extra_labels as e
    (code, label_en, label_de, label_fr, label_ar, machine_langs, updated_at, updated_by)
  values
    (p_code, btrim(p_en),
     nullif(btrim(coalesce(p_de, '')), ''),
     nullif(btrim(coalesce(p_fr, '')), ''),
     nullif(btrim(coalesce(p_ar, '')), ''),
     coalesce(p_machine_langs, '{}'), now(), app.uid())
  on conflict (code) do update
     set label_en = excluded.label_en,
         label_de = excluded.label_de,
         label_fr = excluded.label_fr,
         label_ar = excluded.label_ar,
         machine_langs = excluded.machine_langs,
         updated_at = now(),
         updated_by = app.uid()
  returning * into v_row;

  return v_row;
end
$$;

revoke all on function public.staff_extra_label_upsert(text, text, text, text, text, text[]) from public;
grant execute on function public.staff_extra_label_upsert(text, text, text, text, text, text[]) to vamos_staff;

comment on function public.staff_extra_label_upsert(text, text, text, text, text, text[]) is
  'D-44: admin upserts the four-language name of an extra by surcharge code (same admin check as the rate-book writes: app.is_admin()). EXECUTE: vamos_staff.';
