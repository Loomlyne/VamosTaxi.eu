// Stub answers for the dashboard-fixes pictures (quick 261005-dashboard-fixes).
// Booking rows run through the REAL mapBoardBooking of the tree being shown (before = origin/main as of
// 328b133c, after = this branch), bundled with esbuild, so each side gets the answer shape its own server code
// sends. Nothing here reaches a server. Amounts are small round fixtures (CHF 1.00 / 2.00 / 3.00): never a
// real price (project law 04).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repo = resolve(new URL("../../../../", import.meta.url).pathname);

export async function loadMapper(treeRoot, tmp) {
  const pnpm = join(repo, "node_modules/.pnpm");
  const dir = readdirSync(pnpm).filter((d) => d.startsWith("esbuild@")).sort().at(-1);
  const bin = join(pnpm, dir, "node_modules/esbuild/bin/esbuild");
  const outDir = mkdtempSync(join(tmp, "mapper-"));
  const outfile = join(outDir, "mapper.mjs");
  execFileSync(bin, [join(treeRoot, "apps/web/lib/ops/bookings-map.ts"), "--bundle", "--platform=node", "--format=esm", `--outfile=${outfile}`, "--log-level=error"]);
  return import(pathToFileURL(outfile).href);
}

const base = {
  status: "confirmed", contact_email: "rider@example.test", contact_phone: "+41 79 000 00 00", company_name: null, note: null,
  pay_link_sent_at: null, flight_no: null, pax: 2, bags: 1, payment_status: "captured", stripe_checkout_session_id: "cs_test_x",
  charged_rappen: 100, distance_km: 240, duration_min: 190,
};

/**
 * [reference, created_at (UTC), pickup wall clock (Zurich), pickup UTC, customer, from, to, class slug, class name, driver, rappen]
 * Pickups on Friday 9, Thursday 8, Wednesday 7 and Tuesday 6 October 2026; two are on classes the old console folded
 * into Economy: `first` (a dropped class that still has trips) and `studio` (a class the owner could add).
 */
const SQL = [
  ["VT-26-0836", "2026-10-01T09:20:00Z", "2026-10-09 08:15", "2026-10-09T06:15:00Z", "Nadia Frei", "Zurich Airport", "Lucerne", "first", "First", "Marco Bianchi", 300],
  ["VT-26-0831", "2026-10-02T23:30:00Z", "2026-10-08 06:50", "2026-10-08T04:50:00Z", "Jonas Weber", "Basel EuroAirport", "Bern", "van-luxury", "Van luxury", null, 300],
  ["VT-26-0829", "2026-09-29T07:05:00Z", "2026-10-07 14:40", "2026-10-07T12:40:00Z", "Amira Keller", "Geneva Airport", "Lausanne", "mercedes-benz-v-class", "Business", "Sofia Ricci", 200],
  ["VT-26-0833", "2026-10-03T22:30:00Z", "2026-10-06 09:30", "2026-10-06T07:30:00Z", "Luca Meier", "Bahnhofstrasse 1, Zurich", "Zurich Airport", "saden", "Economy", "Marco Bianchi", 100],
  ["VT-26-0837", "2026-10-04T12:32:00Z", "2026-10-06 18:05", "2026-10-06T16:05:00Z", "Elena Brunner", "Zurich Airport", "Zermatt", "studio", "Studio", null, 100],
];

function sqlRow(r, i) {
  const [reference, created, local, utc, name, from, to, slug, className, driver, rappen] = r;
  return {
    ...base,
    id: `6a1f0e0e-0836-4c0d-9a31-0d5b1c4a${String(800 + i).padStart(4, "0")}`,
    reference, contact_name: name, pickup_text: from, dropoff_text: to,
    scheduled_local: local, scheduled_at: utc, class_slug: slug, class_name: className, chauffeur_name: driver,
    captured_at: created, payment_created_at: created, snapshot_total_rappen: rappen, created_at: new Date(created),
  };
}

export async function stubRows(treeRoot, tmp) {
  const { mapBoardBooking } = await loadMapper(treeRoot, tmp);
  return SQL.map((r, i) => ({ ...mapBoardBooking(sqlRow(r, i)), events: [] }));
}

export const ME = { fullName: "Test Admin", role: "admin", email: "admin@example.com", lang: "en", twoFactor: true, userId: "u-1" };

// GET /api/staff/vehicle-classes as presentVehicleClass sends it (live rows, 2026-10-05, read-only), plus one class the
// owner could add. Order is sort_order, slug.
export const CLASSES = [
  { id: "c0", slug: "mahaha", klass: "Economy", name: "mahaha", sortOrder: 0, active: false },
  { id: "c1", slug: "saden", klass: "Economy", name: "Economy", sortOrder: 0, active: true },
  { id: "c2", slug: "economy", klass: "Economy", name: "Economy", sortOrder: 1, active: false },
  { id: "c3", slug: "business", klass: "Business", name: "Business", sortOrder: 2, active: false },
  { id: "c4", slug: "first", klass: "Economy", name: "First", sortOrder: 3, active: false },
  { id: "c5", slug: "van", klass: "Van luxury", name: "Van", sortOrder: 4, active: false },
  { id: "c6", slug: "mercedes-benz-v-class", klass: "Business", name: "Business", sortOrder: 10, active: true },
  { id: "c7", slug: "van-luxury", klass: "Van luxury", name: "Van luxury", sortOrder: 20, active: true },
  { id: "c8", slug: "studio", klass: "Economy", name: "Studio", sortOrder: 30, active: true },
].map((c) => ({ ...c, passengerCapacity: 3, luggageCapacity: 3, vehicleCount: 0, photoPath: "", photo: "" }));

// The Money in lines the server sends, before (three fixed lines, First and Studio folded into Economy) and after.
export const MONEY_AFTER = {
  period: "all", incomeRappen: 1100, refundRappen: 0, feeRappen: 0, fareCount: 5, refunds: [],
  byClass: [
    { klass: "Economy", rappen: 100 }, { klass: "Business", rappen: 200 }, { klass: "First", rappen: 300 },
    { klass: "Van luxury", rappen: 300 }, { klass: "Studio", rappen: 100 },
  ],
};
export const MONEY_BEFORE = {
  ...MONEY_AFTER,
  byClass: [{ klass: "Economy", rappen: 500 }, { klass: "Business", rappen: 200 }, { klass: "Van luxury", rappen: 300 }],
};

export function answer(method, path, ctx) {
  if (path === "/api/staff/me") return { status: 200, json: { ok: true, data: ctx.me ?? ME } };
  if (path === "/api/staff/bookings") return { status: 200, json: { ok: true, data: ctx.rows } };
  if (path === "/api/staff/vehicle-classes") return { status: 200, json: { ok: true, data: CLASSES } };
  if (path === "/api/staff/dashboard") return { status: 200, json: { ok: true, data: ctx.money } };
  if (method === "POST" && /\/api\/staff\/bookings\/.+\/(voucher|resend)/.test(path)) return ctx.voucher ?? { status: 200, json: { ok: true, data: { email: "rider@example.test" } } };
  return { status: 200, json: { ok: true, data: [] } };
}
