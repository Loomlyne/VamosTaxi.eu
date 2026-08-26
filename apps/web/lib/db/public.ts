// apps/web/lib/db/public.ts
//
// `publicSql(env)` is the cached path (D-11): no identity, no transaction, cacheable — the
// public-content role's connection through the binding `lib/db/identity.ts` never touches.
// Branded to the five §14d public tables the core module exports as `PUBLIC_TABLES`
// (`content_strings`, `reviews`, `vehicle_classes`, `service_zones`, `settings_public`).
// Identity and billing data are never issued on this binding — an authenticated read
// answered from a query cache is the exact leak T-03-02 names, and this file's only job is
// to make that impossible to reach by construction, not by discipline at each call site.

import { publicSql as publicSqlCore } from "@vamos/db/public";

export function publicSql(env: CloudflareEnv) {
  return publicSqlCore(env.HYPERDRIVE.connectionString);
}
