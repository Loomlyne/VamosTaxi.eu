// Mutation check for ops-board-booked.test.ts. Each mutation edits one source file in memory-backed
// fashion (original text restored in finally), runs the test file, and reports whether it failed.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = new URL("../../../../", import.meta.url).pathname.replace(/\/$/, "");
const board = "app/ops/OpsBoard.dc.html";
const sql = "apps/web/lib/ops/bookings.ts";
const map = "apps/web/lib/ops/bookings-map.ts";
const store = "app/vamos-ops-data.js";

const muts = [
  ["M1 SQL drops b.created_at", sql, "        b.created_at,\n", ""],
  ["M2 mapper drops createdAt", map, "createdAt: iso(row.created_at),", 'createdAt: "",'],
  ["M3 store drops createdAt", store, "      createdAt: str(b.createdAt),\n", ""],
  ["M4 formatter in UTC", board, "new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit'", "new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit'"],
  ["M5 year always shown", board, "year: p.year === thisYear ? '' : p.year,", "year: p.year,"],
  ["M6 year never shown", board, "year: p.year === thisYear ? '' : p.year,", "year: '',"],
  ["M7 this-year compared in UTC", board, "new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric' })", "new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric' })"],
  ["M8 column moved to the end", board, "      columns: [\n        { key:'booked'", "      columns: [\n        { key:'zz-booked'"],
  ["M9 day/time not left-to-right", board, "className: 'vt-dir-keep', 'data-vt-no-i18n': '1' }, v)", "className: 'x', 'data-vt-no-i18n': '1' }, v)"],
  ["M10 no dash for unknown", board, "if (!b) return React.createElement('span', { 'data-vt-quiet': '1' }, '—');", "if (!b) return React.createElement('span', null, '');"],
  ["M11 title dropped", board, "title: isolate(b.full)", "title: ''"],
  ["M12 German header equals English", board, "colBooked:'Gebucht'", "colBooked:'Booked'"],
  ["M13 month inside skip marker", board, "React.createElement('span', null, b.month)", "React.createElement('span', { 'data-vt-no-i18n': '1' }, b.month)"],
  ["M14 pickup column width changed", board, "key:'time', header: t.colPickup, width:'100px'", "key:'time', header: t.colPickup, width:'90px'"],
];

let bad = 0;
for (const [name, file, from, to] of muts) {
  const p = `${root}/${file}`;
  const orig = readFileSync(p, "utf8");
  if (!orig.includes(from)) {
    console.log(`${name}: MUTATION DID NOT APPLY`);
    bad++;
    continue;
  }
  try {
    writeFileSync(p, orig.replace(from, to));
    const r = spawnSync("pnpm", ["exec", "vitest", "run", "lib/ops/ops-board-booked.test.ts"], { cwd: `${root}/apps/web`, encoding: "utf8", timeout: 200000 });
    const out = r.stdout + r.stderr;
    const failed = r.status !== 0;
    const line = (out.match(/Tests\s+[^\n]*/) || [""])[0];
    console.log(`${name}: ${failed ? "KILLED" : "SURVIVED"}  ${line.trim()}`);
    if (!failed) bad++;
  } finally {
    writeFileSync(p, orig);
  }
}
console.log(bad ? `${bad} problem(s)` : "all mutations killed");
