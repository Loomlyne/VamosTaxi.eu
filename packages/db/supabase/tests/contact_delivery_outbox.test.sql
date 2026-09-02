begin;
select plan(26);

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
select table_privs_are('public', 'contact_delivery_outbox', 'vamos_system', '{}'::text[], 'Worker system role has no direct outbox access');
select is(
  (select count(*)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where n.nspname = 'public'
      and p.proname = 'claim_contact_delivery'
      and pg_get_function_identity_arguments(p.oid) = 'p_submission_id uuid, p_channel text'
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'),
  0::bigint,
  'PUBLIC cannot claim contact delivery'
);
select is(
  (select count(*)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where n.nspname = 'public'
      and p.proname = 'finalize_contact_delivery'
      and pg_get_function_identity_arguments(p.oid) = 'p_submission_id uuid, p_channel text, p_lease_token uuid, p_accepted boolean, p_provider_suffix text'
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'),
  0::bigint,
  'PUBLIC cannot finalize contact delivery'
);
select function_privs_are('public', 'claim_contact_delivery', array['uuid', 'text']::text[], 'anon', '{}'::name[], 'anon cannot claim contact delivery');
select function_privs_are('public', 'finalize_contact_delivery', array['uuid', 'text', 'uuid', 'boolean', 'text']::text[], 'anon', '{}'::name[], 'anon cannot finalize contact delivery');
select function_privs_are('public', 'claim_contact_delivery', array['uuid', 'text']::text[], 'authenticated', '{}'::name[], 'authenticated cannot claim contact delivery');
select function_privs_are('public', 'finalize_contact_delivery', array['uuid', 'text', 'uuid', 'boolean', 'text']::text[], 'authenticated', '{}'::name[], 'authenticated cannot finalize contact delivery');
select function_privs_are('public', 'claim_contact_delivery', array['uuid', 'text']::text[], 'vamos_staff', '{}'::name[], 'staff cannot claim contact delivery');
select function_privs_are('public', 'finalize_contact_delivery', array['uuid', 'text', 'uuid', 'boolean', 'text']::text[], 'vamos_staff', '{}'::name[], 'staff cannot finalize contact delivery');
select function_privs_are('public', 'claim_contact_delivery', array['uuid', 'text']::text[], 'vamos_guest', '{}'::name[], 'guest cannot claim contact delivery');
select function_privs_are('public', 'finalize_contact_delivery', array['uuid', 'text', 'uuid', 'boolean', 'text']::text[], 'vamos_guest', '{}'::name[], 'guest cannot finalize contact delivery');
select function_privs_are('public', 'claim_contact_delivery', array['uuid', 'text']::text[], 'vamos_public', '{}'::name[], 'public-content role cannot claim contact delivery');
select function_privs_are('public', 'finalize_contact_delivery', array['uuid', 'text', 'uuid', 'boolean', 'text']::text[], 'vamos_public', '{}'::name[], 'public-content role cannot finalize contact delivery');
select function_privs_are('public', 'claim_contact_delivery', array['uuid', 'text']::text[], 'vamos_system', array['EXECUTE']::name[], 'Worker system role can claim contact delivery');
select function_privs_are('public', 'finalize_contact_delivery', array['uuid', 'text', 'uuid', 'boolean', 'text']::text[], 'vamos_system', array['EXECUTE']::name[], 'Worker system role can finalize contact delivery');
select col_is_pk('public', 'contact_delivery_outbox', 'submission_id', 'one state record exists per contact submission');
select col_has_default('public', 'contact_delivery_outbox', 'correlation_id', 'outbox has a non-PII correlation identity');
select has_column('public', 'contact_delivery_outbox', 'customer_lease_token', 'customer has a persisted opaque fence token');
select has_column('public', 'contact_delivery_outbox', 'customer_lease_expires_at', 'customer lease has a bounded expiry');
select has_column('public', 'contact_delivery_outbox', 'support_lease_token', 'support has a persisted opaque fence token');
select has_column('public', 'contact_delivery_outbox', 'support_lease_expires_at', 'support lease has a bounded expiry');
select has_trigger('public', 'contact_submissions', 'contact_submissions_delivery_outbox', 'new submission creates a delivery record');

select * from finish();
rollback;
