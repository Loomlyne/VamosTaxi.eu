// apps/web/lib/ops/stripe-payments.test.ts
//
// Phase 31 (D-01, D-06, D-14): the admin-only list of a booking's Stripe payments with a Stripe
// Dashboard link each. Row mapping is tested as a pure function; the SQL and both route mounts
// are pinned by reading their source (no DB, no route import). Synthetic ids and rappen only.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapStripePaymentRows, type StripePaymentSqlRow } from "./stripe-payments";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

const LOCALIZED_ROUTE = "apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/stripe-payments/route.ts";
const PLAIN_ROUTE = "apps/web/app/api/staff/bookings/[id]/stripe-payments/route.ts";
const ACCT = "acct_1AbCdEfGh";

function row(over: Partial<StripePaymentSqlRow>): StripePaymentSqlRow {
  return {
    id: 1,
    stripe_payment_intent_id: "pi_trip001",
    charged_rappen: 1000,
    captured_at: new Date("2026-01-02T03:04:05.000Z"),
    is_extra: false,
    refunded: 0,
    ...over,
  };
}

describe("mapStripePaymentRows", () => {
  it("maps kind, charged, left, captured time and the Stripe link, keeping the SQL order", () => {
    const rows = mapStripePaymentRows(
      [
        row({ id: 2, stripe_payment_intent_id: "pi_extra002", charged_rappen: "500", is_extra: true, refunded: "100" }),
        row({ id: 1 }),
      ],
      "test",
      ACCT,
    );
    expect(rows).toEqual([
      {
        kind: "extra",
        chargedRappen: 500,
        leftRappen: 400,
        capturedAt: "2026-01-02T03:04:05.000Z",
        url: "https://dashboard.stripe.com/acct_1AbCdEfGh/test/payments/pi_extra002",
      },
      {
        kind: "trip",
        chargedRappen: 1000,
        leftRappen: 1000,
        capturedAt: "2026-01-02T03:04:05.000Z",
        url: "https://dashboard.stripe.com/acct_1AbCdEfGh/test/payments/pi_trip001",
      },
    ]);
  });

  it("never gives a negative left amount and keeps a fully refunded payment (the page decides)", () => {
    const [over, full] = mapStripePaymentRows(
      [row({ refunded: 1200 }), row({ id: 3, stripe_payment_intent_id: "pi_full003", refunded: 1000 })],
      "live",
      undefined,
    );
    expect(over?.leftRappen).toBe(0);
    expect(full?.leftRappen).toBe(0);
    expect(full?.url).toBe("https://dashboard.stripe.com/payments/pi_full003");
  });

  it("reads a missing or bad captured time as null and string or null amounts as numbers", () => {
    const [a, b] = mapStripePaymentRows(
      [
        row({ captured_at: null, charged_rappen: null, refunded: null }),
        row({ id: 4, stripe_payment_intent_id: "pi_bad004", captured_at: "not a date" }),
      ],
      "live",
      null,
    );
    expect(a).toMatchObject({ capturedAt: null, chargedRappen: 0, leftRappen: 0 });
    expect(b?.capturedAt).toBeNull();
    expect(mapStripePaymentRows([row({ captured_at: "2026-01-02T03:04:05Z" })], "live", null)[0]?.capturedAt).toBe(
      "2026-01-02T03:04:05.000Z",
    );
  });

  it("drops a payment whose id gives no link, and a malformed account id never reaches the link", () => {
    const rows = mapStripePaymentRows(
      [row({ stripe_payment_intent_id: "cs_session" }), row({ id: 5, stripe_payment_intent_id: "pi_x/../y" }), row({ id: 6 })],
      "live",
      "evil.com",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.url).toBe("https://dashboard.stripe.com/payments/pi_trip001");
  });

  it("carries only kind, amounts, captured time and the link (no ids, names or e-mails)", () => {
    const [r] = mapStripePaymentRows([row({})], "live", ACCT);
    expect(Object.keys(r ?? {}).sort()).toEqual(["capturedAt", "chargedRappen", "kind", "leftRappen", "url"]);
  });
});

describe("loadStripePayments source", () => {
  const src = read("apps/web/lib/ops/stripe-payments.ts");

  it("reads succeeded pi_ payments as staff, non-reversed refunds only, newest first", () => {
    expect(src).toMatch(/asStaff\(/);
    expect(src).not.toMatch(/asSystem/);
    expect(src).toMatch(/p\.status = 'succeeded'/);
    // The template literal holds `\\_` so Postgres receives `pi\_%` (a literal underscore).
    expect(src).toMatch(/p\.stripe_payment_intent_id like 'pi\\\\_%'/);
    expect(src).toMatch(/not exists \(select 1 from public\.booking_refund_reversals as x where x\.refund_id = r\.id\)/);
    expect(src).toMatch(/order by p\.captured_at desc nulls last, p\.id desc/);
    expect(src).not.toMatch(/booking_refund_intents/);
  });

  it("takes the mode from the Worker key, the account from STRIPE_ACCOUNT_ID, the booking via resolveStaffBookingId", () => {
    expect(src).toMatch(/stripeSecretKeyMode\(env\.STRIPE_SECRET_KEY\)/);
    expect(src).toMatch(/env\.STRIPE_ACCOUNT_ID/);
    expect(src).toMatch(/resolveStaffBookingId\(/);
    expect(src).toMatch(/"stripe-mode-unknown"/);
    expect(src).toMatch(/"not-found"/);
  });

  it("is force-dynamic (check:db-fences Ban #5) and does not import the old refund module", () => {
    expect(src).toMatch(/^export const dynamic = "force-dynamic";$/m);
    expect(src).not.toMatch(/from "\.\/refund"|from "@\/lib\/ops\/refund"/);
    expect(src).not.toMatch(/fetch\(/);
  });
});

describe("stripe-payments route mounts", () => {
  it("localized route: withAdmin GET only, force-dynamic, 404 / 503 answers", () => {
    const route = read(LOCALIZED_ROUTE);
    expect(route).toMatch(/export const GET = withAdmin\(/);
    expect(route).not.toMatch(/withStaff/);
    expect(route).not.toMatch(/export const (POST|PUT|PATCH|DELETE)/);
    expect(route).toMatch(/^export const dynamic = "force-dynamic";$/m);
    expect(route).toMatch(/loadStripePayments\(/);
    expect(route).toMatch(/id === "stripe-payments"/);
    expect(route).toMatch(/jsonErr\("not-found", 404\)/);
    expect(route).toMatch(/503/);
    expect(route).not.toMatch(/redirect/i);
  });

  it("plain mount re-exports GET only from the localized route", () => {
    const pub = read(PLAIN_ROUTE);
    expect(pub).toMatch(/^export const dynamic = "force-dynamic";$/m);
    expect(pub).toMatch(/export \{ GET \} from "\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/\[locale\]\/\(ops\)\/api\/staff\/bookings\/\[id\]\/stripe-payments\/route";/);
    expect(pub).not.toMatch(/POST/);
    expect(pub.trim().split("\n")).toHaveLength(2);
  });
});
