-- set_local_without_begin.test.sql
--
-- ISOL-10: this file proves exactly ONE thing -- a transaction-local identity
-- (`set_config(..., true)` inside a savepoint) reverts when that savepoint rolls back, exactly
-- like `SET LOCAL`. It is NOT the lost-BEGIN proof (failure mode #4,
-- 03-RESEARCH.md lines 670-696): pgTAP itself runs every test file inside one open
-- transaction (`begin; ... rollback;`), so a savepoint body here is failure mode 3 (throw ->
-- rollback), never failure mode 4 (no BEGIN at all, autocommit). `set_config` outside any
-- transaction cannot be constructed inside a pgTAP file at all.
-- `packages/db/test/local/no-begin.test.ts` owns the no-BEGIN claim, in plain Vitest against a
-- real socket, outside any transaction pgTAP could open for it.
begin;
select plan(4);

-- Fixtures ------------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('e0000000-0000-0000-0000-00000000000a', 'slwb-a@example.test', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.customers (user_id, full_name, email)
values ('e0000000-0000-0000-0000-00000000000a', 'Set Local Without Begin', 'slwb-cust-a@example.test');

-- Bind a transaction-local identity inside a savepoint. ----------------------------------------
savepoint identity_local;
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'e0000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text,
  true);
select is(current_user::text, 'authenticated', '(1) a transaction-local identity binds current_user inside the savepoint');
select is(app.uid(), 'e0000000-0000-0000-0000-00000000000a'::uuid, '(2) app.uid() reads the bound claim inside the savepoint');

-- Roll back to the savepoint: the identity must not survive. ------------------------------------
rollback to savepoint identity_local;
select is(current_user::text, 'postgres', '(3) current_user reverts to the outer role after rollback to savepoint');
select is(app.uid(), null::uuid, '(4) app.uid() reverts to NULL -- the identity does not survive the rollback');

select * from finish();
rollback;
