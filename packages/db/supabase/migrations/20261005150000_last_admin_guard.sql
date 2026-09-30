-- 20261005150000_last_admin_guard.sql
--
-- G17 (Phase 20): the last-admin rule lived only in the app (read the roster, then write), so two
-- admins removing each other at once, or any path that skips the route, could leave zero admins.
-- The database now refuses it.
--
-- "Active admin" = role 'admin', active, accepted_at set: the same rows app.is_admin() accepts
-- (20260901000001: unaccepted invites are not admins). A BEFORE UPDATE OF role, active / DELETE
-- row trigger takes one transaction-scoped advisory lock, then counts the OTHER active admins.
-- The lock makes two concurrent removals queue; the second re-reads after the first commits and
-- is refused. SECURITY DEFINER so the count sees every staff row whatever RLS shows the caller.
-- Error: SQLSTATE 23514, message 'staff-last-admin' (the route maps it to its staff-last-admin answer).

begin;

create or replace function public.tg_staff_last_admin_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only a row that currently counts as an active admin can be the last one.
  if not (old.role = 'admin' and old.active and old.accepted_at is not null) then
    return case tg_op when 'DELETE' then old else new end;
  end if;
  -- An update that keeps the row an active admin removes nobody.
  if tg_op = 'UPDATE' and new.role = 'admin' and new.active and new.accepted_at is not null then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('public.staff:last_admin', 20));

  if not exists (
    select 1
      from public.staff s
     where s.user_id <> old.user_id
       and s.role = 'admin'
       and s.active
       and s.accepted_at is not null
  ) then
    raise exception 'staff-last-admin' using errcode = '23514';
  end if;

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

revoke all on function public.tg_staff_last_admin_guard() from public;

create trigger staff_last_admin_guard
  before update of role, active, accepted_at or delete on public.staff
  for each row execute function public.tg_staff_last_admin_guard();

commit;
