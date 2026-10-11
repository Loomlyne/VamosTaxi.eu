// Owner decisions 2026-10-09 (D2): the Google tag. The loader runs in a vm with fakes: no network, nothing reaches Google.
// Google strings are built from parts where the needle scan below would otherwise read them.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { GOOGLE_CASES } from "./google-cases";
import { GOOGLE_ALLOWED_PATHS, googlePageAllowed } from "./google-pages";
import { GOOGLE_TAG_ID, GOOGLE_TAG_OPEN, GOOGLE_CONVERSION_SEND_TO, googleTagAllowed } from "./flag";
import { SECURITY_HEADER_PAIRS, contentSecurityPolicy } from "../security/headers";

const ROOT = resolve(__dirname, "../../../..");
const rawSrc = readFileSync(resolve(ROOT, "app/vamos-google.js"), "utf8");
const TAG = "AW-3681" + "42830";
const SEND = TAG + "/liI8CIe79pUdEO7Txa8B";
const SCRIPT = "https://www.google" + "tagmanager.com/gtag/js?id=" + TAG;

function withFlag(on: boolean): string {
  const out = rawSrc.replace(/var GOOGLE_ON = (true|false);/, `var GOOGLE_ON = ${on};`);
  expect(out).toContain(`var GOOGLE_ON = ${on};`);
  return out;
}

type State = { ok: boolean; chosen?: boolean; choice?: { marketing?: boolean; analytics?: boolean } | null };
const ACCEPTED: State = { ok: true, chosen: true, choice: { marketing: true, analytics: true } };

interface Opts {
  open?: boolean;
  href?: string;
  referrer?: string;
  state?: State | (() => Promise<State>);
  storage?: Record<string, string>;
  noStorage?: boolean;
  queue?: unknown[];
}

function load(o: Opts = {}) {
  const href = o.href ?? "https://vamostaxi.site/about";
  const u = new URL(href);
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const cookieWrites: string[] = [];
  const appended: { src?: string; async?: boolean }[] = [];
  const store: Record<string, string> = { ...(o.storage ?? {}) };
  const fetchCalls: string[] = [];
  const win: Record<string, unknown> = {};
  win.addEventListener = (n: string, fn: (e: unknown) => void) => {
    (listeners[n] = listeners[n] || []).push(fn);
  };
  const document = {
    referrer: o.referrer ?? "",
    head: { appendChild: (el: { src?: string; async?: boolean }) => void appended.push({ ...el }) },
    createElement: () => ({}) as Record<string, unknown>,
    set cookie(v: string) {
      cookieWrites.push(v);
    },
    get cookie() {
      return "_ga=GA1.1.1; _ga_ABC123=GS1; _gcl_au=1.1; other=1";
    },
  };
  win.document = document;
  if (o.queue) win.VamosGoogleQueue = o.queue;
  const ls = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => void (store[k] = String(v)),
    removeItem: (k: string) => void delete store[k],
  };
  win.localStorage = o.noStorage
    ? {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
      }
    : ls;
  const ctx: Record<string, unknown> = {
    window: win,
    document,
    location: { href: u.href, hostname: u.hostname, pathname: u.pathname },
    URL,
    JSON,
    Promise,
    Date,
    Math,
    isFinite,
    String,
    fetch: (url: string) => {
      fetchCalls.push(url);
      const s = o.state ?? ACCEPTED;
      const value = typeof s === "function" ? s() : Promise.resolve(s);
      return value.then((v) => ({ json: () => Promise.resolve(v) }));
    },
  };
  vm.createContext(ctx);
  vm.runInContext(withFlag(o.open === true), ctx);
  const api = {
    win,
    appended,
    cookieWrites,
    store,
    fetchCalls,
    listeners,
    queue: () => win.VamosGoogleQueue as { push: (i: unknown) => unknown },
    g: () => win.VamosGoogle as {
      allowed: (h: string) => boolean;
      scrub: (h: string, r?: string) => { location: string; referrer: string };
      loaded: () => boolean;
      revoked: () => boolean;
      pending: () => number;
      conversion: (i: unknown) => boolean;
    },
    /** What gtag was told, in order, as plain arrays. */
    calls: () => (((win.dataLayer ?? []) as ArrayLike<unknown>[]).map((a) => Array.from(a))) as unknown[][],
    async settle() {
      for (let j = 0; j < 12; j++) await Promise.resolve();
    },
    fire(name: string, e: unknown) {
      (listeners[name] || []).forEach((f) => f(e));
    },
  };
  return api;
}

const DENIED = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" };

describe("flag", () => {
  it("is open in the committed state, in TypeScript and in the loader", () => {
    expect(GOOGLE_TAG_OPEN).toBe(true);
    expect(googleTagAllowed()).toBe(true);
    expect(/var GOOGLE_ON = (true|false);/.exec(rawSrc)?.[1]).toBe(String(GOOGLE_TAG_OPEN));
  });
  it("the ids are the agency's", () => {
    expect(GOOGLE_TAG_ID).toBe(TAG);
    expect(GOOGLE_CONVERSION_SEND_TO).toBe(SEND);
    expect(rawSrc.split(TAG).length - 1).toBeGreaterThanOrEqual(2);
    expect(rawSrc).toContain(SEND);
  });
});

describe("address list parity", () => {
  const g = load({ open: false }).g();
  it.each(GOOGLE_CASES.map((c) => [`${c.why} (${c.href})`, c] as const))("%s", (_w, c) => {
    expect(g.allowed(c.href), c.href).toBe(c.allowed);
    expect(googlePageAllowed(new URL(c.href)), c.href).toBe(c.allowed);
  });
  it("the Meta pages are all on it, and the pay link never is", () => {
    for (const p of GOOGLE_ALLOWED_PATHS) expect(g.allowed(`https://vamostaxi.site${p}`), p).toBe(true);
    expect(GOOGLE_ALLOWED_PATHS.some((p) => p.includes("pay"))).toBe(false);
  });
});

describe("scrub: what Google is told about the page", () => {
  const g = load({ open: false }).g();
  it("the path only, the reference replaced, no query, no hash", () => {
    expect(g.scrub("https://vamostaxi.site/confirmation/VT-26-07331?session=cs_1#x", "").location).toBe("https://vamostaxi.site/confirmation/:ref");
    expect(g.scrub("https://vamostaxi.site/de/confirmation/VT-26-0733", "").location).toBe("https://vamostaxi.site/de/confirmation/:ref");
    expect(g.scrub("https://vamostaxi.site/checkout?from=Zurich&to=Geneva", "").location).toBe("https://vamostaxi.site/checkout");
    expect(g.scrub("https://vamostaxi.site/?gclid=abc&service=airport#book", "").location).toBe("https://vamostaxi.site/");
  });
  it("the referrer is the bare origin of the previous site, or empty", () => {
    expect(g.scrub("https://vamostaxi.site/", "https://l.facebook.com/l.php?u=x&h=y").referrer).toBe("https://l.facebook.com/");
    expect(g.scrub("https://vamostaxi.site/about", "https://vamostaxi.site/confirmation/VT-26-07331").referrer).toBe("https://vamostaxi.site/");
    expect(g.scrub("https://vamostaxi.site/", "").referrer).toBe("");
    expect(g.scrub("https://vamostaxi.site/", "not a url").referrer).toBe("");
    expect(g.scrub("https://vamostaxi.site/", "javascript:alert(1)").referrer).toBe("");
  });
});

describe("flag closed: the loader does nothing at all", () => {
  it("no gtag, no dataLayer, no request, no script, no cookie write", async () => {
    const h = load({ open: false });
    await h.settle();
    expect(h.win.gtag).toBeUndefined();
    expect(h.win.dataLayer).toBeUndefined();
    expect(h.fetchCalls).toHaveLength(0);
    expect(h.appended).toHaveLength(0);
    expect(h.cookieWrites).toHaveLength(0);
    expect(h.g().conversion({ value: 10, transactionId: "VT-26-07331" })).toBe(false);
  });
});

describe("flag open", () => {
  it("before the server answers: only the local denied default, no script", async () => {
    let release: (s: State) => void = () => {};
    const h = load({ open: true, state: () => new Promise<State>((r) => (release = r)) });
    await h.settle();
    expect(h.calls()).toEqual([["consent", "default", DENIED]]);
    expect(h.appended).toHaveLength(0);
    release(ACCEPTED);
    await h.settle();
    expect(h.appended).toHaveLength(1);
  });

  it("accepted: the script, js, consent granted, config with the scrubbed page, no page_view, in that order", async () => {
    const h = load({ open: true, href: "https://vamostaxi.site/confirmation/VT-26-07331?session=cs_1#top", referrer: "https://l.facebook.com/l.php?u=x&h=y" });
    await h.settle();
    expect(h.fetchCalls).toEqual(["/api/consent/state"]);
    expect(h.appended).toEqual([{ src: SCRIPT, async: true }]);
    const calls = h.calls();
    expect(calls.map((c) => c[0])).toEqual(["consent", "js", "consent", "config"]);
    expect(calls[2]).toEqual([
      "consent",
      "update",
      { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted", analytics_storage: "granted" },
    ]);
    expect(calls[3]).toEqual([
      "config",
      TAG,
      { send_page_view: false, page_location: "https://vamostaxi.site/confirmation/:ref", page_referrer: "https://l.facebook.com/" },
    ]);
    expect(JSON.stringify(calls)).not.toContain("VT-26-07331");
    expect(JSON.stringify(calls)).not.toContain("cs_1");
    expect(h.g().loaded()).toBe(true);
    expect(h.cookieWrites).toHaveLength(0); // we never touch Google's cookies while the tag runs
  });

  it("marketing on but analytics off: analytics_storage stays denied", async () => {
    const h = load({ open: true, state: { ok: true, chosen: true, choice: { marketing: true, analytics: false } } });
    await h.settle();
    expect(h.calls()[2]![2]).toMatchObject({ ad_storage: "granted", analytics_storage: "denied" });
  });

  it.each([
    ["marketing off", { ok: true, chosen: true, choice: { marketing: false, analytics: true } } as State],
    ["not chosen", { ok: true, chosen: false, choice: null } as State],
  ])("%s: no script, consent denied, Google's cookies deleted", async (_n, state) => {
    const h = load({ open: true, state });
    await h.settle();
    expect(h.appended).toHaveLength(0);
    expect(h.calls().filter((c) => c[0] === "config")).toHaveLength(0);
    expect(h.calls().at(-1)).toEqual(["consent", "update", DENIED]);
    for (const n of ["_gcl_au", "_gcl_aw", "_ga", "_ga_ABC123"]) {
      expect(h.cookieWrites.some((w) => w.startsWith(`${n}=; Max-Age=0`)), n).toBe(true);
    }
    expect(h.cookieWrites.every((w) => w.includes("Max-Age=0"))).toBe(true);
    expect(h.cookieWrites.some((w) => w.startsWith("other="))).toBe(false);
  });

  it("server unreachable: no script, no deletes", async () => {
    const h = load({ open: true, state: { ok: false } });
    await h.settle();
    expect(h.appended).toHaveLength(0);
    expect(h.cookieWrites).toHaveLength(0);
  });

  it("a state request that rejects does nothing", async () => {
    const h = load({ open: true, state: () => Promise.reject(new Error("net")) });
    await h.settle();
    expect(h.appended).toHaveLength(0);
    expect(h.cookieWrites).toHaveLength(0);
  });

  it.each([
    "https://vamostaxi.site/checkout/pay/abc123",
    "https://vamostaxi.site/manage-booking",
    "https://dashboard.vamostaxi.site/about",
    "https://vamostaxi.site/review",
  ])("%s: nothing at all, not even the default", async (href) => {
    const h = load({ open: true, href });
    await h.settle();
    expect(h.win.dataLayer).toBeUndefined();
    expect(h.fetchCalls).toHaveLength(0);
    expect(h.appended).toHaveLength(0);
  });

  it("a consent event alone does not boot: the server is asked again and only its answer decides", async () => {
    let answer: State = { ok: true, chosen: false, choice: null };
    const h = load({ open: true, state: () => Promise.resolve(answer) });
    await h.settle();
    expect(h.appended).toHaveLength(0);
    h.fire("vamos:consent", { detail: { marketing: true } });
    await h.settle();
    expect(h.fetchCalls).toHaveLength(2);
    expect(h.appended).toHaveLength(0); // the server still says no
    answer = ACCEPTED;
    h.fire("vamos:consent-recorded", {});
    await h.settle();
    expect(h.fetchCalls).toHaveLength(3);
    expect(h.appended).toHaveLength(1);
  });

  it("accepted twice (two events): the script is added once", async () => {
    const h = load({ open: true });
    await h.settle();
    h.fire("vamos:consent", { detail: { marketing: true } });
    h.fire("vamos:consent-recorded", {});
    await h.settle();
    expect(h.appended).toHaveLength(1);
    expect(h.calls().filter((c) => c[0] === "config")).toHaveLength(1);
  });

  it("withdraw after boot: everything denied, cookies deleted, revoked, nothing boots again", async () => {
    const h = load({ open: true });
    await h.settle();
    h.fire("vamos:consent", { detail: { marketing: false } });
    expect(h.calls().at(-1)).toEqual(["consent", "update", DENIED]);
    expect(h.g().revoked()).toBe(true);
    expect(h.cookieWrites.some((w) => w.startsWith("_gcl_aw=; Max-Age=0"))).toBe(true);
    h.fire("vamos:consent", { detail: { marketing: true } });
    await h.settle();
    expect(h.appended).toHaveLength(1);
    expect(h.g().conversion({ value: 10, transactionId: "VT-26-07331" })).toBe(false);
  });

  it("another tab refuses (storage event): the withdraw path runs; other keys and Marketing on do nothing", async () => {
    const h = load({ open: true });
    await h.settle();
    h.fire("storage", { key: "other", newValue: "x" });
    h.fire("storage", { key: "vamosCookieConsent", newValue: JSON.stringify({ marketing: true }) });
    expect(h.cookieWrites).toHaveLength(0);
    h.fire("storage", { key: "vamosCookieConsent", newValue: JSON.stringify({ marketing: false }) });
    expect(h.calls().at(-1)).toEqual(["consent", "update", DENIED]);
  });

  it("a page restored from the back-forward cache asks the server again", async () => {
    const h = load({ open: true });
    await h.settle();
    h.fire("pageshow", { persisted: false });
    expect(h.fetchCalls).toHaveLength(1);
    h.fire("pageshow", { persisted: true });
    expect(h.fetchCalls).toHaveLength(2);
  });
});

describe("conversion", () => {
  const info = { value: 99.79, transactionId: "VT-26-07331" };
  const conv = (h: ReturnType<typeof load>) => h.calls().filter((c) => c[0] === "event");

  it("sent once, with the amount, CHF and the real reference, to the agency's conversion", async () => {
    const h = load({ open: true, href: "https://vamostaxi.site/confirmation/VT-26-07331" });
    await h.settle();
    expect(h.g().conversion(info)).toBe(true);
    expect(conv(h)).toEqual([["event", "conversion", { send_to: SEND, value: 99.79, currency: "CHF", transaction_id: "VT-26-07331" }]]);
  });

  it("a reload, the status poller, a second tab: nothing more (the key is written before the send)", async () => {
    const first = load({ open: true, href: "https://vamostaxi.site/confirmation/VT-26-07331" });
    await first.settle();
    first.g().conversion(info);
    first.g().conversion(info);
    expect(conv(first)).toHaveLength(1);
    const reload = load({ open: true, href: "https://vamostaxi.site/confirmation/VT-26-07331", storage: first.store });
    await reload.settle();
    reload.g().conversion(info);
    expect(conv(reload)).toHaveLength(0);
  });

  it("storage unavailable: still sends (Google de-duplicates on transaction_id), never throws", async () => {
    const h = load({ open: true, href: "https://vamostaxi.site/confirmation/VT-26-07331", noStorage: true });
    await h.settle();
    expect(() => h.g().conversion(info)).not.toThrow();
    expect(conv(h)).toHaveLength(1);
  });

  it("asked for before the tag has started: it waits, then goes out once", async () => {
    const h = load({ open: true, href: "https://vamostaxi.site/confirmation/VT-26-07331" });
    expect(h.g().conversion(info)).toBe(true);
    expect(h.g().pending()).toBe(1);
    await h.settle();
    expect(h.g().pending()).toBe(0);
    expect(conv(h)).toHaveLength(1);
    expect(h.calls().map((c) => c[0])).toEqual(["consent", "js", "consent", "config", "event"]);
  });

  it("pre-load queue: an item pushed before the loader ran is drained on load and goes out once", async () => {
    const early = [info];
    const h = load({ open: true, href: "https://vamostaxi.site/confirmation/VT-26-07331", queue: early });
    expect(h.g().pending()).toBe(1);
    await h.settle();
    expect(conv(h)).toEqual([["event", "conversion", { send_to: SEND, value: 99.79, currency: "CHF", transaction_id: "VT-26-07331" }]]);
  });

  it("pre-load queue: a late push works and does not double-send the same reference", async () => {
    const h = load({ open: true, href: "https://vamostaxi.site/confirmation/VT-26-07331", queue: [info] });
    await h.settle();
    h.queue().push(info);
    h.queue().push({ ...info });
    h.g().conversion(info);
    expect(conv(h)).toHaveLength(1);
    const other = { value: 20, transactionId: "VT-26-07332" };
    h.queue().push(other);
    expect(conv(h)).toHaveLength(2);
  });

  it("pre-load queue: no queue at all is fine, and bad items are refused by the same guards", async () => {
    const h = load({ open: true, href: "https://vamostaxi.site/confirmation/VT-26-07331" });
    await h.settle();
    h.queue().push({ value: -1, transactionId: "VT-26-07331" });
    h.queue().push({ value: 10, transactionId: "nope" });
    h.queue().push(null);
    expect(conv(h)).toHaveLength(0);
  });

  it("pre-load queue: Marketing off drops the queued conversion", async () => {
    const h = load({
      open: true,
      href: "https://vamostaxi.site/confirmation/VT-26-07331",
      queue: [info],
      state: { ok: true, chosen: true, choice: { marketing: false } },
    });
    await h.settle();
    expect(conv(h)).toHaveLength(0);
    expect(h.appended).toHaveLength(0);
  });

  it("pre-load queue: a reload with the key already written sends nothing", async () => {
    const first = load({ open: true, href: "https://vamostaxi.site/confirmation/VT-26-07331", queue: [info] });
    await first.settle();
    const reload = load({ open: true, href: "https://vamostaxi.site/confirmation/VT-26-07331", queue: [info], storage: first.store });
    await reload.settle();
    expect(conv(first)).toHaveLength(1);
    expect(conv(reload)).toHaveLength(0);
  });

  it("Marketing not on: the waiting conversion is dropped and a later Accept does not replay it", async () => {
    let answer: State = { ok: true, chosen: true, choice: { marketing: false } };
    const h = load({ open: true, href: "https://vamostaxi.site/confirmation/VT-26-07331", state: () => Promise.resolve(answer) });
    h.g().conversion(info);
    await h.settle();
    expect(h.g().pending()).toBe(0);
    answer = ACCEPTED;
    h.fire("vamos:consent-recorded", {});
    await h.settle();
    expect(conv(h)).toHaveLength(0);
  });

  it.each([
    ["no amount", { transactionId: "VT-26-07331" }],
    ["zero", { value: 0, transactionId: "VT-26-07331" }],
    ["negative", { value: -5, transactionId: "VT-26-07331" }],
    ["NaN", { value: NaN, transactionId: "VT-26-07331" }],
    ["a string amount", { value: "99.79", transactionId: "VT-26-07331" }],
    ["too large", { value: 50001, transactionId: "VT-26-07331" }],
    ["no reference", { value: 10 }],
    ["a reference that is not one", { value: 10, transactionId: "a@b.com" }],
    ["a lower-case reference", { value: 10, transactionId: "vt-26-07331" }],
    ["not an object", null],
  ])("refused: %s", async (_n, bad) => {
    const h = load({ open: true, href: "https://vamostaxi.site/confirmation/VT-26-07331" });
    await h.settle();
    expect(h.g().conversion(bad)).toBe(false);
    expect(conv(h)).toHaveLength(0);
  });

  it("an address off the list: refused", async () => {
    const h = load({ open: true, href: "https://vamostaxi.site/about" });
    await h.settle();
    expect(h.g().conversion(info)).toBe(true); // /about is on the list (the page is allowed, the call is the page's choice)
    const pay = load({ open: true, href: "https://vamostaxi.site/checkout/pay/abc" });
    expect(pay.g().conversion(info)).toBe(false);
  });

  it("the queue holds three at most", async () => {
    const h = load({ open: true, href: "https://vamostaxi.site/confirmation/VT-26-07331" });
    for (let i = 0; i < 6; i++) h.g().conversion({ value: 10 + i, transactionId: `VT-26-0733${i}` });
    expect(h.g().pending()).toBeLessThanOrEqual(3);
  });
});

describe("source pins", () => {
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
  it("sends no page view, no user data, no event but the conversion", () => {
    expect(rawSrc).not.toMatch(/gtag\('event',\s*'page_view'/);
    expect(rawSrc).not.toMatch(/\buser_data\b/);
    expect(rawSrc).not.toContain("allow_enhanced_conversions");
    const events = [...rawSrc.matchAll(/gtag\('event',\s*'([^']+)'/g)].map((m) => m[1]);
    expect(events).toEqual(["conversion"]);
    expect(rawSrc).toContain("send_page_view: false");
  });
  it("the script address and the tag id are written once each in the places that need them", () => {
    expect(rawSrc.split(SCRIPT.replace(TAG, "' + TAG_ID + '")).length - 1).toBeLessThanOrEqual(1);
    expect(rawSrc.split("google" + "tagmanager.com").length - 1).toBe(1);
  });
});

describe("policy (Content-Security-Policy)", () => {
  const plain = contentSecurityPolicy({ metaPixel: false });
  const google = contentSecurityPolicy({ metaPixel: false, googleTag: true });
  const GOOGLE_HOSTS = ["google" + "tagmanager.com", "google" + "adservices.com", "doubleclick.net", "pagead2.google" + "syndication.com", "https://www.google.com", "https://www.google.ch"];

  it("without googleTag the policy is byte-identical to today's", () => {
    expect(contentSecurityPolicy({ metaPixel: false, googleTag: false })).toBe(plain);
    for (const h of GOOGLE_HOSTS) expect(plain.includes(h), h).toBe(false);
  });
  it("with googleTag it adds Google's documented Ads hosts to script, connect, img and frame, nothing to default or style", () => {
    const dir = (name: string) => google.split("; ").find((d) => d.startsWith(`${name} `))!;
    for (const d of ["script-src", "connect-src", "img-src", "frame-src"]) {
      expect(dir(d), d).toContain("https://www.google" + "tagmanager.com");
    }
    expect(dir("script-src")).toContain("https://www.google" + "adservices.com");
    expect(dir("connect-src")).toContain("https://ad.doubleclick.net");
    expect(dir("img-src")).not.toContain("https://ad.doubleclick.net");
    for (const d of ["default-src", "style-src", "object-src", "base-uri", "frame-ancestors", "worker-src"]) {
      expect(dir(d).includes("google"), d).toBe(false);
    }
    expect(google.includes("*")).toBe(plain.includes("*") && true); // no wildcard added: only Mapbox's own
    expect(google.split("*").length).toBe(plain.split("*").length);
  });
  it("the Next policy list never names Google", () => {
    const all = SECURITY_HEADER_PAIRS.map(([, v]) => v).join("\n");
    expect(all).not.toMatch(/google|doubleclick/i);
  });
  it("both policies together", () => {
    const both = contentSecurityPolicy({ metaPixel: true, googleTag: true });
    expect(both).toContain("connect." + "face" + "book.net");
    expect(both).toContain("google" + "tagmanager.com");
  });
});

describe("policy by address (metaPixelCspFor, Google flag mocked open)", () => {
  it("Google's policy on the list, never on a pay link, the dashboard or a mock with a token", async () => {
    vi.resetModules();
    vi.doMock("./flag", async (orig) => ({ ...(await orig<object>()), googleTagAllowed: () => true }));
    const { metaPixelCspFor } = await import("../meta/pixel-csp");
    const G = "google" + "tagmanager.com";
    for (const c of GOOGLE_CASES) {
      const csp = metaPixelCspFor(new URL(c.href), false);
      if (c.allowed) expect(csp, c.href).toContain(G);
      else expect(csp, c.href).toBeNull();
    }
    // Meta's flag on too: the Meta policy keeps its own addresses, Google adds its own.
    const both = metaPixelCspFor(new URL("https://vamostaxi.site/about"), true)!;
    expect(both).toContain("connect." + "face" + "book.net");
    expect(both).toContain(G);
    const checkout = metaPixelCspFor(new URL("https://vamostaxi.site/checkout"), true)!;
    expect(checkout).toContain(G);
    expect(checkout).not.toContain("face" + "book");
    vi.doUnmock("./flag");
    vi.resetModules();
  });

  it("flag open (committed): Google's policy on the list, none on the other addresses", async () => {
    const { metaPixelCspFor } = await import("../meta/pixel-csp");
    const G = "google" + "tagmanager.com";
    for (const c of GOOGLE_CASES) {
      const csp = metaPixelCspFor(new URL(c.href), false);
      if (c.allowed) expect(csp, c.href).toContain(G);
      else expect(csp, c.href).toBeNull();
    }
  });
});

describe("Google strings only where allowed", () => {
  it("the loader, the policy builder, the flag file and the conversion call", () => {
    // Pinned in legal-gate.test.ts's needle scan too; here the two ids by name.
    const flag = readFileSync(resolve(__dirname, "flag.ts"), "utf8");
    expect(flag).toContain(TAG);
    const headers = readFileSync(resolve(__dirname, "../security/headers.ts"), "utf8");
    expect(headers).toContain("google" + "tagmanager.com");
  });
});
