-- 20260910180000_ticket_status_responded.sql
--
-- Phase 12 delta on hosted contact_ticket_schema: fifth status + FORCE RLS on the header.
-- Apply on hosted only after owner says apply / you apply. Never supabase db push.

alter table public.contact_submissions
  drop constraint if exists contact_submissions_ticket_status_check;

alter table public.contact_submissions
  add constraint contact_submissions_ticket_status_check
  check (ticket_status in ('new', 'open', 'replied', 'responded', 'closed'));

alter table public.contact_submissions FORCE ROW LEVEL SECURITY;
