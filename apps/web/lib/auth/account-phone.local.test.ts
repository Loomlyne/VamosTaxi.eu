// apps/web/lib/auth/account-phone.local.test.ts
//
// Quick 261002 (B5 follow-up 1), on a real local database through the REAL Worker client
// (asCustomer / asSystem / asStaff; login `vamos_edge`, `fetch_types: false`). The number a
// customer gives at sign-up, on the finish step or on the account page must show in the
// dashboard's Customers list and detail (loadCustomers / loadCustomerHistory, as an admin).
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack; rows are committed.
// Test-only raw client to seed the disposable local stack as the superuser; named in
// scripts/db-access-fence-allowlist.json. Never bundled.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asCustomer, type VamosClaims } from "../db/identity";
import { markAccountFinishPending, markAccountFinished } from "../db/system-reads";
import { loadCustomerHistory, loadCustomers } from "../ops/customers";
import { storeProfilePhone, syncSignupPhone } from "./account-phone";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];
const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const uid = (n: number) => `${tag}-0000-4000-a000-${String(n).padStart(12, "0")}`;
const ADMIN = uid(1);
const STAFF = { sub: ADMIN, role: "authenticated", aal: "aal2", app_metadata: { vamos_role: "admin" } } as VamosClaims;
const ctx = { requestId: "local", route: "/api/auth", locale: "en" };

describe.skipIf(!PORT)("a phone from sign-up, finish or the account page reaches the dashboard (local, committed rows)", () => {
  const env = {
    HYPERDRIVE_NOCACHE: { connectionString: `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres` },
  } as unknown as CloudflareEnv;
  let su: postgres.Sql;
  beforeAll(() => {
    su = postgres(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`, { max: 1, onnotice: () => undefined });
  });
  afterAll(async () => {
    await su.end({ timeout: 5 });
  });

  /** An auth user as GoTrue inserts it; the sign-up trigger makes the customers row. */
  async function signUp(n: number, email: string, meta: Record<string, string>, confirmed: boolean) {
    await su`insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
             values (${uid(n)}, ${email}, 'authenticated', 'authenticated', '{}'::jsonb, ${su.json(meta)},
                     ${confirmed ? su`now()` : null}, now(), now())`;
    return { id: uid(n), email };
  }
  const customerPhone = async (id: string) =>
    (await su<{ phone: string }[]>`select phone from public.customers where user_id = ${id}`)[0]?.phone;
  const dashboardPhone = async (email: string) =>
    (await loadCustomers(env, STAFF)).find((c) => c.email?.toLowerCase() === email.toLowerCase())?.phone;

  it("sign-up with a number: the row has none until the first confirmed session, then the list and the detail show it", { timeout: 60_000 }, async () => {
    await su`insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             values (${ADMIN}, ${`pho-admin-${tag}@example.test`}, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now())`;
    await su`insert into public.staff (user_id, role, active, accepted_at, full_name) values (${ADMIN}, 'admin', true, now(), 'Phone Admin')`;

    const email = `pho-signup-${tag}@example.test`;
    const meta = { full_name: "Mia Keller", phone: "+41790000001" };
    const mia = await signUp(2, email, meta, false);
    // The cause: the sign-up trigger copies the name only, so the dashboard has no number to show.
    expect(await customerPhone(mia.id)).toBe("");
    expect(await dashboardPhone(email)).toBe("");

    // First confirmed session (confirm link or code): the number moves to the row.
    await su`update auth.users set email_confirmed_at = now() where id = ${mia.id}`;
    await syncSignupPhone(env, { ...mia, user_metadata: meta }, ctx);
    expect(await customerPhone(mia.id)).toBe("+41790000001");
    expect(await dashboardPhone(email)).toBe("+41790000001");
    const [row] = (await loadCustomers(env, STAFF)).filter((c) => c.email === email);
    const detail = await loadCustomerHistory(env, STAFF, row!.id);
    expect(detail?.customer.phone).toBe("+41790000001");

    // A later sign-in never overwrites a number that is already there (the owner or the person changed it).
    await su`update public.customers set phone = '+41790000099' where user_id = ${mia.id}`;
    await syncSignupPhone(env, { ...mia, user_metadata: meta }, ctx);
    expect(await customerPhone(mia.id)).toBe("+41790000099");
  });

  it("account page: a new number replaces the row's number and shows on the dashboard", { timeout: 60_000 }, async () => {
    const email = `pho-account-${tag}@example.test`;
    const ana = await signUp(3, email, { full_name: "Ana Roth" }, true);
    expect(await dashboardPhone(email)).toBe("");
    await storeProfilePhone(env, ana, "+41 79 000 00 03", ctx);
    expect(await customerPhone(ana.id)).toBe("+41 79 000 00 03");
    expect(await dashboardPhone(email)).toBe("+41 79 000 00 03");
    await storeProfilePhone(env, ana, "+41 79 000 00 04", ctx);
    expect(await dashboardPhone(email)).toBe("+41 79 000 00 04");
  });

  it("account page: a customer can only write their own row", { timeout: 60_000 }, async () => {
    const a = await signUp(4, `pho-own-a-${tag}@example.test`, { full_name: "Own A" }, true);
    const b = await signUp(5, `pho-own-b-${tag}@example.test`, { full_name: "Own B" }, true);
    const touched = await asCustomer(env, { sub: a.id, role: "authenticated", email: a.email } as VamosClaims, (sql) =>
      sql<{ id: string }[]>`update public.customers set phone = '+41790000666' where user_id = ${b.id}::uuid returning id`,
    );
    expect(touched).toEqual([]);
    expect(await customerPhone(b.id)).toBe("");
  });

  it("finish step (27.1): the number lands on the row through account_finish_done and shows on the dashboard", { timeout: 60_000 }, async () => {
    const email = `pho-finish-${tag}@example.test`;
    const lea = await signUp(6, email, {}, false);
    await markAccountFinishPending(env, email);
    await markAccountFinished(env, lea.id, "Lea Meier", "+41790000006");
    expect(await customerPhone(lea.id)).toBe("+41790000006");
    expect(await dashboardPhone(email)).toBe("+41790000006");
  });

  it("dashboard: a row with no number of its own shows the phone of the customer's latest booking, a number of its own wins", { timeout: 60_000 }, async () => {
    const book = (email: string, phone: string, at: string) =>
      su`insert into public.bookings (reference, contact_name, contact_email, contact_phone, status, locale, created_at)
         values (public.next_booking_reference(), 'Pho Booker', ${email}, ${phone}, 'confirmed', 'de', ${at}::timestamptz)`;

    const blank = `pho-blank-${tag}@example.test`;
    const blankUser = await signUp(7, blank, { full_name: "Blank Row" }, true);
    await book(blank, "+41 79 000 07 01", "2030-01-01T10:00:00Z");
    await book(blank, "+41 79 000 07 02", "2030-02-01T10:00:00Z");
    await book(blank, "", "2030-03-01T10:00:00Z");
    expect(await customerPhone(blankUser.id)).toBe("");
    expect(await dashboardPhone(blank)).toBe("+41 79 000 07 02");
    const [blankRow] = (await loadCustomers(env, STAFF)).filter((c) => c.email === blank);
    expect((await loadCustomerHistory(env, STAFF, blankRow!.id))?.customer.phone).toBe("+41 79 000 07 02");

    const own = `pho-own-${tag}@example.test`;
    const ownUser = await signUp(8, own, { full_name: "Own Row" }, true);
    await su`update public.customers set phone = '+41 79 000 08 00' where user_id = ${ownUser.id}`;
    await book(own, "+41 79 000 08 99", "2030-01-01T10:00:00Z");
    expect(await dashboardPhone(own)).toBe("+41 79 000 08 00");

    // A booking of another address never lends its number.
    const alone = `pho-alone-${tag}@example.test`;
    await signUp(9, alone, { full_name: "Alone Row" }, true);
    expect(await dashboardPhone(alone)).toBe("");
  });
});
