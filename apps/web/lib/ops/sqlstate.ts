// apps/web/lib/ops/sqlstate.ts
//
// Shared SQLSTATE → ops copy map for every console Server Action in this phase,
// not just pricing. Call sites branch on `err.code` (invariant 3 in
// lib/db/identity.ts). This module never inspects the driver error text.
//
// Codes are taken from the applied migrations' `using errcode =` lines, not from
// planning documents. restrict_violation is SQLSTATE 23001 — not 23514 (check)
// and not the default raise code.

export const OPS_SQLSTATE = Object.freeze({
  // tg_rate_version_transition, tg_rate_version_insert_draft, tg_pricing_row_frozen
  // (20260823000008_rate_versions.sql); tg_append_only (20260823000019_append_only.sql)
  restrict: "23001",
  // rate_versions_one_live partial unique index, or rate_versions.slug unique
  unique: "23505",
  // rate_versions_published_stamp, or a rappen >= 0 domain check
  check: "23514",
  // forgotten wrapper, or a dispatcher reaching an admin-only write
  privilege: "42501",
  // 06-01 staff_update_self against a missing row (20260826000001_staff_self_service.sql)
  noData: "P0002",
} as const);

export type OpsDbFailure =
  | { kind: "restrict"; code: "23001"; key: "pricing.failure-restrict" }
  | { kind: "unique"; code: "23505"; key: "pricing.failure-unique" }
  | { kind: "check"; code: "23514"; key: "pricing.failure-check" }
  | { kind: "privilege"; code: "42501"; key: "pricing.failure-privilege" }
  | { kind: "no-data"; code: "P0002"; key: "pricing.failure-no-data" }
  | { kind: "unknown" };

function codeOf(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  if (!("code" in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function mapSqlState(err: unknown): OpsDbFailure {
  switch (codeOf(err)) {
    case OPS_SQLSTATE.restrict:
      return { kind: "restrict", code: "23001", key: "pricing.failure-restrict" };
    case OPS_SQLSTATE.unique:
      return { kind: "unique", code: "23505", key: "pricing.failure-unique" };
    case OPS_SQLSTATE.check:
      return { kind: "check", code: "23514", key: "pricing.failure-check" };
    case OPS_SQLSTATE.privilege:
      return { kind: "privilege", code: "42501", key: "pricing.failure-privilege" };
    case OPS_SQLSTATE.noData:
      return { kind: "no-data", code: "P0002", key: "pricing.failure-no-data" };
    default:
      return { kind: "unknown" };
  }
}
