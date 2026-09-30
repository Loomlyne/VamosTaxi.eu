// apps/web/lib/checkout/other-device.test.ts
//
// Phase 26.5 plan 10 (owner decision D-16, .planning/decisions/2026-09-30-unpaid-booking-other-device.md):
// an unpaid booking is never continued on another device, by link or by signing in. Route and law
// tests: pure logic where the code has it, source checks where the guarantee is "this route has
// no such path". The Worker e2e (tests/e2e-worker/other-device.e2e.mjs) proves it on real routes.
// No prices: synthetic strings only.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { checkIntentAgainstLock, type CheckIntentDeps } from "../quote/intent";
import { mintLock, type QuoteLockPayload } from "../quote/lock";
import { meWithDeps } from "./me";
import { resumeCheckoutWithDeps, type ResumeDeps } from "./resume";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const src = (rel: string) => readFileSync(join(webRoot, rel), "utf8");
/** Source with line comments removed, so a law never trips over prose. */
const code = (rel: string) => src(rel).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const Q = "00000000-0000-4000-8000-000000000001";
const Y = "00000000-0000-4000-8000-000000000002";

describe("resume: cookie-hash only (T-26.5-46)", () => {
  const deps = (over: Partial<ResumeDeps> = {}): ResumeDeps => ({
    hashCookie: async () => "ab".repeat(32),
    readRow: async () => null,
    retrieveSession: async () => {
      throw new Error("no session lookup expected");
    },
    ...over,
  });

  it("no cookie and a valid quote -> exactly none, readRow never called", async () => {
    const readRow = vi.fn();
    const answer = await resumeCheckoutWithDeps(Q, "", deps({ readRow }));
    expect(answer).toEqual({ state: "none" });
    expect(readRow).not.toHaveBeenCalled();
  });

  it("a cookie whose hash matches nothing -> exactly purged, no other key", async () => {
    const answer = await resumeCheckoutWithDeps(Q, "some-other-browsers-cookie", deps());
    expect(answer).toEqual({ state: "purged" });
    expect(Object.keys(answer)).toEqual(["state"]);
  });

  it("the route has no customer-session path and its only DB call is checkout_resume_read", () => {
    const route = code("app/api/checkout/resume/route.ts");
    expect(route).not.toMatch(/customerClaims|asCustomer|asSystem|asStaff/);
    expect(route).toMatch(/checkout_resume_read\(/);
    expect(route.match(/public\.\w+/g)).toEqual(["public.checkout_resume_read"]);
    expect(route).toMatch(/readManageCookie\("",\s*request\.headers\.get\("cookie"\)\)/);
  });
});

describe("me: profile only (T-26.5-48)", () => {
  it("answer keys are within the allowlist, and carry nothing from a booking", async () => {
    const answer = await meWithDeps({
      customerId: async () => "c1",
      readOwnRow: async () => ({ full_name: "Ada Rider", email: "ada@example.test", phone: "+41000000001" }),
    });
    const allowed = ["signed_in", "email", "first_name", "last_name", "phone"];
    expect(Object.keys(answer).every((k) => allowed.includes(k))).toBe(true);
    expect(Object.keys(answer).sort()).toEqual([...allowed].sort());
  });

  it("the me route reads public.customers and never bookings", () => {
    const route = code("app/api/checkout/me/route.ts");
    expect(route).toMatch(/from public\.customers/);
    expect(route).not.toMatch(/bookings|booking_legs|price_snapshots|checkout_resume_read|company|coupon/i);
  });
});

describe("account list and details hide unpaid bookings", () => {
  it("the list keeps the pending / pay-link filter verbatim", () => {
    const route = src("app/api/account/bookings/route.ts");
    expect(route).toContain("b.status::text <> 'quote'");
    expect(route).toContain("b.status::text <> 'pending'");
    expect(route).toContain("or b.pay_link_sent_at is not null");
  });

  it("the details route reads through customer_booking_extras, which excludes quote and pending", () => {
    const route = code("app/api/account/bookings/details/route.ts");
    expect(route).toMatch(/customer_booking_extras/);
    const migration = readFileSync(
      join(webRoot, "../../packages/db/supabase/migrations/20260930190000_manage_booking_money_driver.sql"),
      "utf8",
    );
    expect(migration).toMatch(/not in \('quote', 'pending'\)/);
  });
});

describe("intent: a pasted quote id needs the signed lock of that quote (T-26.5-47)", () => {
  const SECRET = "test-quote-lock-secret-current-not-real-00";
  const payload = (quoteId: string): QuoteLockPayload => ({
    v: 1,
    quote_id: quoteId,
    exp: "2099-01-01T12:00:00.000Z",
    engine_version: "quote-engine@test",
    rate_version_id: null,
    settings_version_id: 1,
    computed_at: "2026-08-28T10:00:00.000Z",
    display_currency: "CHF",
    mode: "one_way",
    pax: 1,
    bags: 0,
    legs: [],
    extras: null,
    coupon: null,
    class_totals: [{ slug: "economy", total_rappen: null }],
  });

  it("a lock minted for quote Y with a body for quote X is refused as quote_not_found, with no booking data", async () => {
    const lockForY = await mintLock({ current: SECRET }, payload(Y));
    const now = "2026-08-28T12:00:00.000Z";
    const recompute = vi.fn();
    const deps: CheckIntentDeps = { secrets: { current: SECRET }, workerNowIso: now, postgresNowIso: now, recompute };
    const answer = await checkIntentAgainstLock(
      { quote_id: Q, lock: lockForY, vehicle_class: "economy", idempotency_key: "idem-x" },
      deps,
    );
    expect(answer).toEqual({ ok: false, code: "quote_not_found" });
    expect(recompute).not.toHaveBeenCalled();
    expect(JSON.stringify(answer)).not.toMatch(/booking|reference|VT-|stripe|url/i);
  });

  it("in runCheckoutIntent the lock check runs before any open-booking lookup, and supersedes needs vt_manage ownership", () => {
    const intent = code("lib/checkout/intent.ts");
    const lockAt = intent.indexOf("checkIntentAgainstLock(intentBody");
    const openAt = intent.indexOf("deps.loadOpenPayment(body.quote_id)");
    expect(lockAt).toBeGreaterThan(0);
    expect(openAt).toBeGreaterThan(lockAt);
    expect(intent).toMatch(/deps\.ownsBooking\s*&&\s*\(await deps\.ownsBooking\(body\.supersedes\)\)/);
  });

  it("the sign_in_first answer body has only ok and code (stage is added by the client mapper), no booking field", () => {
    const gate = code("lib/checkout/account-gate.ts");
    expect(gate).toContain("JSON.stringify({ ok: false, code })");
    expect(gate).toMatch(/verifierCookieHeaders/);
    expect(gate).toMatch(/code-verifier/);
  });
});

describe("manage and pay link", () => {
  it("the manage route sets vt_manage only on a 200, and an unpaid booking answers 404", () => {
    const route = code("app/api/manage/booking/route.ts");
    expect(route).toMatch(/if \(rawToken && status === 200\)\s*\{\s*res\.cookies\.set\(MANAGE_COOKIE_NAME/);
    expect(route).toMatch(/gone[\s\S]{0,200}404|404[\s\S]{0,200}gone/);
  });

  it("the pay-link open route never reads vt_manage or the cookie header", () => {
    const route = code("app/api/checkout/pay-link/open/route.ts");
    expect(route).not.toMatch(/vt_manage|readManageCookie|MANAGE_COOKIE_NAME|headers\.get\("cookie"\)|rawManageTokenFromRequest/);
    expect(route).toMatch(/checkout_pay_link_/);
  });
});
