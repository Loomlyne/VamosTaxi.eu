// apps/web/tests/integration/extras-charged-recorded-db.spec.ts
//
// 26.3-G6 (D-35, D-44): the owner's extra is labelled, priced, sent to Stripe, saved and shown
// in ops by its own code and amount. REAL runCheckoutIntent (mode "web") + REAL SQL
// (checkout_create_booking, extra_labels_read, price_snapshots) on the port-shifted local stack;
// only Stripe is faked, in process, BELOW the real createCheckoutSession so `unit_amount` is
// the value the real builder hands to Stripe.
//
// Fixtures only: `child-seat` 1000 rappen (the live row's code and amount) and an invented
// `pet-crate` 1500. Nothing is written to any hosted database; the local stack is never reset;
// everything runs in ONE transaction that is rolled back.
// Needs the stack: `bash scripts/local-stack-263.sh start`. Not run in CI.

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { runCheckoutIntent, type CheckoutIntentDeps } from "../../lib/checkout/intent";
import { checkoutIntentSchema } from "../../lib/checkout/intent-schema";
import { createBooking, issueManageToken } from "../../lib/checkout/create-booking";
import { attachPayment } from "../../lib/checkout/attach-payment";
import { loadOpenPayment } from "../../lib/checkout/load-open-payment";
import { hashManageToken, mintManageToken } from "../../lib/checkout/manage-token";
import { loadCheckoutCatalog } from "../../lib/checkout/checkout-catalog";
import type { ExtraLabelsByCode } from "../../lib/checkout/extras-catalog";
import { createCheckoutSession } from "../../lib/checkout/stripe";
import { priceCheckoutWithDeps } from "../../lib/checkout/price-route";
import { mapBoardBooking, type SqlBoardRow } from "../../lib/ops/bookings-map";
import { mintLock, type QuoteLockPayload } from "../../lib/quote/lock";

const RUN_PROJECT = "component-1440";
const REPO_ROOT = join(process.cwd(), "..", "..");
const SECRETS = { current: "lock-secret-extras-g6" };
const CLASS_NET = 6000;

function localUrl(): string {
  const url = execFileSync("bash", ["scripts/local-stack-263.sh", "url"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  }).trim();
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" || parsed.port !== "55322") {
    throw new Error(`refusing to run against ${parsed.host}: only the 127.0.0.1:55322 stack is allowed`);
  }
  return url;
}

class Rollback extends Error {}

test.describe.configure({ mode: "serial" });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== RUN_PROJECT, "once");
});

const NAMES = {
  "child-seat": { en: "Child seat", de: "Kindersitz", fr: "Siege enfant", ar: "مقعد أطفال" },
  "pet-crate": { en: "Pet crate", de: "Tierbox", fr: "Caisse pour animal", ar: "قفص حيوانات" },
} as const;
const AMOUNT = { "child-seat": 1000, "pet-crate": 1500 } as const;
const LANGS = ["en", "de", "fr", "ar"] as const;

const CASES: Array<{ name: string; codes: Array<keyof typeof NAMES> }> = [
  { name: "unticked", codes: [] },
  { name: "child-seat", codes: ["child-seat"] },
  { name: "pet-crate", codes: ["pet-crate"] },
  { name: "both", codes: ["child-seat", "pet-crate"] },
];

// Independent arithmetic: VAT 8.1 % (vat_rate_bps 81, tenths of a percent), half-up.
function expectedCharged(codes: string[]): { net: number; vat: number; charged: number } {
  const net = CLASS_NET + codes.reduce((n, c) => n + AMOUNT[c as keyof typeof AMOUNT], 0);
  const vat = Math.floor((net * 81 + 500) / 1000);
  return { net, vat, charged: net + vat };
}

type Outcome = {
  name: string;
  codes: string[];
  priceRoute: number;
  intentAmount: number;
  unitAmount: number;
  snapshotTotal: number;
  lines: Array<{ kind: string; code: string | null; amount_rappen: number; params: Record<string, unknown> }>;
  ops: ReturnType<typeof mapBoardBooking>;
  bookingRow: { charged: number };
};

test("child-seat and pet-crate: labelled, priced, sent to Stripe, saved and shown in ops; unticked adds nothing @checkout", async () => {
  const sql = postgres(localUrl(), { max: 1, onnotice: () => undefined });
  const outcomes: Outcome[] = [];
  let labelRows: Array<{ code: string; label_en: string; label_de: string; label_fr: string; label_ar: string }> = [];
  let catalogLabels: Record<string, Record<string, string>> = {};
  try {
    await sql
      .begin(async (tx) => {
        // ---- fixture ----
        await tx`insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity) values ('g6-first', 3, 3)`;
        await tx`insert into public.rate_versions (slug, label) values ('g6-rv', 'G6 fixture')`;
        await tx`
          insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
          select rv.id, vc.id, 3, 1, 2, 3 from public.rate_versions rv, public.vehicle_classes vc
           where rv.slug = 'g6-rv' and vc.slug = 'g6-first'`;
        await tx`update public.rate_versions set status = 'live' where slug = 'g6-rv'`;
        // The owner's saved names (plan 13's store), fixture rows in this transaction.
        for (const [code, n] of Object.entries(NAMES)) {
          await tx`
            insert into public.extra_labels (code, label_en, label_de, label_fr, label_ar)
            values (${code}, ${n.en}, ${n.de}, ${n.fr}, ${n.ar})
            on conflict (code) do update set label_en = excluded.label_en, label_de = excluded.label_de,
              label_fr = excluded.label_fr, label_ar = excluded.label_ar`;
        }
        const [fx] = await tx<{ class_id: string; rate_version_id: string; settings_version_id: string }[]>`
          select vc.id::text as class_id, rv.id::text as rate_version_id, sv.id::text as settings_version_id
            from public.vehicle_classes vc
            join public.rate_versions rv on rv.slug = 'g6-rv'
            join public.settings_versions sv on sv.slug = 'launch-baseline'
           where vc.slug = 'g6-first'`;
        const now = (await tx<{ now: Date }[]>`select now() as now`)[0]!.now;
        const day = new Date(now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
        const when = `${day}T10:00`;

        await tx`set local role vamos_checkout`;

        // ---- the live-book shape: two amount rows, by exact code ----
        const surcharge = (code: string, amount: number) => ({
          code,
          kind: "amount",
          amount_rappen: amount,
          active: true,
          quantity_source: null,
          predicate: { kind: "manual" },
        });
        const loadLabels = async (): Promise<ExtraLabelsByCode> => {
          const rows = await tx<typeof labelRows>`select * from public.extra_labels_read()`;
          labelRows = rows;
          const out: ExtraLabelsByCode = {};
          for (const r of rows) out[r.code] = { en: r.label_en, de: r.label_de, fr: r.label_fr, ar: r.label_ar };
          return out;
        };
        const catalog = await loadCheckoutCatalog({} as CloudflareEnv, {
          loadBook: async () => ({ surcharges: [surcharge("child-seat", 1000), surcharge("pet-crate", 1500)] }),
          loadLabels,
        });
        catalogLabels = Object.fromEntries(catalog.map((c) => [c.code, c.labels]));

        const stripeParams: Array<{ line_items: Array<{ price_data: { unit_amount: number } }> }> = [];
        let n = 0;
        const fakeStripe = {
          checkout: {
            sessions: {
              create: async (params: (typeof stripeParams)[number]) => {
                stripeParams.push(params);
                n += 1;
                return {
                  id: `cs_g6_${Date.now()}_${n}`,
                  status: "open",
                  payment_status: "unpaid",
                  currency: "chf",
                  amount_total: params.line_items[0]!.price_data.unit_amount,
                  url: `https://checkout.stripe.test/cs_g6_${n}`,
                  payment_intent: null,
                  expires_at: Math.floor(now.getTime() / 1000) + 31 * 60,
                };
              },
            },
          },
        };

        let browserCookieRaw = "";
        const deps: CheckoutIntentDeps & { mode: "web" } = {
          mode: "web",
          lockSecrets: SECRETS,
          workerNowIso: now.toISOString(),
          postgresNowIso: now.toISOString(),
          reprice: (p) => ({
            pricing_live: true,
            engine_version: p.engine_version,
            classes: [{ slug: "g6-first", total_rappen: CLASS_NET, eligible: true }],
          }),
          mintManageToken,
          manageLinkMaxAgeSeconds: 1800,
          createCheckoutSession: ((input: Parameters<typeof createCheckoutSession>[1]) =>
            createCheckoutSession(fakeStripe as never, input)) as never,
          expireCheckoutSession: async () => undefined,
          retrieveCheckoutSession: async () => {
            throw new Error("unexpected retrieve");
          },
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
          purgeUnpaid: async () => false,
          ownsBooking: async () => {
            await hashManageToken(browserCookieRaw);
            return false;
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
            policy_doc: "extras-g6",
          },
          loadCatalog: async () => catalog,
          loadLaunchFlags: async () => ({ vat_rate_bps: 81 }),
        };

        let idx = 0;
        for (const c of CASES) {
          idx += 1;
          const quoteId = `60000000-0000-4000-8000-0000000006${String(idx).padStart(2, "0")}`;
          const email = `g6-${idx}-${Date.now()}@example.test`;
          const payload: QuoteLockPayload = {
            v: 1,
            quote_id: quoteId,
            exp: new Date(now.getTime() + 45 * 60_000).toISOString(),
            engine_version: "quote-engine@extras-g6",
            rate_version_id: Number(fx!.rate_version_id),
            settings_version_id: Number(fx!.settings_version_id),
            computed_at: now.toISOString(),
            display_currency: "CHF",
            mode: "one_way",
            pax: 1,
            bags: 0,
            extras: null,
            coupon: null,
            class_totals: [{ slug: "g6-first", total_rappen: CLASS_NET }],
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
          };
          const lock = await mintLock(SECRETS, payload);

          // The price the screen shows: the price route, same lock, same catalog.
          const priced = await priceCheckoutWithDeps(
            { lock, vehicle_class: "g6-first", extra_codes: c.codes },
            {
              lockSecrets: SECRETS,
              nowIso: now.toISOString(),
              loadCatalog: async () => catalog,
              loadVatBps: async () => 81,
              evaluateCoupon: async () => ({ ok: false }),
              actorCustomerId: null,
            },
          );
          if (priced.status !== 200 || !priced.body.ok) throw new Error(`price route refused ${c.name}`);

          const body = checkoutIntentSchema.parse({
            quote_id: quoteId,
            lock,
            vehicle_class: "g6-first",
            extra_codes: c.codes,
            contact: { name: "G6 Guest", email, phone: "+41790000000" },
            locale: "en",
            display_currency: "CHF",
            trip: { from: "ZRH Airport", fid: "mbx-a", to: "Zurich HB", tid: "mbx-b", when, pax: 1, bags: 0 },
            idempotency_key: `idem-g6-${idx}`,
          });
          const res = await runCheckoutIntent(body, deps);
          expect(res.status, `${c.name}: intent status`).toBe(200);
          browserCookieRaw = /vt_manage=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1] ?? "";
          const json = (await res.json()) as { booking_id: string; amount_rappen: number };

          // Saved, then the ops read (the same price_snapshots columns loadBookings selects).
          await tx`reset role`;
          const [snap] = await tx<{ total_rappen: number; lines: Outcome["lines"]; policy: unknown }[]>`
            select s.total_rappen, s.lines, s.policy from public.price_snapshots s where s.booking_id = ${json.booking_id}::uuid`;
          const [pay] = await tx<{ charged: number }[]>`
            select charged_rappen::int as charged from public.booking_payments where booking_id = ${json.booking_id}::uuid limit 1`;
          await tx`set local role vamos_checkout`;

          const ops = mapBoardBooking({
            id: json.booking_id,
            reference: "VT-G6",
            status: "pending",
            lines: snap!.lines,
            policy: snap!.policy,
          } as unknown as SqlBoardRow);

          outcomes.push({
            name: c.name,
            codes: c.codes,
            priceRoute: priced.body.charged_rappen,
            intentAmount: json.amount_rappen,
            unitAmount: stripeParams[stripeParams.length - 1]!.line_items[0]!.price_data.unit_amount,
            snapshotTotal: Number(snap!.total_rappen),
            lines: snap!.lines,
            ops,
            bookingRow: { charged: pay?.charged ?? -1 },
          });
        }
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      });
  } finally {
    await sql.end({ timeout: 5 });
  }

  // 1. names reach the catalog through the real extra_labels_read(), in four languages, not the raw code.
  expect(labelRows.map((r) => r.code)).toEqual(expect.arrayContaining(["child-seat", "pet-crate"]));
  for (const code of Object.keys(NAMES) as Array<keyof typeof NAMES>) {
    for (const lang of LANGS) {
      expect(catalogLabels[code]![lang]).toBe(NAMES[code][lang]);
      expect(catalogLabels[code]![lang]).not.toBe(code);
    }
  }

  expect(outcomes).toHaveLength(CASES.length);
  for (const o of outcomes) {
    const exp = expectedCharged(o.codes);
    // 2. price route == intent == Stripe unit_amount == the payment row, VAT included.
    expect(o.priceRoute, `${o.name}: price route`).toBe(exp.charged);
    expect(o.intentAmount, `${o.name}: intent`).toBe(exp.charged);
    expect(o.unitAmount, `${o.name}: stripe unit_amount`).toBe(exp.charged);
    expect(o.bookingRow.charged, `${o.name}: payment row`).toBe(exp.charged);
    expect(o.snapshotTotal, `${o.name}: snapshot total`).toBe(exp.charged);

    // 3 / 4. saved lines hold each ticked extra by code, owner name and amount, and nothing else.
    const surcharges = o.lines.filter((l) => l.kind === "surcharge");
    expect(surcharges.map((l) => l.code), `${o.name}: surcharge codes`).toEqual(o.codes);
    for (const l of surcharges) {
      const code = l.code as keyof typeof NAMES;
      expect(l.amount_rappen).toBe(AMOUNT[code]);
      expect(l.params.names).toEqual(NAMES[code]);
    }
    expect(o.lines.reduce((s, l) => s + l.amount_rappen, 0), `${o.name}: lines add up`).toBe(exp.charged);

    // ops read: by owner name, each amount once.
    expect(o.ops.extras, `${o.name}: ops extras`).toEqual(o.codes);
    const opsSurcharges = o.ops.fareLines.filter((l) => l.kind === "surcharge");
    expect(opsSurcharges.map((l) => [l.code, l.label, l.rappen])).toEqual(
      o.codes.map((c) => [c, NAMES[c as keyof typeof NAMES].en, AMOUNT[c as keyof typeof AMOUNT]]),
    );
    for (const l of opsSurcharges) expect(l.names).toEqual(NAMES[l.code as keyof typeof NAMES]);
    expect(o.ops.fareLines.reduce((s, l) => s + (l.rappen ?? 0), 0)).toBe(exp.charged);
  }
});
