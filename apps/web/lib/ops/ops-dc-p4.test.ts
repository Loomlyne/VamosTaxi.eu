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
