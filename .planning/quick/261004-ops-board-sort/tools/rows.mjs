// Stub answers for the bookings-table pictures of quick 261004-ops-board-sort.
// The rows go through the REAL mapBoardBooking (bundled with esbuild from apps/web/lib/ops/bookings-map.ts),
// so the answer has exactly the shape GET /api/staff/bookings sends, createdAt and class included. Nothing here
// reaches a server. Amounts are small round fixtures (CHF 1.00 ... 6.00): never a real price (project law 04).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repo = resolve(new URL("../../../../", import.meta.url).pathname);

async function loadMapper() {
  const pnpm = join(repo, "node_modules/.pnpm");
  const dir = readdirSync(pnpm).filter((d) => d.startsWith("esbuild@")).sort().at(-1);
  if (!dir) throw new Error("esbuild is not installed (pnpm install --frozen-lockfile)");
  const bin = join(pnpm, dir, "node_modules/esbuild/bin/esbuild");
  const outDir = mkdtempSync(join(process.env.SORT_TMP || tmpdir(), "sort-mapper-"));
  const outfile = join(outDir, "mapper.mjs");
  execFileSync(bin, [join(repo, "apps/web/lib/ops/bookings-map.ts"), "--bundle", "--platform=node", "--format=esm", `--outfile=${outfile}`, "--log-level=error"]);
  return import(pathToFileURL(outfile).href);
}

const base = {
  status: "confirmed", contact_email: null, contact_phone: "+41 79 000 00 00", company_name: null, note: null,
  pay_link_sent_at: null, flight_no: null, pax: 2, bags: 1, payment_status: "captured", stripe_checkout_session_id: null,
  charged_rappen: null,
};

/**
 * [reference, created_at (UTC), pickup wall clock (Zurich), pickup UTC, customer, from, to, class slug, driver, rappen]
 * Listed the way the staff query sends them (pickup time, newest first), NOT in booked order, so the default
 * "newest booked first" is the board sorting and not the server's order. Two booking years (2026, 2025),
 * three classes, assigned and unassigned, and two pairs of equal totals (to show the tie rule).
 */
const SQL = [
  ["VT-26-0904", "2026-06-02T09:10:00Z", "2026-10-12 09:30", "2026-10-12T07:30:00Z", "Jonas Weber", "Basel EuroAirport", "Bern", "van-luxury", null, 600],
  ["VT-26-0906", "2025-12-18T09:20:00Z", "2026-10-11 17:45", "2026-10-11T15:45:00Z", "Tom Huber", "Zurich Airport", "St. Moritz", "van-luxury", "Sofia Ricci", 400],
  ["VT-26-0907", "2025-03-07T14:05:00Z", "2026-10-10 07:20", "2026-10-10T05:20:00Z", "Ida Roth", "Lugano", "Zurich Airport", "economy", "Marco Bianchi", 100],
  ["VT-26-0901", "2026-10-04T12:32:00Z", "2026-10-09 08:15", "2026-10-09T06:15:00Z", "Elena Brunner", "Zurich Airport", "Zermatt", "economy", null, 300],
  ["VT-26-0902", "2026-10-03T22:30:00Z", "2026-10-08 06:50", "2026-10-08T04:50:00Z", "Luca Meier", "Bahnhofstrasse 1, Zurich", "Zurich Airport", "economy", "Marco Bianchi", 100],
  ["VT-26-0903", "2026-09-29T07:05:00Z", "2026-10-07 14:40", "2026-10-07T12:40:00Z", "Amira Keller", "Geneva Airport", "Lausanne", "business", "Sofia Ricci", 200],
  ["VT-26-0905", "2026-01-15T23:30:00Z", "2026-10-06 11:00", "2026-10-06T09:00:00Z", "Nadia Frei", "Zurich Airport", "Lucerne", "business", "Marco Bianchi", 200],
];

/** Customers by letter; the order each state must show them is written out below, by hand, from the SQL above. */
export const NAMES = {
  A: "Elena Brunner", B: "Luca Meier", C: "Amira Keller", D: "Jonas Weber", E: "Nadia Frei", F: "Tom Huber", G: "Ida Roth",
};
const o = (s) => s.split("").map((k) => NAMES[k]);
export const EXPECT = {
  // booked: newest to oldest, then the flip
  bookedFirst: o("ABCDEFG"), bookedFlip: o("GFEDCBA"),
  // total: biggest to smallest (ties newest booked first), then the flip
  totalFirst: o("DFACEBG"), totalFlip: o("BGCEAFD"),
  // driver: not assigned first, then assigned (each newest booked first), then the flip
  driverFirst: o("ADBCEFG"), driverFlip: o("BCEFGAD"),
  // vehicle: the dashboard's class order Economy, Business, Van luxury (newest booked first inside a class), then the flip
  vehicleFirst: o("ABGCEDF"), vehicleFlip: o("DFCEABG"),
};

function sqlRow(r, i, over = {}) {
  const [reference, created, local, utc, name, from, to, slug, driver, rappen] = r;
  return {
    ...base,
    id: `6a1f0e0e-0901-4c0d-9a31-0d5b1c4a${String(900 + i).padStart(4, "0")}`,
    reference, contact_name: name, pickup_text: from, dropoff_text: to,
    scheduled_local: local, scheduled_at: utc, class_slug: slug, chauffeur_name: driver,
    captured_at: created, payment_created_at: created, snapshot_total_rappen: rappen,
    created_at: new Date(created),
    ...over,
  };
}

export async function stubRows({ withUnknown = false } = {}) {
  const { mapBoardBooking } = await loadMapper();
  const rows = SQL.map((r, i) => mapBoardBooking(sqlRow(r, i)));
  if (withUnknown) {
    // A row with no booking time and no total (cannot happen for a real booking): must sort last both ways.
    rows.push(mapBoardBooking(sqlRow(["VT-26-0999", "2026-10-02T08:00:00Z", "2026-10-13 11:00", "2026-10-13T09:00:00Z", "Test Unknown", "Zurich Airport", "Bern", "business", "Marco Bianchi", 0], 9, { created_at: null, snapshot_total_rappen: 0 })));
  }
  return rows.map((row) => ({ ...row, events: [] }));
}

export const ME = { fullName: "Test Admin", role: "admin", email: "admin@example.com", lang: "en", twoFactor: true, userId: "u-1" };

export function answer(method, path, rows) {
  if (method === "POST" && path === "/api/auth") return { status: 200, json: null };
  if (path === "/api/staff/me") return { status: 200, json: { ok: true, data: ME } };
  if (path === "/api/staff/bookings") return { status: 200, json: { ok: true, data: rows } };
  return { status: 200, json: { ok: true, data: [] } };
}
