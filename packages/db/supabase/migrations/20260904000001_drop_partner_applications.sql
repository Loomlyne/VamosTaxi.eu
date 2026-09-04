-- Drop become-a-partner backend (V1 out). Contact submissions stay.

drop function if exists public.submit_partner_application(text, text, text, text, extensions.citext, text, text, text);
drop table if exists public.partner_applications cascade;
