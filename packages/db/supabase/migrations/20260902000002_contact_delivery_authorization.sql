-- Contact delivery transitions are Worker-only. `vamos_system` is nologin and
-- can be SET ROLE only by the Hyperdrive Worker login (`vamos_edge`).
-- Browser/Data API identities must never claim or finalize an outbox channel.

revoke all on function public.claim_contact_delivery(uuid, text)
  from public, anon, authenticated, vamos_staff, vamos_guest, vamos_public,
       vamos_edge, vamos_checkout, service_role;
revoke all on function public.finalize_contact_delivery(uuid, text, uuid, boolean, text)
  from public, anon, authenticated, vamos_staff, vamos_guest, vamos_public,
       vamos_edge, vamos_checkout, service_role;

grant execute on function public.claim_contact_delivery(uuid, text) to vamos_system;
grant execute on function public.finalize_contact_delivery(uuid, text, uuid, boolean, text) to vamos_system;

-- The Worker gets its capability only through the two SECURITY DEFINER RPCs.
revoke all on table public.contact_submissions, public.contact_delivery_outbox from vamos_system;
