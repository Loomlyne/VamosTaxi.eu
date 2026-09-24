-- Reused Pay must store the minted manage hash. checkout_issue_manage_token
-- already inserts it. vamos_checkout had no EXECUTE, so the cookie was never saved.

grant execute on function public.checkout_issue_manage_token(
  pg_catalog.uuid,
  pg_catalog.bytea,
  pg_catalog.timestamptz
) to vamos_checkout;

revoke all on function public.checkout_issue_manage_token(
  pg_catalog.uuid,
  pg_catalog.bytea,
  pg_catalog.timestamptz
) from anon;
revoke all on function public.checkout_issue_manage_token(
  pg_catalog.uuid,
  pg_catalog.bytea,
  pg_catalog.timestamptz
) from authenticated;
revoke all on function public.checkout_issue_manage_token(
  pg_catalog.uuid,
  pg_catalog.bytea,
  pg_catalog.timestamptz
) from vamos_guest;
