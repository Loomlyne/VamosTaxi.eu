# VamosTaxi.eu agent routing

Use the global Concurrent Agent Integration Protocol: unique worktree and branch per session, mandatory Codex review and green checks, then direct-push new agent work to `main`. When Koussay explicitly identifies an existing PR as his, fix that PR, have Codex review it, then merge it through GitHub.

## Skill routing

| Request | Action |
|---------|--------|
| Any Vamos product/code | Load skill `vamos-taxi` |
| Scope / SOW / timeline | `docs/SCOPE-OF-WORK.md`, `docs/BUILD-PLAYBOOK.md` |
| Phase status | `gsd headless query` + `.gsd/milestones/*/ROADMAP.md` |
| Product ideas / rethink | office-hours design in `docs/OFFICE-HOURS-DESIGN.md` (already locked) |
| Stripe/billing | skill `saas-billing-integration` |
| Screen visuals | **Claude Design** first; implement after freeze |
| Feature slices | **Claude Code** primary; **Cursor** polish; **Hermes** schema/deploy/verify |

## Hard product rules

- Scheduled transfer only (book ahead; driver waits at set time)
- No driver app, no live GPS V1, no Stripe Connect, no global marketplace
- Mapbox for pin/route pricing; Stripe standard; Supabase Auth + guest
- Never invent production CHF prices

## Build order

M000 design freeze → M001 quote → M002 checkout → M003 admin → M004 launch  
Detail: `docs/BUILD-PLAYBOOK.md`
