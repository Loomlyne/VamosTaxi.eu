-- 20260918120000_support_inbound_system_rls.sql
--
-- Inbound ingest runs as vamos_system. FORCE RLS with no system policies
-- made INSERT support_inbound_events fail (42501/RLS) and SELECT tickets
-- return zero rows. Grants already exist on hosted except message files.

grant select, insert on table public.support_inbound_events to vamos_system;
grant select, update on table public.contact_submissions to vamos_system;
grant select, insert, update on table public.support_messages to vamos_system;
grant select, insert on table public.support_message_files to vamos_system;

drop policy if exists support_inbound_events_system_insert on public.support_inbound_events;
create policy support_inbound_events_system_insert
  on public.support_inbound_events
  for insert
  to vamos_system
  with check (true);

drop policy if exists support_inbound_events_system_select on public.support_inbound_events;
create policy support_inbound_events_system_select
  on public.support_inbound_events
  for select
  to vamos_system
  using (true);

drop policy if exists contact_submissions_system_select on public.contact_submissions;
create policy contact_submissions_system_select
  on public.contact_submissions
  for select
  to vamos_system
  using (true);

drop policy if exists contact_submissions_system_update on public.contact_submissions;
create policy contact_submissions_system_update
  on public.contact_submissions
  for update
  to vamos_system
  using (true)
  with check (true);

drop policy if exists support_messages_system_select on public.support_messages;
create policy support_messages_system_select
  on public.support_messages
  for select
  to vamos_system
  using (true);

drop policy if exists support_messages_system_insert on public.support_messages;
create policy support_messages_system_insert
  on public.support_messages
  for insert
  to vamos_system
  with check (true);

drop policy if exists support_messages_system_update on public.support_messages;
create policy support_messages_system_update
  on public.support_messages
  for update
  to vamos_system
  using (true)
  with check (true);

drop policy if exists support_message_files_system_insert on public.support_message_files;
create policy support_message_files_system_insert
  on public.support_message_files
  for insert
  to vamos_system
  with check (true);

drop policy if exists support_message_files_system_select on public.support_message_files;
create policy support_message_files_system_select
  on public.support_message_files
  for select
  to vamos_system
  using (true);
