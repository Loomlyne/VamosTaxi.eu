// apps/web/tests/unit/locale-table-labels.test.ts
//
// The /cookies tables stack into cards at phone width and print each cell's label from CSS attr(data-l), so the
// runtime has to translate data-l like any other reader-facing attribute. And French "Nom" is the translation of
// both "Name" and "Last name": a reader going French -> Arabic used to get the surname (اسم العائلة) as the cookie
// table's "Name" header. The real app/vamos-i18n-dict.js and app/vamos-locale.js run here on a small fake DOM.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FILTER_ACCEPT = 1, FILTER_REJECT = 2;

class FakeText {
  nodeType = 3;
  parentNode: FakeEl | null = null;
  constructor(public nodeValue: string) {}
}

class FakeEl {
  nodeType = 1;
  parentNode: FakeEl | null = null;
  childNodes: Array<FakeEl | FakeText> = [];
  attrs: Record<string, string> = {};
  style = { removeProperty() {}, setProperty() {} };
  classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  constructor(public tagName: string, attrs: Record<string, string> = {}, kids: Array<FakeEl | FakeText | string> = []) {
    this.attrs = { ...attrs };
    for (const k of kids) this.appendChild(typeof k === "string" ? new FakeText(k) : k);
  }
  appendChild(n: FakeEl | FakeText) { n.parentNode = this; this.childNodes.push(n); return n; }
  hasAttribute(a: string) { return a in this.attrs; }
  getAttribute(a: string) { return a in this.attrs ? this.attrs[a] : null; }
  setAttribute(a: string, v: string) { this.attrs[a] = String(v); }
  removeAttribute(a: string) { delete this.attrs[a]; }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  addEventListener() {}
}

/** Depth-first walker with the two filter answers the runtime uses. */
function createTreeWalker(root: FakeEl, _what: number, filter: { acceptNode: (n: FakeEl | FakeText) => number }) {
  const queue: Array<FakeEl | FakeText> = [];
  const visit = (n: FakeEl) => {
    for (const c of n.childNodes) {
      if (filter.acceptNode(c) === FILTER_REJECT) continue;
      queue.push(c);
      if (c instanceof FakeEl) visit(c);
    }
  };
  visit(root);
  let i = 0;
  return { nextNode: () => (i < queue.length ? queue[i++] : null) };
}

const el = (tag: string, attrs: Record<string, string> = {}, kids: Array<FakeEl | FakeText | string> = []) => new FakeEl(tag, attrs, kids);

/** One row of the strictly-necessary table, written the way cookies.dc.html writes it. */
function cookieTable() {
  const head = el("tr", {}, ["Name", "Purpose", "Provider", "Duration"].map((h) => el("th", { scope: "col" }, [h])));
  const row = el("tr", {}, [
    el("td", { "data-l": "Name" }, [el("span", { "data-ck-plain": "1" }, ["Stripe payment"])]),
    el("td", { "data-l": "Purpose" }, ["Fraud checks on the payment step"]),
    el("td", { "data-l": "Provider" }, [el("span", { "data-vt-no-i18n": "1" }, ["Stripe"])]),
    el("td", { "data-l": "Duration" }, ["30 minutes"]),
  ]);
  const table = el("table", { "data-ct": "1" }, [el("thead", {}, [head]), el("tbody", {}, [row])]);
  return { table, head, row };
}

type Locale = { setLang: (l: string) => void; coverage: (root: unknown) => { count: number; strings: string[]; attrs: string[] } };

function loadRuntime() {
  const store: Record<string, string> = {};
  const { table, head, row } = cookieTable();
  const body = el("body", {}, [el("main", {}, [table])]);
  const document = {
    documentElement: el("html"), head: el("head"), body, readyState: "complete", cookie: "",
    addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, createElement: (t: string) => el(t),
    createTreeWalker,
  };
  const localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
  };
  const win: Record<string, unknown> & { VamosLocale?: Locale } = {
    document, localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    location: { pathname: "/cookies", search: "", hostname: "localhost" }, navigator: { language: "en" },
    history: { replaceState() {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }), setTimeout: () => 0, clearTimeout() {},
    CustomEvent: class { type: string; detail: unknown; constructor(t: string, o?: { detail?: unknown }) { this.type = t; this.detail = o?.detail; } },
    MutationObserver: class { observe() {} disconnect() {} }, NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1, FILTER_ACCEPT, FILTER_REJECT },
    fetch: () => Promise.reject(new Error("offline")),
  };
  win.window = win;
  const names = ["window", "document", "localStorage", "navigator", "location", "history", "CustomEvent", "MutationObserver", "NodeFilter", "fetch", "setTimeout", "clearTimeout"];
  for (const file of ["vamos-i18n-dict.js", "vamos-locale.js"]) {
    const src = readFileSync(join(process.cwd(), "../../app", file), "utf8");
    new Function(...names, src)(...names.map((n) => win[n]));
  }
  const headers = () => head.childNodes.map((th) => ((th as FakeEl).childNodes[0] as FakeText).nodeValue);
  const labels = () => row.childNodes.map((td) => (td as FakeEl).getAttribute("data-l"));
  return { locale: win.VamosLocale!, headers, labels, table };
}

describe("cookie table labels follow the language (real vamos-locale.js)", () => {
  it("translates the phone-width data-l labels in every language, Provider cells included", () => {
    const { locale, labels } = loadRuntime();
    expect(labels()).toEqual(["Name", "Purpose", "Provider", "Duration"]);
    locale.setLang("de");
    expect(labels()).toEqual(["Name", "Zweck", "Anbieter", "Dauer"]);
    locale.setLang("fr");
    expect(labels()).toEqual(["Nom", "Finalité", "Fournisseur", "Durée"]);
    locale.setLang("ar");
    expect(labels()).toEqual(["الاسم", "الغرض", "المزوّد", "المدة"]);
    locale.setLang("en");
    expect(labels()).toEqual(["Name", "Purpose", "Provider", "Duration"]);
  });

  it("keeps Name as الاسم, not the surname, when Arabic follows French", () => {
    const { locale, headers, labels } = loadRuntime();
    locale.setLang("fr");
    expect(headers()[0]).toBe("Nom");
    locale.setLang("ar");
    expect(headers()[0]).toBe("الاسم");
    expect(labels()[0]).toBe("الاسم");
    locale.setLang("de");
    locale.setLang("fr");
    locale.setLang("en");
    expect(headers()[0]).toBe("Name");
  });

  it("leaves no untranslated string or label in the table", () => {
    const { locale, table } = loadRuntime();
    for (const lang of ["de", "fr", "ar"]) {
      locale.setLang(lang);
      const gaps = locale.coverage(table);
      expect({ lang, strings: gaps.strings, attrs: gaps.attrs }).toEqual({ lang, strings: [], attrs: [] });
    }
  });
});
