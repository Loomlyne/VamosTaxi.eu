// Mutation check for ops-board-sort.test.ts (and ops-board-booked.test.ts, which shares the file).
// Each mutation edits OpsBoard.dc.html, runs the two test files, and reports whether they failed. The original
// text is restored in finally. Run from anywhere: node .planning/quick/261004-ops-board-sort/tools/mutate.mjs [M32]
// (an optional first argument runs just that mutation).
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = new URL("../../../../", import.meta.url).pathname.replace(/\/$/, "");
const board = "app/ops/OpsBoard.dc.html";

const muts = [
  ["M1 opens oldest booked first", "sortKey: 'booked', sortDir: SORT_FIRST.booked };", "sortKey: 'booked', sortDir: 'asc' };"],
  ["M2 Total first click is smallest first", "total: 'desc' };", "total: 'asc' };"],
  ["M3 Booked first click is oldest first", "booked: 'desc', vehicle", "booked: 'asc', vehicle"],
  ["M4 Driver first click is assigned first", "driver: 'asc', total", "driver: 'desc', total"],
  ["M5 Vehicle first click is reverse class order", "vehicle: 'asc', driver", "vehicle: 'desc', driver"],
  ["M6 the active header never flips", "cur.dir === 'asc' ? 'desc' : 'asc' };", "cur.dir };"],
  ["M7 ties go oldest booked first", "return b.t - a.t;", "return a.t - b.t;"],
  ["M8 missing values go first", "if (am !== Number.isNaN(b.v)) return am ? 1 : -1;", "if (am !== Number.isNaN(b.v)) return am ? -1 : 1;"],
  ["M9 direction ignored (always ascending)", "return (a.v - b.v) * sign;", "return (a.v - b.v);"],
  ["M10 class names written into the sort", "const i = order.indexOf(String(r.klass || r.vehicle || ''));", "const i = ['Economy', 'Business', 'Van luxury'].indexOf(String(r.klass || r.vehicle || ''));"],
  ["M11 an unknown class goes first", "return i === -1 ? NaN : i; }", "return i === -1 ? -1 : i; }"],
  ["M12 a zero total counts as a total", "return n > 0 ? n : NaN; }", "return n; }"],
  ["M13 Booked sorts by pickup, not booking time", "if (key === 'booked') return bookedMs(r.createdAt);", "if (key === 'booked') return Date.parse(r.dateIso);"],
  ["M14 Driver sorts by name", "if (key === 'driver') return r.driver ? 1 : 0;", "if (key === 'driver') return String(r.driver || '').toLowerCase().charCodeAt(0) || 0;"],
  ["M15 the sorted rows are not the ones paged", "const pageRows = orderedRows.slice(pageStart", "const pageRows = visibleRows.slice(pageStart"],
  ["M16 a sort click keeps the page", "return { sortKey: n.key, sortDir: n.dir, page: 0 };", "return { sortKey: n.key, sortDir: n.dir };"],
  ["M17 aria-sort is never cleared", "if (value) th.setAttribute('aria-sort', value); else th.removeAttribute('aria-sort');", "if (value) th.setAttribute('aria-sort', value);"],
  ["M18 aria-sort words swapped", "(dir === 'asc' ? 'ascending' : 'descending')", "(dir === 'asc' ? 'descending' : 'ascending')"],
  ["M19 arrows swapped", "const sortIcon = dir === 'asc' ? 'arrow-up' : 'arrow-down';", "const sortIcon = dir === 'asc' ? 'arrow-down' : 'arrow-up';"],
  ["M20 accessible name is the bare word", "'aria-label': t.sortBy.replace('%s', label),", "'aria-label': label,"],
  ["M21 German phrase equals English", "sortBy:'Nach %s sortieren'", "sortBy:'Sort by %s'"],
  ["M22 Pickup made sortable", "key:'time', header: t.colPickup,", "key:'time', header: sortHead('booked', t.colPickup),"],
  ["M23 target drops under 44 px", "min-block-size:44px", "min-block-size:36px"],
  ["M24 focus ring removed", "[data-vt-board] [data-vt-sort]:focus-visible{box-shadow:inset var(--vt-ring)}", "[data-vt-board] [data-vt-sort]:focus-visible{box-shadow:none}"],
  ["M25 the cell keeps its padding", "th:has([data-vt-sort]){padding:0}", "th:has([data-vt-sort]){padding:12px 16px}"],
  ["M26 the Filter menu resets the sort", "setBoardFilter = (v) => this.setState({ filter: v || 'All', page: 0 });", "setBoardFilter = (v) => this.setState({ filter: v || 'All', page: 0, sortKey: 'booked', sortDir: 'desc' });"],
  ["M27 a stat card resets the sort", "select: () => this.setState({ filter: key, page: 0 }),", "select: () => this.setState({ filter: key, page: 0, sortKey: 'booked', sortDir: 'desc' }),"],
  ["M28 Clear resets the sort", "clearFilt = () => this.setState({ klass: '', statusMore: '', filter: 'All', page: 0 });", "clearFilt = () => this.setState({ klass: '', statusMore: '', filter: 'All', page: 0, sortKey: 'booked', sortDir: 'desc' });"],
  ["M29 the choice is remembered across reloads", "sortKey: 'booked', sortDir: SORT_FIRST.booked };", "sortKey: (typeof localStorage !== 'undefined' && localStorage.getItem('vamosBoardSort')) || 'booked', sortDir: SORT_FIRST.booked };"],
  ["M30 booking time with no zone is read", "return /\\d{2}:\\d{2}.*(Z|[+-]\\d{2}(:?\\d{2})?)$/.test(raw) ? Date.parse(raw) : NaN;", "return Date.parse(raw);"],
  ["M31 ties by index only (no newest-first tie rule)", "if (!at && a.t !== b.t) return b.t - a.t;", "if (!at && a.t !== b.t) return 0;"],
  ["M32 the arrow is hidden when active", "[data-vt-sort][data-active] [data-vt-sort-ico]{opacity:1}", "[data-vt-sort][data-active] [data-vt-sort-ico]{opacity:0}"],
  ["M33 no cue where there is no hover", "@media (hover:none){[data-vt-sort-ico]{opacity:1}}", ""],
  ["M34 the translator reads the header buttons", "'data-vt-no-i18n': '1',\n          'aria-label'", "'aria-label'"],
];

let bad = 0;
const p = `${root}/${board}`;
const orig = readFileSync(p, "utf8");
const only = process.argv[2];
for (const [name, from, to] of muts) {
  if (only && !name.startsWith(`${only} `)) continue;
  if (!orig.includes(from)) {
    console.log(`${name}: MUTATION DID NOT APPLY`);
    bad++;
    continue;
  }
  try {
    writeFileSync(p, orig.replace(from, to));
    const r = spawnSync("pnpm", ["exec", "vitest", "run", "lib/ops/ops-board-sort.test.ts", "lib/ops/ops-board-booked.test.ts"], { cwd: `${root}/apps/web`, encoding: "utf8", timeout: 200000 });
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
