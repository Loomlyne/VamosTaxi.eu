-- 20260918020000_support_message_files.sql
--
-- Inbound attachment metadata. Bytes live on R2 SUPPORT_FILES.
-- Do not MCP-apply until Phase 14-07 after Koss says apply.

create table if not exists public.support_message_files (
  id uuid primary key default extensions.gen_random_uuid(),
  message_id uuid not null references public.support_messages (id) on delete cascade,
  filename text not null,
  content_type text not null,
  byte_size integer not null,
  r2_key text,
  kept boolean not null,
  created_at timestamptz not null default now(),
  constraint support_message_files_filename_check
    check (char_length(filename) between 1 and 255),
  constraint support_message_files_byte_size_check
    check (byte_size >= 0),
  constraint support_message_files_r2_key_kept_check
    check ((kept = true and r2_key is not null) or (kept = false and r2_key is null))
);

comment on table public.support_message_files is
  'Inbound attachments metadata; bytes on R2 SUPPORT_FILES.';

create index if not exists support_message_files_message_id_idx
  on public.support_message_files (message_id);

create index if not exists support_messages_rfc_message_id_idx
  on public.support_messages (rfc_message_id)
  where rfc_message_id is not null and rfc_message_id <> '';

alter table public.support_message_files enable row level security;
alter table public.support_message_files force row level security;

revoke all on table public.support_message_files from public, vamos_public, vamos_edge, vamos_guest, anon, authenticated;

grant select on table public.support_message_files to vamos_staff;

drop policy if exists support_message_files_staff_select on public.support_message_files;
create policy support_message_files_staff_select
  on public.support_message_files
  for select
  to vamos_staff
  using ((select app.is_staff()));
