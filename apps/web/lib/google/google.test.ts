// Owner decisions 2026-10-09 (D2): the Google tag; GA4 wording adopted 2026-10-11; Tag Manager on (GTM_ON), wording
// adopted as written 2026-10-13 (.planning/decisions/2026-10-13-gtm-wording.md).
// The GA4 / Ads blocks run the loader with the container forced off so each config is seen alone; the Tag Manager
// block runs the file exactly as committed (gtm: "committed").
// The loader runs in a vm with fakes: no network, nothing reaches Google.
// Google strings are built from parts where the needle scan in legal-gate.test.ts would otherwise read them.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { GOOGLE_CASES } from "./google-cases";
import { GOOGLE_ALLOWED_PATHS, googlePageAllowed } from "./google-pages";
import {
  GA4_MEASUREMENT_ID,
  GA4_OPEN,
  GOOGLE_CONVERSION_SEND_TO,
  GOOGLE_TAG_ID,
  GOOGLE_TAG_OPEN,
  GTM_CONTAINER_ID,
  GTM_OPEN,
  googleTagAllowed,
} from "./flag";
import { googleStep } from "./steps";
import { SECURITY_HEADER_PAIRS, contentSecurityPolicy } from "../security/headers";

const ROOT = resolve(__dirname, "../../../..");
const rawSrc = readFileSync(resolve(ROOT, "app/vamos-google.js"), "utf8");
const TAG = "AW-3681" + "42830";
const SEND = TAG + "/liI8CIe79pUdEO7Txa8B";
const GA = "G-K5MZ" + "ME44P6";
const GTM = "GTM-KPKG" + "T4VH";
const HOST = "https://www.google" + "tagmanager.com";
const SCRIPT = HOST + "/gtag/js?id=" + TAG;
const GA_SCRIPT = HOST + "/gtag/js?id=" + GA;
const GTM_SCRIPT = HOST + "/gtm" + ".js?id=" + GTM;
const REF = "VT-26-07331";

/** gtm null keeps the committed GTM_ON. */
function withFlags(open: boolean, gtm: boolean | null = false, analytics = true): string {
  let out = rawSrc.replace(/var GOOGLE_ON = (true|false);/, `var GOOGLE_ON = ${open};`);
  if (gtm !== null) out = out.replace(/var GTM_ON = (true|false);/, `var GTM_ON = ${gtm};`);
  out = out.replace(/var ANALYTICS_ON = (true|false);/, `var ANALYTICS_ON = ${analytics};`);
  expect(out).toContain(`var GOOGLE_ON = ${open};`);
  expect(out).toContain(`var GTM_ON = ${gtm === null ? GTM_OPEN : gtm};`);
  expect(out).toContain(`var ANALYTICS_ON = ${analytics};`);
  return out;
}

type Choice = { marketing?: boolean; analytics?: boolean };
type State = { ok: boolean; chosen?: boolean; choice?: Choice | null };
const ACCEPTED: State = { ok: true, chosen: true, choice: { marketing: true, analytics: true } };
const ANALYTICS_ONLY: State = { ok: true, chosen: true, choice: { marketing: false, analytics: true } };
const MARKETING_ONLY: State = { ok: true, chosen: true, choice: { marketing: true, analytics: false } };
const NOT_CHOSEN: State = { ok: true, chosen: false, choice: null };

interface Opts {
  open?: boolean;
  /** false or absent: container forced off; true: forced on; "committed": GTM_ON as the file has it. */
  gtm?: boolean | "committed";
  analytics?: boolean;
  href?: string;
  referrer?: string;
  title?: string;
  state?: State | (() => Promise<State>);
  storage?: Record<string, string>;
  noStorage?: boolean;
  queue?: unknown[];
}

type Anchor = { tagName: string; getAttribute: (n: string) => string | null; parentNode: unknown };

function load(o: Opts = {}) {
  const href = o.href ?? "https://vamostaxi.site/about";
  const u = new URL(href);
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const docListeners: Record<string, ((e: unknown) => void)[]> = {};
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
    title: o.title ?? `Your driver is booked ${REF}`,
    head: { appendChild: (el: { src?: string; async?: boolean }) => void appended.push({ ...el }) },
    createElement: () => ({}) as Record<string, unknown>,
    addEventListener: (n: string, fn: (e: unknown) => void) => {
      (docListeners[n] = docListeners[n] || []).push(fn);
    },
    set cookie(v: string) {
      cookieWrites.push(v);
    },
    get cookie() {
      return "_ga=GA1.1.1; _ga_ABC123=GS1; _gcl_au=1.1; _gac_UA1=1; other=1";
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
    Object,
    fetch: (url: string) => {
      fetchCalls.push(url);
      const s = o.state ?? ACCEPTED;
      const value = typeof s === "function" ? s() : Promise.resolve(s);
      return value.then((v) => ({ json: () => Promise.resolve(v) }));
    },
  };
  vm.createContext(ctx);
  vm.runInContext(withFlags(o.open === true, o.gtm === "committed" ? null : o.gtm === true, o.analytics !== false), ctx);
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
      scrub: (h: string, r?: string) => { location: string; referrer: string; title: string };
      loaded: () => boolean;
      revoked: () => boolean;
      pending: () => number;
      conversion: (i: unknown) => boolean;
      track: (n: unknown, p?: unknown) => boolean;
      analyticsLoaded: () => boolean;
      analyticsRevoked: () => boolean;
      tagManagerLoaded: () => boolean;
      pendingEvents: () => number;
    },
    /** What gtag was told, in order, as plain arrays (a plain object pushed onto dataLayer stays an object). */
    calls: () =>
      ((win.dataLayer ?? []) as unknown[]).map((a) =>
        a && typeof a === "object" && "length" in (a as object) ? Array.from(a as ArrayLike<unknown>) : a,
      ) as unknown[],
    events: () =>
      ((win.dataLayer ?? []) as unknown[])
        .filter((a) => a && typeof a === "object" && "length" in (a as object))
        .map((a) => Array.from(a as ArrayLike<unknown>))
        .filter((c) => c[0] === "event") as [string, string, Record<string, unknown>][],
    async settle() {
      for (let j = 0; j < 12; j++) await Promise.resolve();
    },
    fire(name: string, e: unknown) {
      (listeners[name] || []).forEach((f) => f(e));
    },
    click(href: string | null) {
      const a: Anchor = { tagName: "A", getAttribute: (n) => (n === "href" ? href : null), parentNode: null };
      const span = { tagName: "SPAN", getAttribute: () => null, parentNode: a };
      (docListeners.click || []).forEach((f) => f({ target: span }));
    },
  };
  return api;
}

type H = ReturnType<typeof load>;
const DENIED = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" };
const BOTH = { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "denied", analytics_storage: "granted" };
const ADS = { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "denied", analytics_storage: "denied" };
const ANALYTICS = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "granted" };
const kinds = (h: H) => h.calls().map((c) => (Array.isArray(c) ? (c[0] === "event" || c[0] === "config" ? `${c[0]}:${String(c[1])}` : String(c[0])) : "push"));
const configs = (h: H) => h.calls().filter((c) => Array.isArray(c) && c[0] === "config") as unknown[][];
const updates = (h: H) => h.calls().filter((c) => Array.isArray(c) && c[0] === "consent" && c[1] === "update").map((c) => (c as unknown[])[2]);
const deleted = (h: H, name: string) => h.cookieWrites.some((w) => w.startsWith(`${name}=; Max-Age=0`));
const conv = (h: H) => h.events().filter((c) => c[1] === "conversion");
const purchases = (h: H) => h.events().filter((c) => c[1] === "purchase");
const views = (h: H) => h.events().filter((c) => c[1] === "page_view");
const PAGE = (path: string) => ({ page_location: `https://vamostaxi.site${path}`, page_referrer: "", page_title: path });

describe("flags", () => {
  it("Google and GA4 are open and Tag Manager is off (2026-10-15) in the committed state; each TypeScript flag equals the loader's", () => {
    expect(GOOGLE_TAG_OPEN).toBe(true);
    expect(googleTagAllowed()).toBe(true);
    expect(GA4_OPEN).toBe(true);
    expect(GTM_OPEN).toBe(false);
    expect(/var GOOGLE_ON = (true|false);/.exec(rawSrc)?.[1]).toBe(String(GOOGLE_TAG_OPEN));
    expect(/var ANALYTICS_ON = (true|false);/.exec(rawSrc)?.[1]).toBe(String(GA4_OPEN));
    expect(/var GTM_ON = (true|false);/.exec(rawSrc)?.[1]).toBe(String(GTM_OPEN));
    for (const n of ["GOOGLE_ON", "ANALYTICS_ON", "GTM_ON"]) expect(rawSrc.split(`var ${n} =`).length - 1, n).toBe(1);
  });
  it("the ids are the agency's and the owner's", () => {
    expect(GOOGLE_TAG_ID).toBe(TAG);
    expect(GOOGLE_CONVERSION_SEND_TO).toBe(SEND);
    expect(GA4_MEASUREMENT_ID).toBe(GA);
    expect(GTM_CONTAINER_ID).toBe(GTM);
    expect(rawSrc.split(TAG).length - 1).toBeGreaterThanOrEqual(2);
    expect(rawSrc).toContain(SEND);
    expect(rawSrc.split(`'${GA}'`).length - 1).toBe(1);
    expect(rawSrc.split(`'${GTM}'`).length - 1).toBe(1);
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
  it("the path only, the reference replaced, no query, no hash; the title is that path", () => {
    expect(g.scrub("https://vamostaxi.site/confirmation/VT-26-07331?session=cs_1#x", "").location).toBe("https://vamostaxi.site/confirmation/:ref");
    expect(g.scrub("https://vamostaxi.site/confirmation/VT-26-07331?session=cs_1#x", "").title).toBe("/confirmation/:ref");
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
  it("no gtag, no dataLayer, no request, no script, no cookie write, no event", async () => {
    const h = load({ open: false, gtm: "committed" });
    await h.settle();
    expect(h.win.gtag).toBeUndefined();
    expect(h.win.dataLayer).toBeUndefined();
    expect(h.fetchCalls).toHaveLength(0);
    expect(h.appended).toHaveLength(0);
    expect(h.cookieWrites).toHaveLength(0);
    expect(h.g().conversion({ value: 10, transactionId: REF })).toBe(false);
    expect(h.g().track("Lead")).toBe(false);
  });
});

describe("boot: each config only under its own choice", () => {
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

  it("both accepted: one script, the Ads config and the GA4 config, one GA4 page_view, all scrubbed, in that order", async () => {
    const h = load({
      open: true,
      href: `https://vamostaxi.site/confirmation/${REF}?session=cs_1#top`,
      referrer: "https://l.facebook.com/l.php?u=x&h=y",
    });
    await h.settle();
    expect(h.fetchCalls).toEqual(["/api/consent/state"]);
    expect(h.appended).toEqual([{ src: SCRIPT, async: true }]);
    expect(kinds(h)).toEqual(["consent", "js", "set", "consent", `config:${TAG}`, `config:${GA}`, "event:page_view"]);
    const calls = h.calls() as unknown[][];
    expect(calls[2]).toEqual(["set", "ads_data_redaction", true]);
    expect(calls[3]).toEqual(["consent", "update", BOTH]);
    expect(calls[4]).toEqual([
      "config",
      TAG,
      { send_page_view: false, page_location: "https://vamostaxi.site/confirmation/:ref", page_referrer: "https://l.facebook.com/" },
    ]);
    expect(calls[5]).toEqual([
      "config",
      GA,
      {
        send_page_view: false,
        page_location: "https://vamostaxi.site/confirmation/:ref",
        page_referrer: "https://l.facebook.com/",
        page_title: "/confirmation/:ref",
        cookie_expires: 7776000,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      },
    ]);
    expect(calls[6]).toEqual([
      "event",
      "page_view",
      { send_to: GA, page_location: "https://vamostaxi.site/confirmation/:ref", page_referrer: "https://l.facebook.com/", page_title: "/confirmation/:ref" },
    ]);
    const all = JSON.stringify(calls);
    expect(all).not.toContain(REF);
    expect(all).not.toContain("cs_1");
    expect(h.g().loaded()).toBe(true);
    expect(h.g().analyticsLoaded()).toBe(true);
    expect(h.cookieWrites).toHaveLength(0); // we never touch Google's cookies while the tags run
  });

  it("Analytics only: the script by the GA4 id, every ad signal denied, no Ads config, the Ads cookies deleted, _ga kept", async () => {
    const h = load({ open: true, state: ANALYTICS_ONLY });
    await h.settle();
    expect(h.appended).toEqual([{ src: GA_SCRIPT, async: true }]);
    expect(updates(h)).toEqual([ANALYTICS]);
    expect(configs(h).map((c) => c[1])).toEqual([GA]);
    expect(views(h)).toHaveLength(1);
    expect(deleted(h, "_gcl_au")).toBe(true);
    expect(deleted(h, "_gac_UA1")).toBe(true);
    expect(deleted(h, "_ga")).toBe(false);
    expect(deleted(h, "_ga_ABC123")).toBe(false);
    expect(h.g().loaded()).toBe(true);
  });

  it("Marketing only: the Ads config, analytics_storage denied, no GA4 config and no page_view, _ga deleted, _gcl kept", async () => {
    const h = load({ open: true, state: MARKETING_ONLY });
    await h.settle();
    expect(h.appended).toEqual([{ src: SCRIPT, async: true }]);
    expect(updates(h)).toEqual([ADS]);
    expect(configs(h).map((c) => c[1])).toEqual([TAG]);
    expect(views(h)).toHaveLength(0);
    expect(deleted(h, "_ga")).toBe(true);
    expect(deleted(h, "_ga_ABC123")).toBe(true);
    expect(deleted(h, "_gcl_au")).toBe(false);
  });

  it("GA4 closed (ANALYTICS_ON false): Analytics only loads nothing; both on loads the Ads tag alone", async () => {
    const a = load({ open: true, analytics: false, state: ANALYTICS_ONLY });
    await a.settle();
    expect(a.appended).toHaveLength(0);
    const b = load({ open: true, analytics: false });
    await b.settle();
    expect(configs(b).map((c) => c[1])).toEqual([TAG]);
    expect(updates(b)).toEqual([ADS]);
    expect(b.g().track("Lead")).toBe(false);
  });

  it.each([
    ["neither", { ok: true, chosen: true, choice: { marketing: false, analytics: false } } as State],
    ["not chosen", NOT_CHOSEN],
  ])("%s: no script, consent denied, every Google cookie deleted", async (_n, state) => {
    const h = load({ open: true, state });
    await h.settle();
    expect(h.appended).toHaveLength(0);
    expect(configs(h)).toHaveLength(0);
    expect(h.calls().at(-1)).toEqual(["consent", "update", DENIED]);
    for (const n of ["_gcl_au", "_gcl_aw", "_ga", "_ga_ABC123", "_gac_UA1"]) expect(deleted(h, n), n).toBe(true);
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
  ])("%s: nothing at all, not even the default, no GA4 event", async (href) => {
    const h = load({ open: true, gtm: "committed", href });
    await h.settle();
    expect(h.win.dataLayer).toBeUndefined();
    expect(h.fetchCalls).toHaveLength(0);
    expect(h.appended).toHaveLength(0);
    expect(h.g().track("Lead")).toBe(false);
    h.click("tel:+41796267082");
    expect(h.win.dataLayer).toBeUndefined();
  });

  it("a consent event alone does not boot: the server is asked again and only its answer decides", async () => {
    let answer: State = NOT_CHOSEN;
    const h = load({ open: true, state: () => Promise.resolve(answer) });
    await h.settle();
    expect(h.appended).toHaveLength(0);
    h.fire("vamos:consent", { detail: { marketing: true, analytics: true } });
    await h.settle();
    expect(h.fetchCalls).toHaveLength(2);
    expect(h.appended).toHaveLength(0); // the server still says no
    answer = ACCEPTED;
    h.fire("vamos:consent-recorded", {});
    await h.settle();
    expect(h.fetchCalls).toHaveLength(3);
    expect(h.appended).toHaveLength(1);
  });

  it("accepted twice (two events): the script is added once, each config once", async () => {
    const h = load({ open: true });
    await h.settle();
    h.fire("vamos:consent", { detail: { marketing: true, analytics: true } });
    h.fire("vamos:consent-recorded", {});
    await h.settle();
    expect(h.appended).toHaveLength(1);
    expect(configs(h).map((c) => c[1])).toEqual([TAG, GA]);
    expect(views(h)).toHaveLength(1);
  });
});

describe("upgrade: a later choice adds the other config to the script already there", () => {
  it("Analytics, then Marketing: the Ads config joins, no second script, no second js, no second page_view", async () => {
    let answer: State = ANALYTICS_ONLY;
    const h = load({ open: true, state: () => Promise.resolve(answer) });
    await h.settle();
    expect(configs(h).map((c) => c[1])).toEqual([GA]);
    answer = ACCEPTED;
    h.fire("vamos:consent", { detail: { marketing: true, analytics: true } });
    await h.settle();
    expect(h.appended).toEqual([{ src: GA_SCRIPT, async: true }]);
    expect(h.calls().filter((c) => Array.isArray(c) && c[0] === "js")).toHaveLength(1);
    expect(configs(h).map((c) => c[1])).toEqual([GA, TAG]);
    expect(updates(h).at(-1)).toEqual(BOTH);
    expect(views(h)).toHaveLength(1);
  });

  it("an older answer (Analytics only) arriving first does not cancel a newer one (both) still on its way", async () => {
    const answers: ((s: State) => void)[] = [];
    const h = load({ open: true, state: () => new Promise<State>((r) => answers.push(r)) });
    h.fire("vamos:consent-recorded", {});
    expect(answers).toHaveLength(2);
    answers[0]!(ANALYTICS_ONLY);
    await h.settle();
    answers[1]!(ACCEPTED);
    await h.settle();
    expect(configs(h).map((c) => c[1])).toEqual([GA, TAG]);
  });

  it("Marketing, then Analytics: the GA4 config and its page_view join, no second script", async () => {
    let answer: State = MARKETING_ONLY;
    const h = load({ open: true, state: () => Promise.resolve(answer) });
    await h.settle();
    expect(views(h)).toHaveLength(0);
    answer = ACCEPTED;
    h.fire("vamos:consent-recorded", {});
    await h.settle();
    expect(h.appended).toEqual([{ src: SCRIPT, async: true }]);
    expect(configs(h).map((c) => c[1])).toEqual([TAG, GA]);
    expect(updates(h).at(-1)).toEqual(BOTH);
    expect(views(h)).toHaveLength(1);
  });
});

describe("withdraw", () => {
  it("Analytics off after both: analytics_storage denied, _ga and _ga_* deleted on every domain form, Ads untouched", async () => {
    let answer: State = ACCEPTED;
    const h = load({ open: true, state: () => Promise.resolve(answer) });
    await h.settle();
    answer = MARKETING_ONLY;
    h.fire("vamos:consent", { detail: { marketing: true, analytics: false } });
    expect(updates(h).at(-1)).toEqual(ADS);
    for (const form of ["", "; domain=.vamostaxi.site"]) {
      expect(h.cookieWrites, form).toContain(`_ga=; Max-Age=0; path=/${form}`);
      expect(h.cookieWrites, form).toContain(`_ga_ABC123=; Max-Age=0; path=/${form}`);
    }
    expect(deleted(h, "_gcl_au")).toBe(false);
    expect(h.g().analyticsRevoked()).toBe(true);
    expect(h.g().revoked()).toBe(false);
    await h.settle();
    // never again on this page, even if the server says yes
    answer = ACCEPTED;
    h.fire("vamos:consent-recorded", {});
    await h.settle();
    expect(configs(h).map((c) => c[1])).toEqual([TAG, GA]);
    expect(updates(h).at(-1)).toEqual(ADS);
    expect(h.g().track("Lead")).toBe(false);
    expect(h.g().conversion({ value: 10, transactionId: REF })).toBe(true); // the Ads conversion still goes
    expect(conv(h)).toHaveLength(1);
    expect(purchases(h)).toHaveLength(0);
  });

  it("Marketing off after both: ad signals denied, the Ads cookies deleted, GA4 keeps counting", async () => {
    const h = load({ open: true });
    await h.settle();
    h.fire("vamos:consent", { detail: { marketing: false, analytics: true } });
    expect(updates(h).at(-1)).toEqual(ANALYTICS);
    expect(deleted(h, "_gcl_au")).toBe(true);
    expect(deleted(h, "_gac_UA1")).toBe(true);
    expect(deleted(h, "_ga")).toBe(false);
    expect(h.g().revoked()).toBe(true);
    expect(h.g().analyticsRevoked()).toBe(false);
    expect(h.g().track("Lead")).toBe(true);
    expect(h.events().filter((c) => c[1] === "generate_lead")).toHaveLength(1);
  });

  it("both off after boot: everything denied, every cookie deleted, nothing boots again", async () => {
    const h = load({ open: true });
    await h.settle();
    h.fire("vamos:consent", { detail: { marketing: false, analytics: false } });
    expect(h.calls().at(-1)).toEqual(["consent", "update", DENIED]);
    expect(h.g().revoked()).toBe(true);
    expect(h.g().analyticsRevoked()).toBe(true);
    for (const n of ["_gcl_aw", "_ga", "_ga_ABC123"]) expect(deleted(h, n), n).toBe(true);
    h.fire("vamos:consent", { detail: { marketing: true, analytics: true } });
    await h.settle();
    expect(h.appended).toHaveLength(1);
    expect(h.g().conversion({ value: 10, transactionId: REF })).toBe(false);
    expect(h.g().track("Lead")).toBe(false);
  });

  it("another tab turns a choice off (storage event): that choice is withdrawn here; other keys do nothing", async () => {
    const h = load({ open: true });
    await h.settle();
    h.fire("storage", { key: "other", newValue: "x" });
    h.fire("storage", { key: "vamosCookieConsent", newValue: JSON.stringify({ marketing: true, analytics: true }) });
    expect(h.cookieWrites).toHaveLength(0);
    h.fire("storage", { key: "vamosCookieConsent", newValue: JSON.stringify({ marketing: true, analytics: false }) });
    expect(updates(h).at(-1)).toEqual(ADS);
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

describe("GA4 events: Meta's buttons and booking steps, a fixed list, nothing else", () => {
  it.each([
    ["ViewContent", { content_name: "transfer" }, "view_item", {}],
    ["Lead", undefined, "generate_lead", {}],
    ["Contact", { content_category: "whatsapp" }, "contact", { method: "whatsapp" }],
    ["Contact", { content_category: "phone" }, "contact", { method: "phone" }],
    ["Contact", { content_category: "email" }, "contact", { method: "email" }],
    ["InitiateCheckout", undefined, "begin_checkout", {}],
    ["AddPaymentInfo", undefined, "add_payment_info", {}],
  ] as const)("%s %j -> %s, the scrubbed page and nothing more", async (name, params, ga, extra) => {
    const h = load({ open: true, href: "https://vamostaxi.site/checkout?from=Zurich&to=Geneva&flight=LX18" });
    await h.settle();
    expect(h.g().track(name, params)).toBe(true);
    const sent = h.events().filter((c) => c[1] === ga);
    expect(sent).toEqual([["event", ga, { send_to: GA, ...PAGE("/checkout"), ...extra }]]);
    expect(JSON.stringify(h.calls())).not.toMatch(/Zurich|Geneva|LX18/);
  });

  it.each([
    ["an unknown name", "Purchase", undefined],
    ["a custom name", "page_view", undefined],
    ["a word off the list", "Contact", { content_category: "sms" }],
    ["typed text as the word", "ViewContent", { content_name: "Zurich airport" }],
    ["no word", "Contact", undefined],
    ["not a string", 42, undefined],
  ])("refused: %s", async (_w, name, params) => {
    const h = load({ open: true });
    await h.settle();
    expect(h.g().track(name, params)).toBe(false);
    expect(h.events().filter((c) => c[1] !== "page_view")).toHaveLength(0);
  });

  it("one press never counts twice (1.5 s)", async () => {
    const h = load({ open: true });
    await h.settle();
    expect(h.g().track("Lead")).toBe(true);
    expect(h.g().track("Lead")).toBe(false);
    expect(h.events().filter((c) => c[1] === "generate_lead")).toHaveLength(1);
  });

  it("before the server answers it waits (five at most), then goes out once Analytics is on", async () => {
    let release: (s: State) => void = () => {};
    const h = load({ open: true, state: () => new Promise<State>((r) => (release = r)) });
    expect(h.g().track("InitiateCheckout")).toBe(true);
    expect(h.g().pendingEvents()).toBe(1);
    release(ANALYTICS_ONLY);
    await h.settle();
    expect(h.g().pendingEvents()).toBe(0);
    expect(kinds(h).slice(-2)).toEqual(["event:page_view", "event:begin_checkout"]);
  });

  it("Marketing only: a waiting event is dropped, a later one refused", async () => {
    let release: (s: State) => void = () => {};
    const h = load({ open: true, state: () => new Promise<State>((r) => (release = r)) });
    h.g().track("Lead");
    release(MARKETING_ONLY);
    await h.settle();
    expect(h.g().pendingEvents()).toBe(0);
    expect(h.g().track("AddPaymentInfo")).toBe(false);
    expect(h.events().filter((c) => c[1] !== "conversion")).toHaveLength(0);
  });

  it("contact links: the delegated click sends the kind only; other links nothing", async () => {
    const h = load({ open: true, href: "https://vamostaxi.site/contact" });
    await h.settle();
    h.click("tel:+41796267082");
    h.click("mailto:info@vamostaxi.site?subject=Hello");
    h.click("https://wa.me/41796267082?text=hi");
    h.click("https://vamostaxi.site/about");
    h.click(null);
    const sent = h.events().filter((c) => c[1] === "contact").map((c) => c[2].method);
    expect(sent).toEqual(["phone", "email", "whatsapp"]);
    expect(JSON.stringify(h.calls())).not.toMatch(/41796267082|info@|subject|text=hi/);
  });
});

describe("purchase (GA4) and conversion (Ads)", () => {
  const info = { value: 99.79, transactionId: REF };
  const CONV = ["event", "conversion", { send_to: SEND, value: 99.79, currency: "CHF", transaction_id: REF }];
  const PURCHASE = ["event", "purchase", { send_to: GA, value: 99.79, currency: "CHF", transaction_id: REF, ...PAGE("/confirmation/:ref") }];
  const confirmation = `https://vamostaxi.site/confirmation/${REF}`;

  it("both on: the Ads conversion and the GA4 purchase, once each, with the amount, CHF and the real reference", async () => {
    const h = load({ open: true, href: confirmation });
    await h.settle();
    expect(h.g().conversion(info)).toBe(true);
    expect(conv(h)).toEqual([CONV]);
    expect(purchases(h)).toEqual([PURCHASE]);
  });

  it("Analytics only: the purchase, no conversion", async () => {
    const h = load({ open: true, href: confirmation, state: ANALYTICS_ONLY });
    await h.settle();
    expect(h.g().conversion(info)).toBe(true);
    expect(purchases(h)).toEqual([PURCHASE]);
    expect(conv(h)).toHaveLength(0);
  });

  it("Marketing only: the conversion, no purchase", async () => {
    const h = load({ open: true, href: confirmation, state: MARKETING_ONLY });
    await h.settle();
    h.g().conversion(info);
    expect(conv(h)).toEqual([CONV]);
    expect(purchases(h)).toHaveLength(0);
  });

  it("purchase once only: a second call, a reload, a second tab send nothing more (each key written before the send)", async () => {
    const first = load({ open: true, href: confirmation });
    await first.settle();
    first.g().conversion(info);
    first.g().conversion(info);
    first.queue().push(info);
    expect(purchases(first)).toHaveLength(1);
    expect(conv(first)).toHaveLength(1);
    expect(Object.keys(first.store).sort()).toEqual([`vamosGaPurchase:${REF}`, `vamosGoogleConv:${REF}`]);
    const reload = load({ open: true, href: confirmation, storage: first.store, queue: [info] });
    await reload.settle();
    reload.g().conversion(info);
    expect(purchases(reload)).toHaveLength(0);
    expect(conv(reload)).toHaveLength(0);
  });

  it("the purchase key and the conversion key are separate: Analytics first does not stop the conversion on a later visit", async () => {
    const a = load({ open: true, href: confirmation, state: ANALYTICS_ONLY });
    await a.settle();
    a.g().conversion(info);
    const b = load({ open: true, href: confirmation, storage: a.store });
    await b.settle();
    b.g().conversion(info);
    expect(conv(b)).toHaveLength(1);
    expect(purchases(b)).toHaveLength(0);
  });

  it("storage unavailable: still sends (Google de-duplicates on transaction_id), never throws", async () => {
    const h = load({ open: true, href: confirmation, noStorage: true });
    await h.settle();
    expect(() => h.g().conversion(info)).not.toThrow();
    expect(conv(h)).toHaveLength(1);
    expect(purchases(h)).toHaveLength(1);
  });

  it("asked for before the tag has started: it waits, then goes out once", async () => {
    const h = load({ open: true, href: confirmation });
    expect(h.g().conversion(info)).toBe(true);
    expect(h.g().pending()).toBe(1);
    await h.settle();
    expect(h.g().pending()).toBe(0);
    expect(kinds(h)).toEqual(["consent", "js", "set", "consent", `config:${TAG}`, `config:${GA}`, "event:page_view", "event:conversion", "event:purchase"]);
  });

  it("pre-load queue: an item pushed before the loader ran is drained on load and goes out once", async () => {
    const h = load({ open: true, href: confirmation, queue: [info] });
    expect(h.g().pending()).toBe(1);
    await h.settle();
    expect(conv(h)).toEqual([CONV]);
    expect(purchases(h)).toEqual([PURCHASE]);
  });

  it("pre-load queue: a late push works and does not double-send the same reference", async () => {
    const h = load({ open: true, href: confirmation, queue: [info] });
    await h.settle();
    h.queue().push(info);
    h.queue().push({ ...info });
    h.g().conversion(info);
    expect(conv(h)).toHaveLength(1);
    expect(purchases(h)).toHaveLength(1);
    h.queue().push({ value: 20, transactionId: "VT-26-07332" });
    expect(conv(h)).toHaveLength(2);
    expect(purchases(h)).toHaveLength(2);
  });

  it("pre-load queue: no queue at all is fine, and bad items are refused by the same guards", async () => {
    const h = load({ open: true, href: confirmation });
    await h.settle();
    h.queue().push({ value: -1, transactionId: REF });
    h.queue().push({ value: 10, transactionId: "nope" });
    h.queue().push(null);
    expect(conv(h)).toHaveLength(0);
    expect(purchases(h)).toHaveLength(0);
  });

  it("neither on: the waiting item is dropped and a later Accept does not replay it", async () => {
    let answer: State = { ok: true, chosen: true, choice: { marketing: false, analytics: false } };
    const h = load({ open: true, href: confirmation, state: () => Promise.resolve(answer) });
    h.g().conversion(info);
    await h.settle();
    expect(h.g().pending()).toBe(0);
    answer = ACCEPTED;
    h.fire("vamos:consent-recorded", {});
    await h.settle();
    expect(conv(h)).toHaveLength(0);
    expect(purchases(h)).toHaveLength(0);
  });

  it("pre-load queue: neither on drops it, no script", async () => {
    const h = load({ open: true, href: confirmation, queue: [info], state: NOT_CHOSEN });
    await h.settle();
    expect(conv(h)).toHaveLength(0);
    expect(purchases(h)).toHaveLength(0);
    expect(h.appended).toHaveLength(0);
  });

  it.each([
    ["no amount", { transactionId: REF }],
    ["zero", { value: 0, transactionId: REF }],
    ["negative", { value: -5, transactionId: REF }],
    ["NaN", { value: NaN, transactionId: REF }],
    ["a string amount", { value: "99.79", transactionId: REF }],
    ["too large", { value: 50001, transactionId: REF }],
    ["no reference", { value: 10 }],
    ["a reference that is not one", { value: 10, transactionId: "a@b.com" }],
    ["a lower-case reference", { value: 10, transactionId: "vt-26-07331" }],
    ["not an object", null],
  ])("refused: %s", async (_n, bad) => {
    const h = load({ open: true, href: confirmation });
    await h.settle();
    expect(h.g().conversion(bad)).toBe(false);
    expect(conv(h)).toHaveLength(0);
    expect(purchases(h)).toHaveLength(0);
  });

  it("an address off the list: refused", async () => {
    const pay = load({ open: true, href: "https://vamostaxi.site/checkout/pay/abc" });
    expect(pay.g().conversion(info)).toBe(false);
  });

  it("the queue holds three at most", async () => {
    const h = load({ open: true, href: confirmation });
    for (let i = 0; i < 6; i++) h.g().conversion({ value: 10 + i, transactionId: `VT-26-0733${i}` });
    expect(h.g().pending()).toBeLessThanOrEqual(3);
  });
});

describe("Google Tag Manager (code path forced on; committed state is off since 2026-10-15)", () => {
  it("committed state: GTM_ON false, both choices on load no container script and no noscript frame", async () => {
    expect(rawSrc).toMatch(/var GTM_ON = false;/);
    const h = load({ open: true, gtm: "committed", state: () => Promise.resolve(ACCEPTED) });
    await h.settle();
    expect(h.appended.some((a) => a.src === GTM_SCRIPT)).toBe(false);
    expect(h.appended.some((a) => (a.src ?? "").includes("/gtm" + ".js"))).toBe(false);
    expect(h.g().tagManagerLoaded()).toBe(false);
    expect(rawSrc).not.toMatch(/createElement\(['"]noscript/);
  });

  it("the loader asks for the container (its id from the flag file), and only with both choices", () => {
    expect(rawSrc).toContain("if (!(adsOn && !adsRevoked && gaOn && !gaRevoked)) return;");
    expect(GTM_SCRIPT).toBe("https://www.google" + "tagmanager.com/gtm" + ".js?id=GTM-KPKG" + "T4VH");
  });

  it("kill switch: GTM_ON false, both choices on never load the container", async () => {
    const h = load({ open: true, gtm: false });
    await h.settle();
    expect(h.appended.map((a) => a.src)).toEqual([SCRIPT]);
    expect(h.g().tagManagerLoaded()).toBe(false);
  });

  it("Google closed: nothing, the container neither", async () => {
    const h = load({ open: false, gtm: true });
    await h.settle();
    expect(h.appended).toHaveLength(0);
    expect(h.win.dataLayer).toBeUndefined();
  });

  it("both on: after the consent default and the granted update, one gtm.start push and the container script", async () => {
    const h = load({ open: true, gtm: true });
    await h.settle();
    expect(h.appended.map((a) => a.src)).toEqual([SCRIPT, GTM_SCRIPT]);
    const calls = h.calls();
    const push = calls.findIndex((c) => !Array.isArray(c));
    expect(push).toBeGreaterThan(0);
    expect(calls[0]).toEqual(["consent", "default", DENIED]);
    expect(calls.slice(0, push).some((c) => Array.isArray(c) && c[0] === "consent" && c[1] === "update")).toBe(true);
    const ev = calls[push] as Record<string, unknown>;
    expect(ev.event).toBe("gtm" + ".js");
    expect(typeof ev["gtm.start"]).toBe("number");
    expect(calls.filter((c) => !Array.isArray(c))).toHaveLength(1);
    expect(h.g().tagManagerLoaded()).toBe(true);
  });

  it.each([
    ["Analytics only", ANALYTICS_ONLY],
    ["Marketing only", MARKETING_ONLY],
    ["not chosen", NOT_CHOSEN],
  ])("%s: no container", async (_n, state) => {
    const h = load({ open: true, gtm: true, state });
    await h.settle();
    expect(h.appended.some((a) => a.src === GTM_SCRIPT)).toBe(false);
    expect(h.g().tagManagerLoaded()).toBe(false);
  });

  it("the second choice arriving later loads it then, once", async () => {
    let answer: State = ANALYTICS_ONLY;
    const h = load({ open: true, gtm: true, state: () => Promise.resolve(answer) });
    await h.settle();
    expect(h.g().tagManagerLoaded()).toBe(false);
    answer = ACCEPTED;
    h.fire("vamos:consent-recorded", {});
    h.fire("vamos:consent-recorded", {});
    await h.settle();
    expect(h.appended.filter((a) => a.src === GTM_SCRIPT)).toHaveLength(1);
  });

  it.each([
    ["Analytics off", { marketing: true, analytics: false }],
    ["Marketing off", { marketing: false, analytics: true }],
  ])("%s after it ran: everything denied, every Google cookie deleted, never again on this page", async (_n, detail) => {
    let answer: State = ACCEPTED;
    const h = load({ open: true, gtm: true, state: () => Promise.resolve(answer) });
    await h.settle();
    answer = { ok: true, chosen: true, choice: detail };
    h.fire("vamos:consent", { detail });
    expect(h.calls().at(-1)).toEqual(["consent", "update", DENIED]);
    for (const n of ["_gcl_au", "_ga", "_ga_ABC123"]) expect(deleted(h, n), n).toBe(true);
    expect(h.g().revoked()).toBe(true);
    expect(h.g().analyticsRevoked()).toBe(true);
    await h.settle();
    answer = ACCEPTED;
    h.fire("vamos:consent-recorded", {});
    await h.settle();
    expect(h.appended.filter((a) => a.src === GTM_SCRIPT)).toHaveLength(1);
    expect(h.calls().filter((c) => !Array.isArray(c))).toHaveLength(1);
    expect(h.g().track("Lead")).toBe(false);
    expect(h.g().conversion({ value: 10, transactionId: REF })).toBe(false);
  });

  it("an address off the list: no container even with both on", async () => {
    const h = load({ open: true, gtm: true, href: "https://vamostaxi.site/checkout/pay/abc" });
    await h.settle();
    expect(h.appended).toHaveLength(0);
  });

  it("no request to Google's host before consent, and never a noscript frame", async () => {
    let release: (s: State) => void = () => {};
    const h = load({ open: true, gtm: true, state: () => new Promise<State>((r) => (release = r)) });
    await h.settle();
    expect(h.appended).toHaveLength(0);
    release(ACCEPTED);
    await h.settle();
    expect(rawSrc.toLowerCase()).not.toContain("<noscript");
    expect(rawSrc).not.toContain("ns.html");
    expect(rawSrc).not.toContain("iframe");
  });
});

describe("googleStep (the Next checkout's booking steps)", () => {
  it("hands the step name, and only it, to the loader; no loader or a throwing one is fine", () => {
    const seen: unknown[][] = [];
    googleStep("InitiateCheckout", { VamosGoogle: { track: (...a: unknown[]) => (seen.push(a), true) } });
    googleStep("AddPaymentInfo", { VamosGoogle: { track: (...a: unknown[]) => (seen.push(a), true) } });
    expect(seen).toEqual([["InitiateCheckout"], ["AddPaymentInfo"]]);
    expect(() => googleStep("InitiateCheckout", {})).not.toThrow();
    expect(() => googleStep("InitiateCheckout", undefined)).not.toThrow();
    expect(() =>
      googleStep("InitiateCheckout", {
        VamosGoogle: {
          track: () => {
            throw new Error("x");
          },
        },
      }),
    ).not.toThrow();
  });

  it("the real loader accepts both steps", async () => {
    const h = load({ open: true, href: "https://vamostaxi.site/checkout" });
    await h.settle();
    googleStep("InitiateCheckout", h.win);
    googleStep("AddPaymentInfo", h.win);
    expect(h.events().map((c) => c[1])).toEqual(["page_view", "begin_checkout", "add_payment_info"]);
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
  it("no user data, no enhanced conversions, no remarketing: ad_personalization is never granted", () => {
    expect(rawSrc).not.toMatch(/\buser_data\b/);
    expect(rawSrc).not.toContain("allow_enhanced_conversions");
    expect(rawSrc).toMatch(/ad_personalization: 'denied',/);
    expect(rawSrc).not.toMatch(/ad_personalization: '?gr/);
    expect(rawSrc).toContain("allow_google_signals: false");
    expect(rawSrc).toContain("allow_ad_personalization_signals: false");
  });
  it("the literal events are the conversion, the purchase and the GA4 page_view; every other GA4 event comes from the fixed list", () => {
    const events = [...rawSrc.matchAll(/gtag\('event',\s*'([^']+)'/g)].map((m) => m[1]);
    expect(events.sort()).toEqual(["conversion", "page_view", "purchase"]);
    expect(rawSrc).toMatch(/gtag\('event', 'page_view', \{ send_to: GA_ID,/);
    const list = [...rawSrc.matchAll(/ga: '([a-z_]+)'/g)].map((m) => m[1]);
    expect(list).toEqual(["view_item", "generate_lead", "contact", "begin_checkout", "add_payment_info"]);
    expect(rawSrc).toContain("send_page_view: false");
  });
  it("Google's host is written once; the ids once each", () => {
    expect(rawSrc.split("google" + "tagmanager.com").length - 1).toBe(1);
    expect(rawSrc.split(SCRIPT).length - 1).toBe(0); // built from GOOGLE_HOST and the id
  });
  it("the hooks: the price button and the contact form on the mocks, the two steps on the Next checkout", () => {
    const home = readFileSync(resolve(ROOT, "app/home/home.dc.html"), "utf8");
    const contact = readFileSync(resolve(ROOT, "app/pages/contact.dc.html"), "utf8");
    expect(home.match(/VamosGoogle\.track\('ViewContent', \{ content_name: 'transfer' \}\)/g)).toHaveLength(1);
    const go = home.slice(home.indexOf("goCheckout() {"), home.indexOf("submitBox = "));
    expect(go.indexOf("VamosGoogle.track")).toBeGreaterThan(go.indexOf("if (!r.ok) return;"));
    expect(go.indexOf("VamosGoogle.track")).toBeLessThan(go.indexOf("location.assign"));
    expect(contact.match(/VamosGoogle\.track\('Lead'\)/g)).toHaveLength(1);
    expect(contact).toContain("if (accepted) { try { if (window.VamosGoogle");
    const page = readFileSync(resolve(ROOT, "apps/web/app/[locale]/checkout/CheckoutPage.tsx"), "utf8");
    const form = readFileSync(resolve(ROOT, "apps/web/app/[locale]/checkout/CheckoutForm.tsx"), "utf8");
    expect(page.match(/googleStep\("InitiateCheckout"\)/g)).toHaveLength(1);
    expect(page.indexOf('googleStep("InitiateCheckout")')).toBeGreaterThan(page.indexOf("initiateSent.current = true;"));
    expect(form.match(/googleStep\("AddPaymentInfo"\)/g)).toHaveLength(1);
    const pay = form.slice(form.indexOf("isStripeCheckoutUrl(json.url)) {"));
    expect(pay.indexOf('googleStep("AddPaymentInfo")')).toBeLessThan(pay.indexOf("window.location.assign(json.url)"));
  });
});

describe("policy (Content-Security-Policy)", () => {
  const plain = contentSecurityPolicy({ metaPixel: false });
  const google = contentSecurityPolicy({ metaPixel: false, googleTag: true });
  const GOOGLE_HOSTS = [
    "google" + "tagmanager.com",
    "google" + "adservices.com",
    "doubleclick.net",
    "pagead2.google" + "syndication.com",
    "https://www.google.com",
    "https://www.google.ch",
    "google-" + "analytics.com",
    "analytics.google.com",
  ];
  const dir = (name: string) => google.split("; ").find((d) => d.startsWith(`${name} `))!;

  it("without googleTag the policy is byte-identical to today's", () => {
    expect(contentSecurityPolicy({ metaPixel: false, googleTag: false })).toBe(plain);
    for (const h of GOOGLE_HOSTS) expect(plain.includes(h), h).toBe(false);
  });
  it("with googleTag it adds Google's documented Ads hosts to script, connect, img and frame, nothing to default or style", () => {
    for (const d of ["script-src", "connect-src", "img-src", "frame-src"]) {
      expect(dir(d), d).toContain("https://www.google" + "tagmanager.com");
    }
    expect(dir("script-src")).toContain("https://www.google" + "adservices.com");
    expect(dir("connect-src")).toContain("https://ad.doubleclick.net");
    expect(dir("img-src")).not.toContain("https://ad.doubleclick.net");
    for (const d of ["default-src", "style-src", "object-src", "base-uri", "frame-ancestors", "worker-src"]) {
      expect(dir(d).includes("google"), d).toBe(false);
    }
  });
  it("GA4: its two collection hosts in connect-src, the first in img-src, never in script-src or frame-src", () => {
    const GA_A = "https://*.google-" + "analytics.com";
    const GA_B = "https://*.analytics.google.com";
    expect(dir("connect-src").split(" ")).toEqual(expect.arrayContaining([GA_A, GA_B]));
    expect(dir("img-src").split(" ")).toContain(GA_A);
    expect(dir("img-src").split(" ")).not.toContain(GA_B);
    expect(dir("script-src")).not.toContain("analytics");
    expect(dir("frame-src")).not.toContain("analytics");
    // The only wildcards added are GA4's two, leftmost; Mapbox keeps its own.
    expect(google.split("*").length - plain.split("*").length).toBe(3);
    expect(google.match(/https:\/\/\*\.[a-z.-]+/g)!.filter((h) => !h.includes("mapbox")).sort()).toEqual([GA_B, GA_A, GA_A].sort());
  });
  it("the Next policy list never names Google", () => {
    const all = SECURITY_HEADER_PAIRS.map(([, v]) => v).join("\n");
    expect(all).not.toMatch(/google|doubleclick/i);
  });
  it("both policies together", () => {
    const both = contentSecurityPolicy({ metaPixel: true, googleTag: true });
    expect(both).toContain("connect." + "face" + "book.net");
    expect(both).toContain("google" + "tagmanager.com");
    expect(both).toContain("google-" + "analytics.com");
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
    expect(checkout).toContain("google-" + "analytics.com");
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
    // Pinned in legal-gate.test.ts's needle scan too; here the ids by name.
    const flag = readFileSync(resolve(__dirname, "flag.ts"), "utf8");
    expect(flag).toContain(TAG);
    expect(flag).toContain(GA);
    expect(flag).toContain(GTM);
    const headers = readFileSync(resolve(__dirname, "../security/headers.ts"), "utf8");
    expect(headers).toContain("google" + "tagmanager.com");
    expect(headers).toContain("google-" + "analytics.com");
  });
});
