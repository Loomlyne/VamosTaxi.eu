// apps/web/lib/ops/rate-book-extra-rule.test.ts
//
// 26.2-p4 A1: every extra the pricing page saves gets one rule, "chosen by the
// customer" (`{ kind: "manual" }`), whatever its name. The name is stored as
// typed (slug only, never renamed), and the rule reaches the database as a JSON
// object, not as a JSON string.
//
// The route runs for real; only the database is an in-memory stand-in. The
// stand-in stores the rule exactly as Postgres would: it runs the installed
// driver's own jsonb serializer over the parameter the route hands over. The
// driver is built with the Worker client's options (`fetch_types: false`,
// `prepare: true`) and never connects.
//
// The only amount used is the live figure: child-seat, amount_rappen 1000.

import postgres from "postgres";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCheckoutCatalog } from "../checkout/checkout-catalog";
import { buildExtraLines, buildLegSurchargeLines } from "../pricing/lines";
import { mapRateBook } from "../pricing/rateBook";
import type { Line, QuoteLegInput } from "../pricing/types";

const JSONB_OID = 3802;
const driver = postgres({ max: 1, fetch_types: false, prepare: true });
const DriverJson = driver.json({}).constructor;

/** The text the driver sends for one parameter bound to a jsonb column. */
function wireText(param: unknown): string {
  const value = param instanceof DriverJson ? (param as { value: unknown }).value : param;
  const serialize = driver.options.serializers[JSONB_OID] as (value: unknown) => string;
  return serialize(value);
}

type Extra = {
  id: number;
  version: number;
  code: string;
  kind: string;
  amount: number | null;
  /** What Postgres holds in `predicate` after the write (parsed jsonb). Undefined: column not written. */
  predicate: unknown;
  /** How the route bound the rule: through the driver's JSON helper, or as plain text. */
  predicateBoundAsJson: boolean;
  quantitySource: unknown;
};
type Version = { id: number; status: "live" | "draft"; label: string };

const db: { versions: Version[]; extras: Extra[]; labelCodes: string[] } = {
  versions: [],
  extras: [],
  labelCodes: [],
};

/** One bound value per `?`; a literal `null` in the statement is SQL NULL. */
function bind(slots: string[], values: unknown[]): unknown[] {
  let next = 0;
  return slots.map((slot) => {
    if (slot.includes("?")) return values[next++];
    if (slot.trim().toLowerCase() === "null") return null;
    throw new Error(`stand-in cannot read the literal '${slot.trim()}'`);
  });
}

/** `insert into t (a, b) values (?, null)` → { a: values[0], b: null }. */
function insertedColumns(text: string, values: unknown[]): Record<string, unknown> {
  const match = /\(([^)]*)\)\s*values\s*\(([^)]*)\)/.exec(text);
  const names = (match?.[1] ?? "").split(",").map((name) => name.trim());
  const bound = bind((match?.[2] ?? "").split(","), values);
  return Object.fromEntries(names.map((name, i) => [name, bound[i]]));
}

/** `update t set a = ?, b = ?::jsonb, c = null where …` → { a: values[0], b: values[1], c: null }. */
function updatedColumns(text: string, values: unknown[]): Record<string, unknown> {
  const pairs = (/\bset\b(.*)\bwhere\b/.exec(text)?.[1] ?? "").split(",");
  const bound = bind(
    pairs.map((pair) => pair.slice(pair.indexOf("=") + 1)),
    values,
  );
  return Object.fromEntries(pairs.map((pair, i) => [pair.split("=")[0]!.trim(), bound[i]]));
}

function applyWrite(row: Extra, cols: Record<string, unknown>): void {
  row.code = String(cols.code);
  row.kind = String(cols.kind);
  row.amount = cols.amount_rappen == null ? null : Number(cols.amount_rappen);
  if ("predicate" in cols) {
    row.predicate = JSON.parse(wireText(cols.predicate));
    row.predicateBoundAsJson =
      cols.predicate instanceof DriverJson && (cols.predicate as { type: unknown }).type === JSONB_OID;
  }
  if ("quantity_source" in cols) row.quantitySource = cols.quantity_source;
}

async function fakeTx(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> {
  const text = strings.join("?").replace(/\s+/g, " ").trim();

  if (text.startsWith("select n.id from public.surcharges n")) {
    const origin = db.extras.find((r) => r.id === Number(values[0]));
    const hit = db.extras.find((r) => origin && r.version === Number(values[1]) && r.code === origin.code);
    return hit ? [{ id: hit.id }] : [];
  }
  if (text.startsWith("insert into public.surcharges")) {
    const cols = insertedColumns(text, values);
    const row: Extra = {
      id: 900 + db.extras.length,
      version: Number(cols.rate_version_id),
      code: "",
      kind: "",
      amount: null,
      predicate: undefined,
      predicateBoundAsJson: false,
      quantitySource: undefined,
    };
    applyWrite(row, cols);
    db.extras.push(row);
    return [];
  }
  if (text.startsWith("update public.surcharges set")) {
    const id = Number(values[values.length - 2]);
    const version = Number(values[values.length - 1]);
    const row = db.extras.find((r) => r.id === id && r.version === version);
    if (row) applyWrite(row, updatedColumns(text, values));
    return [];
  }
  if (text.startsWith("select * from public.staff_extra_label_upsert")) {
    db.labelCodes.push(String(values[0]));
    return [];
  }
  return [];
}
fakeTx.json = driver.json;

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: {} }),
}));

vi.mock("@/lib/db/identity", () => ({
  asStaff: async (_env: unknown, _claims: unknown, fn: (tx: unknown) => unknown) => fn(fakeTx),
}));

vi.mock("@/lib/ops/staff-json", () => {
  const claims = { sub: "admin-1", role: "authenticated" };
  const wrap = (handler: (c: unknown, r: Request) => Promise<Response>) => (request: Request) =>
    handler(claims, request);
  return {
    jsonOk: (data: unknown, status = 200) => Response.json({ ok: true, data }, { status }),
    jsonErr: (code: string, status: number) => Response.json({ ok: false, code }, { status }),
    withAdmin: wrap,
    withStaff: wrap,
  };
});

vi.mock("@/lib/ops/pricing", () => ({
  loadRateVersions: async () => db.versions.map((v) => ({ ...v })),
}));

vi.mock("@/lib/ops/rate-book", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./rate-book")>();
  return {
    ...actual,
    forkLiveRateVersion: async () => {
      throw new Error("no fork in this test: the draft exists");
    },
    loadServiceZones: async () => [],
    loadRateBook: async (_env: unknown, _claims: unknown, versionId: number) => {
      const version = db.versions.find((v) => v.id === versionId);
      if (!version) return null;
      return {
        versionId,
        status: version.status,
        slug: `book-${versionId}`,
        label: version.label,
        vatRateBps: null,
        quoteLockMinutes: null,
        freeWaitMinutes: null,
        distanceRates: [],
        fixedRoutes: [],
        surcharges: db.extras
          .filter((r) => r.version === versionId)
          .map((r) => ({
            id: r.id,
            rateVersionId: versionId,
            code: r.code,
            kind: r.kind,
            amountRappen: r.amount,
            percent: null,
            appliesTo: "leg",
            active: true,
            ruleId: null,
          })),
        distanceBands: [],
        regionPremiums: [],
        rules: [],
        vehicleClasses: [],
      };
    },
  };
});

const URL_BASE = "https://dashboard.vamostaxi.site/api/staff/rate-book";

async function put(body: Record<string, unknown>): Promise<Response> {
  const { PUT } = await import("@/app/[locale]/(ops)/api/staff/rate-book/route");
  return PUT(
    new Request(URL_BASE, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** What the pricing page sends for one extra: the name, its slug, the amount in francs. */
function extraBody(name: string, id?: number): Record<string, unknown> {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    ...(id == null ? {} : { id: String(id) }),
    kind: "surcharge",
    type: "checkout_extra",
    rule: "leg",
    name,
    label: name,
    code: slug,
    value: "10",
    amounts: { CHF: "10", EUR: "", USD: "", AED: "" },
  };
}

/** The draft as the quote reads it (`quote_rate_book` JSON), one surcharge per stored row. */
function bookDoc(): { surcharges: Record<string, unknown>[] } {
  return {
    surcharges: db.extras.map((r) => ({
      id: r.id,
      rate_version_id: r.version,
      code: r.code,
      kind: r.kind,
      amount_rappen: r.amount,
      percent: null,
      applies_to: "leg",
      active: true,
      predicate: r.predicate,
      quantity_source: r.quantitySource ?? null,
    })),
  };
}

const LEG: QuoteLegInput = {
  leg_seq: 1,
  scheduled_local: "2026-09-04T23:10",
  distance_m: 10_000,
  duration_s: 900,
  origin_zone_id: null,
  dest_zone_id: null,
  waypoints: [],
};
const FARE_LINE: Line = {
  seq: 1,
  leg_seq: 1,
  kind: "fare",
  code: "distance",
  i18n_key: "price.fare.distance.label",
  basis: { rule: "distance" } as Line["basis"],
  amount_rappen: null,
};

/** Every line the fare engine would add to a quote for the stored rows. */
function quoteLinesForStoredRows(): Line[] {
  const book = mapRateBook(bookDoc());
  return [
    ...buildLegSurchargeLines({
      leg: LEG,
      fareLine: FARE_LINE,
      surcharges: book.surcharges,
      zones: [],
      settings: null,
      rateVersionId: 19,
    }),
    ...buildExtraLines({ legs: [LEG], surcharges: book.surcharges, extras: {}, rateVersionId: 19 }),
  ];
}

/** The tick boxes /checkout offers for the stored rows: [code, amount]. */
async function tickBoxesForStoredRows(): Promise<Array<[string, number]>> {
  const rows = await loadCheckoutCatalog({} as CloudflareEnv, {
    loadBook: async () => bookDoc(),
    loadLabels: async () => ({}),
  });
  return rows.map((row) => [row.code, row.amountRappen]);
}

// RESEARCH "Answer 4": the ten names, each with the code it must be stored under.
const TEN_NAMES: Array<[name: string, code: string]> = [
  ["Ski", "ski"],
  ["Waiting", "waiting"],
  ["Night", "night"],
  ["Weekend", "weekend"],
  ["Holiday", "holiday"],
  ["Pet", "pet"],
  ["Extra stop", "extra-stop"],
  ["Child seat", "child-seat"],
  ["Meet and greet", "meet-and-greet"],
  ["Airport pickup", "airport-pickup"],
];

describe("an extra saved on the pricing page gets the rule 'chosen by the customer' (26.2-p4 A1)", () => {
  beforeEach(() => {
    db.versions = [{ id: 19, status: "draft", label: "Book 19" }];
    db.extras = [];
    db.labelCodes = [];
  });

  it.each(TEN_NAMES)("'%s' is saved under its own code '%s' with the manual rule", async (name, code) => {
    const res = await put(extraBody(name));

    expect(res.status).toBe(200);
    expect(db.extras).toHaveLength(1);
    const saved = db.extras[0]!;
    // The name decides nothing: no renaming, the same rule, the same columns.
    expect(saved.code).toBe(code);
    expect(saved.kind).toBe("amount");
    expect(saved.amount).toBe(1000);
    expect(saved.predicateBoundAsJson).toBe(true);
    expect(saved.predicate).toEqual({ kind: "manual" });
    expect(saved.quantitySource).toBeNull();
    // Its four names are saved under the same code.
    expect(db.labelCodes).toEqual([code]);
    // The quote never adds it by itself.
    expect(quoteLinesForStoredRows()).toEqual([]);
    // 26.2-p4 A2: with a price it is a tick box on /checkout, by its row alone.
    expect(await tickBoxesForStoredRows()).toEqual([[code, 1000]]);
  });

  it("the rule is stored as a JSON object; the old write stored a JSON string", () => {
    // The old write: `${JSON.stringify(rule)}::jsonb`. The driver serialises the text again.
    const oldWire = wireText(JSON.stringify({ kind: "always" }));
    expect(typeof JSON.parse(oldWire)).toBe("string");
    expect(JSON.parse(oldWire)).toBe("{\"kind\":\"always\"}");
    // The new write: the driver's JSON helper.
    const newWire = wireText(driver.json({ kind: "manual" }));
    expect(newWire).toBe("{\"kind\":\"manual\"}");
    expect(JSON.parse(newWire)).toEqual({ kind: "manual" });
  });

  it("saving an existing extra again rewrites its rule as the manual object", async () => {
    // The draft's copy of the live row: the rule is the JSON string the old write stored.
    db.extras = [
      {
        id: 501,
        version: 19,
        code: "child-seat",
        kind: "amount",
        amount: 1000,
        predicate: "{\"kind\":\"always\"}",
        predicateBoundAsJson: false,
        quantitySource: null,
      },
    ];

    const res = await put(extraBody("Child seat", 501));

    expect(res.status).toBe(200);
    expect(db.extras).toHaveLength(1);
    const saved = db.extras[0]!;
    expect(saved.code).toBe("child-seat");
    expect(saved.amount).toBe(1000);
    expect(saved.predicateBoundAsJson).toBe(true);
    expect(saved.predicate).toEqual({ kind: "manual" });
    expect(saved.quantitySource).toBeNull();
    expect(quoteLinesForStoredRows()).toEqual([]);
    expect(await tickBoxesForStoredRows()).toEqual([["child-seat", 1000]]);
  });
});
