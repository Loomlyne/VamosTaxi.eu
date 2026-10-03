// apps/web/lib/ops/ops-accept-paid-dc.test.ts
//
// 261002, review of item 4, round 3: Accept again on a change request whose payment page is already paid
// answers "already-paid" (nothing is replaced; the payment applies the change when the settle records it).
// The route answers 409, and the dashboard booking page (app/ops/OpsDetail.dc.html) says so in its four
// languages instead of "Could not apply edit". No DOM: reads the DC source, like the other OpsDetail pins.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { failStatus } from "./edit-request-map";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const dc = readFileSync(join(repoRoot, "app/ops/OpsDetail.dc.html"), "utf8");

describe("Accept on a request whose difference is already paid", () => {
  it("the route answers 409 (a conflict the owner waits out, not a bad request)", () => {
    expect(failStatus("already-paid")).toBe(409);
  });

  it("the Accept handler shows its own notice for already-paid and reloads the booking", () => {
    const a = dc.indexOf("acceptPending: () => {");
    const b = dc.indexOf("refusePending: () => {", a);
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    const handler = dc.slice(a, b);
    expect(handler).toMatch(/code === 'already-paid'\) \{ if \(ops\) ops\.bookings\.reset\(\); this\.notify\(t\.acceptPaid\); \}/);
    // It comes before the generic failure.
    expect(handler.indexOf("t.acceptPaid")).toBeLessThan(handler.indexOf("t.editFailed"));
  });

  it("the notice exists in English, German, French and Arabic, in plain words", () => {
    const lines = dc.split("\n").filter((l) => /^\s*acceptPaid:'/.test(l));
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("The customer has already paid the difference. The change is applied when the payment is recorded.");
    expect(lines[1]).toContain("Der Kunde hat die Differenz bereits bezahlt.");
    expect(lines[1]).not.toContain("ß");
    expect(lines[2]).toContain("Le client a déjà payé la différence.");
    expect(lines[3]).toContain("دفع العميل الفرق بالفعل.");
  });
});

// ── 261002 settle safety: the dashboard follows two more answers (vm-run, no DOM) ──────────────────────
// The DC logic class is loaded from the page source and run with a stubbed window, the technique of
// ops-dc-dash-design.test.ts. Texts are not retyped here: T2 is read from the owner's decisions file
// (S3, "Approve as written", word for word) and every language is compared byte for byte.
//   1. Accept on a customer request, a second time, after the amount to pay moved: the route answers
//      `price-changed` (409, nothing written); the page shows T2, in its own four-language table.
//   2. A class change or a trip change answering `already-paid` (the customer paid the waiting change's
//      page in the same second): the page shows the existing acceptPaid sentence, not "Could not change".

const decisions = readFileSync(join(repoRoot, ".planning/decisions/2026-10-02-settle-safety.md"), "utf8");

/** The four T2 lines of the decisions file, S3 section: "- en: …" … "- ar: …". */
function t2(): Record<"en" | "de" | "fr" | "ar", string> {
  const section = decisions.slice(decisions.indexOf("## S3"));
  const out: Record<string, string> = {};
  for (const lang of ["en", "de", "fr", "ar"]) {
    const m = section.match(new RegExp(`^- ${lang}: (.+)$`, "m"));
    if (!m?.[1]) throw new Error(`T2 ${lang} not found in the decisions file`);
    out[lang] = m[1];
  }
  return out as Record<"en" | "de" | "fr" | "ar", string>;
}

type DetailLogic = {
  state: Record<string, any>;
  renderVals(): Record<string, any>;
};

class Base {
  props: Record<string, unknown>;
  state: Record<string, unknown> = {};
  constructor(props?: Record<string, unknown>) {
    this.props = props || {};
  }
  setState(update: unknown, cb?: () => void) {
    const patch = typeof update === "function" ? (update as (s: unknown) => object)(this.state) : update;
    this.state = { ...this.state, ...(patch as object) };
    if (typeof cb === "function") cb();
  }
  forceUpdate() {}
  componentDidMount() {}
  componentDidUpdate() {}
  componentWillUnmount() {}
  renderVals() {
    return {};
  }
}

function scriptOf(src: string): string {
  const m = src.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/);
  if (!m?.[1]) throw new Error("no data-dc-script");
  return m[1];
}

function loadDetail(win: Record<string, unknown>, lang: string, props: Record<string, unknown>): DetailLogic {
  const React = { createElement: (...args: unknown[]) => ({ args }) };
  const doc = {
    body: { style: {} as Record<string, string> },
    addEventListener() {},
    removeEventListener() {},
    documentElement: { getAttribute: () => "ltr" },
  };
  const fn = new Function(
    "DCLogic", "StreamableLogic", "React", "window", "document", "history", "localStorage", "location", "PopStateEvent",
    `${scriptOf(dc)}\n;return Component;`,
  );
  const Component = fn(
    Base, Base, React, win, doc, { pushState() {} },
    { getItem: (k: string) => (k === "vamosLang" ? lang : null), setItem() {} },
    { pathname: "/bookings/VT-26-0801", href: "https://dashboard.vamostaxi.site/bookings/VT-26-0801" },
    class {},
  ) as new (p: Record<string, unknown>) => DetailLogic;
  const logic = new Component(props);
  logic.state = { ...logic.state, lang };
  return logic;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const BOOKING_ID = "b0000000-0000-4000-8000-000000000801";
const KEY = "mercedes-benz-v-class";

function booking(over: Record<string, unknown> = {}) {
  return {
    id: "VT-26-0801", bookingId: BOOKING_ID, time: "08:00", date: "Thu 8 Oct", dateIso: "2026-10-08",
    pickupAt: new Date(Date.now() + 48 * 3600e3).toISOString(),
    customer: "Anna Example", email: "anna@example.test", phone: "+41 79 000 00 00",
    pickup: "Zurich Airport (ZRH)", dropoff: "Bahnhofstrasse 1, 8001 Zurich", klass: "Economy", vehicle: "",
    pax: 2, bags: 1, status: "confirmed", driver: "", chauffeur: "", paid: true, paidByCard: true, totalRappen: 0, events: [],
    ...over,
  };
}

function setup(b: Record<string, unknown>, answer: (method: string, url: string) => unknown, lang: string) {
  const request = vi.fn(async (method: string, url: string, _body?: unknown) => answer(method, url));
  const on = () => () => undefined;
  const reset = vi.fn();
  const win = {
    VamosOps: {
      bookings: { all: () => [b], onChange: on, reset },
      chauffeurs: { all: () => [], onChange: on },
      vehicles: { all: () => [], onChange: on },
      profile: { get: () => ({ role: "admin" }), onChange: on },
    },
    VamosOpsApi: { request },
    VamosLocale: { money: () => "CHF 000" },
    VamosOpsBar: { set: vi.fn(), clear: vi.fn() },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    open() {},
  };
  const logic = loadDetail(win, lang, { id: String(b.id) });
  return { logic, request, reset };
}

const LANGS = ["en", "de", "fr", "ar"] as const;

describe("Accept: a second Accept after the amount moved shows T2 (261002 settle safety)", () => {
  it("the route's refusal is a conflict and the page names it before the generic failure", () => {
    expect(failStatus("price-changed")).toBe(409);
    const a = dc.indexOf("acceptPending: () => {");
    const b = dc.indexOf("refusePending: () => {", a);
    const handler = dc.slice(a, b);
    expect(handler).toMatch(/code === 'price-changed'\) \{ if \(ops\) ops\.bookings\.reset\(\); this\.notify\(t\.acceptPriceChanged\); \}/);
    expect(handler.indexOf("t.acceptPriceChanged")).toBeLessThan(handler.indexOf("t.editFailed"));
  });

  it("the key exists once per language table, with the owner's T2 text byte for byte", () => {
    const text = t2();
    const lines = dc.split("\n").filter((l) => /^\s*acceptPriceChanged:'/.test(l));
    expect(lines).toHaveLength(4);
    LANGS.forEach((lang, i) => {
      expect(lines[i]!.trim()).toBe(`acceptPriceChanged:'${text[lang]}',`);
    });
    // The French apostrophe is the typographic one (U+2019), as in the owner's text.
    expect(text.fr).toContain("n’a donc");
    expect(lines[2]).toContain("n’a donc");
  });

  for (const lang of LANGS) {
    it(`${lang}: code price-changed shows the T2 sentence, reloads the booking, and not the generic failure`, async () => {
      const { logic, request, reset } = setup(
        booking({ pendingEditId: "e0000000-0000-4000-8000-000000000801", pendingEditActor: "customer" }),
        () => ({ ok: false, code: "price-changed" }),
        lang,
      );
      logic.renderVals().acceptPending();
      await flush();
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0]![0]).toBe("POST");
      expect(request.mock.calls[0]![1]).toBe(`/api/staff/bookings/${BOOKING_ID}/edit-accept`);
      expect(logic.state.toastMsg).toBe(t2()[lang]);
      expect(reset).toHaveBeenCalledTimes(1);
    });
  }

  it("the neighbours are unchanged: already-paid still shows acceptPaid, an unknown code the generic failure", async () => {
    const paid = setup(booking({ pendingEditId: "r1", pendingEditActor: "customer" }), () => ({ ok: false, code: "already-paid" }), "en");
    paid.logic.renderVals().acceptPending();
    await flush();
    expect(paid.logic.state.toastMsg).toBe("The customer has already paid the difference. The change is applied when the payment is recorded.");
    const other = setup(booking({ pendingEditId: "r1", pendingEditActor: "customer" }), () => ({ ok: false, code: "unknown" }), "en");
    other.logic.renderVals().acceptPending();
    await flush();
    expect(other.logic.state.toastMsg).toBe("Could not apply edit VT-26-0801");
  });
});

describe("a class or trip change answering already-paid shows the acceptPaid sentence (261002 settle safety)", () => {
  const PAID_TEXT: Record<(typeof LANGS)[number], RegExp> = {
    en: /^The customer has already paid the difference\. The change is applied when the payment is recorded\.$/,
    de: /^Der Kunde hat die Differenz bereits bezahlt\./,
    fr: /^Le client a déjà payé la différence\./,
    ar: /^دفع العميل الفرق بالفعل\./,
  };

  /** The page as the owner has it open: Edit mode, the class list from the preview, one field edited. */
  function editing(lang: string, edit: Record<string, unknown>, answer: (method: string, url: string) => unknown) {
    const out = setup(booking(), answer, lang);
    out.logic.state = {
      ...out.logic.state,
      editing: true,
      edit,
      classPreview: {
        key: BOOKING_ID, sig: "{}", busy: false, code: "", field: "",
        data: {
          currentClass: "saden", paidRappen: 25_000, currentTotalRappen: 25_000, rateVersionId: 18,
          classes: [
            { slug: "saden", name: "Economy", current: true, ok: true, newTotalRappen: 25_000, differenceRappen: 0, code: null },
            { slug: KEY, name: "Business", current: false, ok: true, newTotalRappen: 31_000, differenceRappen: 6_000, code: null },
          ],
        },
      },
    };
    return out;
  }
  const changeRefused = (code: string) => (method: string, url: string) =>
    method === "POST" && url.endsWith("/change") ? { ok: false, code } : { ok: false, code: "unknown" };

  for (const lang of LANGS) {
    it(`${lang}: a class change refused as already-paid shows the sentence the Accept button shows`, async () => {
      const { logic, request } = editing(lang, { klass: KEY }, changeRefused("already-paid"));
      logic.renderVals().confirmClassChange();
      await flush();
      const change = request.mock.calls.find((c) => String(c[1]).endsWith("/change"));
      expect(change, "the change was posted").toBeDefined();
      expect(change![2]).toEqual({ klass: KEY, expectTotalRappen: 31_000, expectPaidRappen: 25_000 });
      expect(String(logic.state.toastMsg)).toMatch(PAID_TEXT[lang]);
      expect(String(logic.state.toastMsg)).not.toMatch(/VT-26-0801/);
    });
  }

  it("a trip change (passengers) refused as already-paid shows it too", async () => {
    const { logic, request } = editing("en", { pax: "3" }, changeRefused("already-paid"));
    logic.renderVals().confirmClassChange();
    await flush();
    const change = request.mock.calls.find((c) => String(c[1]).endsWith("/change"));
    expect(change, "the change was posted").toBeDefined();
    expect(change![2]).toMatchObject({ pax: 3, expectPaidRappen: 25_000 });
    expect(logic.state.toastMsg).toBe("The customer has already paid the difference. The change is applied when the payment is recorded.");
  });

  it("another refusal that has no line of its own keeps the generic failure (the control)", async () => {
    const { logic } = editing("en", { klass: KEY }, changeRefused("some-new-code"));
    logic.renderVals().confirmClassChange();
    await flush();
    expect(String(logic.state.toastMsg)).toMatch(/VT-26-0801$/);
  });

  it("the map lists already-paid next to the other refusals, with the page's own acceptPaid text", () => {
    expect(dc).toMatch(/'already-paid': t\.acceptPaid,/);
  });
});
