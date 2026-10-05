// apps/web/lib/ops/ops-poll-hold.test.ts
//
// Dashboard follow-up 4b (2026-10-05, controller): a write refused for a dead session keeps the page so the typed form
// survives (app/vamos-ops-api.js, ops-session-lost.test.ts). The bookings store re-reads every 3 s while it is loaded and
// on window focus; that automatic read was "the next read" and sent OpsDetail to /login ~1.8 s after the refusal. While the
// refusal waits, the store now asks for nothing; a navigation, a screen load or a manual read still go to /login.
// This runs the two real files in one vm with a fake clock, a stub fetch, history and focus. No DOM, no network.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const API = readFileSync(join(here, "../../../../app/vamos-ops-api.js"), "utf8");
const DATA = readFileSync(join(here, "../../../../app/vamos-ops-data.js"), "utf8");
const ORIGIN = "https://dashboard.vamostaxi.site";
const BOOKING_UUID = "6a1f0e0e-0836-4c0d-9a31-0d5b1c4a0800";
const ROW = { id: "VT-26-0829", bookingId: BOOKING_UUID, customer: "Amira Keller", status: "confirmed", pax: 2, paid: true };

type Answer = { status: number; body: unknown };
const NO_SESSION: Answer = { status: 401, body: { ok: false, code: "no-session" } };
const OK = (data: unknown): Answer => ({ status: 200, body: { ok: true, data } });

type Store = {
  bookings: {
    all: () => unknown[];
    get: (id: string) => unknown;
    update: (id: string, patch: Record<string, unknown>) => Promise<{ ok: boolean; code?: string }>;
    reset: () => unknown[];
  };
};

/** One console tab: both real files, a fake clock, a stub fetch, history, window focus, page visibility. */
function consoleTab(opts: { loads?: number } = {}) {
  let now = 5_000_000;
  let nextTimer = 1;
  let timers: Array<{ id: number; at: number; fn: () => void }> = [];
  const calls: string[] = [];
  const replaced: string[] = [];
  const pushes: string[] = [];
  const windowListeners: Record<string, Array<() => void>> = {};
  const documentListeners: Record<string, Array<() => void>> = {};
  const state = { writes: NO_SESSION as Answer };
  const document = {
    visibilityState: "visible",
    addEventListener: (type: string, fn: () => void) => void (documentListeners[type] ??= []).push(fn),
  };
  const sandbox: Record<string, unknown> = {
    document,
    history: { pushState: (_s: unknown, _t: string, url?: string) => void pushes.push(String(url ?? "")) },
    addEventListener: (type: string, fn: () => void) => void (windowListeners[type] ??= []).push(fn),
    dispatchEvent: () => true,
    CustomEvent: class {
      detail: unknown;
      constructor(_type: string, init?: { detail?: unknown }) {
        this.detail = init?.detail;
      }
    },
    location: { origin: ORIGIN, href: `${ORIGIN}/bookings/VT-26-0829`, replace: (to: string) => void replaced.push(to), reload: () => undefined },
    localStorage: { getItem: () => "1", setItem: () => undefined, removeItem: () => undefined },
    sessionStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    URL,
    Promise,
    Number,
    JSON,
    Response,
    console,
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    setTimeout: (fn: () => void, ms: number) => {
      const id = nextTimer++;
      timers.push({ id, at: now + ms, fn });
      return id;
    },
    clearTimeout: (id: number) => {
      timers = timers.filter((t) => t.id !== id);
    },
  };
  sandbox.window = sandbox;
  sandbox.fetch = async (input: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push(`${method} ${input}`);
    let answer: Answer;
    if (method === "GET" && input === "/api/staff/bookings") answer = OK([ROW]);
    else if (method !== "GET") answer = state.writes;
    else answer = OK([]);
    const res = new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
    Object.defineProperty(res, "url", { value: new URL(input, ORIGIN).href });
    return res;
  };
  vm.createContext(sandbox);
  // The shell's helmet runs each file twice: the api file keeps its first watcher, the store keeps its first instance.
  for (let i = 0; i < (opts.loads ?? 1); i++) {
    vm.runInContext(API, sandbox);
    vm.runInContext(DATA, sandbox);
  }
  const flush = async () => {
    for (let i = 0; i < 12; i++) await new Promise((resolve) => setImmediate(resolve));
  };
  /** Moves the fake clock, firing due timers in order, letting promises settle after each step. */
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      now = Math.max(now, next.at);
      next.fn();
      await flush();
    }
    now = end;
    await flush();
  };
  const win = sandbox as { VamosOps: Store; VamosOpsApi: { request: (m: string, p: string, b?: unknown) => Promise<Record<string, unknown>>; sessionLostPending?: () => boolean }; history: { pushState: (s: unknown, t: string, u?: string) => void } };
  const bookingReads = () => calls.filter((c) => c === "GET /api/staff/bookings").length;
  const fire = (target: Record<string, Array<() => void>>, type: string) => (target[type] ?? []).forEach((fn) => fn());
  return { win, calls, replaced, pushes, state, advance, flush, bookingReads, windowListeners, documentListeners, fire, document };
}

/** OpsDetail has the booking open: the store is loaded (and polling), and a save is refused. */
async function openDetail(opts: { loads?: number } = {}) {
  const t = consoleTab(opts);
  t.win.VamosOps.bookings.all(); // hydrate: GET /api/staff/bookings
  await t.flush();
  return t;
}

describe("a refused write holds the bookings poll (follow-up 4b)", () => {
  it("the premise: without a refused write the store reads again every 3 s and on window focus", async () => {
    const t = await openDetail();
    expect(t.bookingReads()).toBe(1);
    await t.advance(3100);
    expect(t.bookingReads()).toBe(2);
    t.fire(t.windowListeners, "focus");
    await t.flush();
    expect(t.bookingReads()).toBe(3);
    expect(t.replaced).toEqual([]);
  });

  it("OpsDetail: a refused save asks for no booking read and does not redirect for 10 s; a navigation then goes to /login", async () => {
    const t = await openDetail();
    const answer = await t.win.VamosOps.bookings.update("VT-26-0829", { note: "Gate B, he waits with a sign" });
    await t.flush();
    expect(answer).toMatchObject({ ok: false, code: "no-session" });
    expect(t.win.VamosOpsApi.sessionLostPending?.()).toBe(true);
    const readsAtRefusal = t.bookingReads();
    const callsAtRefusal = t.calls.length;
    for (let second = 0; second < 10; second += 1) await t.advance(1000);
    expect(t.bookingReads()).toBe(readsAtRefusal); // no poll request
    expect(t.calls).toHaveLength(callsAtRefusal); // and nothing else asked for either
    expect(t.replaced).toEqual([]); // the page stays: the typed form is still there
    t.win.history.pushState({}, "", "/bookings");
    expect(t.replaced).toEqual(["/login"]);
    expect(t.pushes).toEqual(["/bookings"]);
  });

  it("the window-focus refetch is held too, and so is a page that comes back from the background", async () => {
    const t = await openDetail();
    await t.win.VamosOps.bookings.update("VT-26-0829", { note: "x" });
    await t.flush();
    const before = t.bookingReads();
    t.fire(t.windowListeners, "focus");
    t.document.visibilityState = "hidden";
    t.fire(t.documentListeners, "visibilitychange");
    await t.advance(5000);
    t.document.visibilityState = "visible";
    t.fire(t.documentListeners, "visibilitychange");
    await t.advance(5000);
    expect(t.bookingReads()).toBe(before);
    expect(t.replaced).toEqual([]);
  });

  it("a manual read still goes to /login: reset() (a screen's own reload) is the person moving on", async () => {
    const t = await openDetail();
    await t.win.VamosOps.bookings.update("VT-26-0829", { note: "x" });
    await t.flush();
    expect(t.replaced).toEqual([]);
    t.win.VamosOps.bookings.reset();
    await t.flush();
    expect(t.replaced).toEqual(["/login"]);
  });

  it("a screen load goes to /login (a screen file is not a poll)", async () => {
    const t = await openDetail();
    await t.win.VamosOps.bookings.update("VT-26-0829", { note: "x" });
    await t.flush();
    await (t.win as unknown as { fetch: (u: string) => Promise<Response> }).fetch("/app/ops/OpsPricing.dc.html");
    await t.flush();
    expect(t.replaced).toEqual(["/login"]);
  });

  it("the poll resumes by itself once the mark clears (a staff write goes through): the next tick reads again", async () => {
    const t = await openDetail();
    await t.win.VamosOps.bookings.update("VT-26-0829", { note: "x" });
    await t.flush();
    await t.advance(6000);
    const held = t.bookingReads();
    t.state.writes = OK({ id: BOOKING_UUID });
    const retry = await t.win.VamosOps.bookings.update("VT-26-0829", { note: "x" }); // a refresh race: the retry works
    await t.flush();
    expect(retry.ok).toBe(true);
    expect(t.win.VamosOpsApi.sessionLostPending?.()).toBe(false);
    await t.advance(3100);
    expect(t.bookingReads()).toBeGreaterThan(held);
    expect(t.replaced).toEqual([]);
  });

  it("the helmet runs both files twice: the first watcher's mark is the one the store asks (a second API object would answer false)", async () => {
    const t = await openDetail({ loads: 2 });
    await t.win.VamosOps.bookings.update("VT-26-0829", { note: "x" });
    await t.flush();
    expect(t.win.VamosOpsApi.sessionLostPending?.()).toBe(true);
    const before = t.bookingReads();
    await t.advance(10_000);
    expect(t.bookingReads()).toBe(before);
    expect(t.replaced).toEqual([]);
  });

  it("sessionLostPending is a read-only question: false at first, no argument, never throws", async () => {
    const t = consoleTab();
    expect(typeof t.win.VamosOpsApi.sessionLostPending).toBe("function");
    expect(t.win.VamosOpsApi.sessionLostPending?.()).toBe(false);
  });

  it("source pin: the store holds the poll through one question to the api object, not a copy of the logic", () => {
    expect(DATA).toContain("sessionLostPending");
    expect(DATA.match(/writeRefused\(\)/g)?.length).toBeGreaterThanOrEqual(3); // definition + poll tick + focus refetch
    expect(API).toContain("sessionLostPending: function () { return lostPending; }");
  });
});
