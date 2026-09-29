// 26.3-G6 (D-35, D-44): an owner-added extra is generic end to end. The exact live row
// (`child-seat`, 1000 rappen) and an invented `pet-crate` (1500) are TEST FIXTURES, never
// written anywhere. Points: 1 labels in four languages + humanised fallback, 2 price route
// amount == checkoutCharge (== what the intent sends), 4 unticked adds nothing.
// Points 2 (Stripe unit_amount), 3 (saved lines, ops read) run on real SQL in
// tests/integration/extras-charged-recorded-db.spec.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

const state: { book: unknown; labels: Record<string, unknown> } = { book: null, labels: {} };

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: {} }) }));
vi.mock("@/lib/db/quote", () => ({ loadLaunchFlags: async () => ({ vat_rate_bps: 81 }) }));
vi.mock("@/lib/checkout/checkout-catalog", async () => {
  const actual = await vi.importActual<typeof import("./checkout-catalog")>("./checkout-catalog");
  return {
    loadCheckoutCatalog: (env: CloudflareEnv) =>
      actual.loadCheckoutCatalog(env, {
        loadBook: async () => state.book,
        loadLabels: async () => state.labels as never,
      }),
  };
});

import { GET } from "../../app/api/checkout/extras/route";
import { mintLock, type QuoteLockPayload } from "../quote/lock";
import { checkoutCharge, type ExtraCatalogRow } from "./checkout-charge";
import { humaniseCode } from "./extras-catalog";
import { priceCheckoutWithDeps, type PriceDeps } from "./price-route";

const LOCALES = ["en", "de", "fr", "ar"] as const;
const SECRETS = { current: "lock-secret-g6" };
const NOW = "2026-09-29T12:00:00.000Z";

const row = (code: string, amount: number) => ({
  code,
  kind: "amount",
  amount_rappen: amount,
  active: true,
  quantity_source: null,
  predicate: { kind: "manual" },
});
const BOOK = { surcharges: [row("child-seat", 1000), row("pet-crate", 1500)] };
const NAMES = {
  "child-seat": { en: "Child seat", de: "Kindersitz", fr: "Siege enfant", ar: "مقعد أطفال" },
  "pet-crate": { en: "Pet crate", de: "Tierbox", fr: "Caisse pour animal", ar: "قفص حيوانات" },
};

type RouteJson = {
  ok: boolean;
  extras: Array<{ code: string; amount_rappen: number; names: Record<string, string> }>;
  vat_rate_bps: number;
};
async function routeJson(): Promise<RouteJson> {
  return (await GET().then((r) => r.json())) as RouteJson;
}

beforeEach(() => {
  state.book = BOOK;
  state.labels = {};
});

describe("G6 point 1: tile label is the owner's name in four languages", () => {
  it("reads child-seat and pet-crate by name, never the raw code", async () => {
    state.labels = NAMES;
    const json = await routeJson();
    expect(json.vat_rate_bps).toBe(81);
    expect(json.extras.map((e) => [e.code, e.amount_rappen])).toEqual([
      ["child-seat", 1000],
      ["pet-crate", 1500],
    ]);
    for (const extra of json.extras) {
      const expected = NAMES[extra.code as keyof typeof NAMES];
      for (const lang of LOCALES) {
        expect(extra.names[lang]).toBe(expected[lang]);
        expect(extra.names[lang]).not.toBe(extra.code);
      }
    }
  });

  it("before the owner saves names: humanised code in every language, never the raw hyphenated code", async () => {
    state.labels = {};
    const json = await routeJson();
    const byCode = Object.fromEntries(json.extras.map((e) => [e.code, e.names]));
    for (const lang of LOCALES) {
      expect(byCode["child-seat"]![lang]).toBe("Child seat");
      expect(byCode["pet-crate"]![lang]).toBe("Pet crate");
    }
    expect(humaniseCode("child-seat")).toBe("Child seat");
  });

  it("a name saved in one language only fills the others with the humanised code", async () => {
    state.labels = { "child-seat": { en: "Child seat", de: "Kindersitz" } };
    const names = (await routeJson()).extras.find((e) => e.code === "child-seat")!.names;
    expect(names).toEqual({ en: "Child seat", de: "Kindersitz", fr: "Child seat", ar: "Child seat" });
  });

  it("an amount of 0 or a percent row is not a tile; the row is offered by exact code only", async () => {
    state.book = { surcharges: [row("child-seat", 1000), row("freebie", 0), { ...row("pct", 5), kind: "percent" }] };
    expect((await routeJson()).extras.map((e) => e.code)).toEqual(["child-seat"]);
  });
});

function lockPayload(): QuoteLockPayload {
  return {
    v: 1,
    quote_id: "00000000-0000-4000-8000-0000000000a6",
    exp: "2026-09-29T13:00:00.000Z",
    engine_version: "g6",
    rate_version_id: 1,
    settings_version_id: 1,
    computed_at: NOW,
    display_currency: "CHF",
    mode: "one_way",
    pax: 1,
    bags: 0,
    extras: null,
    coupon: null,
    class_totals: [{ slug: "economy", total_rappen: 10000 }],
    legs: [],
  };
}

async function catalog(): Promise<ExtraCatalogRow[]> {
  state.labels = NAMES;
  const json = await routeJson();
  return json.extras.map((e) => ({
    code: e.code,
    amountRappen: e.amount_rappen,
    labels: e.names as ExtraCatalogRow["labels"],
  }));
}

async function price(extraCodes: string[]) {
  const rows = await catalog();
  const deps: PriceDeps = {
    lockSecrets: SECRETS,
    nowIso: NOW,
    loadCatalog: async () => rows,
    loadVatBps: async () => 81,
    evaluateCoupon: async () => ({ ok: false }),
    actorCustomerId: null,
  };
  const res = await priceCheckoutWithDeps(
    { lock: await mintLock(SECRETS, lockPayload()), vehicle_class: "economy", extra_codes: extraCodes },
    deps,
  );
  if (res.status !== 200 || !res.body.ok) throw new Error(`price refused ${JSON.stringify(res.body)}`);
  const direct = checkoutCharge({
    classNetRappen: 10000,
    preCouponRappen: null,
    extraCodes,
    catalog: rows,
    coupon: null,
    vatRateBps: 81,
    vehicleClassSlug: "economy",
  });
  if (!direct.ok) throw new Error("direct refused");
  return { res: res.body, direct };
}

// Independent arithmetic: net = 10000 + extras, VAT = round-half-up(net * 81 / 1000), charged = net + VAT.
const CASES: Array<{ name: string; codes: string[]; net: number; vat: number }> = [
  { name: "unticked (point 4)", codes: [], net: 10000, vat: 810 },
  { name: "child-seat", codes: ["child-seat"], net: 11000, vat: 891 },
  { name: "pet-crate", codes: ["pet-crate"], net: 11500, vat: 932 },
  { name: "both ticked", codes: ["child-seat", "pet-crate"], net: 12500, vat: 1013 },
];

describe("G6 points 2 and 4: price route == charge, VAT included, unticked adds nothing", () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const { res, direct } = await price(c.codes);
      expect(res.net_rappen).toBe(c.net);
      expect(res.vat_rappen).toBe(c.vat);
      expect(res.charged_rappen).toBe(c.net + c.vat);
      expect(res.charged_rappen).toBe(direct.chargedRappen);
      expect(res.lines.reduce((n, l) => n + l.amount_rappen, 0)).toBe(res.charged_rappen);
      const surcharges = res.lines.filter((l) => l.kind === "surcharge");
      expect(surcharges.map((l) => l.code)).toEqual(c.codes);
      for (const l of surcharges) {
        expect(l.params.names).toEqual(NAMES[l.code as keyof typeof NAMES]);
      }
    });
  }

  it("an unknown code is refused, never guessed or mapped to another row", async () => {
    await expect(price(["child_seat"])).rejects.toThrow(/price_changed/);
  });
});
