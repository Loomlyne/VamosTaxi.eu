-- Guest checkout leaves bookings.customer_id null. The account page copy is
-- "everything booked under this email address" — match contact_email to the
-- signed-in JWT email as well as the customers.user_id link.
-- bookings_require_identity (restrictive) still requires app.uid().

drop policy bookings_select_own on public.bookings;

create policy bookings_select_own on public.bookings
  for select to authenticated
  using (
    (select app.uid()) is not null
    and (
      customer_id in (
        select c.id from public.customers c where c.user_id = (select app.uid())
      )
      or (
        contact_email is not null
        and length(btrim(contact_email::text)) > 0
        and lower(contact_email::text)
          = lower(nullif((select app.jwt() ->> 'email'), ''))
      )
    )
  );
