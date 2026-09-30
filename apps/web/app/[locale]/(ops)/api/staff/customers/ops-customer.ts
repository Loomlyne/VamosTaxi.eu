// apps/web/app/[locale]/(ops)/api/staff/customers/ops-customer.ts
//
// The customer shape both /api/staff/customers routes send. `name` / `trips`
// aliases exist so OpsCustomers.dc.html + cleanCustomer can hydrate.

import type { CustomerRow } from "@/lib/ops/customers";

export function toOpsCustomer(row: CustomerRow) {
  return {
    id: row.id,
    name: row.fullName,
    fullName: row.fullName,
    type: row.type,
    since: row.since,
    trips: row.tripCount,
    tripCount: row.tripCount,
    redacted: row.redacted,
    ...(row.email !== undefined ? { email: row.email } : {}),
    ...(row.phone !== undefined ? { phone: row.phone } : {}),
    ...(row.company !== undefined ? { company: row.company } : {}),
    ...(row.note !== undefined ? { note: row.note } : {}),
  };
}
