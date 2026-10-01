// apps/web/lib/ops/trip-change-migration-grants.test.ts
//
// P6 review 4 (2026-10-02): on the hosted database, Supabase's default privileges give anon and
// authenticated EXECUTE on every new function in public; "revoke ... from public" does not take those
// away. The local replay has no such defaults, so pgTAP cannot see it. Every new public function of
// migration 20261007150000 therefore revokes from anon and from authenticated by name, and grants
// EXECUTE to vamos_system only.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(here, "../../../../packages/db/supabase/migrations/20261007150000_trip_change_reprice.sql"),
  "utf8",
);
const NEW_PUBLIC = [
  "booking_staff_trip_change",
  "booking_change_request_facts",
  "booking_staff_contact_update",
  "booking_cancel_resend_facts",
];

describe("migration 20261007150000: the new public functions", () => {
  it.each(NEW_PUBLIC)("%s: revoked from public, anon and authenticated; EXECUTE vamos_system only", (fn) => {
    for (const role of ["public", "anon", "authenticated"]) {
      expect(sql, `${fn} from ${role}`).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^;]*\\) from ${role};`));
    }
    const grants = [...sql.matchAll(new RegExp(`grant execute on function public\\.${fn}\\([^;]*\\) to ([a-z_, ]+);`, "g"))];
    expect(grants.map((g) => g[1]!.trim())).toEqual(["vamos_system"]);
  });
});
