// apps/web/lib/ops/sqlstate.ts
//
// Shared Postgres SQLSTATE → key map. Returns keys, never sentences.
// Screen copy lives under ops.coupons.* (and later sibling screens).

export const OPS_SQLSTATE = {
  unique_violation: "23505",
  check_violation: "23514",
} as const;

export type OpsSqlStateKey = "unique_violation" | "check_violation";

export function mapSqlState(err: unknown): OpsSqlStateKey | null {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  if (code === OPS_SQLSTATE.unique_violation) return "unique_violation";
  if (code === OPS_SQLSTATE.check_violation) return "check_violation";
  return null;
}
