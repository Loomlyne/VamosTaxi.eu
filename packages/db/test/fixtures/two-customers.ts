// packages/db/test/fixtures/two-customers.ts
//
// The deployed sibling of packages/db/test/local/local-fixtures.ts (plan 03-02). Where the
// local fixture inserts directly into auth.users on a superuser connection, THIS file creates
// real Supabase Auth users through the Admin API (D-41) -- a hand-minted JWT would be rejected
// by verifyAccessToken (HS256 refused, issuer/audience checked), so "real identities" here
// means exactly that: real accounts, real access tokens, minted once per run because Auth is
// rate-limited (1800/hour, bursts of 30 per IP -- signing in per request would throttle the
// harness before the connection pool ever saturates).
//
// Guards first, fail-closed (T-03-21): refuses to run unless SUPABASE_URL is set AND contains
// SUPABASE_STAGING_REF, and refuses if either is unset. A fixture that CAN point at production
// is a fixture that eventually will.
//
// D-45: three pairs, not two -- a customer pair (the primary DATA-06 pair), a guest pair
// (manage-token reachable), and a staff pair (public.staff + a real, verified bearer token).
// Without the guest and staff pairs, DATA-03 and AUTH-05 are unproven under the pool.
//
// D-19: rows are schema-legal against the applied migrations -- public.customers(user_id,
// full_name, email), public.bookings.status='quote' with contact_name/contact_email NOT NULL,
// references from the real next_booking_reference() allocator so they are disjoint by
// construction. No legs are inserted (D-19: "do not insert legs unless the test needs them");
// trip time, when a leg exists at all, lives on booking_legs' own scheduled_at column -- the
// bookings table carries no column of that shape at all (F1).
//
// D-21/Law 04: no amount is ever seeded. Every price column stays NULL and no rate_versions
// row is ever set status='live' by this file -- assertNoLiveRateVersion() below is the
// harness's own precondition, and a probe or a local page rendering these fixtures shows
// CHF 000 by data, not by copy.
//
// No teardown deletes anything (D-19): public.bookings is append-only (trigger + REVOKE DELETE
// + RLS with no delete policy + FORCE RLS -- 03-02-SUMMARY.md's local counterpart already
// confirms an afterAll attempt against this same schema throws or silently no-ops). A per-run
// suffix is what keeps re-running this fixture from colliding on customers.email's unique
// index, not a cleanup step.

import { createHash, randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";

export type FixtureKind = "customer" | "guest" | "staff";

export interface FixtureIdentity {
  kind: FixtureKind;
  authUserId: string;
  customerId?: string;
  accessToken: string;
  references: string[];
  manageTokenHashHex?: string;
}

export interface FixturePairs {
  customer: [FixtureIdentity, FixtureIdentity];
  guest: [FixtureIdentity, FixtureIdentity];
  staff: [FixtureIdentity, FixtureIdentity];
}

export interface SeedFixturesOptions {
  /** Bookings seeded per customer/staff identity. Guest identities always seed exactly one
   *  reachable booking (see buildGuest below) regardless of this value. */
  bookingsEach?: number;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`refusing to seed fixtures: missing env ${name}`);
  return value;
}

/** T-03-21: refuses anything but the declared staging project ref. */
function assertStaging(supabaseUrl: string): void {
  const stagingRef = requiredEnv("SUPABASE_STAGING_REF");
  if (!supabaseUrl.includes(stagingRef)) {
    throw new Error(
      `refusing to seed fixtures: SUPABASE_URL does not name the staging ref "${stagingRef}"`,
    );
  }
}

interface MintedUser {
  authUserId: string;
  accessToken: string;
}

/**
 * Creates one real Supabase Auth user through the Admin API and mints its access token with a
 * single password-grant call, reused for every request the harness later issues under this
 * identity (D-41).
 */
async function mint(
  supabaseUrl: string,
  serviceRoleKey: string,
  anonKey: string,
  email: string,
): Promise<MintedUser> {
  const password = `${randomUUID()}Aa1!`;

  const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    // email_confirm: true -- U29/D-41: whether @example.test is accepted with confirmations on
    // is answered at the first deployed run (plan 03-07); the fallback is a dedicated verified
    // test domain or a project-level allowlist, recorded there, not guessed at here.
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!created.ok) {
    throw new Error(`admin createUser failed: ${created.status} ${await created.text()}`);
  }
  const user = (await created.json()) as { id: string };

  const grant = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!grant.ok) {
    throw new Error(`password grant failed: ${grant.status} ${await grant.text()}`);
  }
  const { access_token: accessToken } = (await grant.json()) as { access_token: string };

  return { authUserId: user.id, accessToken };
}

/**
 * The owning Postgres connection for fixture writes only -- never an assertion connection,
 * matching packages/db/test/local/local-fixtures.ts's adminSql() convention for the deployed
 * context. VAMOS_OWNER_URL is an owner-held, out-of-band credential (the project's Postgres
 * superuser on the direct connection string); plan 03-07 is the only plan that ever sets it in
 * CI.
 */
function ownerSql(): postgres.Sql {
  return postgres(requiredEnv("VAMOS_OWNER_URL"), {
    max: 1,
    fetch_types: false,
    prepare: true,
    connect_timeout: 10,
  });
}

async function insertBookings(
  sql: postgres.Sql,
  label: string,
  customerId: string | null,
  count: number,
): Promise<string[]> {
  const references: string[] = [];
  for (let i = 0; i < count; i++) {
    const rows = (await sql`
      insert into public.bookings (contact_name, contact_email, customer_id, status)
      values (${`Vamos Isolation ${label} ${i}`}, ${`iso-${label.toLowerCase()}-${i}@example.test`},
              ${customerId}, 'quote')
      returning reference
    `) as unknown as Array<{ reference: string }>;
    const row = rows[0];
    if (!row) throw new Error("insert into public.bookings returned no row");
    references.push(row.reference);
  }
  return references;
}

/**
 * Seeds the three D-45 pairs -- customer, guest, staff -- against the staging project named by
 * SUPABASE_STAGING_REF. Refuses to run against anything else (T-03-21).
 */
export async function seedFixtures(opts: SeedFixturesOptions = {}): Promise<FixturePairs> {
  const bookingsEach = opts.bookingsEach ?? 3;
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  assertStaging(supabaseUrl);
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = requiredEnv("SUPABASE_ANON_KEY");

  const run = randomUUID().slice(0, 8);
  const sql = ownerSql();

  try {
    const buildCustomer = async (label: "A" | "B"): Promise<FixtureIdentity> => {
      const email = `vamos-iso-customer-${label.toLowerCase()}-${run}@example.test`;
      const minted = await mint(supabaseUrl, serviceRoleKey, anonKey, email);
      const rows = (await sql`
        insert into public.customers (user_id, full_name, email)
        values (${minted.authUserId}, ${`Isolation Customer ${label}`}, ${email})
        returning id
      `) as unknown as Array<{ id: string }>;
      const row = rows[0];
      if (!row) throw new Error("insert into public.customers returned no row");
      const references = await insertBookings(sql, `customer-${label}-${run}`, row.id, bookingsEach);
      return {
        kind: "customer",
        authUserId: minted.authUserId,
        customerId: row.id,
        accessToken: minted.accessToken,
        references,
      };
    };

    const buildGuest = async (label: "A" | "B"): Promise<FixtureIdentity> => {
      // D-45: the guest pair still needs a real, verifiable bearer token to pass the probe's
      // own gate (T-03-18) -- but the DB claim actually under test is the manage-token GUC,
      // not this account's own identity. Two independent credentials, deliberately: the
      // bearer token proves the caller is real, the hash proves possession of one specific
      // booking's manage link.
      const email = `vamos-iso-guest-${label.toLowerCase()}-${run}@example.test`;
      const minted = await mint(supabaseUrl, serviceRoleKey, anonKey, email);

      // bookingsEach bookings are seeded so OTHER, unreachable rows exist around the one this
      // identity's claim actually opens -- useful for a harness that wants to prove a guest
      // sees its own booking and nothing else, not fewer real rows to check against.
      // `token_hash` carries a UNIQUE constraint (booking_access_tokens), so a single hash
      // legally cannot cover more than one booking_access_tokens row: DATA-03's own point is
      // that one manage-token claim opens exactly one booking. Only the FIRST reference below
      // gets a token; `references` names only what this identity's single manageTokenHashHex
      // claim can actually open.
      const allReferences = await insertBookings(sql, `guest-${label}-${run}`, null, bookingsEach);
      const reachableReference = allReferences[0];
      if (!reachableReference) {
        throw new Error("guest fixture: no booking seeded to attach a manage token to");
      }

      // 32 raw bytes, SHA-256'd (Phase 2 D-15) -- Postgres only ever sees the hash; the raw
      // token never reaches SQL and this function never returns it.
      const rawToken = randomBytes(32);
      const digest = createHash("sha256").update(rawToken).digest();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const bookingRows = (await sql`
        select id from public.bookings where reference = ${reachableReference}
      `) as unknown as Array<{ id: string }>;
      const bookingRow = bookingRows[0];
      if (!bookingRow) throw new Error(`seeded booking ${reachableReference} not found`);
      await sql`
        insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
        values (${bookingRow.id}, ${digest}, ${expiresAt})
      `;

      return {
        kind: "guest",
        authUserId: minted.authUserId,
        accessToken: minted.accessToken,
        references: [reachableReference],
        manageTokenHashHex: digest.toString("hex"),
      };
    };

    const buildStaff = async (label: "A" | "B"): Promise<FixtureIdentity> => {
      const email = `vamos-iso-staff-${label.toLowerCase()}-${run}@example.test`;
      const minted = await mint(supabaseUrl, serviceRoleKey, anonKey, email);
      // D-05: the aal2 second factor is a genuine Auth-server fact (a completed TOTP
      // challenge), not something this fixture can forge -- verifyAccessToken reads whatever
      // the real token actually carries. A staff pair minted here without completing
      // enrollment satisfies D-45's adjacency-set requirement (a real, verified staff identity
      // in the pool, dispatcher role, active); exercising app.is_staff()'s aal2 gate
      // end-to-end is a fixture limitation recorded for plan 03-07 to close, not silently
      // assumed away.
      await sql`
        insert into public.staff (user_id, role, full_name, active)
        values (${minted.authUserId}, 'dispatcher', ${`Isolation Staff ${label}`}, true)
      `;
      const references = await insertBookings(sql, `staff-${label}-${run}`, null, bookingsEach);
      return {
        kind: "staff",
        authUserId: minted.authUserId,
        accessToken: minted.accessToken,
        references,
      };
    };

    const [customerA, customerB, guestA, guestB, staffA, staffB] = await Promise.all([
      buildCustomer("A"),
      buildCustomer("B"),
      buildGuest("A"),
      buildGuest("B"),
      buildStaff("A"),
      buildStaff("B"),
    ]);

    return {
      customer: [customerA, customerB],
      guest: [guestA, guestB],
      staff: [staffA, staffB],
    };
  } finally {
    await sql.end();
  }
}

/**
 * D-21/Law 04: no rate_versions row is ever live while this fixture is in use. Exported as the
 * harness's own precondition -- called before trusting anything the fixtures above produced.
 */
export async function assertNoLiveRateVersion(): Promise<boolean> {
  const sql = ownerSql();
  try {
    const rows = (await sql`
      select count(*)::int as count from public.rate_versions where status = 'live'
    `) as unknown as Array<{ count: number }>;
    return (rows[0]?.count ?? 0) === 0;
  } finally {
    await sql.end();
  }
}
