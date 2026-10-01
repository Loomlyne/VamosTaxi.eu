# pgTAP: create_quote_snapshot owner-only check allows service_role — hand-over

**To:** the control session. **From:** the Phase 20 leftovers reviewer session, 2026-10-02, on the owner's request
("fix the pgTAP owner-only check to allow service_role").
**Branch:** `worktree-p20-pgtap-service-role`, cut from origin/main `a584a1c2`. Pushed (branch only).
No PR, no merge to main, no deploy, no migration, no hosted SQL write.

Closes the board line "Known on live, not fixed yet" of 2026-10-02 (Phase 20 reviewer, service_role).

## What changed

One assertion in `packages/db/supabase/tests/phase20_grant_leftovers.test.sql` (G10, `create_quote_snapshot`):
the count of EXECUTE grantees now leaves out `service_role` as well as the owner
(`a.grantee not in (p.proowner, 'service_role'::regrole::oid)`). Live holds the Supabase default
grant to `service_role`; a local stack does not. The description reads "held by its owner and
service_role only". Plan count unchanged (40). No other file.

`'service_role'::regrole` raises if the role is missing, so a stack without it fails loudly instead
of passing silently.

## Checks

- The old and new count expressions, run read-only on live (catalog only, 2026-10-02):
  old = 1 (fails), new = 0 (passes).
- Not run: pgTAP on a local stack (the reviewer session may not start one). The control session's
  clean-clone gate run is the proof that the file still passes locally (expected: local has no
  service_role grant, so the count stays 0).

## Left

Gate run in a clean clone, then merge to main. Planning-and-test only: nothing to deploy, nothing to apply.
