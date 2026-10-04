// Stub answers for the bookings-table pictures of quick 261004-ops-booked-column.
// The rows go through the REAL mapBoardBooking (bundled with esbuild from apps/web/lib/ops/bookings-map.ts),
// so the answer has exactly the shape GET /api/staff/bookings sends, createdAt included. Nothing here reaches
// a server. Amounts are small round fixtures (CHF 1.00 / 2.00 / 3.00): never a real price (project law 04).
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
  const outDir = mkdtempSync(join(process.env.BOOKED_TMP || tmpdir(), "booked-mapper-"));
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
 * Newest pickup first, as the staff query orders them (l.scheduled_at desc).
 * The label each created_at must read in Zurich time, with the clock in 2026, is in EXPECTED_EN below.
 */
const SQL = [
  ["VT-26-0836", "2025-12-18T09:20:00Z", "2026-10-09 08:15", "2026-10-09T06:15:00Z", "Nadia Frei", "Zurich Airport", "Lucerne", "business", "Marco Bianchi", 200],
  ["VT-26-0831", "2026-01-15T23:30:00Z", "2026-10-08 06:50", "2026-10-08T04:50:00Z", "Jonas Weber", "Basel EuroAirport", "Bern", "van-luxury", null, 300],
  ["VT-26-0829", "2026-09-29T07:05:00Z", "2026-10-07 14:40", "2026-10-07T12:40:00Z", "Amira Keller", "Geneva Airport", "Lausanne", "business", "Sofia Ricci", 200],
  ["VT-26-0833", "2026-10-03T22:30:00Z", "2026-10-06 09:30", "2026-10-06T07:30:00Z", "Luca Meier", "Bahnhofstrasse 1, Zurich", "Zurich Airport", "economy", "Marco Bianchi", 100],
  ["VT-26-0837", "2026-10-04T12:32:00Z", "2026-10-05 18:05", "2026-10-05T16:05:00Z", "Elena Brunner", "Zurich Airport", "Zermatt", "economy", null, 100],
];

/** What the Booked cell must read, English, with the clock in 2026 (Zurich time; year only when not 2026). */
export const EXPECTED_EN = ["18 Dec 2025 · 10:20", "16 Jan · 00:30", "29 Sep · 09:05", "4 Oct · 00:30", "4 Oct · 14:32"];
/** The title of each cell: the full date and time, Zurich, wrapped in a left-to-right isolate. */
export const EXPECTED_TITLE = ["2025-12-18 10:20", "2026-01-16 00:30", "2026-09-29 09:05", "2026-10-04 00:30", "2026-10-04 14:32"].map((s) => `⁦${s}⁩`);

function sqlRow(r, i, withCreated = true) {
  const [reference, created, local, utc, name, from, to, slug, driver, rappen] = r;
  return {
    ...base,
    id: `6a1f0e0e-0836-4c0d-9a31-0d5b1c4a${String(800 + i).padStart(4, "0")}`,
    reference, contact_name: name, pickup_text: from, dropoff_text: to,
    scheduled_local: local, scheduled_at: utc, class_slug: slug, chauffeur_name: driver,
    captured_at: created, payment_created_at: created, snapshot_total_rappen: rappen,
    created_at: withCreated ? new Date(created) : null,
  };
}

export async function stubRows({ withUnknown = false } = {}) {
  const { mapBoardBooking } = await loadMapper();
  const rows = SQL.map((r, i) => mapBoardBooking(sqlRow(r, i)));
  if (withUnknown) {
    // A row the database gave no creation time (cannot happen for a real booking): the cell must show a dash.
    rows.push(mapBoardBooking(sqlRow(["VT-26-0900", "2026-10-02T08:00:00Z", "2026-10-04 11:00", "2026-10-04T09:00:00Z", "Test Unknown", "Zurich Airport", "Bern", "economy", "Marco Bianchi", 100], 9, false)));
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
