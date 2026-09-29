// apps/web/tests/integration/checkout-server-db.spec.ts
//
// Plan 26.3-22 Task 2. The server path that failed on 2026-09-28, end to end on a REAL
// database: runCheckoutIntent (mode "web") with real SQL dependencies, then the paid return
// settled by the real handleStripeMessageWithDeps (checkout_payment_settle, stripe_event_*),
// then the real deliverConfirmationWithDeps (notification_claim / settle). Only Stripe and
// the mail provider are faked, in process (the webhook-replay pattern). The test process runs
// each call under the role the Worker uses: vamos_checkout for the intent, vamos_system for
// settle, purge and notify.
//
// Safety: the URL must be the 127.0.0.1:55322 stack (anything else is refused). Every scenario
// runs in ONE transaction that is rolled back; nothing is committed. Needs the stack:
// `bash scripts/local-stack-263.sh start`. Not run in CI.
//
// Amounts here are arithmetic fixtures (class net 600 rappen, child-seat 100), never a book
// price.

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import type Stripe from "stripe";
import { runCheckoutIntent, type CheckoutIntentDeps } from "../../lib/checkout/intent";
import { checkoutIntentSchema } from "../../lib/checkout/intent-schema";
import { createBooking, issueManageToken } from "../../lib/checkout/create-booking";
import { attachPayment } from "../../lib/checkout/attach-payment";
import { loadOpenPayment } from "../../lib/checkout/load-open-payment";
import { hashManageToken, mintManageToken } from "../../lib/checkout/manage-token";
import { priceCheckoutWithDeps } from "../../lib/checkout/price-route";
import { handleStripeMessageWithDeps, pgTextArrayLiteral, type SettleDeps, type SettleRow } from "../../lib/checkout/settle";
import { deliverConfirmationWithDeps, type ConfirmationDeps } from "../../lib/checkout/notify";
import { fxFromSession } from "../../lib/checkout/stripe";
import { purgeOnSessionExpired } from "../../lib/checkout/purge-unpaid";
import { CONFIRMATION_TEMPLATE_VERSION } from "@vamos/emails/confirmation";
import { mintLock, type QuoteLockPayload } from "../../lib/quote/lock";

const RUN_PROJECT = "component-1440";
const REPO_ROOT = join(process.cwd(), "..", "..");
const SECRETS = { current: "lock-secret-server-db-22" };
const CLASS_NET = 600;
const CHILD_SEAT = 100;
const VAT_BPS = 81;

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

type FakeSession = {
  id: string;
  status: "open" | "expired" | "complete";
  amount: number;
  quoteId: string;
  paymentIntent: string | null;
  presentment: { currency: string; amount: number } | null;
};

type Tx = postgres.TransactionSql;

/** The fixture, the fake Stripe and the intent dependencies, all inside one transaction. */
async function withStack(
  run: (h: Harness) => Promise<void>,
): Promise<void> {
  const sql = postgres(localUrl(), { max: 1, onnotice: () => undefined });
  try {
    await sql
      .begin(async (tx) => {
        const h = await buildHarness(tx);
        await run(h);
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

type Harness = Awaited<ReturnType<typeof buildHarness>>;

async function buildHarness(tx: Tx) {
  const slug = `sd-${Math.random().toString(36).slice(2, 8)}`;
  await tx`insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity) values (${slug}, 3, 3)`;
  await tx`insert into public.rate_versions (slug, label) values (${slug + "-rv"}, 'Server db fixture')`;
  await tx`
    insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
    select rv.id, vc.id, 3, 1, 2, 3 from public.rate_versions rv, public.vehicle_classes vc
     where rv.slug = ${slug + "-rv"} and vc.slug = ${slug}`;
  await tx`update public.rate_versions set status = 'live' where slug = ${slug + "-rv"}`;
  const [fx] = await tx<{ class_id: string; rate_version_id: string; settings_version_id: string }[]>`
    select vc.id::text as class_id, rv.id::text as rate_version_id, sv.id::text as settings_version_id
      from public.vehicle_classes vc
      join public.rate_versions rv on rv.slug = ${slug + "-rv"}
      join public.settings_versions sv on sv.slug = 'launch-baseline'
     where vc.slug = ${slug}`;
  const now = (await tx<{ now: Date }[]>`select now() as now`)[0]!.now;
  const day = new Date(now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
  const when = `${day}T10:00`;

  const asRole = async <T,>(role: "owner" | "vamos_checkout" | "vamos_system" | "vamos_guest", fn: () => Promise<T>): Promise<T> => {
    await tx`reset role`;
    if (role === "vamos_checkout") await tx`set local role vamos_checkout`;
    else if (role === "vamos_system") await tx`set local role vamos_system`;
    else if (role === "vamos_guest") await tx`set local role vamos_guest`;
    return fn();
  };

  const catalog = [
    { code: "child_seat", amountRappen: CHILD_SEAT, labels: { en: "Child seat", de: "Kindersitz", fr: "Siege enfant", ar: "مقعد أطفال" } },
  ];

  // ---- in-process Stripe ----
  const sessions = new Map<string, FakeSession>();
  let counter = 0;
  const asSession = (s: FakeSession): Stripe.Checkout.Session =>
    ({
      id: s.id,
      status: s.status,
      payment_status: s.status === "complete" ? "paid" : "unpaid",
      currency: "chf",
      amount_total: s.amount,
      url: s.status === "open" ? `https://checkout.stripe.test/${s.id}` : null,
      payment_intent: s.paymentIntent,
      created: Math.floor(now.getTime() / 1000),
      expires_at: Math.floor(now.getTime() / 1000) + 31 * 60,
      metadata: { booking_id: s.quoteId },
      presentment_details: s.presentment
        ? { presentment_currency: s.presentment.currency.toLowerCase(), presentment_amount: s.presentment.amount }
        : undefined,
    }) as never;

  let browserCookieRaw = "";
  const deps: CheckoutIntentDeps & { mode: "web" } = {
    mode: "web",
    lockSecrets: SECRETS,
    workerNowIso: now.toISOString(),
    postgresNowIso: now.toISOString(),
    reprice: (p) => ({
      pricing_live: true,
      engine_version: p.engine_version,
      classes: [{ slug, total_rappen: CLASS_NET, eligible: true }],
    }),
    mintManageToken,
    manageLinkMaxAgeSeconds: 1800,
    createCheckoutSession: (async (input: { chargedRappen: number; bookingId: string }) => {
      counter += 1;
      const s: FakeSession = {
        id: `cs_test_sd${counter}${Math.random().toString(36).slice(2, 8)}`,
        status: "open",
        amount: input.chargedRappen,
        quoteId: input.bookingId,
        paymentIntent: null,
        presentment: null,
      };
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
    ownsBooking: async (bookingId) => {
      const hashHex = await hashManageToken(browserCookieRaw);
      const rows = await asRole("vamos_guest", async () => {
        await tx`select set_config('request.vamos.manage_token_hash', ${hashHex}, true)`;
        const r = await tx`select id from public.bookings where id = ${bookingId}::uuid`;
        await tx`select set_config('request.vamos.manage_token_hash', '', true)`;
        return r;
      });
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
      policy_doc: "server-db-22",
    },
    loadCatalog: async () => catalog,
    loadLaunchFlags: async () => ({ vat_rate_bps: VAT_BPS }),
  };

  const payloadFor = (quoteId: string): QuoteLockPayload => ({
    v: 1,
    quote_id: quoteId,
    exp: new Date(now.getTime() + 45 * 60_000).toISOString(),
    engine_version: "quote-engine@server-db-22",
    rate_version_id: Number(fx!.rate_version_id),
    settings_version_id: Number(fx!.settings_version_id),
    computed_at: now.toISOString(),
    display_currency: "CHF",
    mode: "one_way",
    pax: 1,
    bags: 0,
    extras: null,
    coupon: null,
    class_totals: [{ slug, total_rappen: CLASS_NET }],
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

  const email = `server-db-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`;

  /** POST /api/checkout/intent, as the Worker runs it (vamos_checkout). */
  const intent = async (quoteId: string, patch: Record<string, unknown> = {}) => {
    const lock = await mintLock(SECRETS, payloadFor(quoteId));
    const body = checkoutIntentSchema.parse({
      quote_id: quoteId,
      lock,
      vehicle_class: slug,
      extra_codes: [],
      contact: { name: "Server Guest", email, phone: "+41790000000" },
      locale: "en",
      display_currency: "CHF",
      company_name: "Fixture AG",
      driver_note: "Meet at arrivals",
      trip: { from: "ZRH Airport", fid: "mbx-a", to: "Zurich HB", tid: "mbx-b", when, pax: 1, bags: 0 },
      idempotency_key: `idem-${quoteId}`,
      ...patch,
    });
    const res = await asRole("vamos_checkout", () => runCheckoutIntent(body, deps));
    const cookie = /vt_manage=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1];
    if (cookie) browserCookieRaw = cookie;
    const json = (await res.json()) as Record<string, unknown>;
    return { status: res.status, json, lock };
  };

  /** The screen's price for a selection: the same price route, same lock and catalog. */
  const screenPrice = async (lock: string, extraCodes: string[]) => {
    const priced = await priceCheckoutWithDeps(
      { lock, vehicle_class: slug, extra_codes: extraCodes },
      {
        lockSecrets: SECRETS,
        nowIso: now.toISOString(),
        loadCatalog: async () => catalog,
        loadVatBps: async () => VAT_BPS,
        evaluateCoupon: async () => ({ ok: false }),
        actorCustomerId: null,
      },
    );
    if (priced.status !== 200 || !priced.body.ok) throw new Error("price route refused");
    return priced.body.charged_rappen as number;
  };

  const emitted: string[] = [];
  const emit = (_l: string, type: string) => {
    emitted.push(type);
  };
  const none = async (): Promise<never> => {
    throw new Error("not used here");
  };

  /** The Stripe queue consumer, real handler, real SQL as vamos_system, fake Stripe. */
  const settleEvent = (message: { eventId: string; type: string; objectId: string; created: number }) =>
    asRole("vamos_system", async () => {
      await tx`
        select public.stripe_event_record(
          ${message.eventId}, ${message.type}, ${new Date(message.created * 1000).toISOString()}::timestamptz,
          ${message.objectId}, ${JSON.stringify({ id: message.objectId })}::jsonb)`;
      const settleDeps: SettleDeps = {
        // DEBUG
        begin: async (eventId, objectIds, created) => {
          const rows = await tx`
            select * from public.stripe_event_begin(${eventId}, ${pgTextArrayLiteral(objectIds)}::text[], ${created.toISOString()}::timestamptz)`;
          return { should_process: Boolean(rows[0]?.should_process), reason: String(rows[0]?.reason ?? "ok") };
        },
        retrieveSession: async (id) => {
          const s = sessions.get(id);
          if (!s) throw new Error("unknown session");
          return asSession(s);
        },
        settlePayment: async (input) => {
          const f = input.session
            ? fxFromSession(input.session)
            : { chargedCurrency: "CHF", fxRate: null, fxSource: null, fxQuotedAt: null, presentmentAmountMinor: null, presentmentCurrency: null };
          const rows = await tx`
            select * from public.checkout_payment_settle(
              ${input.eventId}, ${input.sessionId}, ${input.paymentIntentId}, ${input.outcome},
              ${f.chargedCurrency}, ${f.fxRate}, ${f.fxSource}, ${f.fxQuotedAt}::timestamptz,
              ${f.presentmentAmountMinor}, ${f.presentmentCurrency})`;
          const row = rows[0];
          if (!row) throw new Error("checkout_payment_settle returned no row");
          const out: SettleRow = {
            booking_id: String(row.booking_id),
            reference: String(row.reference),
            locale: String(row.locale),
            contact_email: String(row.contact_email),
            already_settled: Boolean(row.already_settled),
            revived: Boolean(row.revived),
            duplicate: Boolean(row.duplicate),
            refund_required: Boolean(row.refund_required),
            refund_reason: row.refund_reason == null ? null : String(row.refund_reason),
            payment_id: row.payment_id == null ? 0 : Number(row.payment_id),
            charged_rappen: row.charged_rappen == null ? 0 : Number(row.charged_rappen),
            other_open_session_ids: Array.isArray(row.other_open_session_ids)
              ? row.other_open_session_ids.map((x: unknown) => String(x))
              : [],
          };
          return out;
        },
        eventSettle: async (eventId, error) => {
          await tx`select public.stripe_event_settle(${eventId}, ${error})`;
        },
        deliverConfirmation: async (row) => {
          await deliverConfirmationWithDeps(confirmationDeps(), row);
        },
        refund: async () => {
          throw new Error("no refund expected");
        },
        recordDuplicateRefund: async () => undefined,
        alertPaidAfterCancel: async () => undefined,
        alertStuckPayment: async () => undefined,
        expireSession: async (id) => {
          const s = sessions.get(id);
          if (s && s.status === "open") s.status = "expired";
        },
        purgeOnSessionExpired: (sessionId, bookingId) =>
          purgeOnSessionExpired(
            {
              retrieve: async (id) => {
                const s = sessions.get(id);
                if (!s) throw new Error("unknown session");
                return asSession(s);
              },
              sessionIdsFor: async (b) => {
                const rows = await tx<{ ids: string[] | null }[]>`select public.checkout_booking_session_ids(${b}::uuid) as ids`;
                return rows[0]?.ids ?? [];
              },
              purge: async (b, reason) => {
                const rows = await tx<{ purged: boolean | null }[]>`select public.purge_unpaid_booking(${b}::uuid, ${reason}) as purged`;
                return rows[0]?.purged === true;
              },
            },
            sessionId,
            bookingId,
          ),
        retrieveCharge: none,
        retrieveDispute: none,
        findSessionIdForPaymentIntent: async () => null,
        recordChargeRefund: async () => ({ outcome: "unused" }),
        upsertDispute: async () => undefined,
        emit,
      };
      return handleStripeMessageWithDeps(
        { eventId: message.eventId, type: message.type, objectId: message.objectId, stripeCreated: message.created } as never,
        settleDeps,
      );
    });

  const mails: Array<{ to: string }> = [];
  /** The mail provider is faked; the claim, the load and the settle are the real SQL. */
  const confirmationDeps = (): ConfirmationDeps => ({
    apiKey: "re_test_fixture_only",
    claim: async (bookingId, locale) => {
      const rows = await tx`
        select public.notification_claim(${bookingId}::uuid, ${"confirmation"}, ${null}::uuid, ${"email"}, ${locale}, ${CONFIRMATION_TEMPLATE_VERSION}) as id`;
      return rows[0]?.id == null ? null : Number(rows[0].id);
    },
    load: async (bookingId, tokenHash, expires) => {
      await tx`select public.checkout_issue_manage_token(${bookingId}::uuid, ${tokenHash}, ${expires.toISOString()}::timestamptz)`;
      const rows = await tx`select * from public.checkout_booking_for_email(${bookingId}::uuid)`;
      return (rows[0] as Record<string, unknown> | undefined) ?? null;
    },
    mintToken: mintManageToken,
    send: async (payload) => {
      mails.push({ to: String((payload as { contactEmail?: string }).contactEmail ?? "") });
      return { ok: true, providerMessageId: `msg_fixture_${mails.length}` } as never;
    },
    settle: async (claimId, providerMessageId, error) => {
      await tx`select public.notification_settle(${claimId}::bigint, ${providerMessageId}::text, ${error}::text)`;
    },
    emit,
  });

  return { tx, sessions, asRole, intent, screenPrice, settleEvent, confirmationDeps, mails, emitted, email, slug, now };
}

const Q = (n: number) => `60000000-0000-4000-8000-0000000022${String(n).padStart(2, "0")}`;

test("intent, paid return settle, confirmation claim: one confirmed booking, screen = Stripe = saved @checkout", async () => {
  await withStack(async (h) => {
    const { tx } = h;
    // 1. Pay with the child seat ticked (extras pass, control-session item C).
    const first = await h.intent(Q(1), { extra_codes: ["child_seat"] });
    expect(first.status).toBe(200);
    const shown = await h.screenPrice(first.lock, ["child_seat"]);
    const sent = first.json.amount_rappen as number;
    expect(sent).toBe(shown);
    // (600 + 100) net, 8.1 % VAT on top (the flag is per mille)
    expect(sent).toBe(Math.round((CLASS_NET + CHILD_SEAT) * 1.081));
    const bookingId = String(first.json.booking_id);
    const sessionId = [...h.sessions.keys()][0]!;
    expect(h.sessions.get(sessionId)!.amount).toBe(sent);

    await h.asRole("owner", async () => undefined);
    const [snap] = await tx<{ total: number; lines: Array<{ code?: string; amount_rappen?: number }>; company: string; note: string }[]>`
      select s.total_rappen::int as total, s.lines, b.company_name as company, b.note as note
        from public.price_snapshots s join public.bookings b on b.id = s.booking_id
       where s.booking_id = ${bookingId}::uuid`;
    expect(snap!.total).toBe(sent);
    expect(snap!.company).toBe("Fixture AG");
    expect(snap!.note).toBe("Meet at arrivals");
    const lineCodes = JSON.stringify(snap!.lines);
    expect(lineCodes).toContain("child_seat");
    expect(lineCodes).not.toMatch(/child_seat.{0,80}(extra_stop|oversized)/);
    const [pending] = await tx<{ status: string }[]>`select status from public.bookings where id = ${bookingId}::uuid`;
    expect(pending!.status).toBe("pending");

    // 2. Stripe reports the session paid (presented in EUR); the return settles it.
    const s = h.sessions.get(sessionId)!;
    s.status = "complete";
    s.paymentIntent = "pi_test_sd_paid_1";
    s.presentment = { currency: "EUR", amount: 700 };
    const handled = await h.settleEvent({
      eventId: `return_${sessionId}`,
      type: "checkout.session.completed",
      objectId: sessionId,
      created: Math.floor(h.now.getTime() / 1000),
    });
    expect("ack" in handled).toBe(true);

    await h.asRole("owner", async () => undefined);
    const [booking] = await tx<{ status: string }[]>`select status from public.bookings where id = ${bookingId}::uuid`;
    expect(booking!.status).toBe("confirmed");
    const pays = await tx<{ status: string; charged: number; cur: string; pmin: number | null; pi: string | null }[]>`
      select status, charged_rappen::int as charged, charged_currency as cur,
             presentment_amount_minor::int as pmin, stripe_payment_intent_id as pi
        from public.booking_payments where booking_id = ${bookingId}::uuid`;
    expect(pays).toHaveLength(1);
    expect(pays[0]!.status).toBe("succeeded");
    expect(pays[0]!.charged).toBe(sent);
    expect(pays[0]!.pmin).toBe(700);

    // 3. The confirmation e-mail claim: one row, sent, and a second delivery claims nothing.
    const claims = await tx<{ kind: string; sent_at: Date | null; error: string | null; provider_message_id: string | null }[]>`
      select kind, sent_at, error, provider_message_id from public.booking_notifications where booking_id = ${bookingId}::uuid`;
    expect(claims).toHaveLength(1);
    expect(claims[0]!.kind).toBe("confirmation");
    expect(claims[0]!.error).toBeNull();
    expect(claims[0]!.sent_at).not.toBeNull();
    expect(claims[0]!.provider_message_id).toMatch(/^msg_fixture_/);
    const mailsAfterFirst = h.mails.length;
    expect(mailsAfterFirst).toBeGreaterThanOrEqual(1);

    await h.asRole("vamos_system", async () => {
      await deliverConfirmationWithDeps(h.confirmationDeps(), {
        booking_id: bookingId,
        locale: "en",
      } as never);
    });
    expect(h.mails.length).toBe(mailsAfterFirst);
    await tx`reset role`;
    const [again] = await tx<{ n: number }[]>`select count(*)::int as n from public.booking_notifications where booking_id = ${bookingId}::uuid`;
    expect(again!.n).toBe(1);

    // 4. A replayed return settles nothing twice.
    const replay = await h.settleEvent({
      eventId: `return_${sessionId}`,
      type: "checkout.session.completed",
      objectId: sessionId,
      created: Math.floor(h.now.getTime() / 1000),
    });
    expect("ack" in replay).toBe(true);
    expect(h.mails.length).toBe(mailsAfterFirst);
  });
});

test("Back with a new quote_id and supersedes leaves exactly one unpaid row and one non-PII purge line @checkout", async () => {
  await withStack(async (h) => {
    const { tx } = h;
    const first = await h.intent(Q(2));
    expect(first.status).toBe(200);
    const firstId = String(first.json.booking_id);
    const firstSession = [...h.sessions.keys()][0]!;

    const second = await h.intent(Q(3), { supersedes: firstId });
    expect(second.status).toBe(200);
    expect(String(second.json.booking_id)).not.toBe(firstId);
    expect(h.sessions.get(firstSession)!.status).toBe("expired");

    await tx`reset role`;
    const pending = await tx<{ quote_id: string }[]>`
      select b.quote_id::text as quote_id from public.bookings b where b.contact_email = ${h.email} and b.status = 'pending'`;
    expect(pending).toHaveLength(1);
    expect(pending[0]!.quote_id).toBe(Q(3));
    const audit = await tx<{ before_value: Record<string, unknown> }[]>`
      select before_value from public.audit_log
       where table_name = 'bookings' and record_id = ${firstId} and action = 'delete'
         and before_value ->> 'reason' = 'superseded'`;
    expect(audit).toHaveLength(1);
    const line = JSON.stringify(audit[0]!.before_value);
    expect(line).not.toContain(h.email);
    expect(line).not.toContain("Server Guest");
    expect(line).not.toContain("41790000000");
  });
});

test("Back while the old session is complete and unpaid in the database refuses, purges nothing @checkout", async () => {
  await withStack(async (h) => {
    const { tx } = h;
    const first = await h.intent(Q(4));
    expect(first.status).toBe(200);
    const firstId = String(first.json.booking_id);
    const s = [...h.sessions.values()][0]!;
    // Stripe says the customer paid; the database has not settled it yet.
    s.status = "complete";
    s.paymentIntent = "pi_test_sd_race_1";

    const second = await h.intent(Q(5), { supersedes: firstId });
    expect(second.status).not.toBe(200);
    expect(second.json.code).toBe("quote_already_booked");

    await tx`reset role`;
    const rows = await tx<{ id: string; status: string }[]>`
      select id::text as id, status from public.bookings where contact_email = ${h.email}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(firstId);
    expect(rows[0]!.status).toBe("pending");
    const purges = await tx<{ n: number }[]>`
      select count(*)::int as n from public.audit_log where table_name = 'bookings' and record_id = ${firstId} and action = 'delete'`;
    expect(purges[0]!.n).toBe(0);
  });
});

test("checkout.session.expired with a second session complete but unsettled does not purge @checkout", async () => {
  await withStack(async (h) => {
    const { tx } = h;
    const first = await h.intent(Q(6));
    expect(first.status).toBe(200);
    const bookingId = String(first.json.booking_id);
    const sessionA = [...h.sessions.keys()][0]!;
    const a = h.sessions.get(sessionA)!;

    // A second Stripe session for the same booking, attached the way the re-attach path does.
    const bId = `cs_test_sdB${Math.random().toString(36).slice(2, 8)}`;
    const b: FakeSession = {
      id: bId,
      status: "open",
      amount: a.amount,
      quoteId: a.quoteId,
      paymentIntent: null,
      presentment: null,
    };
    h.sessions.set(bId, b);
    await h.asRole("vamos_checkout", () =>
      attachPayment(tx, {
        quoteId: Q(6),
        stripePaymentIntentId: `pi_placeholder_${bId}`,
        stripeCheckoutSessionId: bId,
        chargedRappen: a.amount,
      }),
    );

    // A expires; B is complete on Stripe's side but not settled in the database.
    a.status = "expired";
    b.status = "complete";
    b.paymentIntent = "pi_test_sd_B";
    const handled = await h.settleEvent({
      eventId: "evt_sd_expired_A",
      type: "checkout.session.expired",
      objectId: sessionA,
      created: Math.floor(h.now.getTime() / 1000),
    });
    expect("ack" in handled).toBe(true);
    await tx`reset role`;
    const kept = await tx<{ status: string }[]>`select status from public.bookings where id = ${bookingId}::uuid`;
    expect(kept).toHaveLength(1);
    expect(kept[0]!.status).toBe("pending");

    // Control: once B is expired and unpaid too, the same event kind purges the row.
    b.status = "expired";
    b.paymentIntent = null;
    const handled2 = await h.settleEvent({
      eventId: "evt_sd_expired_B",
      type: "checkout.session.expired",
      objectId: bId,
      created: Math.floor(h.now.getTime() / 1000) + 1,
    });
    expect("ack" in handled2).toBe(true);
    await tx`reset role`;
    const gone = await tx<{ n: number }[]>`select count(*)::int as n from public.bookings where id = ${bookingId}::uuid`;
    expect(gone[0]!.n).toBe(0);
  });
});
