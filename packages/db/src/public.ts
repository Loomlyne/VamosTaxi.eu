// packages/db/src/public.ts
//
// `publicSql` is the cached-path client (D-11): no identity, no transaction, `vamos_public`,
// `HYPERDRIVE`'s cache-enabled binding. It is branded to the §14d table set only —
// `content_strings`, `reviews`, `vehicle_classes`, `service_zones`, `settings_public` — because
// nothing else is granted to `vamos_public` (Phase 2 plan 02-08's
// `...24_rls_public.sql`). Identity data and billing/pricing data are never issued on this
// binding (D-12): Phase 4's proposal to load the rate book through the cached binding
// contradicts Phase 2 D-03 and is refused here — correcting Phase 4's own document is Phase
// 4's planning job, not this file's.
//
// `postgres` is importable from this file and `identity.ts` only (see identity.ts's invariant
// 1) — enforced at compile time by plan 03-06's ESLint rule and CI grep.

import postgres from "postgres";

/** The exact five tables/views this binding may read. Nothing else is granted to vamos_public. */
export const PUBLIC_TABLES = [
  "content_strings",
  "reviews",
  "vehicle_classes",
  "service_zones",
  "settings_public",
] as const;

export type PublicTable = (typeof PUBLIC_TABLES)[number];

/**
 * A bare, cached-path client — no identity, no transaction, a pool size of five. Constructed
 * per invocation, never at module scope, matching `identity.ts`'s `client()` lifecycle
 * (module-scope construction is a hard Workers error that is silent on the first request).
 */
export function publicSql(connectionString: string): postgres.Sql {
  return postgres(connectionString, {
    max: 5,
    fetch_types: false,
    prepare: true,
    connect_timeout: 10,
  });
}
