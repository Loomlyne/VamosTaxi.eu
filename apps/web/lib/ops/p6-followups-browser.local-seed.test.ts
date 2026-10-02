// apps/web/lib/ops/p6-followups-browser.local-seed.test.ts
//
// Quick 261002-p6-followups: the seed of the browser proof (.planning/quick/261002-p6-followups/tools/proof-run.sh
// -> proof-browser.mjs). Not a test of behaviour: it writes three paid bookings of one customer the way checkout writes
// them (trip-change.local-fixture.ts) and leaves them in the disposable local database:
//   van10    a paid Van luxury booking (12 seats), 10 travellers, 6 bags, pickup about 5 days ahead
//   waiting  a paid booking on which the owner has confirmed a dearer change (a new pickup at Zug) that now waits for its
//            difference (staff request "requested" with an unexpired extra price record; Stripe stood in)
//   plain    a paid booking with no pending change (a customer's time request must be accepted)
// All three carry the same contact e-mail, so the customer sees them signed in; each has a manage-link token (the raw value goes
// to the JSON file, the table keeps the SHA-256). No password is written here: the browser script sets the customer's through the
// local stack's admin API.
// Skipped unless BOTH VAMOS_LOCAL_DB_PORT (a DISPOSABLE local stack) and P6F_BROWSER_SEED_OUT are set. Rows are committed;
// synthetic rappen only (the Van luxury rates are 3 and 2 rappen; amounts stay "CHF 000" while public_chf is off); host 127.0.0.1.
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";
import { base64urlEncode } from "../crypto/hmac";
import { openWorld } from "./trip-change.local-fixture";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];
const OUT = process.env["P6F_BROWSER_SEED_OUT"];

// Outside services, replaced: the Stripe page of the difference and the mails.
const createCheckoutSession = vi.fn();
const sendTripChangePay = vi.fn();
vi.mock("../checkout/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../checkout/stripe")>();
  return {
    ...actual,
    stripeFromEnv: () => ({}),
    createCheckoutSession: (...a: unknown[]) => createCheckoutSession(...a),
    retrieveCheckoutSession: vi.fn(async () => null),
    expireCheckoutSession: vi.fn(async () => ({ status: "expired" })),
    createRefund: vi.fn(),
  };
});
vi.mock("@vamos/emails/confirmation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vamos/emails/confirmation")>();
  return { ...actual, sendTripChangePay: (...a: unknown[]) => sendTripChangePay(...a) };
});
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: null }) }));

const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const adminId = `${tag}-0000-4000-a000-000000000007`;
const CLAIMS = { sub: adminId, role: "authenticated", aal: "aal2", app_metadata: { vamos_role: "admin" } } as VamosClaims;

/** The Europe/Zurich calendar day `days` from now ("YYYY-MM-DD"). */
function zurichDay(days: number): string {
  const p: Record<string, string> = {};
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(Date.now() + days * 86_400_000)).forEach((x) => { p[x.type] = x.value; });
  return `${p["year"]}-${p["month"]}-${p["day"]}`;
}

describe.skipIf(!PORT || !OUT)("seed for the p6-followups browser proof (local, committed rows)", () => {
  it("seeds van10, waiting and plain for one customer, with manage tokens", { timeout: 120_000 }, async () => {
    const w = await openWorld(PORT!, tag, adminId, CLAIMS);
    const { su, env, claims, ECO, deps, seedBooking, zug, NO, previewTripChange, confirmTripChange } = w;
    try {
      // Van luxury, 12 seats, in the fixture's live price book (the fixture has only 4 and 7 seats). Synthetic rates; the
      // frozen-row trigger is skipped for that one insert, as the fixture's own snapshot seeding skips others.
      const VAN = `p6f-van-${tag}`;
      await su.begin(async (tx) => {
        await tx`insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity, sort_order, name)
                 values (${VAN}, 12, 12, 3, 'Van luxury')`;
        await tx`set local session_replication_role = replica`;
        await tx`insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
                 select rv.id, vc.id, 12, 3, 2, null
                   from public.rate_versions rv cross join public.vehicle_classes vc
                  where rv.slug = ${`p6e-${tag}`} and vc.slug = ${VAN}`;
      });

      // The fixture wrote the admin straight into auth.users (no instance, NULL token columns): make the row one the local
      // GoTrue can read, so the dashboard checks can set a password through the admin API and sign in. (Same as the P6 seed.)
      await su`
        update auth.users set instance_id = '00000000-0000-0000-0000-000000000000', confirmation_token = '', recovery_token = '',
          email_change_token_new = '', email_change = '', email_change_token_current = '', phone_change = '', phone_change_token = '',
          reauthentication_token = '', raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb
        where id = ${adminId}`;

      // The fixture's rates are the same as the other local suites'; no figure of this seed may read like a real fare. The
      // book the owner's change is priced from (read from the database at the preview) gets synthetic rappen too.
      await su.begin(async (tx) => {
        await tx`set local session_replication_role = replica`;
        await tx`update public.distance_rates set base_fare_rappen = 7, per_km_rappen = 9
                  where rate_version_id = (select id from public.rate_versions where slug = ${`p6e-${tag}`})
                    and vehicle_class_id in (select id from public.vehicle_classes where slug in (${ECO}, ${w.BIZ}))`;
      });

      // The customer: one address on all three bookings, so the signed-in views list them. The account itself (with a
      // password) is made by the browser script through the local stack's admin API.
      const customerEmail = `p6f-${tag}-customer@example.test`;
      const day = (n: number) => `${zurichDay(n)}T14:20`;
      const rows = {
        van10: await seedBooking("van10", ECO, { local: day(5) }),
        waiting: await seedBooking("waiting", ECO, { local: day(6) }),
        plain: await seedBooking("plain", ECO, { local: day(7) }),
      };
      // The fixture charges the real-looking fare of its first book (checkout's own lines). What the customer reads as "what you
      // paid" is rewritten to synthetic rappen: fare 77 + VAT 6 = 83 (CHF 0.83), in the saved lines, the totals, the
      // class totals shown at checkout and the payment. (Append-only table: triggers off, this scratch stack only.)
      const SYN = { fare: 77, vat: 6, total: 83, eco: 77, biz: 99 };
      for (const r of Object.values(rows)) {
        await su`update public.bookings set contact_email = ${customerEmail}, contact_name = 'P6F Customer' where id = ${r.id}`;
        await su.begin(async (tx) => {
          await tx`set local session_replication_role = replica`;
          await tx`update public.price_snapshots set
                     lines = jsonb_set(jsonb_set(lines, '{0,amount_rappen}', to_jsonb(${SYN.fare}::int)), '{1,amount_rappen}', to_jsonb(${SYN.vat}::int)),
                     subtotal_rappen = ${SYN.total}, total_rappen = ${SYN.total},
                     shown_alternatives = ${tx.json([{ slug: ECO, total_rappen: SYN.eco }, { slug: w.BIZ, total_rappen: SYN.biz }])}
                   where booking_id = ${r.id}`;
          await tx`update public.booking_payments set charged_rappen = ${SYN.total} where booking_id = ${r.id}`;
        });
        r.paid = SYN.total;
      }
      // van10: Van luxury, ten travellers, six bags.
      await su`update public.booking_legs set vehicle_class_id = (select id from public.vehicle_classes where slug = ${VAN}), pax = 10, bags = 6
                where booking_id = ${rows.van10.id}`;

      // waiting: the owner confirms a dearer change (a new pickup at Zug); the request waits for the difference.
      const p1 = await previewTripChange(env, claims, rows.waiting.reference, { ...NO, pickup: zug }, deps);
      if (!p1.ok) throw new Error(`preview refused: ${JSON.stringify(p1)}`);
      const eco = p1.classes.find((c) => c.slug === ECO);
      if (!eco || !eco.ok) throw new Error(`no price for the class: ${JSON.stringify(eco)}`);
      createCheckoutSession.mockResolvedValue({ id: `cs_p6f_${tag}`, url: `https://checkout.stripe.test/c/pay/cs_p6f_${tag}` });
      sendTripChangePay.mockResolvedValue({ ok: true, providerMessageId: "p6f1" });
      const c1 = await confirmTripChange(env, claims, rows.waiting.reference, {
        klass: null, expectTotalRappen: eco.newTotalRappen, expectPaidRappen: p1.paidRappen,
        trip: { ...NO, pickup: { ...zug, text: "Typed elsewhere" }, lock: p1.lock! },
      }, "https://dashboard.vamostaxi.site", deps);
      expect(c1).toMatchObject({ ok: true, outcome: "extra_required" });
      const staff = await su<{ id: string; status: string; session: string | null; alive: boolean }[]>`
        select r.id::text as id, r.status, r.extra_session_id as session, x.expires_at > now() as alive
          from public.booking_edit_requests r join public.price_snapshots x on x.id = r.extra_snapshot_id
         where r.booking_id = ${rows.waiting.id} and r.actor = 'staff'`;
      expect(staff).toHaveLength(1);
      expect(staff[0]).toMatchObject({ status: "requested", alive: true });

      // Manage-link tokens: the raw value goes to the browser script, the table keeps the hash.
      const tokens: Record<string, string> = {};
      for (const key of ["van10", "waiting", "plain"] as const) {
        const bytes = randomBytes(32);
        tokens[key] = base64urlEncode(bytes);
        await su`
          insert into public.booking_access_tokens (booking_id, token_hash, expires_at, purpose)
          values (${rows[key].id}, ${createHash("sha256").update(bytes).digest()}, now() + interval '7 days', 'manage')`;
      }

      // Honest checks: a live book, every seeded booking paid and of this customer, the classes as claimed.
      const live = await su<{ n: number }[]>`select count(*)::int as n from public.rate_versions where status = 'live'`;
      expect(live[0]!.n).toBe(1);
      const legs = await su<{ ref: string; cls: string; cap: number; pax: number; bags: number; email: string; paid: boolean }[]>`
        select b.reference as ref, vc.name as cls, vc.passenger_capacity as cap, l.pax, l.bags, b.contact_email::text as email,
               exists (select 1 from public.booking_payments p where p.booking_id = b.id and p.status = 'succeeded') as paid
          from public.bookings b join public.booking_legs l on l.booking_id = b.id join public.vehicle_classes vc on vc.id = l.vehicle_class_id
         where b.id in (${rows.van10.id}, ${rows.waiting.id}, ${rows.plain.id}) order by b.reference`;
      expect(legs).toHaveLength(3);
      expect(legs.every((l) => l.paid && l.email === customerEmail)).toBe(true);
      expect(legs.find((l) => l.ref === rows.van10.reference)).toMatchObject({ cls: "Van luxury", cap: 12, pax: 10, bags: 6 });

      const local = async (id: string) =>
        (await su<{ l: string }[]>`select scheduled_local as l from public.booking_legs where booking_id = ${id}`)[0]!.l;
      const out = {
        tag, customerEmail, ECO, VAN, adminId, adminEmail: `p6e-admin-${tag}@example.test`,
        bookings: Object.fromEntries(
          await Promise.all(Object.entries(rows).map(async ([k, r]) => [k, { id: r.id, reference: r.reference, paid: r.paid, scheduledLocal: await local(r.id) }])),
        ),
        waiting: { staffRequestId: staff[0]!.id, session: staff[0]!.session },
        tokens,
      };
      writeFileSync(OUT!, JSON.stringify(out, null, 1), { mode: 0o600 });
    } finally {
      // Not world.close(): that retires the live price book, and the browser run needs it live.
      await su.end({ timeout: 5 });
    }
  });
});
