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
import { testDbUrl, workerSql } from "../support/worker-client.js";
import type { VamosClaims } from "../../src/claims.js";

const SUPERUSER_CONNECTION_STRING = testDbUrl("owner");

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
  return workerSql(SUPERUSER_CONNECTION_STRING);
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
      // AUTH-01 (migration 20260828000001_customers_auth_link.sql): the
      // `link_customer_on_signup` trigger on auth.users already created this user's
      // public.customers row inside the insert above -- the same path a real GoTrue signup
      // takes. A second, explicit customers insert here would collide on
      // `customers_user_id_key`, so the fixture reads the trigger-made row back (failing loudly
      // if the trigger did not fire) and only sets the display name on it.
      const linked = await sql<{ id: string }[]>`
        update public.customers
           set full_name = ${`Connection Reuse ${displayLabel}`}
         where user_id = ${uid}
        returning id
      `;
      if (linked.length !== 1) {
        throw new Error(
          `local fixture: expected exactly one public.customers row linked to auth user ${uid} by link_customer_on_signup, found ${linked.length}`,
        );
      }
      const customerId = linked[0]!.id;

      const references: string[] = [];
      for (let i = 0; i < 3; i++) {
        const [{ reference }] = await sql<[{ reference: string }]>`
          insert into public.bookings (contact_name, contact_email, customer_id, status)
          values (
            ${`Connection Reuse ${displayLabel}${i}`},
            ${`cr-booking-${label}-${i}-${suffix}@example.test`},
            ${customerId},
            'confirmed' -- 26.0: customers no longer read quote rows (migration 20261001110000), so fixtures use a paid state
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
