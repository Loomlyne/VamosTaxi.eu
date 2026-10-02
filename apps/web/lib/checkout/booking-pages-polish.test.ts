// apps/web/lib/checkout/booking-pages-polish.test.ts
//
// 261002 booking pages polish. The two customer booking pages (manage-booking, booking-detail) run as a page runs
// them (the page's own logic class from its <script data-dc-script> block, the real app/vamos-manage-ticket.js
// helper, the real vamos-i18n-dict.js + vamos-locale.js, a fake fetch). Amounts: none; every figure here is a
// date, a time or a count.
//
//   1. A signed-in customer's paid booking reads paid and can be cancelled: the details route answers status,
//      canCancel, cancelWindow and reviewSubmitted; the helper copies them; the badge gets a key it knows.
//   2. Dates are in the reader's language and re-labelled in place (nothing date-like is kept as text in state).
//   3. Arabic bag counts (dictionary patterns).
//   4. The refund line names the country in the reader's language.
//   5. The time spinner keeps hour : minute left to right.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { customerCanCancel } from "./cancel-window";

const asCustomer = vi.fn();
const asSystem = vi.fn();
const customerClaims = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: {} }) }));
vi.mock("@/lib/account/session", () => ({ customerClaims: (...a: unknown[]) => customerClaims(...a) }));
vi.mock("@/lib/db/identity", () => ({
  asCustomer: (...a: unknown[]) => asCustomer(...a),
  asSystem: (...a: unknown[]) => asSystem(...a),
}));

import { GET as detailsGET } from "@/app/api/account/bookings/details/route";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const HELPER = read("app/vamos-manage-ticket.js");
const PAGES = ["app/pages/manage-booking.dc.html", "app/pages/booking-detail.dc.html"];
const PICKERS = ["app/pages/WhenPicker.dc.html", "app/home/WhenPicker.dc.html"];
const LANGS = ["de", "fr", "ar"] as const;
const REF = "VT-26-0101";

// ── the real language runtime ──────────────────────────────────────────────────────────────────────────────────

type Locale = { t: (s: string, lang?: string) => string; setLang: (l: string) => void; lang: () => string };
type Win = Record<string, unknown> & { VamosLocale?: Locale; VamosManageTicket?: Helper; VamosI18n?: { strings: Record<string, Record<string, string>> } };

/** A page stub just wide enough for the two runtime scripts to boot; nothing else is faked. */
function loadRuntime(): Win {
  const store: Record<string, string> = {};
  const el = () => ({
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    style: { removeProperty() {}, setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, querySelectorAll: () => [], querySelector: () => null, addEventListener() {},
  });
  const document = {
    documentElement: el(), head: el(), body: el(), readyState: "complete", cookie: "",
    addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, createElement: el,
    createTreeWalker: () => ({ nextNode: () => null }), getElementById: () => null,
  };
  const localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
  };
  const win: Win = {
    document, localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    location: { pathname: "/", search: "", hostname: "localhost" }, navigator: { language: "en" },
    matchMedia: () => ({ matches: false, addEventListener() {} }), setTimeout, clearTimeout,
    CustomEvent: class { type: string; detail: unknown; constructor(t: string, o?: { detail?: unknown }) { this.type = t; this.detail = o?.detail; } },
    MutationObserver: class { observe() {} disconnect() {} }, NodeFilter: { SHOW_TEXT: 4 },
    fetch: () => Promise.reject(new Error("offline")),
  };
  win.window = win;
  const names = ["window", "document", "localStorage", "navigator", "location", "CustomEvent", "MutationObserver", "NodeFilter", "fetch"];
  for (const file of ["vamos-i18n-dict.js", "vamos-locale.js"]) {
    new Function(...names, read(`app/${file}`))(...names.map((n) => win[n]));
  }
  return win;
}

const win = loadRuntime();
const locale = win.VamosLocale!;
const strings = win.VamosI18n!.strings;
const resolves = (en: string, lang: string) => Boolean(strings[en]?.[lang]) || locale.t(en, lang) !== en;

beforeEach(() => locale.setLang("en"));
afterEach(() => locale.setLang("en"));

// ── the helper app/vamos-manage-ticket.js ──────────────────────────────────────────────────────────────────

type Booking = Record<string, unknown> & { status: string; canCancel: boolean; cancelWindow: string; reviewSubmitted: boolean };
type Loaded = { kind: string; booking: Booking; via: string };
type Helper = {
  dayLabel: (s: string) => string;
  lang: () => string;
  LOCALES: Record<string, string>;
  refundedCopy: (b: Record<string, unknown>) => string;
  loadAccount: (ref: string) => Promise<Loaded>;
};

type Routes = Record<string, { status?: number; body: unknown }>;

/** The helper as a page runs it: a window with the real runtime, a fake fetch answering by URL prefix. `intl` replaces Intl. */
function loadHelper(routes: Routes = {}, intl?: unknown): { helper: Helper; requests: string[] } {
  const requests: string[] = [];
  const sandbox: Record<string, unknown> = {
    window: win,
    location: { search: "", pathname: "/booking-detail" },
    URLSearchParams,
    fetch: async (url: string) => {
      requests.push(url);
      const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
      const status = hit?.[1].status ?? (hit ? 200 : 404);
      return { ok: status < 400, status, json: async () => hit?.[1].body ?? {} };
    },
  };
  if (intl) sandbox.Intl = intl;
  const ctx = createContext(sandbox);
  runInContext(HELPER, ctx);
  return { helper: win.VamosManageTicket!, requests };
}

// ── the page's logic class ─────────────────────────────────────────────────────────────────────────────────

type Vals = Record<string, unknown> & {
  bookedDay: string; bookedTime: string; newDay: string; newTime: string; badge: string; badgeLabel: string;
  diffs: { k: string; oDay: string; oTime: string; nDay: string; nTime: string }[];
  requested: { k: string; oDay: string; oTime: string; nDay: string; nTime: string }[];
  meta: { icon: string; label: string }[];
  mDate: string; mTime: string; mDay: number; pickerLocale: string; pickerMonth: string; hasDiff: boolean; changePending: boolean;
  showCancel: boolean; cancelFull: boolean; cancelOps: boolean; canConfirmCancel: boolean; refundedCopy: string;
  pickupDetail: string; pickupTime: string;
};
type Page = {
  state: Record<string, unknown>;
  setState: (patch: Record<string, unknown>) => void;
  renderVals: () => Vals;
  applyTicket: (booking: Record<string, unknown>, entry: string, via: string) => void;
  applyLoad: (result: Loaded, entry: string) => void;
  setDay: (d: number, label: string, y: number, m: number) => void;
  setTime: (t: string) => void;
  resetWhen: () => void;
  confirmModify: () => void;
  confirmCancel: () => void;
  diffList: () => Record<string, unknown>[];
};

const dcLogic = (html: string) => {
  const tag = html.indexOf('<script type="text/x-dc" data-dc-script');
  const start = html.indexOf(">", tag) + 1;
  return html.slice(start, html.indexOf("</script>", start));
};

const DCLogic = class {
  props: Record<string, unknown>;
  state: Record<string, unknown> = {};
  constructor(props?: Record<string, unknown>) { this.props = props ?? {}; }
  setState(patch: Record<string, unknown> | ((s: Record<string, unknown>) => Record<string, unknown>), cb?: () => void) {
    const next = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    cb?.();
  }
  forceUpdate() {}
};

/** A booking page with the real helper and runtime. `answer` is what the server says to the request the page sends. */
function openPage(rel: string, answer: { status: number; body: Record<string, unknown> } = { status: 200, body: { ok: true } }) {
  const sent: { url: string; method: string; body: unknown }[] = [];
  const store = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  const ctx = createContext({
    window: win,
    location: { search: "", pathname: rel.includes("detail") ? "/booking-detail" : "/manage-booking", href: "" },
    URLSearchParams, localStorage: store, sessionStorage: store,
    setTimeout: () => 0, clearTimeout: () => undefined, console,
    React: { createRef: () => ({ current: null }) },
    fetch: async (url: string, opt: { method?: string; body?: string } = {}) => {
      sent.push({ url, method: opt.method ?? "GET", body: opt.body ? JSON.parse(opt.body) : null });
      return { ok: answer.status < 400, status: answer.status, json: async () => answer.body };
    },
    DCLogic,
  });
  runInContext(HELPER, ctx);
  runInContext(`${dcLogic(read(rel))}\n;globalThis.__Page = Component;`, ctx);
  const Ctor = (ctx as unknown as { __Page: new (p: Record<string, unknown>) => Page }).__Page;
  return { page: new Ctor({}), sent };
}

/** The booked trip of these tests: Tue 6 Oct 2026, 08:15 Zurich time. No amount anywhere. */
const BOOKED = {
  id: "", reference: REF, status: "confirmed", pickupText: "Zurich Airport", dropoffText: "Hotel", scheduledLocal: "2026-10-06T08:15",
  pax: 2, bags: 2, canCancel: true, cancelWindow: "auto_full", reviewSubmitted: false, refundStatus: "none", priceTotalRappen: 0,
};

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

// ── 1. the details route ───────────────────────────────────────────────────────────────────────────────────

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;
type OwnerRow = {
  id?: string | null; status?: string | null; has_review?: boolean | null;
  refund_status?: string | null; refund_owed_rappen?: number | string | null; refunded_rappen?: number | string | null;
};
const BOOKING_ID = "7a0c9a62-0000-4000-8000-000000000001"; // synthetic
const events: string[] = [];
const ownerQueries: { text: string; values: unknown[] }[] = [];
const systemQueries: { text: string; values: unknown[] }[] = [];

function installOwner(rows: OwnerRow[]) {
  asCustomer.mockImplementation(async (_e: unknown, _c: unknown, fn: (sql: Sql) => Promise<unknown>) => {
    events.push("customer:start");
    const out = await fn(async (strings, ...values) => {
      const text = strings.join(" ");
      ownerQueries.push({ text, values });
      if (text.includes("customer_booking_extras")) return [{ payload: { money: null, driver: null } }];
      if (text.includes("refund_status")) return rows;
      return [];
    });
    events.push("customer:end");
    return out;
  });
}

/** `mode` is what compute_cancellation_refund answers; an Error makes the window read fail. */
function installSystem(mode: string | null | Error) {
  asSystem.mockImplementation(async (_e: unknown, fn: (sql: Sql) => Promise<unknown>) => {
    events.push("system");
    return fn(async (strings, ...values) => {
      systemQueries.push({ text: strings.join(" "), values });
      if (mode instanceof Error) throw mode;
      return [{ refund_mode: mode }];
    });
  });
}

const callDetails = () => detailsGET(new Request(`http://localhost/api/account/bookings/details?ref=${REF}`));
const paidRow = (over: OwnerRow = {}): OwnerRow => ({ id: BOOKING_ID, status: "confirmed", has_review: false, refund_status: "none", refund_owed_rappen: 0, refunded_rappen: 0, ...over });

describe("GET /api/account/bookings/details: status, window and Cancel (261002 item 1)", () => {
  beforeEach(() => {
    events.length = 0;
    ownerQueries.length = 0;
    systemQueries.length = 0;
    asCustomer.mockReset();
    asSystem.mockReset();
    customerClaims.mockReset();
    customerClaims.mockResolvedValue({ sub: "u1", email: "A@Example.test" });
  });

  it("answers the booking's own status, the window from compute_cancellation_refund and Cancel", async () => {
    installOwner([paidRow({ status: "assigned" })]);
    installSystem("auto_full");
    expect(await (await callDetails()).json()).toMatchObject({
      ok: true, status: "assigned", canCancel: true, cancelWindow: "auto_full", reviewSubmitted: false,
    });
    installSystem("pending_ops");
    expect(await (await callDetails()).json()).toMatchObject({ status: "assigned", canCancel: true, cancelWindow: "pending_ops" });
  });

  it("reads the window with the same definer function the cancel uses, for the id of the owned row", async () => {
    installOwner([paidRow()]);
    installSystem("auto_full");
    await callDetails();
    expect(systemQueries).toHaveLength(1);
    expect(systemQueries[0]!.text).toMatch(/compute_cancellation_refund\(\s*\)?/);
    expect(systemQueries[0]!.text).toMatch(/::uuid/);
    // the id comes from the row the signed-in e-mail owns, never from the request
    expect(systemQueries[0]!.values).toEqual([BOOKING_ID]);
  });

  it("reads the window outside the customer transaction (postgres.js begin() rethrows errors caught inside)", async () => {
    installOwner([paidRow()]);
    installSystem("auto_full");
    await callDetails();
    expect(events).toEqual(["customer:start", "customer:end", "system"]);
  });

  it("nothing captured to refund (mode none): no Cancel, window none", async () => {
    installOwner([paidRow()]);
    installSystem("none");
    expect(await (await callDetails()).json()).toMatchObject({ ok: true, canCancel: false, cancelWindow: "none" });
  });

  it("a window that cannot be read means no Cancel, never a wrong promise (the page itself still answers ok)", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      installOwner([paidRow()]);
      installSystem(new Error("boom"));
      const res = await callDetails();
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, status: "confirmed", canCancel: false, cancelWindow: "none" });
      asSystem.mockReset();
      asSystem.mockRejectedValue(new Error("pool exhausted"));
      expect(await (await callDetails()).json()).toMatchObject({ ok: true, canCancel: false, cancelWindow: "none" });
      // the failure is logged (a drifted grant on live would otherwise hide Cancel with no trace), without the
      // e-mail or the reference
      expect(logged.mock.calls).toEqual([
        ["account_booking_cancel_window_failed", "boom"],
        ["account_booking_cancel_window_failed", "pool exhausted"],
      ]);
      const text = JSON.stringify(logged.mock.calls);
      expect(text).not.toContain("example.test");
      expect(text).not.toContain(REF);
    } finally {
      logged.mockRestore();
    }
  });

  it.each(["completed", "no_show", "cancelled", "partially_cancelled", "refunded"])("%s: no Cancel and no window read", async (status) => {
    installOwner([paidRow({ status })]);
    installSystem("auto_full");
    expect(await (await callDetails()).json()).toMatchObject({ status, canCancel: false, cancelWindow: "none" });
    expect(asSystem).not.toHaveBeenCalled();
  });

  it("an unpaid booking (pending, quote) is never offered the paid cancel", async () => {
    for (const status of ["pending", "quote"]) {
      installOwner([paidRow({ status })]);
      installSystem("auto_full");
      expect(await (await callDetails()).json()).toMatchObject({ status, canCancel: false, cancelWindow: "none" });
    }
    expect(asSystem).not.toHaveBeenCalled();
  });

  it("a reviewed booking says so and is not offered Cancel", async () => {
    installOwner([paidRow({ status: "confirmed", has_review: true })]);
    installSystem("auto_full");
    expect(await (await callDetails()).json()).toMatchObject({ reviewSubmitted: true, canCancel: false, cancelWindow: "none" });
    expect(asSystem).not.toHaveBeenCalled();
  });

  it("no readable row for this e-mail: no status, no Cancel, no window read", async () => {
    installOwner([]);
    installSystem("auto_full");
    expect(await (await callDetails()).json()).toMatchObject({ ok: true, status: "", canCancel: false, cancelWindow: "none", reviewSubmitted: false });
    expect(asSystem).not.toHaveBeenCalled();
  });

  it("the ownership read (id, status, review, refund) is filtered by reference AND the signed-in e-mail", async () => {
    installOwner([paidRow()]);
    installSystem("auto_full");
    await callDetails();
    const q = ownerQueries.find((x) => x.text.includes("refund_status"))!;
    expect(q.text).toMatch(/b\.id/);
    expect(q.text).toMatch(/b\.status::text as status/);
    expect(q.text).toMatch(/exists \(select 1 from public\.reviews r where r\.booking_id = b\.id\) as has_review/);
    expect(q.text).toMatch(/lower\(b\.contact_email::text\) = lower\(/);
    expect(q.values).toContain(REF);
    expect(q.values).toContain("A@Example.test");
  });

  it("a signed-out request is refused before any read", async () => {
    customerClaims.mockResolvedValue(null);
    expect((await callDetails()).status).toBe(401);
    expect(asCustomer).not.toHaveBeenCalled();
    expect(asSystem).not.toHaveBeenCalled();
  });
});

describe("customerCanCancel (261002 item 1, shared by the manage link and the signed-in view)", () => {
  it.each(["completed", "no_show", "cancelled", "partially_cancelled", "refunded"])("%s: false", (status) => {
    expect(customerCanCancel(status, false)).toBe(false);
  });

  it.each(["confirmed", "paid", "assigned", "partially_completed"])("%s: true until reviewed", (status) => {
    expect(customerCanCancel(status, false)).toBe(true);
    expect(customerCanCancel(status, true)).toBe(false);
  });

  it("the manage route uses it in place of its own list", () => {
    const route = read("apps/web/app/api/manage/booking/route.ts");
    expect(route).toMatch(/import \{ customerCancelWindow, customerCanCancel \} from "@\/lib\/checkout\/cancel-window";/);
    expect(route).toMatch(/const canCancel = customerCanCancel\(status, reviewSubmitted\);/);
    expect(route).not.toContain("HIDE_CANCEL");
  });
});

// ── 1. the helper: fromAccount / loadAccount ───────────────────────────────────────────────────────────────

describe("the helper maps an account booking to the page's words (261002 item 1)", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    ref: REF, status: "booked", pickup: "Zurich Airport", dropoff: "Hotel", pax: 2, dateIso: "2026-10-06", time: "08:15",
    reviewState: "none", priceRappen: 0, contactEmail: "a@example.test", ...over,
  });
  const details = (over: Record<string, unknown> = {}) => ({
    ok: true, money: null, driver: null, refundStatus: "none", refundOwedRappen: 0, refundedRappen: 0,
    status: "assigned", canCancel: true, cancelWindow: "auto_full", reviewSubmitted: false, ...over,
  });
  async function load(listRow: Record<string, unknown>, detailsAnswer: Routes[string]) {
    const { helper, requests } = loadHelper({
      "/api/account/bookings/details": detailsAnswer,
      "/api/account/bookings": { body: { bookings: [listRow] } },
    });
    const result = await helper.loadAccount(REF);
    return { booking: result.booking, requests };
  }

  it.each([
    ["booked", "confirmed"], ["new", "confirmed"], ["awaiting_payment", "pending"], ["unpaid", "pending"],
    ["completed", "completed"], ["cancelled", "cancelled"],
  ])("list status %s reads %s while the details answer has not landed", async (listStatus, want) => {
    const { booking } = await load(row({ status: listStatus }), { status: 500, body: {} });
    expect(booking.status).toBe(want);
    // no details answer: no Cancel, window none (nothing is promised that was not checked)
    expect(booking).toMatchObject({ canCancel: false, cancelWindow: "none" });
  });

  it("the details answer replaces the status and sets Cancel, its window and the review flag", async () => {
    const { booking, requests } = await load(row(), { body: details() });
    expect(requests).toEqual(["/api/account/bookings", `/api/account/bookings/details?ref=${REF}`]);
    expect(booking).toMatchObject({ status: "assigned", canCancel: true, cancelWindow: "auto_full", reviewSubmitted: false });
    const paid = await load(row(), { body: details({ status: "paid", cancelWindow: "pending_ops" }) });
    expect(paid.booking).toMatchObject({ status: "paid", canCancel: true, cancelWindow: "pending_ops" });
    const part = await load(row(), { body: details({ status: "partially_cancelled", canCancel: false, cancelWindow: "none" }) });
    expect(part.booking).toMatchObject({ status: "partially_cancelled", canCancel: false, cancelWindow: "none" });
  });

  it("an unknown window word never opens Cancel; a missing canCancel is false", async () => {
    const odd = await load(row(), { body: details({ cancelWindow: "whenever" }) });
    expect(odd.booking.cancelWindow).toBe("none");
    const bare = await load(row(), { body: { ok: true } });
    expect(bare.booking).toMatchObject({ status: "confirmed", canCancel: false, cancelWindow: "none" });
  });

  it("reviewSubmitted comes from the list's reviewState until the details answer says otherwise", async () => {
    const reviewed = await load(row({ reviewState: "reviewed", status: "completed" }), { status: 500, body: {} });
    expect(reviewed.booking.reviewSubmitted).toBe(true);
    const open = await load(row({ reviewState: "requested" }), { status: 500, body: {} });
    expect(open.booking.reviewSubmitted).toBe(false);
    const answered = await load(row({ reviewState: "none" }), { body: details({ reviewSubmitted: true, canCancel: false, cancelWindow: "none" }) });
    expect(answered.booking.reviewSubmitted).toBe(true);
  });

  it("the account booking carries its booked day and time as values and no English date label", async () => {
    const { booking } = await load(row(), { body: details() });
    expect(booking.scheduledLocal).toBe("2026-10-06T08:15");
    expect(booking).not.toHaveProperty("dateLabel");
    expect(booking).not.toHaveProperty("timeLabel");
  });
});

// ── 1. the pages: badge, Cancel ────────────────────────────────────────────────────────────────────────────

const dsKeys = (() => {
  const bundle = read("design-system/_ds_bundle.js");
  const at = bundle.indexOf("// components/transfer/StatusBadge.jsx");
  const body = bundle.slice(bundle.indexOf("const MAP = {", at), bundle.indexOf("function StatusBadge", at));
  return [...body.matchAll(/^\s{2}'?([a-z-]+)'?:\s*\{/gm)].map((m) => m[1]!);
})();

describe.each(PAGES)("%s: status badge and Cancel (261002 item 1)", (rel) => {
  it("the design-system badge keys are read from the bundle (a guard against reading nothing)", () => {
    expect(dsKeys).toEqual(expect.arrayContaining(["pending", "confirmed", "assigned", "completed", "cancelled", "refunded", "no-show"]));
  });

  it.each([
    ["confirmed", "confirmed", "Confirmed"], ["paid", "confirmed", "Paid"], ["assigned", "assigned", "Driver assigned"],
    ["completed", "completed", "Completed"], ["cancelled", "cancelled", "Cancelled"], ["canceled", "cancelled", "Cancelled"],
    ["partially_cancelled", "cancelled", "Partially cancelled"], ["partially_completed", "completed", "Partially completed"],
    ["no_show", "no-show", "No-show"], ["refunded", "refunded", "Refunded"],
    ["pending", "pending", "waiting payment"], ["quote", "pending", "waiting payment"],
  ])("status %s gives the badge the key %s and the page's own label %s, in de, fr and ar too", (status, key, label) => {
    const { page } = openPage(rel);
    page.setState({ status });
    const v = page.renderVals();
    expect(v.badge).toBe(key);
    expect(dsKeys).toContain(v.badge);
    expect(v.badgeLabel).toBe(label);
    for (const l of LANGS) expect(resolves(label, l), `${l}: ${label}`).toBe(true);
  });

  it("every StatusBadge on the page gets the key and the label (the card header too)", () => {
    const html = read(rel);
    const badges = html.match(/<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1\.StatusBadge"[^>]*>/g) ?? [];
    expect(badges).toHaveLength(3);
    for (const b of badges) expect(b).toContain('status="{{ badge }}" label="{{ badgeLabel }}"');
    expect(html).not.toContain('status="{{ status }}"');
  });

  it("a signed-in customer's paid booking reads paid and can be cancelled, from the real account path", async () => {
    const { helper } = loadHelper({
      "/api/account/bookings/details": { body: { ok: true, money: null, driver: null, refundStatus: "none", status: "paid", canCancel: true, cancelWindow: "auto_full", reviewSubmitted: false } },
      "/api/account/bookings": { body: { bookings: [{ ref: REF, status: "booked", pickup: "Zurich Airport", dropoff: "Hotel", pax: 2, dateIso: "2026-10-06", time: "08:15", reviewState: "none", priceRappen: 0 }] } },
    });
    const loaded = await helper.loadAccount(REF);
    const { page } = openPage(rel);
    page.applyLoad(loaded, "gate");
    const v = page.renderVals();
    expect(v.badge).toBe("confirmed");
    expect(v.badgeLabel).toBe("Paid");
    expect(v.showCancel).toBe(true);
    expect(v.cancelFull).toBe(true);
    expect(v.canConfirmCancel).toBe(true);
    expect(page.state.authVia).toBe("account");
  });

  it("no Cancel once the details answer says no (partly cancelled, reviewed, or the window could not be read)", () => {
    const { page } = openPage(rel);
    page.applyTicket({ ...BOOKED, status: "partially_cancelled", canCancel: false, cancelWindow: "none" }, "gate", "account");
    expect(page.renderVals().showCancel).toBe(false);
    page.applyTicket({ ...BOOKED, canCancel: false, cancelWindow: "none" }, "gate", "account");
    expect(page.renderVals().showCancel).toBe(false);
    expect(page.renderVals().canConfirmCancel).toBe(false);
  });
});

// ── 2. dates ───────────────────────────────────────────────────────────────────────────────────────────────

describe("dayLabel and the four-locale map (261002 item 2)", () => {
  const { helper } = loadHelper();

  it("the map is the home picker's", () => {
    expect(helper.LOCALES).toEqual({ en: "en-GB", de: "de-CH", fr: "fr-CH", ar: "ar-u-nu-latn" });
    expect(read("app/home/WhenPicker.dc.html")).toContain("{ en: 'en-GB', de: 'de-CH', fr: 'fr-CH', ar: 'ar-u-nu-latn' }");
  });

  it.each([
    ["en", "Tue 6 Oct"], ["de", "Di. 6. Okt."], ["fr", "mar. 6 oct."], ["ar", "الثلاثاء، 6 أكتوبر"],
  ])("Tue 6 Oct 2026 in %s reads %s (Latin digits in Arabic, no ASCII comma)", (lang, want) => {
    locale.setLang(lang);
    expect(helper.lang()).toBe(lang);
    expect(helper.dayLabel("2026-10-06")).toBe(want);
    // a Zurich wall clock works too, and the label does not move with the clock
    expect(helper.dayLabel("2026-10-06T08:15")).toBe(want);
    expect(helper.dayLabel("2026-10-06T23:59")).toBe(want);
    expect(want).not.toContain(",");
  });

  it("no day, no label", () => {
    expect(helper.dayLabel("")).toBe("");
    expect(helper.dayLabel("soon")).toBe("");
    expect(helper.dayLabel(undefined as unknown as string)).toBe("");
  });

  it("the label does not depend on the reader's time zone (the day at UTC noon, formatted in UTC)", () => {
    const before = process.env.TZ;
    try {
      for (const tz of ["Pacific/Kiritimati", "Pacific/Pago_Pago", "Asia/Dubai"]) {
        process.env.TZ = tz;
        expect(helper.dayLabel("2026-10-06")).toBe("Tue 6 Oct");
      }
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
});

describe.each(PAGES)("%s: every date is labelled while rendering (261002 item 2)", (rel) => {
  const LABELS = {
    en: "Tue 6 Oct", de: "Di. 6. Okt.", fr: "mar. 6 oct.", ar: "الثلاثاء، 6 أكتوبر",
  } as const;

  it("the booked day follows the language switch on the same page, with nothing date-like kept in state", () => {
    const { page } = openPage(rel);
    page.applyTicket({ ...BOOKED }, "gate", "account");
    for (const lang of ["en", "de", "fr", "ar"] as const) {
      locale.setLang(lang);
      const v = page.renderVals();
      expect(v.bookedDay, lang).toBe(LABELS[lang]);
      expect(v.bookedTime, lang).toBe("08:15");
      expect(v.newDay, lang).toBe(LABELS[lang]);
      expect(v.newTime, lang).toBe("08:15");
      expect(v.meta.find((m) => m.icon === "calendar")?.label, lang).toBe(LABELS[lang]);
      expect(v.pickupDetail, lang).toBe("08:15");
      expect(v.pickupTime, lang).toBe("08:15");
    }
    const kept = JSON.stringify(page.state);
    for (const label of Object.values(LABELS)) expect(kept).not.toContain(label);
    expect(page.state).toMatchObject({ mIso: "2026-10-06", mTime: "08:15" });
    expect(page.state.ticket).not.toHaveProperty("dateLabel");
    expect(page.state.ticket).not.toHaveProperty("countdown");
  });

  it("the picker gets the language, the day numbered by its day of the month and the day labelled in that language", () => {
    const { page } = openPage(rel);
    page.applyTicket({ ...BOOKED }, "gate", "account");
    locale.setLang("de");
    expect(page.renderVals()).toMatchObject({ pickerLocale: "de", mDate: "Di. 6. Okt.", mTime: "08:15", mDay: 6 });
    locale.setLang("ar");
    expect(page.renderVals()).toMatchObject({ pickerLocale: "ar", mDate: LABELS.ar });
  });

  it("the calendar opens on the month of the day picked, else of the booked day (no fixed month)", () => {
    const { page } = openPage(rel);
    page.applyTicket({ ...BOOKED }, "gate", "account");
    expect(page.renderVals().pickerMonth).toBe("2026-10");
    page.setDay(3, "x", 2026, 10);
    expect(page.state.mIso).toBe("2026-11-03");
    expect(page.renderVals().pickerMonth).toBe("2026-11");
    page.setDay(30, "x", 2027, 0);
    expect(page.renderVals().pickerMonth).toBe("2027-01");
    // no day picked yet: the booked day's month; no day at all: nothing (the picker falls back to its own minimum)
    page.setState({ mIso: "" });
    expect(page.renderVals().pickerMonth).toBe("2026-10");
    page.applyTicket({ ...BOOKED, scheduledLocal: "" }, "gate", "account");
    expect(page.renderVals().pickerMonth).toBe("");
  });

  it("a day picked is kept as YYYY-MM-DD only (the picker's own label is ignored) and is labelled for the reader", () => {
    const { page } = openPage(rel);
    page.applyTicket({ ...BOOKED }, "gate", "account");
    page.setDay(9, "Fri 9 Oct", 2026, 9);
    expect(page.state.mIso).toBe("2026-10-09");
    expect(page.state).not.toHaveProperty("mDate");
    locale.setLang("de");
    expect(page.renderVals()).toMatchObject({ newDay: "Fr. 9. Okt.", mDate: "Fr. 9. Okt.", mDay: 9, bookedDay: "Di. 6. Okt." });
  });

  it("the changes list compares values, not strings, and is labelled old beside new in the reader's language", () => {
    const { page } = openPage(rel);
    page.applyTicket({ ...BOOKED }, "gate", "account");
    expect(page.renderVals()).toMatchObject({ hasDiff: false });
    page.setDay(9, "whatever the picker says", 2026, 9);
    page.setTime("10:00");
    locale.setLang("fr");
    expect(page.renderVals().diffs).toEqual([
      { k: "Pickup time", oDay: "mar. 6 oct.", oTime: "08:15", nDay: "ven. 9 oct.", nTime: "10:00" },
    ]);
    // raw values underneath
    expect(page.diffList()).toEqual([{ k: "Pickup time", oIso: "2026-10-06", oTime: "08:15", nIso: "2026-10-09", nTime: "10:00" }]);
    // back to the booked day and time with a different label text: no difference (values equal)
    page.setDay(6, "6 October", 2026, 9);
    page.setTime("08:15");
    expect(page.renderVals()).toMatchObject({ hasDiff: false, diffs: [] });
    // Reset puts the booked values back
    page.setDay(12, "x", 2026, 9);
    page.resetWhen();
    expect(page.state).toMatchObject({ mIso: "2026-10-06", mTime: "08:15" });
  });

  it("a request goes out with the raw wall clock, its row is kept as values and labelled in whichever language the reader has then", async () => {
    const { page, sent } = openPage(rel, { status: 200, body: { ok: true } });
    page.applyTicket({ ...BOOKED }, "link", "token");
    page.setDay(9, "Fri 9 Oct", 2026, 9);
    page.setTime("10:00");
    locale.setLang("de");
    page.confirmModify();
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ url: "/api/manage/time-change", body: { ref: REF, scheduled_local: "2026-10-09T10:00" } });
    // the toast labels the booked day at the moment it is shown
    expect(page.state.toast).toBe("Zeitänderung angefragt. Abholung bleibt Di. 6. Okt. · 08:15, bis wir bestätigen.");
    // `requested` holds values, no label text
    expect(page.state.requested).toEqual([{ k: "Pickup time", oIso: "2026-10-06", oTime: "08:15", nIso: "2026-10-09", nTime: "10:00" }]);
    expect(page.state.view).toBe("booking");
    // labelled at render, in German now, and again in Arabic after a switch
    expect(page.renderVals()).toMatchObject({ changePending: true });
    expect(page.renderVals().requested).toEqual([{ k: "Pickup time", oDay: "Di. 6. Okt.", oTime: "08:15", nDay: "Fr. 9. Okt.", nTime: "10:00" }]);
    locale.setLang("ar");
    expect(page.renderVals().requested).toEqual([{ k: "Pickup time", oDay: LABELS.ar, oTime: "08:15", nDay: "الجمعة، 9 أكتوبر", nTime: "10:00" }]);
  });

  it("with no booked day on screen the toast still says 'the booked time'", async () => {
    const { page } = openPage(rel, { status: 200, body: { ok: true } });
    page.applyTicket({ ...BOOKED, scheduledLocal: "" }, "link", "token");
    page.setState({ mIso: "2026-10-09", mTime: "10:00" });
    page.confirmModify();
    await flush();
    expect(page.state.toast).toBe("Time-change requested. Pickup stays the booked time until we confirm.");
  });
});

describe.each(PAGES)("%s: markup for dates (261002 item 2)", (rel) => {
  const html = read(rel);
  const markup = html.slice(html.indexOf("<x-dc"), html.indexOf('<script type="text/x-dc" data-dc-script'));
  const DAY = '<span data-vt-no-i18n="1">';
  const TIME = '<span class="vt-dir-keep" data-vt-no-i18n="1">';

  it("no date is a single text value any more", () => {
    for (const old of ["{{ countdown }}", "{{ bookedWhen }}", "{{ newWhen }}", "{{ d.o }}", "{{ d.n }}", "{{ r.n }}"]) {
      expect(markup, old).not.toContain(old);
    }
    expect(html).not.toMatch(/dateLabel|timeLabel|formatLocal|countdown/);
  });

  it("every day sits in its own untranslated span and every time in a left-to-right one", () => {
    for (const day of ["bookedDay", "newDay", "d.oDay", "d.nDay", "r.nDay"]) {
      const all = markup.split(`{{ ${day} }}`).length - 1;
      expect(all, day).toBeGreaterThan(0);
      expect(markup.split(`${DAY}{{ ${day} }}</span>`).length - 1, `${day} left bare`).toBe(all);
    }
    for (const time of ["bookedTime", "newTime", "d.oTime", "d.nTime", "r.nTime"]) {
      const all = markup.split(`{{ ${time} }}`).length - 1;
      expect(all, time).toBeGreaterThan(0);
      expect(markup.split(`${TIME}{{ ${time} }}</span>`).length - 1, `${time} left bare`).toBe(all);
    }
  });

  it("date text, a dot, then the time, at every spot (pill, stop banner, voucher, booked for, new pickup, cancel sentence, changes)", () => {
    // pill + banner + voucher Date + Booked for + cancel sentence
    expect(markup.split(`${DAY}{{ bookedDay }}</span> · ${TIME}{{ bookedTime }}</span>`).length - 1).toBe(5);
    expect(markup).toContain(`${DAY}{{ newDay }}</span> · ${TIME}{{ newTime }}</span>`);
    expect(markup).toContain(`${DAY}{{ d.oDay }}</span> · ${TIME}{{ d.oTime }}</span>`);
    expect(markup).toContain(`${DAY}{{ d.nDay }}</span> · ${TIME}{{ d.nTime }}</span>`);
    expect(markup).toContain(`${DAY}{{ r.nDay }}</span> · ${TIME}{{ r.nTime }}</span>`);
  });

  it("the picker gets the reader's language and opens on the right month (not a fixed one)", () => {
    expect(markup).toMatch(/<dc-import name="WhenPicker"[^>]* value="\{\{ mDate \}\}"[^>]* locale="\{\{ pickerLocale \}\}"/);
    expect(markup).toContain('baseMonth="{{ pickerMonth }}"');
    expect(markup).not.toContain('baseMonth="2026-08"');
  });

  it("the countdown pill is a flex box: day · time sit in ONE inline span so the dot gets no flex gaps", () => {
    const pill = markup.slice(markup.indexOf('<span data-pill="1"><x-import'), markup.indexOf("</span></span></span>", markup.indexOf('<span data-pill="1"><x-import')) + "</span></span></span>".length);
    expect(pill).toMatch(/hint-size="14px,14px"><\/x-import><span>/);
    expect(pill).toContain(`<span>${DAY}{{ bookedDay }}</span> · ${TIME}{{ bookedTime }}</span></span></span>`);
    // exactly two flex items: the clock icon and the one span
    expect(pill.split("<x-import").length - 1).toBe(1);
  });

  it("the other parents of a date · time pair (data-row-v, data-diff-o, data-diff-n, data-stop-fig) are not flex or grid", () => {
    const css = html.slice(html.indexOf(":root{--vt-icon-base"), html.indexOf("</style>", html.indexOf(":root{--vt-icon-base")));
    for (const sel of ["[data-row-v]", "[data-diff-o]", "[data-diff-n]", "[data-stop-fig]"]) {
      const at = css.indexOf(`${sel}{`);
      expect(at, sel).toBeGreaterThan(-1);
      expect(css.slice(at, css.indexOf("}", at) + 1), sel).not.toMatch(/display:\s*(inline-)?(flex|grid)/);
    }
    // the pairs with a <p> or <dd> parent: neither element is given a flex or grid display on the page
    expect(markup).not.toMatch(/<p data-stop-fig="1"[^>]*style="[^"]*display:\s*(flex|grid)/);
    expect(markup).not.toMatch(/<dd [^>]*display:\s*(flex|grid)[^>]*>\s*<span data-vt-no-i18n="1">\{\{ bookedDay \}\}/);
  });

  it("the arrow travels with 'New pickup': both are one flex item, so a wrap never leaves the arrow alone", () => {
    const row = markup.slice(markup.indexOf("Booked for"), markup.indexOf('<div style="max-width:420px;margin-bottom:30px">'));
    const group = '<span style="display:flex;align-items:center;gap:12px 16px;min-width:0">\n<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Icon" name="arrow-right"';
    expect(row).toContain(group);
    const inGroup = row.slice(row.indexOf(group));
    expect(inGroup.indexOf("New pickup")).toBeGreaterThan(-1);
    expect(inGroup.indexOf("New pickup")).toBeLessThan(inGroup.indexOf("</span>\n</div>"));
    // the row itself still wraps, with the same gaps
    expect(markup).toContain('<div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;margin-bottom:16px">\n<span style="display:flex;flex-direction:column;gap:2px"><span data-row-k="1">Booked for</span>');
  });

  it("the cancel answer's country code is kept; the label the routes never sent is not read", () => {
    expect(html).toContain("payoutCountry: result.body.payoutCountry || ticket.payoutCountry,");
    expect(html).not.toContain("result.body.payoutCountryLabel");
  });
});

// ── 2/5. the date pickers ──────────────────────────────────────────────────────────────────────────────────

type PickerVals = { dows: string[]; monthTitle: string; hourStr: string; minStr: string; summary: string };
type Picker = { loc: () => string; dayLabel: (y: number, m: number, d: number) => string; renderVals: () => PickerVals };

function openPicker(rel: string, props: Record<string, unknown>) {
  const ctx = createContext({ DCLogic, window: { innerWidth: 1200, innerHeight: 800 }, document: { addEventListener() {}, removeEventListener() {} }, console });
  runInContext(`${dcLogic(read(rel))}\n;globalThis.__Picker = Component;`, ctx);
  const Ctor = (ctx as unknown as { __Picker: new (p: Record<string, unknown>) => Picker }).__Picker;
  return new Ctor(props);
}

describe.each(PICKERS)("%s: the date picker in four languages and the left-to-right spinner (261002 items 2, 5)", (rel) => {
  it.each([["en", "en-GB"], ["de", "de-CH"], ["fr", "fr-CH"], ["ar", "ar-u-nu-latn"]])("locale %s formats with %s", (lang, want) => {
    expect(openPicker(rel, { locale: lang }).loc()).toBe(want);
  });

  it("Tue 6 Oct 2026 is labelled in the picker's language; Arabic keeps Latin digits", () => {
    expect(openPicker(rel, { locale: "de" }).dayLabel(2026, 9, 6)).toBe("Di. 6. Okt.");
    expect(openPicker(rel, { locale: "fr" }).dayLabel(2026, 9, 6)).toBe("mar. 6 oct.");
    expect(openPicker(rel, { locale: "ar" }).dayLabel(2026, 9, 6)).toBe("الثلاثاء، 6 أكتوبر");
  });

  it("the calendar opens on the month it is given (baseMonth), not a fixed one", () => {
    const v = openPicker(rel, { locale: "en", baseMonth: "2099-03", time: "08:15", day: 6, value: "x" }).renderVals();
    expect(v.monthTitle).toBe("March 2099");
    const de = openPicker(rel, { locale: "de", baseMonth: "2099-11", time: "08:15", day: 6, value: "x" }).renderVals();
    expect(de.monthTitle).toBe("November 2099");
  });

  it("04:30 shows as 04 and 30 (Latin digits) whatever the language", () => {
    for (const lang of ["en", "ar"]) {
      const v = openPicker(rel, { locale: lang, time: "04:30", day: 6, value: "x" }).renderVals();
      expect([v.hourStr, v.minStr]).toEqual(["04", "30"]);
    }
  });

  it("the weekday headings and the month are in the language, the digits Latin", () => {
    const v = openPicker(rel, { locale: "ar", time: "04:30", day: 6, value: "x" }).renderVals();
    expect(v.dows[0]).toMatch(/\p{Script=Arabic}/u);
    expect(v.monthTitle).toMatch(/\p{Script=Arabic}/u);
    expect(v.monthTitle).toMatch(/\b20\d\d\b/);
  });

  it("the hour : minute row is kept left to right (vt-dir-keep, laws.css: direction ltr under [dir=rtl])", () => {
    const html = read(rel);
    const row = '<div class="vt-dir-keep" style="flex:1 1 auto;display:flex;align-items:center;justify-content:center;gap:8px;padding:18px 4px 8px">';
    expect(html.split(row).length - 1).toBe(1);
    // and it is the row that holds hour, colon and minute, in that order
    const at = html.indexOf(row);
    const block = html.slice(at, at + 5200);
    expect(block.indexOf("{{ hourStr }}")).toBeGreaterThan(-1);
    expect(block.indexOf("{{ hourStr }}")).toBeLessThan(block.indexOf(">:</span>"));
    expect(block.indexOf(">:</span>")).toBeLessThan(block.indexOf("{{ minStr }}"));
    expect(read("design-system/tokens/laws.css")).toMatch(/\[dir="rtl"\] \.vt-dir-keep\{direction:ltr;unicode-bidi:isolate\}/);
  });
});

describe("the pages' picker trigger (261002 item 2)", () => {
  it("the date and the time in the trigger are never looked up, the time is left to right (as on home)", () => {
    const html = read("app/pages/WhenPicker.dc.html");
    expect(html).toContain('<span data-vt-no-i18n style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ value }}</span>');
    expect(html).toContain('<span data-vt-no-i18n style="color:var(--vt-text-secondary);font-variant-numeric:tabular-nums" class="vt-dir-keep">{{ time }}</span>');
  });

  it("the footer summary follows the text direction (no vt-dir-keep) and shrinks with an ellipsis; the footer wraps instead of running off", () => {
    const html = read("app/pages/WhenPicker.dc.html");
    const summary = html.slice(html.lastIndexOf("<span", html.indexOf("{{ summary }}</span>")), html.indexOf("{{ summary }}</span>"));
    expect(summary).toContain("data-vt-no-i18n");
    expect(summary).not.toContain("vt-dir-keep");
    expect(summary).toContain("white-space:nowrap;overflow:hidden;text-overflow:ellipsis");
    // the summary column can shrink (min-width:0, basis 140px) and the row wraps, buttons end-aligned
    expect(html).toContain('<div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid var(--vt-border-subtle)">\n<span style="display:flex;flex-direction:column;gap:1px;min-width:0;flex:1 1 140px">');
    expect(html).toContain('<span style="display:flex;align-items:center;gap:8px;flex:0 0 auto;margin-inline-start:auto">');
  });

  it("the pages copy has the home copy's four-locale map", () => {
    const pages = read("app/pages/WhenPicker.dc.html");
    const home = read("app/home/WhenPicker.dc.html");
    const map = "{ en: 'en-GB', de: 'de-CH', fr: 'fr-CH', ar: 'ar-u-nu-latn' }[l] || l";
    expect(pages).toContain(map);
    expect(home).toContain(map);
  });
});

// ── 3. Arabic bag counts ───────────────────────────────────────────────────────────────────────────────────

describe("Arabic bag counts (261002 item 3, real vamos-locale.js)", () => {
  it.each([
    // 2 is the dual, 3-10 the plural, 11-99 the singular accusative; 0 and 100+ keep the general form
    ["0 bags", "0 حقيبة"], ["1 bag", "حقيبة واحدة"], ["2 bags", "حقيبتان"], ["3 bags", "3 حقائب"], ["10 bags", "10 حقائب"],
    ["11 bags", "11 حقيبةً"], ["12 bags", "12 حقيبةً"], ["16 bags", "16 حقيبةً"], ["99 bags", "99 حقيبةً"], ["100 bags", "100 حقيبة"],
  ])("%s → ar %s", (en, ar) => {
    expect(locale.t(en, "ar")).toBe(ar);
    // and back: an Arabic page switching to English, German or French
    expect(locale.t(ar, "en")).toBe(en);
  });

  it.each([2, 3, 10, 11, 12, 16])("%i bags keeps the German and French wording", (n) => {
    expect(locale.t(`${n} bags`, "de")).toBe(`${n} Gepäckstücke`);
    expect(locale.t(`${n} bags`, "fr")).toBe(`${n} bagages`);
    // a page in German or French switching to Arabic reaches the same form
    expect(locale.t(`${n} Gepäckstücke`, "ar")).toBe(locale.t(`${n} bags`, "ar"));
    expect(locale.t(`${n} bagages`, "ar")).toBe(locale.t(`${n} bags`, "ar"));
    expect(locale.t(`${n} Gepäckstücke`, "en")).toBe(`${n} bags`);
  });

  it("a wider German template does not swallow a longer phrase", () => {
    expect(locale.t("Bis zu 7 Gepäckstücke", "en")).toBe("Up to 7 bags");
    expect(locale.t("Bis zu 12 Gepäckstücke", "en")).toBe("Up to 12 bags");
  });

  it.each([
    // one traveller
    ["1 passenger · 1 bag", "راكب واحد · حقيبة واحدة"], ["1 passenger · 2 bags", "راكب واحد · حقيبتان"],
    ["1 passenger · 5 bags", "راكب واحد · 5 حقائب"], ["1 passenger · 11 bags", "راكب واحد · 11 حقيبةً"],
    ["1 passenger · 16 bags", "راكب واحد · 16 حقيبةً"],
    // 2 to 10 travellers
    ["2 passengers · 1 bag", "2 ركاب · حقيبة واحدة"], ["2 passengers · 2 bags", "2 ركاب · حقيبتان"],
    ["3 passengers · 3 bags", "3 ركاب · 3 حقائب"], ["3 passengers · 10 bags", "3 ركاب · 10 حقائب"],
    ["5 passengers · 12 bags", "5 ركاب · 12 حقيبةً"], ["10 passengers · 16 bags", "10 ركاب · 16 حقيبةً"],
    ["7 passengers · 0 bags", "7 ركاب · 0 حقائب"],
    // 11 to 99 travellers
    ["12 passengers · 1 bag", "12 راكبًا · حقيبة واحدة"], ["12 passengers · 2 bags", "12 راكبًا · حقيبتان"],
    ["12 passengers · 5 bags", "12 راكبًا · 5 حقائب"], ["12 passengers · 12 bags", "12 راكبًا · 12 حقيبةً"],
    ["16 passengers · 16 bags", "16 راكبًا · 16 حقيبةً"],
  ])("the home summary %s → ar %s, and back to English", (en, ar) => {
    expect(locale.t(en, "ar")).toBe(ar);
    expect(locale.t(ar, "en")).toBe(en);
  });

  it("the summary keeps German and French wording for the new forms", () => {
    expect(locale.t("1 passenger · 2 bags", "de")).toBe("1 Passagier · 2 Gepäckstücke");
    expect(locale.t("5 passengers · 12 bags", "fr")).toBe("5 passagers · 12 bagages");
    expect(locale.t("12 passengers · 2 bags", "de")).toBe("12 Passagiere · 2 Gepäckstücke");
    expect(locale.t("12 passengers · 12 bags", "fr")).toBe("12 passagers · 12 bagages");
    expect(locale.t("2 passengers · 2 bags", "de")).toBe("2 Passagiere · 2 Gepäckstücke");
  });

  it("each new pattern was added above the entry that would have caught it first (nothing else moved)", () => {
    const dict = read("app/vamos-i18n-dict.js");
    const at = (re: string) => dict.indexOf(re);
    expect(at("{ re: /^2 bags$/,")).toBeGreaterThan(-1);
    expect(at("{ re: /^2 bags$/,")).toBeLessThan(at("{ re: /^(\\d+) bags$/,"));
    expect(at("{ re: /^(1[1-9]|[2-9]\\d) passengers · 2 bags$/,")).toBeLessThan(at("{ re: /^(1[1-9]|[2-9]\\d) passengers · (\\d+) bags$/,"));
    expect(at("{ re: /^(\\d+) passengers · 2 bags$/,")).toBeLessThan(at("{ re: /^(\\d+) passengers · (\\d+) bags$/,"));
    expect(at("{ re: /^1 passenger · 2 bags$/,")).toBeLessThan(at("{ re: /^1 passenger · (\\d+) bags$/,"));
  });

  it("Swiss German: no ß in any new bag entry", () => {
    for (const s of ["2 bags", "3 bags", "11 bags", "1 passenger · 2 bags", "5 passengers · 12 bags", "12 passengers · 2 bags", "12 passengers · 12 bags"]) {
      expect(locale.t(s, "de"), s).not.toContain("ß");
    }
  });
});

// ── 1/4. new words ─────────────────────────────────────────────────────────────────────────────────────────

describe("new words exist in four languages (261002)", () => {
  it.each(["Partially cancelled", "Partially completed", "Switzerland"])("%s has de, fr and ar (Swiss German: no ß)", (en) => {
    for (const l of LANGS) expect(strings[en]?.[l], `${l}: ${en}`).toBeTruthy();
    expect(strings[en]!.de).not.toContain("ß");
    for (const l of LANGS) expect(locale.t(strings[en]![l]!, "en")).toBe(en);
  });
});

// ── 4. the refund line's country ───────────────────────────────────────────────────────────────────────────

describe("the refund line names the country in the reader's language (261002 item 4)", () => {
  const refunded = { refundStatus: "refunded", payoutCountry: "CH", payoutCountryLabel: "Switzerland", availableOn: null as string | null };

  it.each([
    ["en", "Refunded to your Switzerland card."],
    ["de", "Erstattet auf Ihre Karte in Schweiz."],
    ["fr", "Remboursé sur votre carte Suisse."],
    ["ar", "أُعيد إلى بطاقتك في سويسرا."],
  ])("CH in %s: %s", (lang, want) => {
    const { helper } = loadHelper();
    locale.setLang(lang);
    expect(helper.refundedCopy(refunded)).toBe(want);
  });

  it("another country comes from its ISO code", () => {
    const { helper } = loadHelper();
    const de = { ...refunded, payoutCountry: "DE", payoutCountryLabel: "Germany" };
    locale.setLang("en");
    expect(helper.refundedCopy(de)).toBe("Refunded to your Germany card.");
    locale.setLang("de");
    expect(helper.refundedCopy(de)).toBe("Erstattet auf Ihre Karte in Deutschland.");
    locale.setLang("fr");
    expect(helper.refundedCopy(de)).toBe("Remboursé sur votre carte Allemagne.");
    locale.setLang("ar");
    expect(helper.refundedCopy(de)).toBe("أُعيد إلى بطاقتك في ألمانيا.");
  });

  it("no code means Switzerland (the account path sends none)", () => {
    const { helper } = loadHelper();
    locale.setLang("de");
    expect(helper.refundedCopy({ refundStatus: "refunded" })).toBe("Erstattet auf Ihre Karte in Schweiz.");
    expect(helper.refundedCopy({ refundStatus: "refunded", payoutCountry: null, payoutCountryLabel: null })).toBe("Erstattet auf Ihre Karte in Schweiz.");
  });

  it("a browser without region names falls back to the server's label through t(), then to Switzerland", () => {
    const { helper } = loadHelper({}, { DateTimeFormat: Intl.DateTimeFormat });
    locale.setLang("de");
    expect(helper.refundedCopy({ refundStatus: "refunded", payoutCountry: "CH", payoutCountryLabel: "Switzerland" })).toBe("Erstattet auf Ihre Karte in Schweiz.");
    expect(helper.refundedCopy({ refundStatus: "refunded", payoutCountry: "CH" })).toBe("Erstattet auf Ihre Karte in Schweiz.");
    expect(helper.refundedCopy({ refundStatus: "refunded", payoutCountry: "DE", payoutCountryLabel: "Germany" })).toBe("Erstattet auf Ihre Karte in Germany.");
  });

  it("an unknown code does not print the code; the label or Switzerland is used", () => {
    const { helper } = loadHelper();
    locale.setLang("de");
    expect(helper.refundedCopy({ refundStatus: "refunded", payoutCountry: "QQ", payoutCountryLabel: "Switzerland" })).toBe("Erstattet auf Ihre Karte in Schweiz.");
    expect(helper.refundedCopy({ refundStatus: "refunded", payoutCountry: "ZZ" })).toBe("Erstattet auf Ihre Karte in Schweiz.");
  });

  it("'Stripe pays out on {date}' uses the day label, in the reader's language", () => {
    const { helper } = loadHelper();
    const b = { ...refunded, availableOn: "2026-10-06T00:00:00.000Z" };
    locale.setLang("en");
    expect(helper.refundedCopy(b)).toBe("Refunded to your Switzerland card. Stripe pays out on Tue 6 Oct.");
    locale.setLang("de");
    expect(helper.refundedCopy(b)).toBe("Erstattet auf Ihre Karte in Schweiz. Stripe zahlt am Di. 6. Okt. aus.");
    locale.setLang("fr");
    // the day ends in a full stop in French; the sentence does not end in two
    expect(helper.refundedCopy(b)).toBe("Remboursé sur votre carte Suisse. Stripe verse le mar. 6 oct.");
    locale.setLang("ar");
    expect(helper.refundedCopy(b)).toBe("أُعيد إلى بطاقتك في سويسرا. سترايب يدفع في الثلاثاء، 6 أكتوبر.");
  });

  it("a date that is not a date leaves the payout sentence out", () => {
    const { helper } = loadHelper();
    expect(helper.refundedCopy({ ...refunded, availableOn: "soon" })).toBe("Refunded to your Switzerland card.");
  });

  it("only a refunded booking has the line", () => {
    const { helper } = loadHelper();
    expect(helper.refundedCopy({ ...refunded, refundStatus: "pending_ops" })).toBe("");
    expect(helper.refundedCopy(null as unknown as Record<string, unknown>)).toBe("");
  });
});

describe.each(PAGES)("%s: after a cancel the page keeps the country code (261002 item 4)", (rel) => {
  it("the answer's payoutCountry is kept and the refund line names the country in the language at that moment", async () => {
    const { page, sent } = openPage(rel, {
      status: 200,
      body: { ok: true, bookingId: "b1", refundStatus: "refunded", refundRappen: 0, payoutCountry: "DE", availableOn: "2026-10-09T00:00:00.000Z" },
    });
    page.applyTicket({ ...BOOKED }, "gate", "account");
    page.confirmCancel();
    await flush();
    expect(sent[0]).toMatchObject({ url: "/api/account/bookings/paid-cancel", method: "POST" });
    expect(page.state.ticket).toMatchObject({ status: "cancelled", canCancel: false, payoutCountry: "DE" });
    locale.setLang("de");
    expect(page.renderVals().refundedCopy).toBe("Erstattet auf Ihre Karte in Deutschland. Stripe zahlt am Fr. 9. Okt. aus.");
    locale.setLang("fr");
    expect(page.renderVals().refundedCopy).toBe("Remboursé sur votre carte Allemagne. Stripe verse le ven. 9 oct.");
  });

  it("an answer without a code keeps what the page had (CH by default)", async () => {
    const { page } = openPage(rel, { status: 200, body: { ok: true, bookingId: "b1", refundStatus: "refunded" } });
    page.applyTicket({ ...BOOKED }, "gate", "account");
    page.confirmCancel();
    await flush();
    locale.setLang("de");
    expect(page.renderVals().refundedCopy).toBe("Erstattet auf Ihre Karte in Schweiz.");
  });
});
