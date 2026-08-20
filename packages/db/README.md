# @vamos/db

Empty scaffold created in Phase 1 (D-01) so Phase 2's schema work lands in a package that
already exists on the workspace graph, rather than requiring every downstream import path
and the CI build config to move later.

**Filled by:** Phase 2 (Supabase schema, RLS policies, auth). Migrations will live here as
SQL files versioned in order, plus a thin `postgres.js` access helper consumed by
`apps/web` through Cloudflare Hyperdrive (Phase 3 wires the binding).

Nothing in this package is implemented yet — do not import from it until Phase 2 lands.
