// 261003 fare lines on the two customer DC pages (Manage booking, My bookings -> booking detail), through
// the real page logic and the real i18n runtime. The saved lines reach the page as `ticket.money.lines`
// (lib/checkout/manage-money.ts). A price with the airport pickup fee or the route extra as their own lines
// shows them (with an icon); an older one-line price reads exactly as it did.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const PAGES = ["app/pages/manage-booking.dc.html", "app/pages/booking-detail.dc.html"];

type Locale = { t: (s: string, lang?: string) => string; setLang: (l: string) => void; lang: () => string; money: (a: unknown) => string };
type Win = Record<string, unknown> & { VamosLocale?: Locale };

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

type Page = { state: Record<string, unknown>; setState: (p: Record<string, unknown>) => void; renderVals: () => { lines: Array<{ label: string; value: string; icon?: string }>; total: string } };

function pageFor(rel: string): Page {
  const html = read(rel);
  const tag = html.indexOf('<script type="text/x-dc" data-dc-script');
  const start = html.indexOf(">", tag) + 1;
  const logic = html.slice(start, html.indexOf("</script>", start));
  const store = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  const ctx = createContext({
    window: win,
    location: { search: "", pathname: rel.includes("detail") ? "/booking-detail" : "/manage-booking", href: "" },
    URLSearchParams, localStorage: store, sessionStorage: store,
    setTimeout: () => 0, clearTimeout: () => undefined, console,
    React: { createRef: () => ({ current: null }) },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }),
    DCLogic: class {
      props: Record<string, unknown>;
      state: Record<string, unknown> = {};
      constructor(props?: Record<string, unknown>) { this.props = props ?? {}; }
      setState(patch: Record<string, unknown>, cb?: () => void) {
        this.state = { ...this.state, ...patch };
        cb?.();
      }
      forceUpdate() {}
    },
  });
  runInContext(read("app/vamos-manage-ticket.js"), ctx);
  runInContext(`${logic}\n;globalThis.__Page = Component;`, ctx);
  const Ctor = (ctx as unknown as { __Page: new (p: Record<string, unknown>) => Page }).__Page;
  return new Ctor({});
}

// Internal rappen fixtures, never a shown price. Saved amounts add up to 4400; shown figures too.
const money = (lines: unknown[], chargedRappen = 4400) => ({
  chargedRappen, method: null, presentment: null, className: "Business", lastChange: null, lines,
});
const SPLIT = [
  { kind: "fare", code: "distance_fare", labels: { en: "x", de: "x", fr: "x", ar: "x" }, vatRateBps: null, amountRappen: 4000, origin: null, destination: null },
  { kind: "fare", code: "airport_fee", labels: { en: "x", de: "x", fr: "x", ar: "x" }, vatRateBps: null, amountRappen: 1500, origin: null, destination: null },
  { kind: "fare", code: "fixed_route", labels: { en: "x", de: "x", fr: "x", ar: "x" }, vatRateBps: null, amountRappen: 2500, origin: "Zürich", destination: "Genève" },
  { kind: "coupon", code: "WELCOME", labels: { en: "x", de: "x", fr: "x", ar: "x" }, vatRateBps: null, amountRappen: -5000, origin: null, destination: null },
  { kind: "vat", code: "vat", labels: { en: "x", de: "x", fr: "x", ar: "x" }, vatRateBps: 81, amountRappen: 400, origin: null, destination: null },
];
const OLD = [
  { kind: "fare", code: "distance_fare", labels: { en: "x", de: "x", fr: "x", ar: "x" }, vatRateBps: null, amountRappen: 9000, origin: null, destination: null },
  { kind: "vat", code: "vat", labels: { en: "x", de: "x", fr: "x", ar: "x" }, vatRateBps: 81, amountRappen: 729, origin: null, destination: null },
];

function linesOf(rel: string, lang: string, m: unknown, priceTotalRappen: number) {
  locale.setLang(lang);
  const page = pageFor(rel);
  page.setState({
    authVia: "token", view: "booking", status: "confirmed",
    ticket: { ...(page.state.ticket as object), reference: "VT-26-0101", status: "confirmed", scheduledLocal: "2026-10-20T10:00", priceTotalRappen, money: m },
  });
  return page.renderVals();
}

const ISO_O = "⁦Zürich⁩";
const ISO_D = "⁦Genève⁩";

describe.each(PAGES)("%s", (rel) => {
  it("shows the airport fee (plane) and the route (pin, both towns) as their own lines, the voucher as its discount", () => {
    const out = linesOf(rel, "en", money(SPLIT), 4400);
    expect(out.lines.map((l) => [l.label, l.icon ?? ""])).toEqual([
      ["Business", ""],
      ["Airport pickup fee", "plane-landing"],
      [`${ISO_O} – ${ISO_D} route`, "map-pin"],
      ["Voucher", ""],
      [expect.stringContaining("VAT"), ""],
    ]);
    expect(out.lines.map((l) => l.value).slice(3, 4)[0]).toContain("−");
  });

  it.each([
    ["de", "Flughafen-Abholgebühr", `Strecke ${ISO_O} – ${ISO_D}`],
    ["fr", "Frais de prise en charge à l’aéroport", `Trajet ${ISO_O} – ${ISO_D}`],
    ["ar", "رسوم الاستقبال من المطار", `مسار ${ISO_O} – ${ISO_D}`],
  ])("%s: the two new labels resolve, the towns are kept as quoted", (lang, fee, route) => {
    const en = linesOf(rel, "en", money(SPLIT), 4400).lines;
    expect(locale.t(en[1]!.label, lang)).toBe(fee);
    expect(locale.t(en[2]!.label, lang)).toBe(route);
    expect(locale.t("Route price", lang)).not.toBe("Route price");
  });

  it("a route with no towns reads 'Route price'", () => {
    const noNames = SPLIT.map((l) => (l.code === "fixed_route" ? { ...l, origin: null, destination: null } : l));
    expect(linesOf(rel, "en", money(noNames), 4400).lines[2]!.label).toBe("Route price");
  });
});

describe("an older one-line booking", () => {
  it("booking detail: one Fare line equal to the total, exactly as today", () => {
    const out = linesOf("app/pages/booking-detail.dc.html", "en", money(OLD, 9729), 9729);
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]).toMatchObject({ label: "Fare" });
    expect(out.lines[0]!.icon).toBeUndefined();
  });

  it("manage booking: the saved lines as before (class name, VAT)", () => {
    const out = linesOf("app/pages/manage-booking.dc.html", "en", money(OLD, 9729), 9729);
    expect(out.lines.map((l) => l.label)).toEqual(["Business", expect.stringContaining("VAT")]);
  });
});
