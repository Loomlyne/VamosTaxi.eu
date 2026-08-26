// packages/db/test/local/local-fixtures.ts
//
// D-04/D-19/D-21/D-41 fixture builder shared by the connection-reuse simulator
// (connection-reuse.test.ts) and the lost-BEGIN proof (no-begin.test.ts).
//
// Seeding connects AS THE SUPERUSER on `postgres://postgres:postgres@127.0.0.1:54322/postgres`
// -- legitimate for fixture setup, and only for setup: D-04 treats the superuser as an
// *identity* login (its BYPASSRLS makes `42501` untestable), so no assertion in this plan runs
// on a superuser connection. This file is also the ONE place in `packages/db/test/local` this
// connection string is allowed to appear (acceptance criterion: `grep -c "postgres:postgres@"
// connection-reuse.test.ts` prints 0).
//
// Two real customers, >= 3 bookings each, `status = 'quote'`, every price column left NULL
// (D-21, Law 04) -- no `rate_versions` row is ever set `status = 'live'` by this file. Emails
// carry a per-run suffix so re-running this suite without a `pnpm db:reset` never collides on
// the unique index on `customers.email`.
//
// No teardown DELETE (D-19): `bookings` is append-only and `DELETE` is revoked from every
// client-facing role, so a delete attempt would throw or silently no-op. The restore path is
// `pnpm db:reset`, run before this suite and between CI runs.
//
// D-41: this file seeds rows and sets claims directly against the applied schema; it never
// calls Supabase Auth's Admin API.

import postgres from "postgres";
import type { VamosClaims } from "../../src/claims.js";

const SUPERUSER_CONNECTION_STRING = "postgres://postgres:postgres@127.0.0.1:54322/postgres";

export interface LocalIdentity {
  uid: string;
  customerId: string;
  references: string[];
  claims: VamosClaims;
}

/**
 * A fresh superuser connection for fixture setup / mutant-aware checks only. Never used for an
 * assertion connection in this plan (D-04) -- callers close it with `sql.end()` when done.
 */
export function adminSql(): postgres.Sql {
  return postgres(SUPERUSER_CONNECTION_STRING, {
    max: 1,
    fetch_types: false,
    prepare: true,
    connect_timeout: 10,
  });
}

/**
 * Seeds two real customers (`a`, `b`), each with three bookings carrying disjoint
 * `VT-YY-####` references from the real `public.next_booking_reference()` allocator. Every
 * price column stays NULL (D-21) -- this function never writes a CHF figure.
 */
export async function seedTwoCustomers(): Promise<{ a: LocalIdentity; b: LocalIdentity }> {
  const sql = adminSql();
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  try {
    const build = async (label: "a" | "b"): Promise<LocalIdentity> => {
      const displayLabel = label.toUpperCase();
      // auth.users.id carries no DEFAULT (confirmed against the applied schema) -- generate it
      // here, matching the explicit-column-list convention every pgTAP fixture in this repo
      // already uses for this table.
      const uid = crypto.randomUUID();
      await sql`
        insert into auth.users
          (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values
          (${uid}, ${`cr-${label}-${suffix}@example.test`}, 'authenticated', 'authenticated',
           '{}'::jsonb, '{}'::jsonb, now(), now())
      `;
      const [{ id: customerId }] = await sql<[{ id: string }]>`
        insert into public.customers (user_id, full_name, email)
        values (${uid}, ${`Connection Reuse ${displayLabel}`}, ${`cr-cust-${label}-${suffix}@example.test`})
        returning id
      `;

      const references: string[] = [];
      for (let i = 0; i < 3; i++) {
        const [{ reference }] = await sql<[{ reference: string }]>`
          insert into public.bookings (contact_name, contact_email, customer_id, status)
          values (
            ${`Connection Reuse ${displayLabel}${i}`},
            ${`cr-booking-${label}-${i}-${suffix}@example.test`},
            ${customerId},
            'quote'
          )
          returning reference
        `;
        references.push(reference);
      }

      return {
        uid,
        customerId,
        references,
        claims: { sub: uid, role: "authenticated", aal: "aal2" },
      };
    };

    const a = await build("a");
    const b = await build("b");
    return { a, b };
  } finally {
    await sql.end();
  }
}

/** D-21: no `rate_versions` row is ever live while this local suite runs. */
export async function assertNoLiveRateVersion(): Promise<boolean> {
  const sql = adminSql();
  try {
    const [{ count }] = await sql<[{ count: number }]>`
      select count(*)::int as count from public.rate_versions where status = 'live'
    `;
    return count === 0;
  } finally {
    await sql.end();
  }
}
