// apps/web/lib/checkout/customer-time-refused.test.ts
//
// 261002 (P6 follow-ups, owner F2): "Request these changes" on the two booking pages, run as the page runs it
// (its own logic class from the <script data-dc-script> block, the real app/vamos-manage-ticket.js helper, a
// fake fetch, a stand-in for the design-component base class). A customer who asks for a new time while the
// owner's change to the trip waits for its difference to be paid gets 409 `staff-change-waiting` from the
// server; the page says so in the owner's words, in danger tone. Any other failure keeps the generic line, and
// a request that goes through keeps its "Time-change requested…" line. The words exist in four languages and
// resolve through the real vamos-i18n-dict.js + vamos-locale.js.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const HELPER = read("app/vamos-manage-ticket.js");
const PAGES = ["app/pages/manage-booking.dc.html", "app/pages/booking-detail.dc.html"];

// The owner's four sentences, word for word (.planning/decisions/2026-10-02-p6-followups.md, F2).
const WAITING = {
  en: "A change to this trip is waiting for payment. Pay the difference from our e-mail first, then ask for a new time.",
  de: "Eine Änderung dieser Fahrt wartet auf die Zahlung. Bezahlen Sie zuerst die Differenz über unsere E-Mail und fragen Sie dann nach einer neuen Zeit.",
  fr: "Une modification de ce trajet attend le paiement. Payez d’abord la différence depuis notre e-mail, puis demandez une nouvelle heure.",
  ar: "يوجد تعديل على هذه الرحلة بانتظار الدفع. ادفع الفرق أولاً من رسالتنا الإلكترونية، ثم اطلب وقتاً جديداً.",
};
const GENERIC = "Could not request this time change.";

type Win = Record<string, unknown> & { VamosLocale?: { t: (s: string, lang?: string) => string; setLang: (l: string) => void } };

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
    createTreeWalker: () => ({ nextNode: () => null }),
    // setLang('ar') adds the Arabic font link once (arabicFont looks it up by id first).
    getElementById: () => null,
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

type Sent = { url: string; method: string; body: unknown };
type Answer = { status: number; body: Record<string, unknown> } | "network-error";
type Page = {
  state: Record<string, unknown>;
  setState: (patch: Record<string, unknown>) => void;
  confirmModify: () => void;
};

/** The page's logic class with the real helper; `answer` is what the server says to the time-change request.
 *  `win` puts the real language runtime on the page's window (the page's t() then translates). */
function openPage(rel: string, answer: Answer, win?: Win) {
  const html = read(rel);
  const tag = html.indexOf("<script type=\"text/x-dc\" data-dc-script");
  const start = html.indexOf(">", tag) + 1;
  const logic = html.slice(start, html.indexOf("</script>", start));
  const sent: Sent[] = [];
  const store = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  const ctx = createContext({
    window: win ?? ({} as Record<string, unknown>),
    location: { search: "", pathname: rel.includes("detail") ? "/booking-detail" : "/manage-booking", href: "" },
    URLSearchParams,
    localStorage: store,
    sessionStorage: store,
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    console,
    React: { createRef: () => ({ current: null }) },
    fetch: async (url: string, opt: { method?: string; body?: string } = {}) => {
      sent.push({ url, method: opt.method ?? "GET", body: opt.body ? JSON.parse(opt.body) : null });
      if (answer === "network-error") throw new Error("offline");
      return { ok: answer.status < 400, status: answer.status, json: async () => answer.body };
    },
    DCLogic: class {
      props: Record<string, unknown>;
      state: Record<string, unknown> = {};
      constructor(props?: Record<string, unknown>) {
        this.props = props ?? {};
      }
      setState(patch: Record<string, unknown> | ((s: Record<string, unknown>) => Record<string, unknown>), cb?: () => void) {
        const next = typeof patch === "function" ? patch(this.state) : patch;
        this.state = { ...this.state, ...next };
        cb?.();
      }
      forceUpdate() {}
    },
  });
  runInContext(HELPER, ctx);
  runInContext(`${logic}\n;globalThis.__Page = Component;`, ctx);
  const Page = (ctx as unknown as { __Page: new (p: Record<string, unknown>) => Page }).__Page;
  return { page: new Page({}), sent };
}

const flush = () => new Promise((r) => setImmediate(r));

/** A paid trip on the change view with 10:00 picked, then "Request these changes". */
async function pressRequest(rel: string, authVia: "token" | "account", answer: Answer, win?: Win) {
  const { page, sent } = openPage(rel, answer, win);
  page.setState({
    authVia,
    signedIn: authVia === "account",
    view: "change",
    mIso: "2026-10-20",
    mTime: "10:00",
    ticket: { ...(page.state.ticket as object), reference: "VT-26-0101", status: "confirmed", dateLabel: "20 Oct 2026", timeLabel: "08:15", scheduledLocal: "2026-10-20T08:15" },
  });
  page.confirmModify();
  for (let i = 0; i < 5; i++) await flush();
  return { page, sent };
}

describe.each(PAGES)("%s: Request these changes", (rel) => {
  it("a staff change waits for payment (guest link): the owner's sentence, danger tone, the change view stays", async () => {
    const { page, sent } = await pressRequest(rel, "token", { status: 409, body: { ok: false, code: "staff-change-waiting" } });
    expect(sent).toEqual([
      { url: "/api/manage/time-change", method: "POST", body: { token: "", ref: "VT-26-0101", scheduled_local: "2026-10-20T10:00" } },
    ]);
    expect(page.state.toast).toBe(WAITING.en);
    expect(page.state.toastTone).toBe("danger");
    expect(page.state.view).toBe("change");
    expect(page.state.requested ?? null).toBeNull();
  });

  it("the same answer on the signed-in route says the same", async () => {
    const { page, sent } = await pressRequest(rel, "account", { status: 409, body: { ok: false, code: "staff-change-waiting" } });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ url: "/api/account/bookings/time-change", method: "POST" });
    expect(page.state.toast).toBe(WAITING.en);
    expect(page.state.toastTone).toBe("danger");
  });

  it("any other refusal keeps the generic line", async () => {
    for (const body of [{ ok: false, code: "wrong-booking" }, { ok: false, code: "not-changeable" }, { ok: false }, {}]) {
      const { page } = await pressRequest(rel, "token", { status: 409, body });
      expect(page.state.toast).toBe(GENERIC);
      expect(page.state.toastTone).toBe("danger");
    }
  });

  it("a server error with no JSON, and a network error, keep the generic line", async () => {
    const serverError = await pressRequest(rel, "token", { status: 500, body: {} });
    expect(serverError.page.state.toast).toBe(GENERIC);
    expect(serverError.page.state.toastTone).toBe("danger");
    const offline = await pressRequest(rel, "token", "network-error");
    expect(offline.page.state.toast).toBe(GENERIC);
    expect(offline.page.state.toastTone).toBe("danger");
  });

  it("a request that goes through keeps its own line and moves to the booking view", async () => {
    const { page } = await pressRequest(rel, "token", { status: 200, body: { ok: true } });
    expect(page.state.toast).toBe("Time-change requested. Pickup stays 20 Oct 2026 · 08:15 until we confirm.");
    expect(page.state.toastTone).toBe("ok");
    expect(page.state.view).toBe("booking");
  });
});

describe("the refusal sentence exists in four languages (real vamos-i18n-dict.js + vamos-locale.js)", () => {
  const win = loadRuntime();
  const locale = win.VamosLocale!;

  it.each(["de", "fr", "ar"] as const)("%s: the runtime gives the owner's words", (lang) => {
    expect(locale.t(WAITING.en, lang)).toBe(WAITING[lang]);
  });

  it("the generic line is translated too (a failure is never English in Arabic)", () => {
    for (const lang of ["de", "fr", "ar"]) expect(locale.t(GENERIC, lang)).not.toBe(GENERIC);
  });

  it.each(PAGES)("%s: with the page in Arabic, German and French the toast carries the translation", async (rel) => {
    for (const lang of ["ar", "de", "fr"] as const) {
      locale.setLang(lang);
      const { page } = await pressRequest(rel, "token", { status: 409, body: { ok: false, code: "staff-change-waiting" } }, win);
      expect(page.state.toast).toBe(WAITING[lang]);
    }
    locale.setLang("en");
  });
});
