// apps/web/lib/checkout/manage-pages-i18n.test.ts
//
// 261002 (P6 follow-ups, step 3): manage-booking and booking-detail in four languages, checked through the real
// app/vamos-i18n-dict.js + app/vamos-locale.js.
//
// The DC runtime renders `text {{ value }} text` as a Fragment, so the value is its own text node and the words
// around it are separate nodes; the runtime translates each node on its own. So every piece of visible markup
// text (split where a {{ }} sits) and every text attribute must resolve in de/fr/ar, a reference, e-mail or
// flight number sits in its own <span class="vt-dir-keep" data-vt-no-i18n="1"> (left to right in Arabic, never
// looked up), and the step-3 entries switch between all four languages both ways.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const PAGES = ["app/pages/manage-booking.dc.html", "app/pages/booking-detail.dc.html"];
const LANGS = ["de", "fr", "ar"] as const;
const KEEP = '<span class="vt-dir-keep" data-vt-no-i18n="1">';

type Locale = { t: (s: string, lang?: string) => string; setLang: (l: string) => void };
type Win = Record<string, unknown> & { VamosLocale?: Locale; VamosI18n?: { strings: Record<string, Record<string, string>> } };

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
const HAS_LETTER = /\p{L}/u;
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** True when `en` reads in `lang`: an entry for that language (identity entries count) or a pattern. */
function resolves(en: string, lang: string): boolean {
  return Boolean(strings[en]?.[lang]) || locale.t(en, lang) !== en;
}

/** The template part of a page (no head, no styles, no comments, no logic). */
function markupOf(rel: string): string {
  const html = read(rel);
  const start = html.indexOf("<x-dc");
  const end = html.indexOf('<script type="text/x-dc" data-dc-script');
  return html.slice(start, end).replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--[\s\S]*?-->/g, "");
}

/** Every text node the page renders from its markup, split where a {{ }} value sits, trimmed as the runtime keys it. */
function visibleTexts(rel: string): string[] {
  const markup = markupOf(rel);
  const out = new Set<string>();
  for (const m of markup.matchAll(/>([^<>]+)</g)) {
    for (const part of m[1]!.split(/\{\{[\s\S]+?\}\}/)) {
      const key = decode(part).trim();
      if (key && HAS_LETTER.test(key)) out.add(key);
    }
  }
  const ATTRS = ["placeholder", "title", "aria-label", "alt", "label", "totalLabel", "timeTitle", "savedLabel", "saveLabel", "clearLabel"];
  for (const m of markup.matchAll(/\s([a-zA-Z-]+)="([^"]*)"/g)) {
    if (!ATTRS.includes(m[1]!) || m[2]!.includes("{{")) continue;
    const key = decode(m[2]!).trim();
    if (key && HAS_LETTER.test(key)) out.add(key);
  }
  return [...out];
}

// Lines the page logic hands to the template as plain values (renderVals) or puts through t().
const LOGIC_LINES = [
  "Your surname",
  "you@example.com",
  "See what comes back at this notice before you decide.",
  "See the refund you are due before anything is confirmed.",
  "the booked time",
];

// The step-3 entries, English source as the runtime keys it (the words around a value are separate nodes).
const STEP3 = [
  "Opened from your confirmation email",
  "This link opens booking",
  "and nothing else. To see other trips, sign in or look them up one at a time.",
  "Sent by pay link. Not confirmed until money lands.",
  "Airline code and number, as printed on your boarding pass. Your driver watches this flight, so a change of flight matters more than a change of time.",
  "Confirmation sent to",
  "Refund",
  "Cancel this transfer",
  "Payer email",
  "Printing gives you the voucher alone — the rest of this page is left off the page.",
  "Send it again to",
  ", voucher attached.",
  "This transfer is cancelled",
  "is cancelled and no driver will come. The cancellation confirmation is on its way to",
  "— keep it, because that is what your refund is calculated from.",
  "Refunds go back to the original payment method only, and we cannot send one to a different card. If that card is gone, call us.",
  "Same pickup, same destination, same class — you only choose the day and the time. Prices are quoted fresh, so the fare may differ from the one you paid.",
  "What you paid",
  "A person, if you need one",
  "Dispatch answers the phone. Quote",
  "and they can do anything on this page for you, including the things this page will not.",
  "Read the",
  "cancellation and refund policy",
  "Another booking",
  "Your surname",
  "See what comes back at this notice before you decide.",
  "See the refund you are due before anything is confirmed.",
  "the booked time",
  "Pick a new date and time",
  "Use this time",
  "Time set",
  "Reset",
  "VT-0000",
  "you@example.com",
];

describe.each(PAGES)("%s in four languages", (rel) => {
  it("every visible markup string and text attribute resolves in German, French and Arabic", () => {
    const texts = visibleTexts(rel);
    expect(texts.length).toBeGreaterThan(100);
    const gaps = texts.flatMap((s) => LANGS.filter((l) => !resolves(s, l)).map((l) => `${l}: ${s}`));
    expect(gaps).toEqual([]);
  });

  it("the lines the logic hands to the template resolve too", () => {
    const html = read(rel);
    for (const s of LOGIC_LINES) {
      expect(html, s).toContain(`'${s}'`);
      for (const l of LANGS) expect(resolves(s, l), `${l}: ${s}`).toBe(true);
    }
  });

  it("every reference, e-mail and flight number in the text is its own left-to-right, untranslated span", () => {
    const markup = markupOf(rel);
    for (const v of ["ref", "email", "flight"]) {
      const all = markup.split(`{{ ${v} }}`).length - 1;
      const kept = markup.split(`${KEEP}{{ ${v} }}</span>`).length - 1;
      expect(all, v).toBeGreaterThan(0);
      expect(kept, `${v}: ${all - kept} left bare`).toBe(all);
    }
  });

  it("names, cars and the charged amount are never looked up (data-vt-no-i18n, not the ignored data-i18n-skip)", () => {
    expect(read(rel)).not.toContain("data-i18n-skip");
  });

  it("the three phone numbers stay inside vt-dir-keep (step 2)", () => {
    const markup = markupOf(rel);
    expect(markup.split("+41 79 626 70 82").length - 1).toBe(3);
    expect(markup.split('<span class="vt-dir-keep">+41 79 626 70 82</span>').length - 1).toBe(3);
  });
});

describe("the step-3 entries (real runtime)", () => {
  it.each(STEP3)("%s: switches between all four languages and back", (en) => {
    for (const a of LANGS) {
      const shown = strings[en]?.[a];
      expect(shown, `${a} missing`).toBeTruthy();
      expect(locale.t(en, a)).toBe(shown);
      // a page read in one language switches to every other, English included
      expect(locale.t(shown!, "en")).toBe(en);
      for (const b of LANGS) expect(locale.t(shown!, b)).toBe(strings[en]![b]);
    }
  });

  it("Swiss German: no ß in any step-3 line", () => {
    for (const en of STEP3) expect(strings[en]!.de, en).not.toContain("ß");
  });

  it("the resend toast the logic builds around the address resolves through its pattern", () => {
    const sent = "Sent. Check anna@example.com in a minute or two.";
    for (const l of LANGS) {
      const out = locale.t(sent, l);
      expect(out, l).not.toBe(sent);
      expect(out, l).toContain("anna@example.com");
    }
  });
});

describe("a time change with no booked date on screen (real page logic + runtime)", () => {
  /** The page's logic class with the real helper and runtime; the server accepts the time change. */
  async function requestWithoutLabels(rel: string) {
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
        setState(patch: Record<string, unknown> | ((s: Record<string, unknown>) => Record<string, unknown>), cb?: () => void) {
          const next = typeof patch === "function" ? patch(this.state) : patch;
          this.state = { ...this.state, ...next };
          cb?.();
        }
        forceUpdate() {}
      },
    });
    runInContext(read("app/vamos-manage-ticket.js"), ctx);
    runInContext(`${logic}\n;globalThis.__Page = Component;`, ctx);
    const Page = (ctx as unknown as { __Page: new (p: Record<string, unknown>) => { state: Record<string, unknown>; setState: (p: Record<string, unknown>) => void; confirmModify: () => void } }).__Page;
    const page = new Page({});
    page.setState({
      authVia: "token", view: "change", mIso: "2026-10-20", mTime: "10:00",
      ticket: { ...(page.state.ticket as object), reference: "VT-26-0101", status: "confirmed", dateLabel: "", timeLabel: "", scheduledLocal: "2026-10-20T08:15" },
    });
    page.confirmModify();
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    return String(page.state.toast);
  }

  it.each(PAGES)("%s: 'the booked time' is translated inside the sentence, not left in English", async (rel) => {
    locale.setLang("en");
    expect(await requestWithoutLabels(rel)).toBe("Time-change requested. Pickup stays the booked time until we confirm.");
    locale.setLang("ar");
    const ar = await requestWithoutLabels(rel);
    expect(ar).toContain(strings["the booked time"]!.ar);
    expect(ar).not.toContain("the booked time");
    locale.setLang("en");
  });
});
