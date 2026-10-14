// apps/web/lib/security/booking-answer-keys.test.ts
//
// Owner 2026-10-04, "hide all ids": guest and customer booking answers carry no internal UUID
// (d92a9c26). Each route below is run with its library call mocked to return the ids it really
// returns (bookingId, requestId, review_id, booking_id), and the success answer is pinned to its
// exact keys, so a route that puts an id back into its answer fails here.

import { beforeEach, describe, expect, it, vi } from "vitest";

const BOOKING_ID = "aaaaaaaa-0000-4000-8000-00000000000a";
const REQUEST_ID = "cccccccc-0000-4000-8000-00000000000c";
const REVIEW_ID = "dddddddd-0000-4000-8000-00000000000d";
const REF = "VT-26-0101";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { QUOTE_RATE_LIMITER: {}, TURNSTILE_SECRET_KEY: "test" } }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "token-a" }) }),
}));
vi.mock("@/lib/checkout/manage-token", () => ({
  MANAGE_COOKIE_NAME: "vt_manage",
  readManageCookie: (value: string) => value,
  rawManageTokenFromRequest: () => "token-a",
  hashManageToken: async () => "abcd",
}));
vi.mock("@/lib/security/origin", () => ({ csrfForbidden: () => null }));
vi.mock("@/lib/abuse/account-write", () => ({ accountWriteForbidden: async () => null }));
vi.mock("@/lib/abuse/rate-limit", () => ({ checkWriteRateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: async () => ({ ok: true }) }));
vi.mock("@/lib/account/session", () => ({
  customerClaims: async () => ({ email: "anna@example.com", sub: "user-1" }),
}));
vi.mock("@/lib/ops/edit-request", () => ({
  requestCustomerTimeChange: async () => ({
    ok: true,
    requestId: REQUEST_ID,
    bookingId: BOOKING_ID,
    status: "requested",
  }),
  writeCustomerFlightNo: async () => ({ ok: true, bookingId: BOOKING_ID, flightNo: "LX318" }),
}));
// Phase 31 D-04: a cancel answer carries no refund amount. The library result no longer has one; the
// stray `refundRappen` below stands for a library that leaks it again, and the routes must still not echo it.
vi.mock("@/lib/lifecycle/paid-cancel", () => {
  const cancelled = async () => ({
    ok: true,
    bookingId: BOOKING_ID,
    refundMode: "auto",
    refundStatus: "pending",
    refundRappen: 4000,
    payoutCountry: null,
    availableOn: null,
  });
  return { paidCancelCustomer: cancelled, paidCancelGuest: cancelled };
});
vi.mock("@/lib/db/system-reads", () => ({
  loadManageReviewState: async () => ({ review_submitted: false, price_total_rappen: 0 }),
}));

// Fields merged over the manage_booking_read row (Phase 31 D-04 cases below); reset before each test.
let manageRowOver: Record<string, unknown> = {};

function sqlFor(text: string): unknown[] {
  if (text.includes("manage_booking_read")) {
    return [
      {
        booking_id: BOOKING_ID,
        reference: REF,
        status: "paid",
        locale: "en",
        contact_name: "Anna",
        contact_email: "anna@example.com",
        contact_phone: null,
        pickup_text: "Zurich Airport",
        dropoff_text: "Zurich HB",
        scheduled_at: "2026-11-01T08:00:00Z",
        scheduled_local: "2026-11-01T09:00",
        original_scheduled_at: "2026-11-01T08:00:00Z",
        flight_no: null,
        pax: 1,
        bags: 0,
        refund_status: null,
        refund_owed_rappen: 0,
        refunded_rappen: 0,
        payout_country: null,
        available_on: null,
        ...manageRowOver,
      },
    ];
  }
  if (text.includes("manage_booking_extras")) return [{ payload: null }];
  if (text.includes("submit_review")) return [{ review_id: REVIEW_ID, booking_id: BOOKING_ID }];
  if (text.includes("from public.bookings")) return [{ id: BOOKING_ID }];
  throw new Error(`unexpected sql: ${text}`);
}

vi.mock("@/lib/db/identity", () => {
  const run = async (fn: (sql: unknown) => unknown) =>
    fn(async (strings: TemplateStringsArray) => sqlFor(strings.join("?")));
  return {
    asGuest: async (_env: unknown, _hash: string, fn: (sql: unknown) => unknown) => run(fn),
    asCustomer: async (_env: unknown, _claims: unknown, fn: (sql: unknown) => unknown) => run(fn),
    asSystem: async (_env: unknown, fn: (sql: unknown) => unknown) => run(fn),
    asStaff: vi.fn(),
  };
});

import { GET as manageBooking } from "../../app/api/manage/booking/route";
import { POST as manageTimeChange } from "../../app/api/manage/time-change/route";
import { POST as accountTimeChange } from "../../app/api/account/bookings/time-change/route";
import { POST as manageFlight } from "../../app/api/manage/flight/route";
import { POST as accountFlight } from "../../app/api/account/bookings/flight/route";
import { POST as accountPaidCancel } from "../../app/api/account/bookings/paid-cancel/route";
import { POST as manageCancel } from "../../app/api/manage/cancel/route";
import { POST as reviewSubmit } from "../../app/api/reviews/submit/route";

function post(path: string, body: unknown): Request {
  return new Request(`https://vamostaxi.site${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function okBody(res: Response): Promise<Record<string, unknown>> {
  expect(res.status).toBe(200);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.ok).toBe(true);
  return body;
}

function keys(value: unknown): string[] {
  return Object.keys(value as Record<string, unknown>).sort();
}

function noUuid(body: unknown): void {
  const text = JSON.stringify(body);
  for (const id of [BOOKING_ID, REQUEST_ID, REVIEW_ID]) expect(text).not.toContain(id);
}

beforeEach(() => {
  vi.clearAllMocks();
  manageRowOver = {};
});

describe("guest and customer booking answers carry no internal id (exact keys)", () => {
  it("GET /api/manage/booking: booking has no id", async () => {
    const body = await okBody(await manageBooking(new Request("https://vamostaxi.site/api/manage/booking")));
    expect(keys(body)).toStrictEqual(["booking", "ok"]);
    expect(keys(body.booking)).toStrictEqual(
      [
        "availableOn",
        "bags",
        "cancelWindow",
        "canCancel",
        "contactEmail",
        "contactName",
        "driver",
        "dropoffText",
        "flightNo",
        "locale",
        "money",
        "originalScheduledAt",
        "pax",
        "payoutCountry",
        "payoutCountryLabel",
        "pickupText",
        "priceTotalRappen",
        "reference",
        "refundedRappen",
        "refundOwedRappen",
        "refundStatus",
        "reviewSubmitted",
        "scheduledLocal",
        "status",
      ].sort(),
    );
    noUuid(body);
  });

  it("POST /api/manage/time-change: ok and status only (no requestId, no bookingId)", async () => {
    const body = await okBody(
      await manageTimeChange(post("/api/manage/time-change", { ref: REF, scheduled_local: "2026-11-01T10:00" })),
    );
    expect(keys(body)).toStrictEqual(["ok", "status"]);
    noUuid(body);
  });

  it("POST /api/account/bookings/time-change: ok and status only (no requestId, no bookingId)", async () => {
    const body = await okBody(
      await accountTimeChange(
        post("/api/account/bookings/time-change", { ref: REF, scheduled_local: "2026-11-01T10:00" }),
      ),
    );
    expect(keys(body)).toStrictEqual(["ok", "status"]);
    noUuid(body);
  });

  it("POST /api/manage/flight: ok and flightNo only (no bookingId)", async () => {
    const body = await okBody(await manageFlight(post("/api/manage/flight", { ref: REF, flight_no: "LX318" })));
    expect(keys(body)).toStrictEqual(["flightNo", "ok"]);
    noUuid(body);
  });

  it("POST /api/account/bookings/flight: ok and flightNo only (no bookingId)", async () => {
    const body = await okBody(
      await accountFlight(post("/api/account/bookings/flight", { ref: REF, flight_no: "LX318" })),
    );
    expect(keys(body)).toStrictEqual(["flightNo", "ok"]);
    noUuid(body);
  });

  it("POST /api/account/bookings/paid-cancel: refund status only (no bookingId, no amount: Phase 31 D-04)", async () => {
    const body = await okBody(await accountPaidCancel(post("/api/account/bookings/paid-cancel", { ref: REF })));
    expect(keys(body)).toStrictEqual(["availableOn", "ok", "payoutCountry", "refundMode", "refundStatus"].sort());
    noUuid(body);
  });

  it("POST /api/manage/cancel: refund status only (no bookingId, no amount: Phase 31 D-04)", async () => {
    const body = await okBody(await manageCancel(post("/api/manage/cancel", { ref: REF })));
    expect(keys(body)).toStrictEqual(["availableOn", "ok", "payoutCountry", "refundMode", "refundStatus"].sort());
    noUuid(body);
  });

  const review = { company: 5, chauffeur: 5, overall: 5, comment: "Lab review", turnstileToken: "t" };

  it("POST /api/reviews/submit with a review-link token: {ok:true} only (no reviewId, no bookingId)", async () => {
    const body = await okBody(await reviewSubmit(post("/api/reviews/submit", { ...review, token: "token-a" })));
    expect(body).toStrictEqual({ ok: true });
  });

  it("POST /api/reviews/submit signed in: {ok:true} only (no reviewId, no bookingId)", async () => {
    const body = await okBody(await reviewSubmit(post("/api/reviews/submit", { ...review, bookingRef: REF })));
    expect(body).toStrictEqual({ ok: true });
  });
});

// Phase 31 D-04: the customer sees one policy line for a cancel and no computed refund, so the guest booking
// read gives no owed amount for a cancelled booking. The refunded amount stays (D-02), and a live booking keeps
// its owed amount for the class/trip difference line (owner-approved 2026-10-01). Synthetic rappen.
describe("GET /api/manage/booking: no owed amount on a cancelled booking (Phase 31 D-04)", () => {
  for (const status of ["cancelled", "refunded", "partially_cancelled"]) {
    it(`${status}: refundOwedRappen 0, refundedRappen unchanged`, async () => {
      manageRowOver = { status, refund_status: "pending_ops", refund_owed_rappen: "12000", refunded_rappen: "3000" };
      const body = await okBody(await manageBooking(new Request("https://vamostaxi.site/api/manage/booking")));
      const booking = body.booking as Record<string, unknown>;
      expect(booking).toMatchObject({ status, refundStatus: "pending_ops", refundOwedRappen: 0, refundedRappen: 3000 });
    });
  }

  it("a live booking (confirmed) keeps the stored owed amount for the difference line", async () => {
    manageRowOver = { status: "confirmed", refund_status: "pending_ops", refund_owed_rappen: "1500", refunded_rappen: "0" };
    const body = await okBody(await manageBooking(new Request("https://vamostaxi.site/api/manage/booking")));
    expect(body.booking).toMatchObject({ status: "confirmed", refundOwedRappen: 1500, refundedRappen: 0 });
  });
});
