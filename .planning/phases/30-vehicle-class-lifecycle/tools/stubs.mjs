// Offline answers for the Phase 30 signing pictures. Nothing here reaches a server: every /api/* request of
// the page is fulfilled by `installStubs`. Demo data is only the three real class names, three chauffeurs,
// and zero amounts (law 04: never a price).
// Booking rows run through the REAL mapBoardBooking of this tree (bundled with esbuild), so the answer has
// the shape the server sends.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repo = resolve(new URL("../../../../", import.meta.url).pathname);

export async function loadMapper() {
  const pnpm = join(repo, "node_modules/.pnpm");
  const dir = readdirSync(pnpm).filter((d) => d.startsWith("esbuild@")).sort().at(-1);
  const bin = join(pnpm, dir, "node_modules/esbuild/bin/esbuild");
  const outfile = join(mkdtempSync(join(tmpdir(), "p30-mapper-")), "mapper.mjs");
  execFileSync(bin, [join(repo, "apps/web/lib/ops/bookings-map.ts"), "--bundle", "--platform=node", "--format=esm", `--outfile=${outfile}`, "--log-level=error"]);
  return import(pathToFileURL(outfile).href);
}

export const ME = { fullName: "Test Admin", role: "admin", email: "admin@example.com", lang: "en", twoFactor: true, userId: "u-1" };

export const ID = { sedan: "c1000000-0000-4000-8000-000000000001", van: "c1000000-0000-4000-8000-000000000002", lux: "c1000000-0000-4000-8000-000000000003" };
const SLUG = { sedan: "saden", van: "economy-van", lux: "van-luxury" };
const NAME = { sedan: "Economy Sedan", van: "Economy Van", lux: "Luxury Van" };
const ORDER = { sedan: 0, van: 10, lux: 20 };

/** 140 plain characters (counted by the caller). */
export const REASON_140 = "Replaced by a newer van next season, so this class is no longer offered to customers and its chauffeurs move to the other classes in spring.";

/**
 * `status` = { sedan, van, lux } each 'live' | 'draft' | 'retired'; `reasons` = { key: text }.
 * Row shape = presentVehicleClass + status + retiredReason (editors' contract).
 */
export function classRows(status, reasons = {}) {
  return ["sedan", "van", "lux"].map((k) => ({
    id: ID[k], slug: SLUG[k], klass: NAME[k], name: NAME[k], passengerCapacity: 3, luggageCapacity: 3, sortOrder: ORDER[k],
    active: status[k] === "live", status: status[k], retiredReason: reasons[k] || "", vehicleCount: 0,
    inLiveBook: true, photoPath: `site/${SLUG[k]}.jpg`, photo: `site/${SLUG[k]}.jpg`,
  }));
}

const money = { CHF: "0", EUR: "0", USD: "0", AED: "0" };
/** Rate-book answer: one rate row per class that is not Draft-only (all three here), amounts 0. */
export function rateBook(status) {
  const rates = ["sedan", "van", "lux"].filter((k) => status[k] !== "draft").map((k) => ({
    id: `r-${k}`, klass: NAME[k], name: NAME[k], vehicleClassId: ID[k], vehicleClassSlug: SLUG[k], photo: `site/${SLUG[k]}.jpg`,
    baseFare: money, perKm: money, minFare: money, airportStart: money, maxPax: 3, maxBags: 3, available: true, hideFromPublic: false, sortOrder: ORDER[k],
  }));
  return { zones: [], classes: classRows(status).map((c) => ({ id: c.id, slug: c.slug, label: c.name, name: c.name })), rates, routes: [], bands: [], regionPremiums: [], surcharges: [], rules: [], vatRateBps: 81 };
}

/** chauffeurs: [[name, classKey|null, status]] */
export function chauffeurRows(list) {
  return list.map(([name, key, st], i) => ({
    id: `d0000000-0000-4000-8000-00000000000${i + 1}`, name, fullName: name, phone: "", email: "", plate: key ? `ZH ${100 + i}` : "",
    vehicleClassId: key ? ID[key] : "", vehicleClassName: key ? NAME[key] : "", status: st || "shift", languages: ["en"], shiftWeekdays: [], leaveRanges: [],
  }));
}

const BOOKING_ID = "6a1f0e0e-0836-4c0d-9a31-0d5b1c4a0900";
/** A paid, upcoming trip in Economy Van, no chauffeur. */
export async function bookingRows() {
  const { mapBoardBooking } = await loadMapper();
  const row = {
    id: BOOKING_ID, reference: "VT-26-0900", status: "confirmed", contact_name: "Nadia Frei", contact_email: "rider@example.test", contact_phone: "+41 79 000 00 00",
    company_name: null, note: null, pay_link_sent_at: null, flight_no: null, pax: 2, bags: 1, payment_status: "captured", stripe_checkout_session_id: "cs_test_x",
    charged_rappen: 0, snapshot_total_rappen: 0, distance_km: 0, duration_min: 0, pickup_text: "Zurich Airport", dropoff_text: "Lucerne",
    scheduled_local: "2026-10-20 08:15", scheduled_at: "2026-10-20T06:15:00Z", class_slug: SLUG.van, class_name: NAME.van, vehicle_class_id: ID.van,
    chauffeur_name: null, assigned_chauffeur_id: null, captured_at: "2026-10-10T09:00:00Z", payment_created_at: "2026-10-10T09:00:00Z", created_at: new Date("2026-10-10T09:00:00Z"),
  };
  return [{ ...mapBoardBooking(row), events: [] }];
}
export const BOOKING_REF = "VT-26-0900";

/** state = { status, reasons, chauffeurs (rows), bookings (rows), quoteClasses }. Read live per request. */
export async function installStubs(page, state, log = []) {
  await page.route("**/api/**", (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const ok = (data) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data }) });
    if (url.hostname !== "127.0.0.1") return route.abort();
    log.push(`${method} ${path}`);
    if (path === "/api/staff/me") return ok(ME);
    if (path === "/api/quote" && method === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, classes: state.quoteClasses || [] }) });
    if (method !== "GET") return ok({});
    if (path === "/api/staff/vehicle-classes") return ok(classRows(state.status, state.reasons));
    if (path === "/api/staff/chauffeurs") return ok(state.chauffeurs || []);
    if (path === "/api/staff/bookings") return ok(state.bookings || []);
    if (path === "/api/staff/rate-book") return ok(rateBook(state.status));
    if (path === "/api/staff/rate-versions") return ok({ versions: [{ id: "v-live", status: "live" }] });
    if (path === "/api/staff/vehicles") return ok([]);
    return ok([]);
  });
  await page.route((u) => u.hostname !== "127.0.0.1", (route) => route.abort());
}
