// apps/web/lib/ops/ops-dc-bp.test.ts
//
// 26.2 booking-path candidates, group C: New trip and Booking detail on the live dashboard
// (app/ops/OpsNewTrip.dc.html, app/ops/OpsDetail.dc.html). The whole script block of the DC file
// runs here against a stub DCLogic, so each test drives the real method and fails on the source
// as it was before the fix. No DOM, no network. Fixture amounts are synthetic rappen, not rates.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function readDc(name: string): string {
  return readFileSync(join(repoRoot, "app/ops", name), "utf8");
}

function scriptOf(name: string): string {
  const m = readDc(name).match(/<script type="text\/x-dc" data-dc-script[^>]*>\n([\s\S]*?)\n<\/script>/);
  if (!m?.[1]) throw new Error(`missing script block in ${name}`);
  return m[1];
}

type Json = Record<string, unknown>;
type Call = { url: string; method: string; body: Json | null };

/** Same contract as the DC runtime's DCLogic for what these components use: state, setState (object or updater, callback), props. */
class StubLogic {
  props: Record<string, unknown> = {};
  state: Record<string, unknown> = {};
  setState(patch: Json | ((s: Json) => Json), done?: () => void) {
    const next = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    if (done) done();
  }
  forceUpdate() {}
}

async function settle(): Promise<void> {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

// ── OpsNewTrip ──────────────────────────────────────────────────────────────────────────────
type NewTripComp = {
  state: {
    priceBusy: boolean;
    fareRappen: number;
    error: string;
    saving: boolean;
    pickupHits: { label: string }[];
    dropHits: { label: string }[];
    pickupOpen: boolean;
    dropOpen: boolean;
  };
  setState(patch: Json): void;
  toggleExtra(code: string): () => void;
  saveTrip(): void;
  setPickup(value: string): void;
  setDrop(value: string): void;
  pickPlace(field: "pickup" | "drop", loc: Json, text: string): void;
  componentWillUnmount(): void;
};

function newTripHarness(route: (call: Call) => unknown) {
  const calls: Call[] = [];
  const fetchStub = (url: string, init?: { method?: string; body?: string }) => {
    const call: Call = {
      url,
      method: init?.method ?? "GET",
      body: init?.body ? (JSON.parse(init.body) as Json) : null,
    };
    calls.push(call);
    return Promise.resolve(route(call)).then((json) => ({ ok: true, json: () => Promise.resolve(json) }));
  };
  const pushed: string[] = [];
  const win = {
    VamosLocale: { money: () => "CHF 000", cur: () => "CHF", lang: () => "en" },
    dispatchEvent: () => true,
  };
  class FakePopStateEvent {
    constructor(public type: string) {}
  }
  const sessionStore = { getItem: () => null, setItem: () => undefined };
  const history = { pushState: (_s: unknown, _t: string, url: string) => pushed.push(url) };
  const Component = new Function(
    "DCLogic", "window", "fetch", "sessionStorage", "history", "PopStateEvent",
    `${scriptOf("OpsNewTrip.dc.html")}\nreturn Component;`,
  )(StubLogic, win, fetchStub, sessionStore, history, FakePopStateEvent) as new () => NewTripComp;
  return { comp: new Component(), calls, pushed };
}

const OLD_TOTAL = 111; // synthetic rappen
const NEW_TOTAL = 222;

/** A quoted trip that is ready to save: both places picked, contact typed, one extra offered. */
const quotedTrip: Json = {
  quoteId: "q1",
  lock: "lock-1",
  klass: "economy",
  classes: [{ slug: "economy", name: "Economy" }],
  pickupLoc: { n: "Zurich HB", mapbox_id: "mb-1", session_token: "s-1" },
  dropLoc: { n: "Basel SBB", mapbox_id: "mb-2" },
  pickupText: "Zurich HB",
  dropText: "Basel SBB",
  dateIso: "2026-10-05",
  time: "10:00",
  name: "Ada Example",
  email: "ada@example.com",
  phone: "+41 79 000 00 00",
  fareRappen: OLD_TOTAL,
  extrasList: [{ code: "child-seat", amount_rappen: 50 }],
};

const isIntent = (c: Call) => c.url.startsWith("/api/checkout/intent");

afterEach(() => {
  vi.useRealTimers();
});

describe("OpsNewTrip Save while the price is updating (C1)", () => {
  function pendingPrice() {
    let answer!: (json: Json) => void;
    const promise = new Promise<Json>((resolve) => {
      answer = resolve;
    });
    const h = newTripHarness((c) => {
      if (c.url.startsWith("/api/checkout/price")) return promise;
      if (isIntent(c)) return { reference: "VT-TEST-1" };
      return {};
    });
    h.comp.setState(quotedTrip);
    return { ...h, answer };
  }

  it("does not book while the new price is still on its way", async () => {
    const { comp, calls } = pendingPrice();
    comp.toggleExtra("child-seat")(); // the old total stays on screen until the answer comes
    expect(comp.state.priceBusy).toBe(true);
    expect(comp.state.fareRappen).toBe(OLD_TOTAL);
    comp.saveTrip();
    await settle();
    expect(calls.filter(isIntent)).toEqual([]);
  });

  it("books once the new total is on screen, with the codes that total was priced for", async () => {
    const { comp, calls, answer } = pendingPrice();
    comp.toggleExtra("child-seat")();
    answer({ ok: true, charged_rappen: NEW_TOTAL });
    await settle();
    expect(comp.state.priceBusy).toBe(false);
    expect(comp.state.fareRappen).toBe(NEW_TOTAL);
    comp.saveTrip();
    await settle();
    const intents = calls.filter(isIntent);
    expect(intents).toHaveLength(1);
    expect(intents[0]?.body?.extra_codes).toEqual(["child-seat"]);
  });
});

describe("OpsNewTrip address suggestions, one answer per field (C3a)", () => {
  const suggestion = (name: string) => ({ suggestions: [{ name, address: "Somewhere", mapbox_id: `mb-${name}` }] });

  it("a slow Pickup answer still lands when Drop-off is typed before it arrives", async () => {
    vi.useFakeTimers();
    let answerPickup!: (json: Json) => void;
    const pickupAnswer = new Promise<Json>((resolve) => {
      answerPickup = resolve;
    });
    const { comp } = newTripHarness((c) => {
      if (c.url.includes("q=Zurich")) return pickupAnswer;
      if (c.url.startsWith("/api/geo/suggest")) return suggestion("Basel SBB");
      return {};
    });
    comp.setPickup("Zurich");
    await vi.advanceTimersByTimeAsync(500);
    comp.setDrop("Basel");
    await vi.advanceTimersByTimeAsync(500);
    answerPickup(suggestion("Zurich HB"));
    await settle();
    expect(comp.state.dropHits.map((h) => h.label)).toEqual(["Basel SBB \u2014 Somewhere"]);
    expect(comp.state.pickupHits.map((h) => h.label)).toEqual(["Zurich HB \u2014 Somewhere"]);
    expect(comp.state.pickupOpen).toBe(true);
  });
});

describe("OpsNewTrip address search is debounced (C3b)", () => {
  const suggestCalls = (calls: Call[]) => calls.filter((c) => c.url.startsWith("/api/geo/suggest"));
  const queryOf = (c: Call) => new URL(c.url, "http://x").searchParams.get("q");

  it("typing an address sends one suggest call for the finished text, not one per keystroke", async () => {
    vi.useFakeTimers();
    const { comp, calls } = newTripHarness(() => ({ suggestions: [] }));
    for (const typed of ["Ba", "Bas", "Base", "Basel"]) {
      comp.setDrop(typed);
      await vi.advanceTimersByTimeAsync(40);
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(suggestCalls(calls).map(queryOf)).toEqual(["Basel"]);
  });

  it("each field waits on its own pause: a Drop-off keystroke does not cancel the Pickup search", async () => {
    vi.useFakeTimers();
    const { comp, calls } = newTripHarness(() => ({ suggestions: [] }));
    comp.setPickup("Zurich");
    await vi.advanceTimersByTimeAsync(40);
    comp.setDrop("Basel");
    await vi.advanceTimersByTimeAsync(1000);
    expect(suggestCalls(calls).map(queryOf).sort()).toEqual(["Basel", "Zurich"]);
  });

  it("picking a suggestion cancels the search still waiting, so the list does not reopen", async () => {
    vi.useFakeTimers();
    const { comp, calls } = newTripHarness(() => ({ suggestions: [{ name: "Basel SBB", mapbox_id: "mb-2" }] }));
    comp.setDrop("Basel S");
    await vi.advanceTimersByTimeAsync(40);
    comp.pickPlace("drop", { n: "Basel SBB", mapbox_id: "mb-2", session_token: "s-1" }, "Basel SBB");
    await vi.advanceTimersByTimeAsync(1000);
    expect(suggestCalls(calls)).toEqual([]);
    expect(comp.state.dropOpen).toBe(false);
  });

  it("leaving the page cancels a search still waiting", async () => {
    vi.useFakeTimers();
    const { comp, calls } = newTripHarness(() => ({ suggestions: [] }));
    comp.setDrop("Basel");
    comp.componentWillUnmount();
    await vi.advanceTimersByTimeAsync(1000);
    expect(suggestCalls(calls)).toEqual([]);
  });
});

// ── Four languages (platform law) ──────────────────────────────────────────────────────────
type DictEntry = { de?: string; fr?: string; ar?: string };
type Dict = { strings: Record<string, DictEntry> };

function loadDict(): Dict {
  const code = readFileSync(join(repoRoot, "app/vamos-i18n-dict.js"), "utf8");
  const win: { VamosI18n?: Dict } = {};
  new Function("window", code)(win);
  if (!win.VamosI18n) throw new Error("dictionary did not load");
  return win.VamosI18n;
}

// English these screens write straight into the page (no copy table of their own).
const BP_LITERALS: Record<string, string[]> = {
  "OpsNewTrip.dc.html": ["Quote first"], // the "need a quote" error title
  "OpsDetail.dc.html": ["Not paid yet", "Paid by card"], // Payment tag and cancel dialog
};

describe("New trip and Booking detail literals resolve in the platform dictionary (C4)", () => {
  const dict = loadDict();

  for (const [file, strings] of Object.entries(BP_LITERALS)) {
    it(`${file}: every literal has de, fr and ar`, () => {
      const src = readDc(file);
      const missing: string[] = [];
      for (const s of strings) {
        expect(src, `${s} is still in ${file}`).toContain(s);
        const e = dict.strings[s];
        if (!e?.de || !e.fr || !e.ar) missing.push(s);
        else expect(e.de, s).not.toContain("ß");
      }
      expect(missing).toEqual([]);
    });
  }

  it("no new entry reuses a translation another English key already owns (the language switch maps back by first owner)", () => {
    const mine = new Set(Object.values(BP_LITERALS).flat());
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const [key, e] of Object.entries(dict.strings)) {
      for (const v of [e.de, e.fr, e.ar]) {
        if (!v) continue;
        const first = owner.get(v);
        if (first === undefined) owner.set(v, key);
        else if (first !== key && mine.has(key) && v !== key) clashes.push(`${key} -> ${v} (owned by ${first})`);
      }
    }
    expect(clashes).toEqual([]);
  });
});

// ── OpsDetail ───────────────────────────────────────────────────────────────────────────────
type DetailVals = {
  markArrival(): void;
  markComplete(): void;
  markNoShow(): void;
  sendPayLink(): void;
  confirmAssign(): void;
  pickAction(value: string): void;
};

type DetailComp = {
  state: Json;
  props: Json;
  setState(patch: Json): void;
  renderVals(): DetailVals;
};

const BOOKING_UUID = "11111111-1111-4111-8111-111111111111";
const DRIVER_UUID = "22222222-2222-4222-8222-222222222222";

function detailHarness(booking: Json, answer: (call: Call) => Promise<Json> | Json) {
  const calls: Call[] = [];
  const noop = () => undefined;
  const client = {
    request: (method: string, path: string, body?: Json) => {
      const call: Call = { url: path, method, body: body ?? null };
      calls.push(call);
      return Promise.resolve(answer(call));
    },
  };
  const table = { all: () => [] as unknown[], onChange: () => noop };
  const win = {
    VamosOpsApi: client,
    VamosOps: {
      bookings: { ...table, all: () => [booking], reset: noop },
      chauffeurs: { ...table, all: () => [{ id: DRIVER_UUID, name: "Ada Driver" }] },
      vehicles: table,
      profile: { get: () => ({ role: "admin" }), onChange: () => noop },
    },
    VamosLocale: { money: () => "CHF 000" },
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => true,
    open: () => null,
  };
  class FakePopStateEvent {
    constructor(public type: string) {}
  }
  const Component = new Function(
    "DCLogic", "window", "document", "localStorage", "history", "PopStateEvent", "navigator",
    `${scriptOf("OpsDetail.dc.html")}\nreturn Component;`,
  )(
    StubLogic, win, { body: { style: {} } }, { getItem: () => "en" }, { pushState: noop }, FakePopStateEvent, {},
  ) as new () => DetailComp;
  const comp = new Component();
  comp.props = { id: "VT-TEST-1" };
  return { comp, calls };
}

/** A paid, confirmed booking with a chauffeur to pick: every action of the detail page is on offer. */
const paidBooking: Json = {
  id: "VT-TEST-1",
  bookingId: BOOKING_UUID,
  status: "confirmed",
  paid: true,
  email: "ada@example.com",
  customer: "Ada Example",
  klass: "Economy",
  pickup: "Zurich HB",
  dropoff: "Basel SBB",
};
const unpaidBooking: Json = { ...paidBooking, paid: false, status: "pending" };

describe("OpsDetail actions send one request per click (C6)", () => {
  // name -> how to press it, which booking it needs, and the request it sends
  const actions: {
    name: string;
    booking: Json;
    press: (v: DetailVals, comp: DetailComp) => void;
    method: string;
    path: string;
  }[] = [
    { name: "Mark complete", booking: paidBooking, press: (v) => v.markComplete(), method: "PATCH", path: `/api/staff/bookings/${BOOKING_UUID}` },
    { name: "Mark no-show", booking: paidBooking, press: (v) => v.markNoShow(), method: "PATCH", path: `/api/staff/bookings/${BOOKING_UUID}` },
    { name: "Mark arrival", booking: paidBooking, press: (v) => v.markArrival(), method: "PATCH", path: `/api/staff/bookings/${BOOKING_UUID}` },
    { name: "Send pay link", booking: unpaidBooking, press: (v) => v.sendPayLink(), method: "POST", path: `/api/staff/bookings/${BOOKING_UUID}/pay-link` },
    {
      name: "Assign",
      booking: paidBooking,
      press: (v, comp) => {
        comp.setState({ pickDriver: DRIVER_UUID });
        v.confirmAssign();
      },
      method: "POST",
      path: `/api/staff/bookings/${BOOKING_UUID}/assign`,
    },
    { name: "Complete, from the action menu", booking: paidBooking, press: (v) => v.pickAction("complete"), method: "PATCH", path: `/api/staff/bookings/${BOOKING_UUID}` },
    { name: "Arrival, from the action menu", booking: paidBooking, press: (v) => v.pickAction("arrival"), method: "PATCH", path: `/api/staff/bookings/${BOOKING_UUID}` },
  ];

  function pending(booking: Json) {
    let reply!: (json: Json) => void;
    const promise = new Promise<Json>((resolve) => {
      reply = resolve;
    });
    return { ...detailHarness(booking, () => promise), reply };
  }

  for (const a of actions) {
    it(`${a.name}: a second click while the first is in flight sends nothing`, async () => {
      const { comp, calls } = pending(a.booking);
      a.press(comp.renderVals(), comp);
      a.press(comp.renderVals(), comp); // a double click re-renders in between, so the second press has fresh handlers
      await settle();
      expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`${a.method} ${a.path}`]);
    });
  }

  it("the page is free again once the answer is in, whether it was good or not", async () => {
    const { comp, calls, reply } = pending(paidBooking);
    comp.renderVals().markComplete();
    reply({ ok: false, code: "network" });
    await settle();
    comp.renderVals().markComplete();
    await settle();
    expect(calls).toHaveLength(2);
  });

  it("one status change at a time: No-show while Complete is in flight is not sent", async () => {
    const { comp, calls } = pending(paidBooking);
    comp.renderVals().markComplete();
    comp.renderVals().markNoShow();
    await settle();
    expect(calls.map((c) => c.body)).toEqual([{ status: "completed" }]);
  });
});
