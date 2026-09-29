// apps/web/tests/integration/intent-supersede-db.spec.ts
//
// Plan 26.3-10 Task 2. The REAL runCheckoutIntent (mode "web") with REAL SQL
// dependencies (checkout_create_booking, checkout_open_payment,
// checkout_set_booking_details, checkout_booking_session_ids,
// purge_unpaid_booking) against the port-shifted local stack. Only Stripe is
// faked, in process.
//
// Scenario (D-24, D-25): Pay → Back → the trip is re-quoted (a NEW quote_id) →
// Pay again with `supersedes` = the first booking. The store must end with
// exactly ONE pending booking for this contact.
//
// Safety: the URL must be the 55322 stack (refuses anything else). Everything
// runs inside ONE transaction that is rolled back at the end — nothing is ever
// committed and the stack is never reset (other plans use it in the same wave).
// Needs the stack: `bash scripts/local-stack-263.sh start`. Not run in CI.
// Port contract (26.0-09, D-01/D-07): the port is VAMOS_TEST_DB_PORT, default 55322 so the 26.3
// session's workflow is unchanged (no env = 127.0.0.1:55322, loopback check only, no marker).
// With the env set (CI, local-test-stack.sh) the throwaway marker is also required. The
// connection uses the Worker's own client options (workerSql, fetch_types:false), so array
// bugs like VT-26-0733 show here.

import { test, expect } from "../support/test";
import type postgres from "postgres";
import { workerSql } from "../../../../packages/db/test/support/worker-client";
import { requireTestStack, testDbPort } from "../support/test-stack";
import { runCheckoutIntent, type CheckoutIntentDeps } from "../../lib/checkout/intent";
import { checkoutIntentSchema } from "../../lib/checkout/intent-schema";
import { createBooking, issueManageToken } from "../../lib/checkout/create-booking";
import { attachPayment } from "../../lib/checkout/attach-payment";
import { loadOpenPayment } from "../../lib/checkout/load-open-payment";
import { hashManageToken, mintManageToken } from "../../lib/checkout/manage-token";
import { mintLock, type QuoteLockPayload } from "../../lib/quote/lock";

const RUN_PROJECT = "component-1440";
// Playwright runs from apps/web.
const SECRETS = { current: "lock-secret-supersede-db" };

function localUrl(): string {
  const port = testDbPort("55322");
  const url = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== port) {
    throw new Error(`refusing to run against ${parsed.host}: only loopback port ${port} is allowed`);
  }
  return url;
}

/** With VAMOS_TEST_DB_PORT set (CI, $STACK) the throwaway marker is required before any write. */
async function guardStack(url: string): Promise<void> {
  if (process.env.VAMOS_TEST_DB_PORT) await requireTestStack(url, testDbPort("55322"));
}

class Rollback extends Error {}

test.describe.configure({ mode: "serial" });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== RUN_PROJECT, "once");
});

type FakeSession = { id: string; status: "open" | "expired" | "complete"; amount: number };

test("Pay, Back, new quote_id + supersedes leaves exactly one pending booking @checkout", async () => {
  test.fail(true, "VT-26-0733: Worker client (fetch_types:false) — checkout_booking_session_ids text[] comes back as \"{cs_...}\" string, purge on supersede does not run, intent answers 409 quote_already_booked; flips green when the 26.3 fix lands, then remove this line");
  const url = localUrl();
  await guardStack(url);
  const sql = workerSql(url, "identity");
  const email = `supersede-${Date.now()}@example.test`;
  let result: { pending: Array<{ quote_id: string; company_name: string; note: string; trip: string }>; purged: number } | null = null;
  try {
    await sql
      .begin(async (tx) => {
        // ---- fixture (as the owner, inside the transaction) ----
        await tx`insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity) values ('is-first', 3, 3)`;
        await tx`insert into public.rate_versions (slug, label) values ('is-rv', 'Supersede fixture')`;
        await tx`
          insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
          select rv.id, vc.id, 3, 1, 2, 3 from public.rate_versions rv, public.vehicle_classes vc
           where rv.slug = 'is-rv' and vc.slug = 'is-first'`;
        await tx`update public.rate_versions set status = 'live' where slug = 'is-rv'`;
        const [fx] = await tx<{ class_id: string; rate_version_id: string; settings_version_id: string }[]>`
          select vc.id::text as class_id, rv.id::text as rate_version_id, sv.id::text as settings_version_id
            from public.vehicle_classes vc
            join public.rate_versions rv on rv.slug = 'is-rv'
            join public.settings_versions sv on sv.slug = 'launch-baseline'
           where vc.slug = 'is-first'`;
        const now = (await tx<{ now: Date }[]>`select now() as now`)[0]!.now;

        const day = new Date(now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
        const when = `${day}T10:00`;
        const payloadFor = (quoteId: string): QuoteLockPayload => ({
          v: 1,
          quote_id: quoteId,
          exp: new Date(now.getTime() + 45 * 60_000).toISOString(),
          engine_version: "quote-engine@supersede-db",
          rate_version_id: Number(fx!.rate_version_id),
          settings_version_id: Number(fx!.settings_version_id),
          computed_at: now.toISOString(),
          display_currency: "CHF",
          mode: "one_way",
          pax: 1,
          bags: 0,
          extras: null,
          coupon: null,
          class_totals: [{ slug: "is-first", total_rappen: 600 }],
          legs: [
            {
              leg_seq: 1,
              pickup: { lng: 8.549167, lat: 47.458056, text: "ZRH Airport" },
              dropoff: { lng: 8.540192, lat: 47.378177, text: "Zurich HB" },
              scheduled_local: when,
              distance_m: 12500,
              duration_s: 1500,
              origin_zone_id: null,
              dest_zone_id: null,
              waypoints: [],
              flight_no: null,
              landing_source: null,
            },
          ],
        });

        // ---- in-process Stripe ----
        const sessions = new Map<string, FakeSession>();
        let n = 0;
        const asSession = (s: FakeSession) =>
          ({
            id: s.id,
            status: s.status,
            payment_status: "unpaid",
            currency: "chf",
            amount_total: s.amount,
            url: s.status === "open" ? `https://checkout.stripe.test/${s.id}` : null,
            payment_intent: null,
            expires_at: Math.floor(now.getTime() / 1000) + 31 * 60,
          }) as never;

        // The browser's vt_manage cookie: set from the first response, the way a
        // browser would, and sent with the second request.
        let browserCookieRaw = "";
        const deps: CheckoutIntentDeps & { mode: "web" } = {
          mode: "web",
          lockSecrets: SECRETS,
          workerNowIso: now.toISOString(),
          postgresNowIso: now.toISOString(),
          reprice: (p) => ({
            pricing_live: true,
            engine_version: p.engine_version,
            classes: [{ slug: "is-first", total_rappen: 600, eligible: true }],
          }),
          mintManageToken,
          manageLinkMaxAgeSeconds: 1800,
          createCheckoutSession: (async (input: { chargedRappen: number }) => {
            n += 1;
            const s: FakeSession = { id: `cs_supersede_${Date.now()}_${n}`, status: "open", amount: input.chargedRappen };
            sessions.set(s.id, s);
            return asSession(s);
          }) as never,
          expireCheckoutSession: async (id) => {
            const s = sessions.get(id);
            if (s && s.status === "open") s.status = "expired";
          },
          retrieveCheckoutSession: async (id) => {
            const s = sessions.get(id);
            if (!s) throw new Error("unknown session");
            return asSession(s);
          },
          // Real SQL, as vamos_checkout, in the one transaction.
          createBooking: (args) => createBooking(tx, args),
          issueManageToken: (args) => issueManageToken(tx, args),
          attachPayment: (args) => attachPayment(tx, args),
          loadOpenPayment: (quoteId) => loadOpenPayment(tx, quoteId),
          setBookingDetails: async (a) => {
            await tx`
              select public.checkout_set_booking_details(
                ${a.bookingId}::uuid, ${a.companyName}, ${a.companyAddress}, ${a.companyVat}, ${a.driverNote}, ${a.tripQuery})`;
          },
          listSessionIds: async (bookingId) => {
            const rows = await tx<{ ids: string[] | null }[]>`select public.checkout_booking_session_ids(${bookingId}::uuid) as ids`;
            return rows[0]?.ids ?? [];
          },
          purgeUnpaid: async (bookingId, reason) => {
            const rows = await tx<{ purged: boolean | null }[]>`select public.purge_unpaid_booking(${bookingId}::uuid, ${reason}) as purged`;
            return rows[0]?.purged === true;
          },
          // The cookie's hash reaches the guest role the way asGuest sets it (RLS decides).
          ownsBooking: async (bookingId) => {
            const hashHex = await hashManageToken(browserCookieRaw);
            await tx`reset role`;
            await tx`set local role vamos_guest`;
            await tx`select set_config('request.vamos.manage_token_hash', ${hashHex}, true)`;
            const rows = await tx`select id from public.bookings where id = ${bookingId}::uuid`;
            await tx`select set_config('request.vamos.manage_token_hash', '', true)`;
            await tx`reset role`;
            await tx`set local role vamos_checkout`;
            return rows.length > 0;
          },
          origin: "https://vamostaxi.site",
          twint: false,
          legacyUaeAccount: false,
          checkoutWindowMinutes: 31,
          actorCustomerId: null,
          vehicleClassId: fx!.class_id,
          snapshotPolicy: {
            cancellation_tiers: [],
            free_cancel_hours: 24,
            airport_waiting_minutes: 60,
            city_waiting_minutes: 15,
            settings_version_id: Number(fx!.settings_version_id),
            modification_deadline_hours: 24,
            min_advance_minutes: 180,
            policy_doc: "supersede-db",
          },
          loadCatalog: async () => [
            { code: "child_seat", amountRappen: 100, labels: { en: "Child seat", de: "Kindersitz", fr: "Siege enfant", ar: "x" } },
          ],
          loadLaunchFlags: async () => ({ vat_rate_bps: 81 }),
        };

        const bodyFor = (quoteId: string, lock: string, patch: Record<string, unknown>) => {
          const parsed = checkoutIntentSchema.parse({
            quote_id: quoteId,
            lock,
            vehicle_class: "is-first",
            extra_codes: ["child_seat"],
            contact: { name: "Supersede Guest", email, phone: "+41790000000" },
            locale: "en",
            display_currency: "CHF",
            company_name: "Fixture AG",
            driver_note: "Meet at arrivals",
            trip: { from: "ZRH Airport", fid: "mbx-a", to: "Zurich HB", tid: "mbx-b", when, pax: 1, bags: 0 },
            idempotency_key: `idem-${quoteId}`,
            ...patch,
          });
          return parsed;
        };

        await tx`set local role vamos_checkout`;

        // 1. Pay
        const q1 = "60000000-0000-4000-8000-000000000001";
        const first = await runCheckoutIntent(bodyFor(q1, await mintLock(SECRETS, payloadFor(q1)), {}), deps);
        expect(first.status).toBe(200);
        browserCookieRaw = /vt_manage=([^;]+)/.exec(first.headers.get("set-cookie") ?? "")?.[1] ?? "";
        expect(browserCookieRaw).not.toBe("");
        const firstJson = (await first.json()) as { booking_id: string; url: string; amount_rappen: number };
        // (600 + 100) net, 8.1 % VAT on top
        expect(firstJson.amount_rappen).toBe(757);

        // 2. Back, the trip is re-quoted: a new quote_id, `supersedes` = the first booking.
        const q2 = "60000000-0000-4000-8000-000000000002";
        const second = await runCheckoutIntent(
          bodyFor(q2, await mintLock(SECRETS, payloadFor(q2)), { supersedes: firstJson.booking_id }),
          deps,
        );
        expect(second.status).toBe(200);
        const secondJson = (await second.json()) as { booking_id: string };
        expect(secondJson.booking_id).not.toBe(firstJson.booking_id);

        await tx`reset role`;
        const pending = await tx<{ quote_id: string; company_name: string; note: string; trip: string }[]>`
          select b.quote_id::text as quote_id, b.company_name, b.note, b.checkout_trip_query as trip
            from public.bookings b
           where b.contact_email = ${email} and b.status = 'pending'`;
        const purged = await tx<{ n: number }[]>`
          select count(*)::int as n from public.audit_log
           where table_name = 'bookings' and record_id = ${firstJson.booking_id}
             and action = 'delete' and before_value ->> 'reason' = 'superseded'`;
        result = { pending, purged: purged[0]!.n };
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      });
  } finally {
    await sql.end({ timeout: 5 });
  }

  expect(result).not.toBeNull();
  expect(result!.pending).toHaveLength(1);
  expect(result!.pending[0]!.quote_id).toBe("60000000-0000-4000-8000-000000000002");
  expect(result!.pending[0]!.company_name).toBe("Fixture AG");
  expect(result!.pending[0]!.note).toBe("Meet at arrivals");
  expect(result!.pending[0]!.trip).toContain("fid=mbx-a");
  expect(result!.purged).toBe(1);
});
