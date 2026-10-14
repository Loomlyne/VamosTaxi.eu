// Offline answers for the Phase 31 signing pictures. Nothing reaches a server: every /api/* request of the
// page is fulfilled here. Amounts are zero (law 04: never a price). Booking rows for the dashboard run through
// the REAL mapBoardBooking of this tree (bundled with esbuild), so the answer has the shape the server sends.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repo = resolve(new URL("../../../../", import.meta.url).pathname);
/** node_modules come from the main checkout (this worktree has none installed). */
export const DEPS = process.env.P31_DEPS || "/Users/koss/Developer/VamosTaxi.eu";

export async function loadMapper() {
  const pnpm = join(DEPS, "node_modules/.pnpm");
  const dir = readdirSync(pnpm).filter((d) => d.startsWith("esbuild@")).sort().at(-1);
  const bin = join(pnpm, dir, "node_modules/esbuild/bin/esbuild");
  const outfile = join(mkdtempSync(join(tmpdir(), "p31-mapper-")), "mapper.mjs");
  execFileSync(bin, [join(repo, "apps/web/lib/ops/bookings-map.ts"), "--bundle", "--platform=node", "--format=esm", `--outfile=${outfile}`, "--log-level=error"]);
  return import(pathToFileURL(outfile).href);
}

export const ME = { fullName: "Test Admin", role: "admin", email: "admin@example.com", lang: "en", twoFactor: true, userId: "u-1" };
export const REF = "VT-26-0900";
const BOOKING_ID = "6a1f0e0e-0836-4c0d-9a31-0d5b1c4a0900";

/** A paid trip in Economy Van, cancelled by the customer late (refund left to you), nothing refunded yet. */
export async function bookingRows() {
  const { mapBoardBooking } = await loadMapper();
  const row = {
    id: BOOKING_ID, reference: REF, status: "cancelled", contact_name: "Nadia Frei", contact_email: "rider@example.test", contact_phone: "+41 79 000 00 00",
    company_name: null, note: null, pay_link_sent_at: null, flight_no: null, pax: 2, bags: 1, payment_status: "captured", stripe_checkout_session_id: "cs_test_x",
    charged_rappen: 0, snapshot_total_rappen: 0, distance_km: 0, duration_min: 0, pickup_text: "Zurich Airport", dropoff_text: "Lucerne",
    scheduled_local: "2026-10-20 08:15", scheduled_at: "2026-10-20T06:15:00Z", class_slug: "economy-van", class_name: "Economy Van",
    chauffeur_name: null, assigned_chauffeur_id: null, captured_at: "2026-10-10T09:00:00Z", payment_created_at: "2026-10-10T09:00:00Z", created_at: new Date("2026-10-10T09:00:00Z"),
    refund_status: "pending_ops", refund_owed_rappen: null, refund_rappen: 0, trip_passed: false,
  };
  return [{ ...mapBoardBooking(row), events: [] }];
}

const PAY = (id, kind, at) => ({ id, kind, chargedRappen: 0, refundedRappen: 0, leftRappen: 0, capturedAt: at });
/** GET …/refund (before): one trip payment, late-cancel review. */
export const REFUND_PICKER = { payments: [PAY(1, "trip", "2026-10-10T09:00:00Z")], fullTier: false, creditTier: false, dueRappen: 0, refundedRappen: 0 };
/** GET …/stripe-payments (after). Test-mode PaymentIntent pages on the staging test account. */
const URL0 = "https://dashboard.stripe.com/acct_1UIZmqHcNp9GZYjz/test/payments/";
export const STRIPE_ONE = [{ ...PAY(1, "trip", "2026-10-10T09:00:00Z"), url: URL0 + "pi_trip" }];
export const STRIPE_TWO = [{ ...PAY(2, "extra", "2026-10-11T15:40:00Z"), url: URL0 + "pi_extras" }, ...STRIPE_ONE];

/** Customer account answers: the same booking, cancel window as given. */
export function accountRows() {
  return { ok: true, bookings: [{ id: BOOKING_ID, ref: REF, status: "booked", pickup: "Zurich Airport", dropoff: "Lucerne", dateIso: "2026-10-20", time: "08:15", pax: 2, priceRappen: 0, contactEmail: "rider@example.test", reviewState: "none" }] };
}
export function accountDetails(c) {
  return { ok: true, money: null, driver: null, refundStatus: c.refundStatus, refundOwedRappen: c.owed || 0, refundedRappen: 0, status: c.status, canCancel: c.canCancel, cancelWindow: c.cancelWindow, reviewSubmitted: false };
}

/** state = { bookings, picker, stripe, details } */
export async function installStubs(page, state, log = []) {
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const json = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    const ok = (data) => json({ ok: true, data });
    if (url.hostname !== "127.0.0.1") return route.abort();
    log.push(`${method} ${path}`);
    // The cookie sheet would cover the page: answer that a choice was already made (essential only).
    if (path === "/api/consent/state") return json({ ok: true, chosen: true, choice: { functional: false, analytics: false, marketing: false }, policyVersion: "2026-09-12" });
    if (path === "/api/auth/session") return json({ signedIn: true, finishRequired: false });
    if (path === "/api/account/bookings") return json(accountRows());
    if (path === "/api/account/bookings/details") return json(accountDetails(state.details || {}));
    if (path === "/api/staff/me") return ok(ME);
    if (method !== "GET") return ok({});
    if (path === "/api/staff/bookings") return ok(state.bookings || []);
    if (/\/api\/staff\/bookings\/[^/]+\/refund$/.test(path)) return ok(state.picker || REFUND_PICKER);
    if (/\/api\/staff\/bookings\/[^/]+\/stripe-payments$/.test(path)) return ok(state.stripe || []);
    return ok([]);
  });
  await page.route((u) => u.hostname !== "127.0.0.1", (route) => route.abort());
}
