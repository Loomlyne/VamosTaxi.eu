-- M1_grant_layer_removed.sql
--
-- Mutant (D-18/D-38): removes the grant layer that makes `42501` the fail-closed answer.
-- `vamos_edge` goes back to INHERIT (undoing the D-01/D-02 boundary
-- `20260823000002_roles_and_helpers.sql` establishes) and picks up a direct SELECT grant on
-- the two tables the fail-closed proof depends on being ungranted. With INHERIT restored,
-- `vamos_edge` would also silently pick up every privilege `authenticated`/`anon`/
-- `vamos_guest`/`vamos_staff` already hold, through its four memberships, with no `SET ROLE`
-- and no identity bound at all -- exactly the bug D-02's "the grant is the stronger of the two
-- gates" line exists to rule out.
--
-- TARGET: pgtap:supabase/tests/fail_closed.test.sql vitest:test/local/no-begin.test.ts
--
-- Both targets above must go red when this mutant is applied. Never part of the migration
-- sequence (D-31) -- applied and restored only by `scripts/mutation-gate.mjs`, via
-- `supabase db reset`, which recreates the local Postgres cluster and its roles from scratch
-- (confirmed empirically: `alter role vamos_edge inherit` does not survive a `db reset`).
alter role vamos_edge inherit;
grant select on public.bookings, public.customers to vamos_edge;
