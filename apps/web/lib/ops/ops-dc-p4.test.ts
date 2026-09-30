// apps/web/lib/ops/ops-dc-p4.test.ts
//
// 26.2-p4 A4 and A5, signed by the owner 2026-09-30 (question form): "Remove the tag" and
// "Remove column and old words". The whole script block of each DC file runs here against a stub
// DCLogic, so each test drives the real renderVals and the real copy table. No DOM, no network.
// Fixture amounts are the owner's own live figure (Child seat, CHF 10.00) or synthetic rappen.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapBoardBooking, type SqlBoardRow } from "./bookings-map";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

function scriptOf(name: string): string {
  const m = read(`app/ops/${name}`).match(/<script type="text\/x-dc" data-dc-script[^>]*>\n([\s\S]*?)\n<\/script>/);
  if (!m?.[1]) throw new Error(`missing script block in ${name}`);
  return m[1];
}

type Json = Record<string, unknown>;
type Copy = Record<"en" | "de" | "fr" | "ar", Record<string, string>>;
const LANGS = ["en", "de", "fr", "ar"] as const;

/** Same contract as the DC runtime's DCLogic for what these components use. */
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

const noop = () => undefined;
const coll = (rows: unknown[]) => ({
  all: () => rows,
  get: (id: string) => rows.find((r) => (r as Json).id === id) ?? null,
  blank: () => ({ kind: "amount", amounts: {}, pct: "" }),
  onChange: () => noop,
  upsert: noop,
  remove: noop,
  reorder: noop,
  reset: noop,
});
const locale = { lang: () => "en", cur: () => "CHF", money: (v: unknown) => `CHF ${String(v)}`, onChange: () => noop };

// ── A4: booking detail ──────────────────────────────────────────────────────────────────────

type Tag = { icon: string; k: string; v: string };
type DetailComp = { state: Json; props: Json; renderVals(): { tags: Tag[] } };

function detail(booking: Json): { comp: DetailComp; T: Copy } {
  const win = {
    VamosOpsApi: { request: () => Promise.resolve({ ok: true }) },
    VamosOps: {
      bookings: { ...coll([booking]) },
      chauffeurs: coll([]),
      vehicles: coll([]),
      profile: { get: () => ({ role: "admin" }), onChange: () => noop },
    },
    VamosLocale: locale,
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => true,
    open: () => null,
  };
  const out = new Function(
    "DCLogic", "window", "document", "localStorage", "history", "PopStateEvent", "navigator",
    `${scriptOf("OpsDetail.dc.html")}\nreturn { Component, T };`,
  )(StubLogic, win, { body: { style: {} } }, { getItem: () => "en" }, { pushState: noop }, class {}, {}) as {
    Component: new () => DetailComp;
    T: Copy;
  };
  const comp = new out.Component();
  comp.props = { id: "VT-26-4821" };
  return { comp, T: out.T };
}

/** A paid, confirmed trip; the driver marked arrival 25 minutes after the pickup time. */
const lateArrival: Json = {
  id: "VT-26-4821",
  bookingId: "11111111-1111-4111-8111-111111111111",
  status: "confirmed",
  paid: true,
  customer: "Ada Example",
  email: "ada@example.com",
  klass: "Economy",
  pickup: "Zurich Airport",
  dropoff: "Bahnhofstrasse 1, Zurich",
  date: "Thu 1 Oct",
  time: "08:00",
  pickupAt: "2026-10-01T06:00:00.000Z",
  arrivedAt: "2026-10-01T06:25:00.000Z",
  // What the board mapper sent before A4 for this trip (free wait not set, no waiting row).
  extraWaitMinutes: 25,
  extraWaitRappen: 0,
};

// The tag's label in each language before A4 (OpsDetail copy table at ff09120c).
const OLD_EXTRA_WAIT = { en: "Extra wait", de: "Extra-Wartezeit", fr: "Attente extra", ar: "انتظار إضافي" };

describe("A4 booking detail: the Extra wait tag is gone, Arrived stays", () => {
  for (const lang of LANGS) {
    it(`a trip that arrived after pickup shows Arrived and no Extra wait (${lang})`, () => {
      const { comp, T } = detail(lateArrival);
      comp.state = { ...comp.state, lang };
      const keys = comp.renderVals().tags.map((tag) => tag.k);
      expect(keys).toContain(T[lang].arrived);
      expect(keys).not.toContain(OLD_EXTRA_WAIT[lang]);
    });
  }

  it("the copy table has no extraWait key in any language", () => {
    const { T } = detail(lateArrival);
    for (const lang of LANGS) expect(T[lang], lang).not.toHaveProperty("extraWait");
  });

  it("the board mapper sends no extra-wait figure, and still sends the arrival time", () => {
    const row = {
      id: "11111111-1111-4111-8111-111111111111",
      reference: "VT-26-4821",
      status: "confirmed",
      contact_name: "Ada Example",
      contact_email: "ada@example.com",
      contact_phone: null,
      company_name: null,
      note: null,
      pay_link_sent_at: null,
      pickup_text: "Zurich Airport",
      dropoff_text: "Bahnhofstrasse 1, Zurich",
      scheduled_local: "2026-10-01T08:00:00",
      scheduled_at: "2026-10-01T06:00:00.000Z",
      flight_no: null,
      pax: 1,
      bags: 0,
      class_slug: "economy",
      chauffeur_name: null,
      payment_status: "succeeded",
      captured_at: "2026-09-30T10:00:00.000Z",
      payment_created_at: "2026-09-30T09:59:00.000Z",
      stripe_checkout_session_id: null,
      charged_rappen: 111,
      arrived_at: "2026-10-01T06:25:00.000Z",
      // The two columns the board query read from the live price book before A4.
      free_wait_minutes: 0,
      waiting_amount_rappen: 222,
    } as unknown as SqlBoardRow;
    const mapped = mapBoardBooking(row) as unknown as Json;
    expect(mapped.arrivedAt).toBe("2026-10-01T06:25:00.000Z");
    expect(mapped).not.toHaveProperty("extraWaitMinutes");
    expect(mapped).not.toHaveProperty("extraWaitRappen");
  });

  it("the board query reads no surcharge row by its code and no free-wait setting", () => {
    const src = read("apps/web/lib/ops/bookings.ts");
    expect(src).toMatch(/l\.arrived_at/);
    expect(src).not.toMatch(/waiting_airport|waiting_city|'waiting'/);
    expect(src).not.toMatch(/free_wait_minutes|waiting_amount_rappen/);
  });
});

// ── A5: Pricing > Extras ────────────────────────────────────────────────────────────────────

type Column = { key: string; header: string; lookup: (r: Json) => string };
type PricingVals = {
  surcharges: Json[];
  surchargeColumns: Column[];
  surchargeSearchKeys: string[];
  tEmptySurchargesBody: string;
  panes: { label: string; hint: string }[];
};
type PricingComp = { state: Json; renderVals(): PricingVals };

function pricing(rows: Json[]): { comp: PricingComp; T: Copy } {
  const win = {
    VamosLocale: locale,
    VamosOpsApi: { request: () => Promise.resolve({ ok: true, data: [] }) },
    VamosOps: {
      CLASSES: [],
      LOCATIONS: [],
      routes: coll([]),
      rates: coll([]),
      bands: coll([]),
      coupons: coll([]),
      surcharges: coll(rows),
      profile: { get: () => ({ role: "admin" }), onChange: () => noop },
      onAny: () => noop,
    },
    innerWidth: 1440,
    addEventListener: noop,
    removeEventListener: noop,
  };
  const out = new Function(
    "DCLogic", "window", "document",
    `${scriptOf("OpsPricing.dc.html")}\nreturn { Component, T };`,
  )(StubLogic, win, { addEventListener: noop, removeEventListener: noop }) as {
    Component: new () => PricingComp;
    T: Copy;
  };
  return { comp: new out.Component(), T: out.T };
}

/** The owner's one live extra: "Child seat", CHF 10.00 (his figure on /pricing, PLAN.md). */
const childSeat: Json = {
  id: "1",
  code: "child-seat",
  label: "child-seat",
  name: "Child seat",
  kind: "amount",
  amounts: { CHF: "10.00" },
  pct: "",
};

function cells(vals: PricingVals, row: Json): string[] {
  return vals.surchargeColumns.map((c) => c.lookup(row));
}

describe("A5 Pricing > Extras: the Type column and the old type words are gone", () => {
  it("the Extras table has two columns: name and amount", () => {
    const vals = pricing([childSeat]).comp.renderVals();
    expect(vals.surchargeColumns.map((c) => c.key)).toEqual(["label", "value"]);
    expect(cells(vals, vals.surcharges[0]!)).toEqual(["Child seat", "CHF 10.00"]);
  });

  const OLD_CODES = ["meet_greet", "free_wait", "extra_wait", "waiting", "waiting_city", "waiting_airport"];
  for (const code of OLD_CODES) {
    it(`an extra stored under the code ${code} shows its own name and price, like any other extra`, () => {
      const vals = pricing([childSeat, { ...childSeat, id: "2", code, label: code }]).comp.renderVals();
      expect(cells(vals, vals.surcharges[1]!)).toEqual(cells(vals, vals.surcharges[0]!));
      expect(vals.surcharges[1]).not.toHaveProperty("hours");
    });
  }

  it("search does not index a type", () => {
    const vals = pricing([childSeat]).comp.renderVals();
    expect(vals.surchargeSearchKeys).not.toContain("type");
  });

  it("the copy table holds none of the type words or the meet-and-greet line, in four languages", () => {
    const { T } = pricing([]);
    const gone = ["surchargeType", "typeCheckoutExtra", "typeMeet", "typeFreeWait", "typeExtraWait", "notDeletableMeet"];
    for (const lang of LANGS) for (const key of gone) expect(T[lang], `${lang}.${key}`).not.toHaveProperty(key);
    const src = scriptOf("OpsPricing.dc.html");
    expect(src).not.toMatch(/SURCHARGE_TYPES|surchargeTypeOf/);
    expect(src).not.toMatch(/meet_greet|free_wait|extra_wait|waiting_city|waiting_airport/);
  });

  // Words about waiting, meet and greet or free wait, per language, as they stood at ff09120c.
  const OLD_WORDS: Record<(typeof LANGS)[number], RegExp> = {
    en: /wait|meet and greet/i,
    de: /wart|meet and greet/i,
    fr: /attente|accueil/i,
    ar: /انتظار|استقبال/,
  };

  it("the Extras hint no longer talks about waiting or meet and greet; the rest stays", () => {
    const { T } = pricing([]);
    const want = { en: "Checkout extras", de: "Checkout-Extras", fr: "Extras de paiement", ar: "إضافات الدفع" };
    for (const lang of LANGS) {
      expect(T[lang].hintSurcharges, lang).not.toMatch(OLD_WORDS[lang]);
      expect(T[lang].hintSurcharges, lang).toBe(want[lang]);
    }
  });

  it("the empty list says: add an extra, customers choose it at checkout — in four languages", () => {
    const want = {
      en: "Add an extra. Customers choose it at checkout.",
      de: "Fügen Sie ein Extra hinzu. Kundinnen und Kunden wählen es beim Checkout.",
      fr: "Ajoutez un extra. Les clients le choisissent au paiement.",
      ar: "أضف إضافة. يختارها العملاء عند الدفع.",
    };
    for (const lang of LANGS) {
      const { comp, T } = pricing([]);
      expect(T[lang].emptySurchargesBody, lang).not.toMatch(OLD_WORDS[lang]);
      comp.state = { ...comp.state, lang, pane: "surcharges" };
      expect(comp.renderVals().tEmptySurchargesBody, lang).toBe(want[lang]);
    }
    expect(want.de).not.toMatch(/ß/);
  });

  it("the rate-book payload carries no type derived from the code and no free-wait hours", () => {
    const route = read("apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts");
    expect(route).not.toMatch(/surchargeTypeFromCode/);
    const m = route.match(/function mockSurcharges\([^)]*\)[^{]*\{([\s\S]*?)\n\}\n/);
    expect(m?.[1]).toBeTruthy();
    expect(m![1]).not.toMatch(/\btype\b|hours:/);
  });

  it("the dashboard data layer derives no type from the code", () => {
    const data = read("app/vamos-ops-data.js");
    const m = data.match(/function cleanSurcharge\(s\) \{([\s\S]*?)\n  \}\n/);
    expect(m?.[1]).toBeTruthy();
    expect(m![1]).not.toMatch(/meet_greet|free_wait|extra_wait|waiting|hours/);
  });
});
