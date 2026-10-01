// apps/web/lib/ops/ops-dc-dash-design.test.ts
//
// Quick 260930-dash-design — owner decisions 2026-09-30 / 2026-10-01, pinned on the live dashboard
// DC sources (app/ops/*.dc.html), the technique of ops-dc-u08.test.ts: the DC logic class is
// loaded from the page source and run with a stubbed window. No DOM, no network.
//
//   1. Booking detail: one "Actions" menu replaces Reassign / Unassign / Edit booking / Action /
//      No-show / Cancel; "Back to bookings" stays; Cancel stays apart (danger), no glow.
//   2. Phone: the top bar is one compact row (menu, title or wordmark, one Actions button);
//      a screen's own buttons fold into that menu at phone width (booking detail, Pricing).
//   3. The Assign box asks only for the driver, one primary button, refusals in plain words.
//      (The car parts of 3 — a Car field, the car under the driver's name — were withdrawn by the
//      owner on 2026-10-01: no cars; ops-dc-chauffeur-class.test.ts pins class and plate.)

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}
function readDc(name: string): string {
  return read(`app/ops/${name}`);
}
function scriptOf(src: string): string {
  const m = src.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/);
  if (!m?.[1]) throw new Error("no data-dc-script");
  return m[1];
}
/** Every @media block for this query, braces matched, joined. */
function mediaBlocks(src: string, query: string): string {
  const out: string[] = [];
  const head = `@media ${query}{`;
  let at = src.indexOf(head);
  while (at >= 0) {
    let depth = 1;
    let i = at + head.length;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
    }
    out.push(src.slice(at + head.length, i - 1));
    at = src.indexOf(head, i);
  }
  return out.join("\n");
}
function templateOf(src: string): string {
  const m = src.match(/<x-dc>([\s\S]*?)<\/x-dc>/);
  if (!m?.[1]) throw new Error("no <x-dc>");
  return m[1];
}

type Vals = Record<string, any>;
type Logic = {
  props: Record<string, unknown>;
  state: Record<string, any>;
  renderVals(): Vals;
  componentDidMount(): void;
  componentDidUpdate(prev?: unknown): void;
  componentWillUnmount(): void;
};

class Base {
  props: Record<string, unknown>;
  state: Record<string, unknown> = {};
  constructor(props?: Record<string, unknown>) {
    this.props = props || {};
  }
  setState(update: unknown) {
    const patch = typeof update === "function" ? (update as (s: unknown) => object)(this.state) : update;
    this.state = { ...this.state, ...(patch as object) };
  }
  forceUpdate() {}
  componentDidMount() {}
  componentDidUpdate() {}
  componentWillUnmount() {}
  renderVals() {
    return {};
  }
}

function loadLogic(file: string, win: Record<string, unknown>, lang = "en", props: Record<string, unknown> = {}): Logic {
  const src = scriptOf(readDc(file));
  const React = { createElement: (...args: unknown[]) => ({ args }) };
  const doc = {
    body: { style: {} as Record<string, string> },
    addEventListener() {},
    removeEventListener() {},
    documentElement: { getAttribute: () => "ltr" },
  };
  const fn = new Function(
    "DCLogic",
    "StreamableLogic",
    "React",
    "window",
    "document",
    "history",
    "localStorage",
    "location",
    "PopStateEvent",
    `${src}\n;return Component;`,
  );
  const Component = fn(
    Base,
    Base,
    React,
    win,
    doc,
    { pushState() {} },
    { getItem: (k: string) => (k === "vamosLang" ? lang : null), setItem() {} },
    { pathname: "/bookings/VT-26-0042", href: "https://dashboard.vamostaxi.site/bookings/VT-26-0042" },
    class {},
  ) as new (p: Record<string, unknown>) => Logic;
  const logic = new Component(props);
  if (lang) logic.state = { ...logic.state, lang };
  return logic;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const HOUR = 3600e3;
const isoIn = (ms: number) => new Date(Date.now() + ms).toISOString();
/** The Zurich wall clock of an instant, the way the board row carries it (dateIso + time). */
function zurichWall(ms: number): { dateIso: string; time: string } {
  const p: Record<string, string> = {};
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(Date.now() + ms)).forEach((x) => { p[x.type] = x.value; });
  return { dateIso: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

// ── fixtures (no amounts: totals stay CHF 000) ─────────────────────────────────────────────
const MARCO = "c0000000-0000-4000-8000-00000000aa01";
const LUCA = "c0000000-0000-4000-8000-00000000aa02";
const ECON_CAR = "87a4578f-0000-4000-8000-00000000ec01";
const BUS_CAR = "87a4578f-0000-4000-8000-00000000b501";

function booking(over: Record<string, unknown> = {}) {
  return {
    id: "VT-26-0042",
    bookingId: "b0000000-0000-4000-8000-000000000042",
    time: "08:00",
    date: "Fri 2 Oct",
    dateIso: "2026-10-02",
    customer: "Ada Example",
    email: "ada@example.com",
    phone: "+41 79 000 00 00",
    pickup: "Zurich Airport (ZRH)",
    dropoff: "Bahnhofstrasse 1, 8001 Zurich",
    klass: "Business",
    vehicle: "",
    pax: 2,
    bags: 2,
    status: "confirmed",
    driver: "",
    chauffeur: "",
    paid: true,
    paidByCard: true,
    totalRappen: 0,
    events: [],
    ...over,
  };
}

function detailWindow(b: Record<string, unknown>, answer: unknown = { ok: true }) {
  const request = vi.fn(async () => answer);
  const bar = { set: vi.fn(), clear: vi.fn() };
  const on = () => () => undefined;
  const win = {
    VamosOps: {
      bookings: { all: () => [b], onChange: on, reset: vi.fn() },
      chauffeurs: {
        all: () => [
          { id: MARCO, name: "Marco", defaultVehicleId: ECON_CAR, vehicle: ECON_CAR },
          { id: LUCA, name: "Luca", defaultVehicleId: "", vehicle: "" },
        ],
        onChange: on,
      },
      vehicles: {
        all: () => [
          { id: ECON_CAR, klass: "Economy", model: "Toyota Corolla", plate: "ZH 123 456" },
          { id: BUS_CAR, klass: "Business", model: "Mercedes V-Class", plate: "ZH 000 000" },
        ],
        onChange: on,
      },
      profile: { get: () => ({ role: "admin" }), onChange: on },
    },
    VamosOpsApi: { request },
    VamosLocale: { money: () => "CHF 000" },
    VamosOpsBar: bar,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    open() {},
  };
  return { win, request, bar };
}

function detail(over: Record<string, unknown> = {}, lang = "en", answer?: unknown) {
  const b = booking(over);
  const { win, request, bar } = detailWindow(b, answer);
  const logic = loadLogic("OpsDetail.dc.html", win, lang, { id: b.id });
  return { logic, request, bar, vals: () => logic.renderVals() };
}

function barMarkup(): string {
  const tpl = templateOf(readDc("OpsDetail.dc.html"));
  const start = tpl.indexOf("<div data-ops-detail-bar");
  const end = tpl.indexOf("<div data-ops-detail-col>");
  if (start < 0 || end < 0) throw new Error("detail bar not found");
  return tpl.slice(start, end);
}

// ── 1 · Booking detail: one Actions menu ────────────────────────────────────────────────────
describe("1 · booking detail: one Actions menu", () => {
  it("the bar holds Back to bookings and one ActionsMenu — none of the six old buttons", () => {
    const bar = barMarkup();
    expect(bar).toContain('onClick="{{ goBack }}"');
    expect(bar.match(/<dc-import name="ActionsMenu"/g) ?? []).toHaveLength(1);
    for (const gone of [
      "{{ openAssignDialog }}",
      "{{ confirmUnassign }}",
      "{{ openEdit }}",
      "{{ markNoShow }}",
      "{{ openCancel }}",
      "{{ markRefund }}",
      "{{ openRequested }}",
      'name="BrandSelect"',
    ]) {
      expect(bar, gone).not.toContain(gone);
    }
    // Edit mode keeps its own Cancel / Continue.
    expect(bar).toContain("{{ cancelEdit }}");
    expect(bar).toContain("{{ saveEdit }}");
  });

  it("a paid, unassigned trip lists every valid action; Cancel booking is last and danger", () => {
    const items = detail({ pickupAt: isoIn(-HOUR) }).vals().actionItems as { value: string; label: string; tone?: string }[];
    expect(items.map((i) => i.value)).toEqual(["assign", "edit", "resend", "arrival", "complete", "noShow", "cancel"]);
    expect(items.map((i) => i.label)).toEqual([
      "Assign driver",
      "Edit booking",
      "Resend voucher",
      "Mark arrival",
      "Complete",
      "No-show",
      "Cancel booking",
    ]);
    expect(items.filter((i) => i.tone === "danger").map((i) => i.value)).toEqual(["cancel"]);
  });

  it("signed 2026-10-01: Complete and No-show only once the pickup time has passed (Zurich)", () => {
    const values = (over: Record<string, unknown>) =>
      (detail(over).vals().actionItems as { value: string }[]).map((i) => i.value);
    const nextWeek = values({ pickupAt: isoIn(7 * 24 * HOUR) });
    expect(nextWeek).not.toContain("complete");
    expect(nextWeek).not.toContain("noShow");
    expect(nextWeek).toContain("arrival");
    const hourAgo = values({ pickupAt: isoIn(-HOUR) });
    expect(hourAgo).toContain("complete");
    expect(hourAgo).toContain("noShow");
    // Without pickupAt, the Zurich date and time of the row decide.
    expect(values({ pickupAt: "", ...zurichWall(-HOUR) })).toContain("complete");
    expect(values({ pickupAt: "", ...zurichWall(7 * 24 * HOUR) })).not.toContain("noShow");
  });

  it("an assigned trip offers Reassign and Unassign", () => {
    const items = detail({ driver: "Marco", chauffeur: "Marco", status: "assigned" }).vals().actionItems as {
      value: string;
      label: string;
    }[];
    expect(items.slice(0, 2)).toEqual([
      expect.objectContaining({ value: "assign", label: "Reassign" }),
      expect.objectContaining({ value: "unassign", label: "Unassign" }),
    ]);
  });

  it("a finished trip offers no trip-state actions; a cancelled paid trip offers Refund to an admin", () => {
    const done = (detail({ status: "completed", driver: "Marco" }).vals().actionItems as { value: string }[]).map(
      (i) => i.value,
    );
    for (const v of ["assign", "unassign", "arrival", "complete", "noShow", "cancel"]) expect(done).not.toContain(v);
    const cancelled = (detail({ status: "cancelled" }).vals().actionItems as { value: string }[]).map((i) => i.value);
    expect(cancelled).toContain("refund");
    expect(cancelled).not.toContain("cancel");
  });

  it("each item runs the handler the old button ran", async () => {
    const d = detail();
    d.vals().pickAction("cancel");
    expect(d.logic.state.cancelOpen).toBe(true);
    d.vals().pickAction("edit");
    expect(d.logic.state.editing).toBe(true);
    const n = detail();
    n.vals().pickAction("noShow");
    await flush();
    expect(n.request).toHaveBeenCalledWith("PATCH", "/api/staff/bookings/b0000000-0000-4000-8000-000000000042", {
      status: "no_show",
    });
    const u = detail({ driver: "Marco", status: "assigned" });
    u.vals().pickAction("unassign");
    await flush();
    expect(u.request).toHaveBeenCalledWith("POST", "/api/staff/bookings/b0000000-0000-4000-8000-000000000042/unassign", {});
    const r = detail();
    r.vals().pickAction("resend");
    await flush();
    expect(r.request).toHaveBeenCalledWith("POST", "/api/staff/bookings/b0000000-0000-4000-8000-000000000042/voucher", {});
  });

  it("the button reads Actions in en, de, fr and ar (Swiss German)", () => {
    expect(detail({}, "en").vals().tActions).toBe("Actions");
    expect(detail({}, "de").vals().tActions).toBe("Aktionen");
    expect(detail({}, "fr").vals().tActions).toBe("Actions");
    expect(detail({}, "ar").vals().tActions).toBe("الإجراءات");
  });

  it("ActionsMenu: a destructive item is set apart in the danger colour, never a glow or a tint", () => {
    const src = readDc("ActionsMenu.dc.html");
    expect(src).toMatch(/\[data-am-item\]\[data-tone="danger"\]\{color:var\(--vt-danger\)\}/);
    expect(src).toMatch(/sepBefore: i > 0 && i === firstDanger/);
    expect(src).not.toMatch(/--vt-shadow-accent\b(?!:none)/);
    expect(src).not.toMatch(/--vt-yellow-(50|100|200|300|600|700)\b/);
    expect(src).not.toMatch(/box-shadow:[^;}]*(rgb\(253|--vt-accent|--vt-danger)/);
    expect(src).toContain('role="menu"');
    expect(src).toContain('role="menuitem"');
    expect(src).toContain("min-height:44px");
  });
});

// ── 1b · Merged with main (20-10 refunds by hand): Refund lives in Actions, main's panel does the work ──
describe("1b · Actions → Refund opens main's refunds-by-hand panel", () => {
  const due = { status: "cancelled", refundStatus: "pending_ops", refundOwedRappen: 12000 };
  const fakePanel = () => {
    const focus = vi.fn();
    return { el: { isConnected: true, scrollIntoView: vi.fn(), querySelector: vi.fn(() => ({ focus })) }, focus };
  };

  it("a cancelled paid booking with a refund due shows Actions with Refund, and main's panel on the page", () => {
    const v = detail(due).vals();
    expect(v.refundFormShown).toBe(true);
    expect(v.fullShown).toBe(true);
    expect(v.showRefundDue).toBe(true);
    expect(v.showActions).toBe(true);
    expect((v.actionItems as { value: string }[]).map((i) => i.value)).toEqual(["refund"]);
  });

  it("picking Refund sends nothing: it scrolls to main's panel and focuses its first control", async () => {
    const d = detail(due);
    const p = fakePanel();
    (d.logic as unknown as { _refundEl: unknown })._refundEl = p.el;
    d.vals().pickAction("refund");
    await flush();
    expect(d.request).not.toHaveBeenCalled();
    expect(p.el.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    expect(p.focus).toHaveBeenCalledWith({ preventScroll: true });
    // The panel's own Confirm refund is what sends (main's body: full tier = 100 %).
    d.vals().confirmPercent();
    await flush();
    expect(d.request).toHaveBeenCalledWith("POST", "/api/staff/bookings/b0000000-0000-4000-8000-000000000042/refund", { percent: 100 });
  });

  it("the phone bar's Refund does the same (one handler)", async () => {
    const d = detail(due);
    const p = fakePanel();
    (d.logic as unknown as { _refundEl: unknown })._refundEl = p.el;
    d.vals();
    d.logic.componentDidUpdate();
    const [, entry] = d.bar.set.mock.calls.at(-1) as [string, Record<string, any>];
    expect(entry.items.map((i: { value: string }) => i.value)).toEqual(["refund"]);
    entry.onPick("refund");
    await flush();
    expect(d.request).not.toHaveBeenCalledWith("POST", expect.stringMatching(/\/refund$/), expect.anything());
    expect(p.el.scrollIntoView).toHaveBeenCalled();
  });

  it("a failed refund offers Refund too; it leads to main's Try again, never a new POST", async () => {
    const d = detail({ status: "cancelled", refundStatus: "failed", refundOwedRappen: 12000 });
    const v = d.vals();
    expect(v.refundFailedShown).toBe(true);
    expect((v.actionItems as { value: string }[]).map((i) => i.value)).toContain("refund");
    v.pickAction("refund");
    await flush();
    expect(d.request).not.toHaveBeenCalledWith("POST", expect.stringMatching(/\/refund$/), expect.anything());
  });

  it("an old cancelled row (refund_status none) keeps main's one-press full refund", async () => {
    const d = detail({ status: "cancelled" });
    d.vals().pickAction("refund");
    await flush();
    expect(d.request).toHaveBeenCalledWith("POST", "/api/staff/bookings/b0000000-0000-4000-8000-000000000042/refund", {});
  });

  it("a post-trip request opens main's Accept / Reject panel", () => {
    const d = detail({ status: "completed", tripPassed: true, driver: "Marco" });
    d.vals().pickAction("refund");
    expect(d.logic.state.requestedFor).toBe("b0000000-0000-4000-8000-000000000042");
    expect(d.vals().requestedShown).toBe(true);
  });

  it("while a refund is being sent the item is disabled and a pick does nothing", async () => {
    const d = detail(due);
    d.logic.state = { ...d.logic.state, refundBusy: "percent" };
    const item = (d.vals().actionItems as { value: string; disabled?: boolean }[]).find((i) => i.value === "refund");
    expect(item?.disabled).toBe(true);
  });

  it("main's three refund panels carry the ref the menu scrolls to; no Refund button outside the menu", () => {
    const tpl = templateOf(readDc("OpsDetail.dc.html"));
    for (const flag of ["refundFormShown", "requestedShown", "refundFailedShown"]) {
      expect(tpl, flag).toMatch(new RegExp(`sc-if value="\\{\\{ ${flag} \\}\\}"[^>]*>\\s*<div data-ops-refund-region ref="\\{\\{ refundRef \\}\\}">`));
    }
    expect(tpl).not.toContain('onClick="{{ markRefund }}"');
    expect(tpl).not.toContain('onClick="{{ openRequested }}"');
  });
});

// ── 2 · Phone: compact bar, page buttons fold into its Actions menu ─────────────────────────
describe("2 · phone: compact bar and folded page buttons", () => {
  it("booking detail hands its actions and its reference to the bar, and takes them back on leave", () => {
    const d = detail();
    d.vals();
    d.logic.componentDidUpdate();
    expect(d.bar.set).toHaveBeenCalled();
    const [owner, entry] = d.bar.set.mock.calls.at(-1) as [string, Record<string, any>];
    expect(owner).toBe("detail");
    expect(entry.title).toBe("VT-26-0042");
    expect(entry.label).toBe("Actions");
    expect(entry.items.map((i: { value: string }) => i.value)).toEqual(d.vals().actionItems.map((i: { value: string }) => i.value));
    entry.onPick("cancel");
    expect(d.logic.state.cancelOpen).toBe(true);
    d.logic.componentWillUnmount();
    expect(d.bar.clear).toHaveBeenCalledWith("detail");
  });

  it("while editing, the bar lists nothing (the form keeps its Cancel / Continue)", () => {
    const d = detail();
    d.logic.state = { ...d.logic.state, editing: true };
    d.vals();
    d.logic.componentDidUpdate();
    const [, entry] = d.bar.set.mock.calls.at(-1) as [string, Record<string, any>];
    expect(entry.items).toEqual([]);
  });

  it("the detail's Actions menu sits in a [data-ops-fold] wrapper, which the shell hides at phone width", () => {
    expect(barMarkup()).toMatch(/<div data-ops-fold[^>]*>\s*<dc-import name="ActionsMenu"/);
    const shell = readDc("ops.dc.html");
    // Signed 2026-10-01: "tablets too" — the fold applies up to 1080px (tablet range 681–1080).
    expect(mediaBlocks(shell, "(max-width:1080px)")).toContain("[data-ops-fold]{display:none!important}");
    expect(mediaBlocks(shell, "(max-width:767px)")).not.toContain("[data-ops-fold]");
  });

  it("the shell bar is one compact row: menu, title or wordmark, the page's Actions — no avatar", () => {
    const shell = readDc("ops.dc.html");
    const tpl = templateOf(shell);
    const top = tpl.slice(tpl.indexOf("<div data-ops-topbar"), tpl.indexOf('<sc-if value="{{ isDash }}"'));
    expect(shell).toContain('<script src="../vamos-ops-bar.js"></script>');
    expect(top).toMatch(/<dc-import name="ActionsMenu"[^>]*tone="inverse"[^>]*items="\{\{ barItems \}\}"[^>]*onPick="\{\{ pickBar \}\}"/);
    expect(top).toContain("{{ barTitle }}");
    expect(top).not.toContain("data-ops-prof-btn");
    const h = shell.match(/\[data-ops-topbar\]\{display:grid;[^}]*min-height:(\d+)px/);
    expect(Number(h?.[1])).toBeLessThanOrEqual(52);
    // The Actions slot only shows at phone width.
    expect(shell).toMatch(/\[data-ops-top-acts\]\{display:none\}/);
    expect(mediaBlocks(shell, "(max-width:1080px)")).toContain("[data-ops-top-acts]{display:flex}");
    // The compact bar (and the drawer) cover the same range; above 1080 the desktop rail stays.
    expect(mediaBlocks(shell, "(max-width:1080px)")).toContain("[data-ops-topbar]{display:grid;");
    expect(mediaBlocks(shell, "(max-width:899px)")).toBe("");
  });

  it("the shell reads the bar store: title, items and the pick go to the screen", () => {
    const entry = {
      title: "VT-26-0042",
      label: "Aktionen",
      items: [{ value: "cancel", label: "Buchung stornieren", tone: "danger" }],
      onPick: vi.fn(),
    };
    const store = { get: () => entry, pick: vi.fn(), onChange: () => () => undefined };
    const shell = loadLogic("ops.dc.html", {
      VamosOpsBar: store,
      VamosOps: { profile: { get: () => ({}), onChange: () => () => undefined } },
      addEventListener() {},
      removeEventListener() {},
    }, "de");
    const v = shell.renderVals();
    expect(v.barTitle).toBe("VT-26-0042");
    expect(v.hasBarTitle).toBe(true);
    expect(v.barLabel).toBe("Aktionen");
    expect(v.barItems).toEqual(entry.items);
    v.pickBar("cancel");
    expect(store.pick).toHaveBeenCalledWith("cancel");
  });

  it("the bar store survives a second load of its file, and the shell waits for it to exist", async () => {
    const code = read("app/vamos-ops-bar.js");
    const win: Record<string, any> = {};
    new Function("window", code)(win);
    const heard: unknown[] = [];
    win.VamosOpsBar.onChange((v: unknown) => heard.push(v));
    new Function("window", code)(win); // the helmet runs it again
    win.VamosOpsBar.set("detail", { title: "VT-26-0042", items: [{ value: "cancel", label: "Cancel booking" }] });
    await flush();
    expect(heard).toHaveLength(1);
    const shell = readDc("ops.dc.html");
    expect(shell).toMatch(/bindBar = \(\) => \{\n\s*if \(!window\.VamosOpsBar[^\n]*setTimeout\(this\.bindBar, 120\)/);
  });

  it("with the avatar gone from the bar, the drawer shows Profile, Settings and Sign out on a phone", () => {
    const side = readDc("OpsSidebar.dc.html");
    const phone = mediaBlocks(side, "(max-width:1080px)");
    expect(side).toContain("window.matchMedia('(max-width: 1080px)')");
    expect(phone).toContain("[data-rail-toggle]{display:none!important}");
    expect(phone).not.toContain("[data-rail-profile]{display:none!important}");
    expect(side).not.toMatch(/profileShow: drawer \? 'none'/);
  });

  it("Pricing: Discard draft and Publish fare book fold into the bar at phone width", () => {
    const src = readDc("OpsPricing.dc.html");
    const tpl = templateOf(src);
    expect(tpl).toMatch(
      /<span data-ops-fold="1"[^>]*>\s*<x-import[^>]*onClick="\{\{ openDiscard \}\}"[\s\S]*?onClick="\{\{ openPublish \}\}"[\s\S]*?<\/span>/,
    );
    const body = src.match(/\nfunction pricingBarItems\(t, discardOff, publishOff\) \{\n([\s\S]*?)\n\}\n/)?.[1];
    if (!body) throw new Error("pricingBarItems missing");
    const items = new Function("t", "discardOff", "publishOff", body)(
      { discard: "Discard draft", publish: "Publish fare book" },
      false,
      true,
    );
    expect(items).toEqual([
      { value: "publish", label: "Publish fare book", icon: "check", disabled: true },
      { value: "discard", label: "Discard draft", icon: "trash-2", tone: "danger", disabled: false },
    ]);
    expect(src).toMatch(/window\.VamosOpsBar\.set\('pricing'/);
    expect(src).toMatch(/window\.VamosOpsBar\.clear\('pricing'\)/);
    for (const lang of ["en: {", "de: {", "fr: {", "ar: {"]) {
      const at = src.indexOf(lang, src.indexOf("const T = {"));
      expect(src.slice(at, at + 20000)).toMatch(/actions:'[^']+'/);
    }
  });
});

// ── 3 · The Assign box ──────────────────────────────────────────────────────────────────────
// Owner, 2026-10-01: no cars. The Car field, the car under the driver's name and the car refusals
// pinned here before are withdrawn; class and plate are pinned in ops-dc-chauffeur-class.test.ts.
describe("3 · the Assign box", () => {
  it("the button is never a pale-yellow disabled pill: without a pick it asks for one, in words, and sends nothing", async () => {
    const d = detail();
    expect(d.vals().assignDisabled).toBe(false);
    d.vals().confirmAssign();
    await flush();
    expect(d.request).not.toHaveBeenCalled();
    expect(d.vals().assignError).toBe("Pick a chauffeur first.");
    // Decision 7 (2026-10-01): the pick is the one-row dropdown now (ops-dc-chauffeur-class.test.ts).
    d.vals().pickDriverFromSelect({ target: { value: MARCO } });
    expect(d.logic.state.pickDriver).toBe(MARCO);
    expect(d.vals().hasAssignError).toBe(false);
    const css = readDc("OpsDetail.dc.html");
    expect(css).toMatch(/\[data-ops-assign-row\]\{[^}]*max-inline-size:\d+px/);
  });

});
