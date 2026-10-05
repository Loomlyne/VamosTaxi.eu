// apps/web/lib/db/rest-grants.local.test.ts
//
// 261005 money hardening S6 (migrations 20261007310000 grant, 20261007320000 revoke) and M18, on a real local database through the
// REAL Worker client (login vamos_edge, fetch_types: false, SET ROLE per identity). Every Worker path
// that called the eight functions still answers after EXECUTE moved from anon to vamos_checkout, and
// the roles Supabase REST uses (anon, authenticated) are refused:
//   quotes          lib/db/quote.ts            loadRateBook, loadLaunchFlags, loadSettingsVersion,
//                                              mintLockDeadline, evaluateCoupon
//   extra names     lib/checkout/checkout-catalog.ts defaultLoadLabels
//   account switch  lib/checkout/account-notice.ts   loadGuestAccountsLive
//   cookie banner   app/api/consent (POST) and app/api/consent/state (GET), the real route handlers
//   price preview   asStaff quote_rate_book(true): staff still see coupon codes
//   M18             forkLiveRateVersion: a draft of a "… draft draft draft" book carries one " draft"
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack (the test lab: scripts/test-lab/lab.sh,
// seeded with seed-live-like.sql). Committed rows: one consent row, one extra name, one staff user and the
// draft price book "ops-draft-from-<live id>" (the lab is destroyed after the job).
// Test-only raw client to read and seed the disposable stack as the superuser; named in
// scripts/db-access-fence-allowlist.json. Never bundled.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "./identity";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];
const MARKER_ROLE = "vamos_throwaway_test_stack";

const ctx = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: ctx.env }) }));

const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const adminId = `${tag}-0000-4000-a000-0000000000a5`;
const STAFF = { sub: adminId, role: "authenticated", aal: "aal1", app_metadata: { vamos_role: "admin" } } as VamosClaims;

describe.skipIf(!PORT)("S6 + M18 through the real Worker client (local lab, committed rows)", () => {
  let su: postgres.Sql;
  const env = () => ctx.env as unknown as CloudflareEnv;

  beforeAll(async () => {
    su = postgres(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`, { max: 1, onnotice: () => undefined });
    const marker = await su`select 1 from pg_roles where rolname = ${MARKER_ROLE}`;
    if (marker.length === 0) throw new Error(`refusing: ${MARKER_ROLE} missing, not a throwaway test stack`);
    ctx.env = {
      HYPERDRIVE_NOCACHE: { connectionString: `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres` },
      QUOTE_RATE_LIMITER_BARE: { limit: async () => ({ success: true }) },
    };
  });
  afterAll(async () => {
    await su?.end({ timeout: 5 });
  });

  it("quotes, vouchers, extra names and the account switch answer as vamos_checkout; codes stay hidden", { timeout: 60_000 }, async () => {
    const live = (await su<{ id: string; slug: string }[]>`select id::text as id, slug from public.rate_versions where status = 'live'`)[0]!;
    const codes = (await su<{ code: string }[]>`select code from public.coupons where rate_version_id = ${live.id} and active order by code`).map((r) => r.code);
    expect(codes.length).toBeGreaterThan(0);
    const { loadRateBook, loadLaunchFlags, loadSettingsVersion, mintLockDeadline, evaluateCoupon } = await import("./quote");

    const book = (await loadRateBook(env(), { preferDraft: false })) as { rate_version: { slug: string }; coupons: Record<string, unknown>[] };
    expect(book.rate_version.slug).toBe(live.slug);
    expect(book.coupons.length).toBe(codes.length);
    for (const coupon of book.coupons) {
      expect(coupon).toHaveProperty("id");
      expect(coupon).not.toHaveProperty("code");
      expect(coupon).not.toHaveProperty("note");
    }
    for (const code of codes) expect(JSON.stringify(book)).not.toContain(code);

    const publicChf = (await su<{ p: boolean }[]>`select public_chf as p from public.settings where id = 1`)[0]!.p;
    expect((await loadLaunchFlags(env())).public_chf).toBe(publicChf);

    const settings = (await loadSettingsVersion(env(), new Date().toISOString())) as { id: number };
    expect(typeof settings.id).toBe("number");
    const deadline = await mintLockDeadline(env(), settings.id);
    expect(new Date(deadline!).getTime()).toBeGreaterThan(Date.now());

    const voucher = (await evaluateCoupon(env(), codes[0]!.toLowerCase(), { customerId: null, contactEmail: null })) as { ok: boolean; code: string; coupon_id: number };
    expect(voucher).toMatchObject({ ok: true, code: codes[0] });
    // The engine (engine.ts couponOnBook) finds the typed voucher on the book by coupon_id = row id,
    // the key the public book keeps.
    expect(book.coupons.some((c) => Number(c.id) === Number(voucher.coupon_id))).toBe(true);

    await su`insert into public.extra_labels (code, label_en, label_de) values (${`rfg_${tag}`}, 'Lab seat', 'Laborsitz')`;
    const { defaultLoadLabels } = await import("../checkout/checkout-catalog");
    expect((await defaultLoadLabels(env()))[`rfg_${tag}`]).toMatchObject({ en: "Lab seat", de: "Laborsitz" });

    const guestSwitch = (await su<{ v: boolean | null }[]>`select public.checkout_account_settings() as v`)[0]!.v === true;
    const { loadGuestAccountsLive } = await import("../checkout/account-notice");
    // loadGuestAccountsLive answers false on any error, so compare with the switch read as the owner.
    expect(await loadGuestAccountsLive(env())).toBe(guestSwitch);
    const { asCheckout } = await import("./identity");
    await expect(asCheckout(env(), null, (sql) => sql`select public.checkout_account_settings() as v`)).resolves.toHaveLength(1);
  });

  it("the roles Supabase REST uses are refused (42501), also through the Worker client", { timeout: 60_000 }, async () => {
    const { asAnon, asCustomer } = await import("./identity");
    const refused = (fn: Promise<unknown>) => expect(fn).rejects.toMatchObject({ code: "42501" });
    await refused(asAnon(env(), (sql) => sql`select public.quote_rate_book(false) as r`));
    await refused(asAnon(env(), (sql) => sql`select public.quote_settings_version(now()) as r`));
    await refused(asAnon(env(), (sql) => sql`select public.quote_lock_deadline(1::bigint) as r`));
    await refused(asAnon(env(), (sql) => sql`select public.evaluate_coupon('NOPE') as r`));
    await refused(asAnon(env(), (sql) => sql`select * from public.extra_labels_read()`));
    await refused(asAnon(env(), (sql) => sql`select * from public.consent_choice('v1', null)`));
    await refused(asAnon(env(), (sql) => sql`select public.checkout_account_settings() as r`));
    await refused(asAnon(env(), (sql) => sql`select public.record_consent(true, false, false, false, 'reject_all', 'en', 'v1') as r`));
    const customer = { sub: `${tag}-0000-4000-a000-0000000000c5`, role: "authenticated" } as VamosClaims;
    await refused(asCustomer(env(), customer, (sql) => sql`select public.record_consent(true, false, false, false, 'reject_all', 'en', 'v1') as r`));
    await refused(asCustomer(env(), customer, (sql) => sql`select public.checkout_account_settings() as r`));
  });

  it("the cookie banner records and reads a choice through the real routes", { timeout: 60_000 }, async () => {
    const { POST } = await import("@/app/api/consent/route");
    const { GET } = await import("@/app/api/consent/state/route");
    const res = await POST(
      new Request("https://vamostaxi.site/api/consent", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://vamostaxi.site", "cf-connecting-ip": "203.0.113.9" },
        body: JSON.stringify({ method: "reject_all", locale: "de" }),
      }),
    );
    expect(res.status).toBe(200);
    const cookie = (res.headers.get("Set-Cookie") ?? "").split(";")[0]!;
    const subject = cookie.split("=")[1]!;
    expect(subject).toMatch(/^[0-9a-f-]{36}$/);
    const rows = await su<{ method: string; marketing: boolean }[]>`
      select method, marketing from public.consent_log where consent_subject_id = ${subject}::uuid`;
    expect(rows).toEqual([{ method: "reject_all", marketing: false }]);

    const state = await GET(new Request("https://vamostaxi.site/api/consent/state", { headers: { cookie } }));
    expect(state.status).toBe(200);
    expect(await state.json()).toMatchObject({ ok: true, chosen: true, choice: { method: "reject_all", marketing: false } });
  });

  it("staff (the price preview) still see coupon codes; a cloned draft carries one ' draft' (M18)", { timeout: 60_000 }, async () => {
    await su`insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             values (${adminId}, ${`rfg-admin-${tag}@example.test`}, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now())`;
    await su`insert into public.staff (user_id, role, active, accepted_at, full_name) values (${adminId}, 'admin', true, now(), 'RFG Admin')`;
    const live = (await su<{ id: string; label: string }[]>`select id::text as id, label from public.rate_versions where status = 'live'`)[0]!;
    const codes = (await su<{ code: string }[]>`select code from public.coupons where rate_version_id = ${live.id} order by code`).map((r) => r.code);

    const { asStaff } = await import("./identity");
    const staffBook = (await asStaff(env(), STAFF, (sql) => sql<{ result: { coupons: { code: string }[] } }[]>`
      select public.quote_rate_book(false) as result`))[0]!.result;
    expect(staffBook.coupons.map((c) => c.code)).toEqual(codes);

    const { forkLiveRateVersion } = await import("../ops/rate-book");
    const base = live.label.replace(/(?:(?:^|\s+)draft)+\s*$/i, "").trim();
    const draftId = await forkLiveRateVersion(env(), STAFF, { id: Number(live.id), label: `${base} draft draft draft` });
    const draft = (await su<{ label: string; status: string }[]>`select label, status::text as status from public.rate_versions where id = ${draftId}`)[0]!;
    expect(draft).toEqual({ label: `${base} draft`, status: "draft" });
  });
});
