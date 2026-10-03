// Phase 28 plan 02. vm harness for app/vamos-meta.js, the mock runtime's Meta page-view loader.
// The harness never depends on the committed flag values: it rewrites the two literals in the source
// text (closed cases get false, open cases get true). The committed values are pinned in
// legal-gate.test.ts. Meta strings are built from parts: the Phase 26 needle scan reads apps/web/lib.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { PIXEL_CASES } from "./pixel-pages.cases";
import { pixelPageAllowed } from "./pixel-pages";

const APP_DIR = resolve(__dirname, "../../../../app");
const rawSrc = readFileSync(resolve(APP_DIR, "vamos-meta.js"), "utf8");

const SCRIPT_URL = "https://connect." + "facebook" + ".net/en_US/fb" + "events.js";
const PIXEL = "15955" + "96972063765";
const FBQ = "fb" + "q";

function withFlags(open: boolean): string {
  const out = rawSrc
    .replace(/var GATE_OPEN = (true|false);/, `var GATE_OPEN = ${open};`)
    .replace(/var SWITCHES_OFF = (true|false);/, `var SWITCHES_OFF = ${open};`);
  expect(out).toContain(`var GATE_OPEN = ${open};`);
  expect(out).toContain(`var SWITCHES_OFF = ${open};`);
  return out;
}

type State = { ok: boolean; chosen?: boolean; choice?: { marketing?: boolean } | null };
const ACCEPTED: State = { ok: true, chosen: true, choice: { marketing: true } };

interface Opts {
  open?: boolean;
  href?: string;
  referrer?: string;
  state?: State | (() => Promise<State>);
  consentAfterTicks?: number | null; // null: never appears
  existingFbq?: boolean;
  cached?: { marketing: boolean } | null;
}

function load(o: Opts = {}) {
  const href = o.href ?? "https://vamostaxi.site/about";
  const u = new URL(href);
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const timers: (() => void)[] = [];
  const cookieWrites: string[] = [];
  const appended: { src?: string; async?: boolean; fbqPushState?: unknown }[] = [];
  const store: Record<string, string> = { multiFbc: "x", aemSource: "y" };
  const consentHandlers: ((d: unknown) => void)[] = [];
  const stateCalls: number[] = [];
  const win: Record<string, unknown> = {};
  win.addEventListener = (n: string, fn: (e: unknown) => void) => {
    (listeners[n] = listeners[n] || []).push(fn);
  };
  const consent = {
    state: () => {
      stateCalls.push(1);
      const s = o.state ?? ACCEPTED;
      return typeof s === "function" ? s() : Promise.resolve(s);
    },
    onChange: (fn: (d: unknown) => void) => {
      consentHandlers.push(fn);
      return () => {};
    },
    cached: () => (o.cached === undefined ? null : o.cached),
  };
  if (o.consentAfterTicks === 0 || o.consentAfterTicks === undefined) win.VamosConsent = consent;
  if (o.existingFbq) win.fbq = function other() {};
  const document = {
    referrer: o.referrer ?? "",
    head: {
      appendChild: (el: { src?: string; async?: boolean }) => {
        appended.push({ ...el, fbqPushState: (win.fbq as { disablePushState?: unknown } | undefined)?.disablePushState });
      },
    },
    createElement: () => ({}) as Record<string, unknown>,
    set cookie(v: string) {
      cookieWrites.push(v);
    },
    get cookie() {
      return "";
    },
  };
  win.document = document;
  const ctx: Record<string, unknown> = {
    window: win,
    document,
    location: { href: u.href, hostname: u.hostname, pathname: u.pathname },
    localStorage: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => void (store[k] = String(v)),
      removeItem: (k: string) => void delete store[k],
    },
    URL,
    JSON,
    Promise,
    setTimeout: (fn: () => void) => {
      timers.push(fn);
      return timers.length;
    },
  };
  vm.createContext(ctx);
  vm.runInContext(withFlags(o.open === true), ctx);

  let ticks = 0;
  const api = {
    win,
    appended,
    cookieWrites,
    store,
    stateCalls,
    listeners,
    consentHandlers,
    api: () => win.VamosMeta as {
      allowed: (h: string, r?: string) => boolean;
      loaded: () => boolean;
      revoked: () => boolean;
    },
    calls: () => (((win.fbq as { queue?: ArrayLike<unknown>[] } | undefined)?.queue ?? []) as ArrayLike<unknown>[]).map((a) => Array.from(a)),
    /** Run due timers and let promises settle; the consent runtime shows up after N poll ticks. */
    async settle(n = 8) {
      for (let i = 0; i < n; i++) {
        const batch = timers.splice(0);
        for (const t of batch) {
          ticks += 1;
          if (o.consentAfterTicks && ticks >= o.consentAfterTicks) win.VamosConsent = consent;
          t();
        }
        for (let j = 0; j < 5; j++) await Promise.resolve();
      }
    },
    fire(name: string, e: unknown) {
      (listeners[name] || []).forEach((f) => f(e));
    },
    change(detail: unknown) {
      consentHandlers.forEach((f) => f(detail));
    },
  };
  return api;
}

describe("app/vamos-meta.js: allow-list parity", () => {
  const meta = load({ open: false });
  it.each(PIXEL_CASES.map((c) => [`${c.why} (${c.href}${c.referrer ? ` <- ${c.referrer}` : ""})`, c] as const))("%s", (_w, c) => {
    expect(meta.api().allowed(c.href, c.referrer), c.href).toBe(c.allowed);
    if (!c.browserOnly) expect(pixelPageAllowed(new URL(c.href)), c.href).toBe(c.allowed);
  });
});

describe("app/vamos-meta.js: flags closed", () => {
  it("adds no script and clears Meta cookies and storage", async () => {
    const h = load({ open: false });
    await h.settle();
    expect(h.appended).toHaveLength(0);
    expect(h.win[FBQ]).toBeUndefined();
    expect(h.cookieWrites.some((w) => w.startsWith("_fbp=; Max-Age=0"))).toBe(true);
    expect(h.store.multiFbc).toBeUndefined();
    expect(h.store.aemSource).toBeUndefined();
    expect(h.stateCalls).toHaveLength(0);
  });
});

describe("app/vamos-meta.js: flags open", () => {
  it("accepted visitor on a clean page: stub, autoConfig off, init with the id only, one PageView, then the script", async () => {
    const h = load({ open: true });
    await h.settle();
    const calls = h.calls();
    expect(calls).toEqual([
      ["set", "autoConfig", false, PIXEL],
      ["set", "autoConfig", false],
      ["init", PIXEL],
      ["track", "PageView"],
    ]);
    expect(calls[2]).toHaveLength(2); // init carries exactly the id: no user data
    expect(h.appended).toHaveLength(1);
    expect(h.appended[0]!.src).toBe(SCRIPT_URL);
    expect(h.appended[0]!.async).toBe(true);
    expect(h.appended[0]!.fbqPushState).toBe(true); // set before the script tag is appended
    expect(h.api().loaded()).toBe(true);
    expect(h.cookieWrites).toHaveLength(0); // we never touch the cookies while the pixel runs
  });

  it.each([
    ["marketing off", { ok: true, chosen: true, choice: { marketing: false } } as State],
    ["not chosen", { ok: true, chosen: false, choice: null } as State],
  ])("%s: no script, cookies deleted", async (_n, state) => {
    const h = load({ open: true, state });
    await h.settle();
    expect(h.appended).toHaveLength(0);
    expect(h.cookieWrites.some((w) => w.startsWith("_fbp=; Max-Age=0"))).toBe(true);
    expect(h.cookieWrites.some((w) => w.startsWith("_fbc=; Max-Age=0"))).toBe(true);
  });

  it("server unreachable: no script, no deletes", async () => {
    const h = load({ open: true, state: { ok: false } });
    await h.settle();
    expect(h.appended).toHaveLength(0);
    expect(h.cookieWrites).toHaveLength(0);
  });

  it("a state() that rejects does nothing", async () => {
    const h = load({ open: true, state: () => Promise.reject(new Error("net")) });
    await h.settle();
    expect(h.appended).toHaveLength(0);
  });

  it("the consent runtime never appears within 5 s: nothing happens", async () => {
    const h = load({ open: true, consentAfterTicks: null });
    await h.settle(130);
    expect(h.appended).toHaveLength(0);
    expect(h.cookieWrites).toHaveLength(0);
  });

  it("the consent runtime appears late (poll): the page view still counts", async () => {
    const h = load({ open: true, consentAfterTicks: 5 });
    await h.settle(20);
    expect(h.appended).toHaveLength(1);
  });

  it.each([
    ["denied path", { href: "https://vamostaxi.site/manage-booking" }],
    ["denied query", { href: "https://vamostaxi.site/about?ref=1" }],
    ["denied referrer", { href: "https://vamostaxi.site/about", referrer: "https://vamostaxi.site/confirmation/VT-26-07331" }],
    ["dashboard host", { href: "https://dashboard.vamostaxi.site/about" }],
    ["localhost", { href: "http://localhost:4300/about" }],
  ])("%s: no script and state() is not asked", async (_n, extra) => {
    const h = load({ open: true, ...extra });
    await h.settle();
    expect(h.appended).toHaveLength(0);
    expect(h.stateCalls).toHaveLength(0);
  });

  it("another fbq already on the page: do nothing (fail closed)", async () => {
    const h = load({ open: true, existingFbq: true });
    await h.settle();
    expect(h.appended).toHaveLength(0);
    expect(h.api().loaded()).toBe(false);
  });

  it("a consent event alone does not boot: state() is asked again and only its answer decides", async () => {
    let answer: State = { ok: true, chosen: false, choice: null };
    const h = load({ open: true, state: () => Promise.resolve(answer) });
    await h.settle();
    expect(h.appended).toHaveLength(0);
    // The event says marketing, the server still says no.
    h.change({ method: "accept_all", marketing: true });
    await h.settle();
    expect(h.stateCalls).toHaveLength(2);
    expect(h.appended).toHaveLength(0);
    // Now the server agrees.
    answer = ACCEPTED;
    h.change({ method: "accept_all", marketing: true });
    await h.settle();
    expect(h.stateCalls).toHaveLength(3);
    expect(h.appended).toHaveLength(1);
  });

  it("withdraw after boot: revoke recorded, revoked() true, no later boot or allow, cookies and storage deleted", async () => {
    const h = load({ open: true });
    await h.settle();
    h.change({ method: "reject_all", marketing: false });
    await h.settle();
    expect(h.calls().at(-1)).toEqual(["consent", "revoke"]);
    expect(h.api().revoked()).toBe(true);
    for (const name of ["_fbp", "_fbc", "_fbleid"]) {
      expect(h.cookieWrites).toContain(`${name}=; Max-Age=0; path=/`);
      expect(h.cookieWrites).toContain(`${name}=; Max-Age=0; path=/; domain=.vamostaxi.site`);
    }
    expect(h.store.multiFbc).toBeUndefined();
    expect(h.store.aemSource).toBeUndefined();
    const before = h.calls().length;
    h.change({ method: "accept_all", marketing: true });
    await h.settle();
    expect(h.calls()).toHaveLength(before); // never allowed again on this page
    expect(h.appended).toHaveLength(1);
  });

  it("withdraw while state() is still in flight: the late answer does not boot", async () => {
    let release: (s: State) => void = () => {};
    const h = load({ open: true, state: () => new Promise<State>((r) => (release = r)) });
    await h.settle(2);
    h.change({ method: "reject_all", marketing: false });
    release(ACCEPTED);
    await h.settle();
    expect(h.appended).toHaveLength(0);
  });

  it("storage event for the consent cache with marketing off (another tab) takes the withdraw path", async () => {
    const h = load({ open: true });
    await h.settle();
    h.fire("storage", { key: "vamosCookieConsent", newValue: JSON.stringify({ marketing: false }) });
    expect(h.calls().at(-1)).toEqual(["consent", "revoke"]);
    expect(h.api().revoked()).toBe(true);
  });

  it("storage events for other keys, or marketing on, do nothing", async () => {
    const h = load({ open: true });
    await h.settle();
    h.fire("storage", { key: "other", newValue: "x" });
    h.fire("storage", { key: "vamosCookieConsent", newValue: JSON.stringify({ marketing: true }) });
    expect(h.api().revoked()).toBe(false);
  });

  it("pageshow with persisted true after a revoke: revoke runs synchronously in the first listener", async () => {
    const h = load({ open: true });
    await h.settle();
    h.change({ marketing: false });
    const n = h.calls().filter((c) => c[0] === "consent").length;
    h.fire("pageshow", { persisted: true });
    expect(h.calls().filter((c) => c[0] === "consent").length).toBe(n + 1);
    h.fire("pageshow", { persisted: false });
    expect(h.calls().filter((c) => c[0] === "consent").length).toBe(n + 1);
  });

  it("pageshow is the first listener registered, before anything else could run", () => {
    const h = load({ open: true, consentAfterTicks: null });
    expect(Object.keys(h.listeners)[0]).toBe("pageshow");
  });

  it("loading the file twice keeps the first instance", () => {
    const h = load({ open: true });
    const first = h.win.VamosMeta;
    const ctx: any = { window: h.win, document: h.win.document, location: { href: "https://vamostaxi.site/", hostname: "vamostaxi.site" }, URL, setTimeout: () => 0 };
    vm.createContext(ctx);
    vm.runInContext(withFlags(true), ctx);
    expect(h.win.VamosMeta).toBe(first);
  });
});

describe("app/vamos-meta.js: source pins", () => {
  it("never allows consent again, tracks only PageView, never custom events or user data, no noscript", () => {
    expect(new RegExp("consent['\"],\\s*['\"]gr" + "ant").test(rawSrc)).toBe(false);
    const tracks = [...rawSrc.matchAll(new RegExp(FBQ + "\\('track',\\s*'([^']+)'", "g"))].map((m) => m[1]);
    expect(tracks).toEqual(["PageView"]);
    expect(rawSrc.includes("trackCustom")).toBe(false);
    expect(rawSrc.includes("userData")).toBe(false);
    expect(rawSrc.includes("<noscript")).toBe(false);
  });

  it("every cookie write ends the cookie (Max-Age=0); our code never sets a value", () => {
    const writes = rawSrc.split("\n").filter((l) => /document\.cookie\s*=/.test(l));
    expect(writes.length).toBeGreaterThan(0);
    for (const l of writes) expect(l).toContain("Max-Age=0");
  });

  it("is ES5-style: no async, no arrow functions, no let/const", () => {
    expect(/\basync\s+function|\bawait\b/.test(rawSrc)).toBe(false);
    expect(rawSrc.includes("=>")).toBe(false);
    expect(/^\s*(let|const)\s/m.test(rawSrc)).toBe(false);
  });

  it("the pixel id and Meta's script address live once, in this file", () => {
    expect(rawSrc.split(PIXEL).length - 1).toBe(1);
    expect(rawSrc.split(SCRIPT_URL).length - 1).toBe(1);
  });

  it("no customer mock changes the address with a query key outside fbclid / utm_* (research Pitfall 3)", () => {
    const files: string[] = [];
    for (const f of readdirSync(APP_DIR)) if (f.endsWith(".js")) files.push(resolve(APP_DIR, f));
    for (const d of ["home", "pages"]) {
      for (const f of readdirSync(resolve(APP_DIR, d))) if (f.endsWith(".dc.html")) files.push(resolve(APP_DIR, d, f));
    }
    let seen = 0;
    for (const file of files) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!/history\.(pushState|replaceState)\(/.test(line)) continue;
        seen += 1;
        const literals = [...line.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2] ?? "");
        for (const lit of literals) {
          expect(lit.includes("?"), `${file}: ${line.trim()}`).toBe(false);
          expect(lit.includes("="), `${file}: ${line.trim()}`).toBe(false);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});
