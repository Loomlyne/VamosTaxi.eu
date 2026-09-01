begin;
select plan(15);

select has_table('public', 'contact_delivery_outbox', 'durable contact delivery outbox exists');
select ok(
  (select c.relrowsecurity
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'contact_delivery_outbox'),
  'outbox has RLS enabled'
);
select table_privs_are('public', 'contact_delivery_outbox', 'anon', '{}'::text[], 'anon has no direct outbox access');
select table_privs_are('public', 'contact_delivery_outbox', 'authenticated', '{}'::text[], 'authenticated has no direct outbox access');
select function_privs_are('public', 'claim_contact_delivery', array['uuid', 'text']::text[], 'anon', array['EXECUTE']::name[], 'anon can claim only through RPC');
select function_privs_are('public', 'claim_contact_delivery', array['uuid', 'text']::text[], 'authenticated', array['EXECUTE']::name[], 'authenticated can claim only through RPC');
select function_privs_are('public', 'finalize_contact_delivery', array['uuid', 'text', 'uuid', 'boolean', 'text']::text[], 'anon', array['EXECUTE']::name[], 'anon can finalize only through fenced RPC');
select function_privs_are('public', 'finalize_contact_delivery', array['uuid', 'text', 'uuid', 'boolean', 'text']::text[], 'authenticated', array['EXECUTE']::name[], 'authenticated can finalize only through fenced RPC');
select col_is_pk('public', 'contact_delivery_outbox', 'submission_id', 'one state record exists per contact submission');
select col_has_default('public', 'contact_delivery_outbox', 'correlation_id', 'outbox has a non-PII correlation identity');
select has_column('public', 'contact_delivery_outbox', 'customer_lease_token', 'customer has a persisted opaque fence token');
select has_column('public', 'contact_delivery_outbox', 'customer_lease_expires_at', 'customer lease has a bounded expiry');
select has_column('public', 'contact_delivery_outbox', 'support_lease_token', 'support has a persisted opaque fence token');
select has_column('public', 'contact_delivery_outbox', 'support_lease_expires_at', 'support lease has a bounded expiry');
select has_trigger('public', 'contact_submissions', 'contact_submissions_delivery_outbox', 'new submission creates a delivery record');

select * from finish();
rollback;
