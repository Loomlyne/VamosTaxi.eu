-- identity_helpers.test.sql
--
-- Proves D-01/D-26: identity reaches SQL only inside the explicit transaction that sets it,
-- and reverts on rollback exactly like SET LOCAL — U2 was settled by the local probe
-- (research/local-toolchain-probe.md, Probe 2 — "set_config('role', $1, true) behaves
-- exactly like SET LOCAL ROLE $1 on this Postgres") and this file re-proves it on every
-- `supabase db reset` rather than trusting the probe as a one-time fact. Also proves the
-- three identity helpers' unset behaviour and the grant-layer boundary on
-- app.manage_token_hash() (D-02 — granted to vamos_guest only).
--
-- Run as `postgres` by `supabase test db`, so `set local role <any>` is permitted inside
-- this test without a separate connection.
begin;
select plan(11);

-- Unset GUCs: every helper degrades to its documented empty value, never an error.
select is(app.jwt(), '{}'::jsonb, 'app.jwt() with no GUC set returns {}');
select is(app.uid(), null::uuid, 'app.uid() with no GUC set returns NULL');
select is(app.manage_token_hash(), null::bytea, 'app.manage_token_hash() with no GUC set returns NULL');

-- app.uid() reads the `sub` claim out of request.jwt.claims.
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);
select is(
  app.uid(),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'app.uid() reads the sub claim from request.jwt.claims'
);

-- app.manage_token_hash() decodes the hex GUC to the same bytes the Worker hashed.
select set_config(
  'request.vamos.manage_token_hash',
  encode(extensions.digest('x', 'sha256'), 'hex'),
  true
);
select is(
  app.manage_token_hash(),
  extensions.digest('x', 'sha256'),
  'app.manage_token_hash() decodes the hex GUC to the digest bytes'
);
select is(
  octet_length(app.manage_token_hash()),
  32,
  'app.manage_token_hash() is 32 bytes (sha256)'
);

-- D-01/D-26: identity set inside a subtransaction reverts with that subtransaction, exactly
-- like SET LOCAL — a lost BEGIN fails to set identity rather than leaking the previous one.
savepoint identity_scope;
select set_config('role', 'authenticated', true);
select is(current_user::text, 'authenticated', 'set_config(role, ..., true) switches current_user inside the subtransaction');
rollback to savepoint identity_scope;
select is(current_user::text, 'postgres', 'current_user reverts to the outer role after rollback to savepoint (D-26)');

-- D-02 grant-layer boundary: app.jwt() is granted to anon; app.manage_token_hash() is
-- granted to vamos_guest only, so anon gets 42501, not a NULL result.
set local role anon;
select lives_ok(
  $$ select app.jwt() $$,
  'anon can execute app.jwt() (granted)'
);
select throws_ok(
  $$ select app.manage_token_hash() $$,
  '42501',
  null,
  'anon raises 42501 calling app.manage_token_hash() (not granted)'
);
reset role;

select function_privs_are(
  'app', 'manage_token_hash', array[]::name[],
  'anon', array[]::name[],
  'anon holds zero privileges on app.manage_token_hash()'
);

select * from finish();
rollback;
