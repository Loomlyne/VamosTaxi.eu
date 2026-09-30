-- 20261007110000_extra_labels_prune.sql
--
-- 26.2 P4 part A, task A6 (owner decision 2026-09-30, question form: "anything deleted should be
-- deleted completely"). The four-language names of an extra (public.extra_labels, keyed by the
-- surcharge code) were never deleted: no delete path existed, and staff hold no table grant.
--
-- An extra lives in a price book row (public.surcharges). A name is still needed while the live
-- book or the draft uses that code. This function deletes every name whose code is used by no
-- surcharge row of a live or draft book. Retired books and bookings keep what they have: a
-- booking carries its extras' names inside its own price record.
--
-- Called by the dashboard after an extra is deleted from the draft, after a draft is discarded
-- and after a book is published (apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts and
-- rate-versions/[id]/{publish,discard}/route.ts). Admin only, same guard as
-- staff_extra_label_upsert. The audit trigger on extra_labels records each delete.

create or replace function public.staff_extra_labels_prune()
returns pg_catalog.int4
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted pg_catalog.int4;
begin
  if not app.is_admin() then
    raise exception 'staff_extra_labels_prune: admin only' using errcode = '42501';
  end if;

  delete from public.extra_labels as e
   where not exists (
     select 1
       from public.surcharges as s
       join public.rate_versions as rv on rv.id = s.rate_version_id
      where s.code = e.code
        and rv.status in ('live', 'draft')
   );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$$;

revoke all on function public.staff_extra_labels_prune() from public;
grant execute on function public.staff_extra_labels_prune() to vamos_staff;

comment on function public.staff_extra_labels_prune() is
  '26.2 P4 A6: deletes the four-language names of every extra whose code no live or draft price book uses. Admin only (app.is_admin()). EXECUTE: vamos_staff.';
