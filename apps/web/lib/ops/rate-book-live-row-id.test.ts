// apps/web/lib/ops/rate-book-live-row-id.test.ts
//
// 26.2-bp B9: the pricing page shows the live price book when no draft exists
// (always the case right after Publish or Discard) and sends that book's row
// ids. The first write forks a draft whose rows have new ids. A write that
// names a live row id must land on that row's copy in the draft.
//
// The route runs for real; only the database is an in-memory stand-in that
// answers the statements the route sends.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Extra = { id: number; version: number; code: string; kind: string; amount: number | null };
type Version = {
  id: number;
  status: "live" | "draft";
  label: string;
  lock: number | null;
  vat: number | null;
};

const CLASS_ID = "11111111-1111-4111-8111-111111111111";

const db: { versions: Version[]; extras: Extra[] } = {
  versions: [],
  extras: [],
};

function seedLiveOnly() {
  db.versions = [{ id: 18, status: "live", label: "Book 18", lock: null, vat: null }];
  db.extras = [{ id: 401, version: 18, code: "vip-welcome", kind: "amount", amount: 1000 }];
}

/** What cloneRateVersionFrom does: a new draft, every row copied under a new id. */
function forkInto(source: number): number {
  const next = source + 1;
  const from = db.versions.find((v) => v.id === source);
  db.versions.push({
    id: next,
    status: "draft",
    label: `Book ${source} draft`,
    lock: from?.lock ?? null,
    vat: from?.vat ?? null,
  });
  db.extras.push(...db.extras.filter((r) => r.version === source).map((r) => ({ ...r, id: r.id + 100, version: next })));
  return next;
}

/** `select n.id ... join ... o where o.id = $1 and n.rate_version_id = $2`: the row itself, else its copy. */
function twin<T extends { id: number; version: number }>(
  rows: T[],
  same: (a: T, b: T) => boolean,
  values: unknown[],
): { id: number }[] {
  const origin = rows.find((r) => r.id === Number(values[0]));
  if (!origin) return [];
  const hits = rows
    .filter((r) => r.version === Number(values[1]) && same(r, origin))
    .sort((a, b) => Number(b.id === origin.id) - Number(a.id === origin.id) || a.id - b.id);
  return hits[0] ? [{ id: hits[0].id }] : [];
}

async function fakeTx(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> {
  const text = strings.join("?").replace(/\s+/g, " ").trim();
  const idAt = values.length - 2;
  const hit = <T extends { id: number; version: number }>(rows: T[]) =>
    rows.filter((r) => r.id === Number(values[idAt]) && r.version === Number(values[idAt + 1]));

  if (text.startsWith("select n.id from public.surcharges n")) {
    return twin(db.extras, (a, b) => a.code === b.code, values);
  }
  // The book settings writers: `update public.rate_versions set <col> = $1 where id = $2 and status = 'draft'`.
  if (text.startsWith("update public.rate_versions set quote_lock_minutes")) {
    for (const v of db.versions) {
      if (v.id === Number(values[1]) && v.status === "draft") v.lock = Number(values[0]);
    }
    return [];
  }
  if (text.startsWith("update public.rate_versions set vat_rate_bps")) {
    for (const v of db.versions) {
      if (v.id === Number(values[1]) && v.status === "draft") v.vat = Number(values[0]);
    }
    return [];
  }
  if (text.startsWith("update public.surcharges set")) {
    for (const row of hit(db.extras)) {
      row.code = String(values[0]);
      row.kind = String(values[1]);
      row.amount = values[2] == null ? null : Number(values[2]);
    }
    return [];
  }
  if (text.startsWith("delete from public.surcharges")) {
    const gone = new Set(hit(db.extras).map((r) => r.id));
    db.extras = db.extras.filter((r) => !gone.has(r.id));
    return [];
  }
  return [];
}

// 26.2-p4 A1: the extra write binds its rule through the driver's JSON helper (`tx.json`).
// This stand-in does not store the rule; rate-book-extra-rule.test.ts proves that part.
fakeTx.json = (value: unknown) => value;

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
    forkLiveRateVersion: async (_env: unknown, _claims: unknown, source: { id: number }) => forkInto(source.id),
    loadServiceZones: async () => [],
    loadRateBook: async (_env: unknown, _claims: unknown, versionId: number) => {
      const version = db.versions.find((v) => v.id === versionId);
      if (!version) return null;
      return {
        versionId,
        status: version.status,
        slug: `book-${versionId}`,
        label: version.label,
        vatRateBps: version.vat,
        quoteLockMinutes: version.lock,
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
          })),
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

async function del(kind: string, id: number): Promise<Response> {
  const { DELETE } = await import("@/app/[locale]/(ops)/api/staff/rate-book/route");
  return DELETE(
    new Request(`${URL_BASE}?kind=${kind}&id=${id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, id: String(id) }),
    }),
  );
}

/** What the pricing page sends when the owner changes the amount of an existing extra. */
function extraBody(id: number, chf: string): Record<string, unknown> {
  return {
    id: String(id),
    kind: "surcharge",
    type: "checkout_extra",
    rule: "leg",
    name: "VIP welcome",
    label: "VIP welcome",
    code: "vip-welcome",
    amounts: { CHF: chf, EUR: "", USD: "", AED: "" },
  };
}

describe("rate-book writes that name a row of the live book land on the draft's copy (26.2-bp B9)", () => {
  beforeEach(() => {
    seedLiveOnly();
  });

  it("PUT surcharge: the new amount is saved on the draft, the live row stays", async () => {
    const res = await put(extraBody(401, "25"));

    expect(res.status).toBe(200);
    const draft = db.extras.find((r) => r.version === 19);
    expect(draft?.amount).toBe(2500);
    expect(db.extras.find((r) => r.id === 401)?.amount).toBe(1000);
  });

  it("DELETE surcharge: the extra is gone from the draft, the live row stays", async () => {
    const res = await del("surcharge", 401);

    expect(res.status).toBe(200);
    expect(db.extras.filter((r) => r.version === 19)).toEqual([]);
    expect(db.extras.map((r) => r.id)).toEqual([401]);
  });

  it("a draft row id still writes that row and no other", async () => {
    forkInto(18);
    db.extras.push({ id: 502, version: 19, code: "pet", kind: "amount", amount: 500 });

    const res = await put(extraBody(501, "30"));

    expect(res.status).toBe(200);
    expect(db.extras.find((r) => r.id === 501)?.amount).toBe(3000);
    expect(db.extras.find((r) => r.id === 502)?.amount).toBe(500);
    expect(db.extras.find((r) => r.id === 401)?.amount).toBe(1000);
  });
});

/** The rate_versions stand-in row with this id. */
const book = (id: number) => db.versions.find((v) => v.id === id);

describe("price-valid hours: PUT kind rule, ruleKind quote_lock (decision 2026-10-13 item 13)", () => {
  beforeEach(() => {
    seedLiveOnly();
  });

  it("whole hours land on the draft as minutes; the live book stays; the answer carries the hours", async () => {
    const res = await put({ kind: "rule", ruleKind: "quote_lock", quoteLockHours: 48 });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: { quoteLockHours: string } };
    expect(json.ok).toBe(true);
    expect(json.data.quoteLockHours).toBe("48");
    expect(book(19)?.status).toBe("draft");
    expect(book(19)?.lock).toBe(2880);
    expect(book(18)?.lock).toBeNull();
  });

  it("a digit string is accepted (the dashboard field is text)", async () => {
    const res = await put({ kind: "rule", ruleKind: "quote_lock", quoteLockHours: "36" });
    expect(res.status).toBe(200);
    expect(book(19)?.lock).toBe(2160);
  });

  it.each([0, -1, "", "x", 1.5, "1.5", null, 35791395, true])(
    "refuses %j with 400, forks no draft and changes nothing",
    async (hours) => {
      const res = await put({ kind: "rule", ruleKind: "quote_lock", quoteLockHours: hours });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { code: string }).code).toBe("invalid");
      expect(db.versions.map((v) => v.id)).toEqual([18]);
      expect(book(18)?.lock).toBeNull();
    },
  );

  it("the largest value the integer column holds is accepted", async () => {
    const res = await put({ kind: "rule", ruleKind: "quote_lock", quoteLockHours: 35791394 });
    expect(res.status).toBe(200);
    expect(book(19)?.lock).toBe(35791394 * 60);
  });

  it("an existing draft is written, not forked again", async () => {
    forkInto(18);
    const res = await put({ kind: "rule", ruleKind: "quote_lock", quoteLockHours: 12 });
    expect(res.status).toBe(200);
    expect(db.versions.map((v) => v.id)).toEqual([18, 19]);
    expect(book(19)?.lock).toBe(720);
  });

  it.each(["waiting", "free_wait", "service_area", "city_pair", "lock", "night", ""])(
    "ruleKind %j is refused with 400",
    async (ruleKind) => {
      const res = await put({ kind: "rule", ruleKind, quoteLockHours: 48 });
      expect(res.status).toBe(400);
      expect(db.versions.map((v) => v.id)).toEqual([18]);
    },
  );

  it("ruleKind vat still writes vat_rate_bps on the draft", async () => {
    const res = await put({ kind: "rule", ruleKind: "vat", vat_rate_bps: 81 });
    expect(res.status).toBe(200);
    expect(book(19)?.vat).toBe(81);
    expect(book(19)?.lock).toBeNull();
  });

  it("another kind carrying quoteLockHours no longer touches the minutes", async () => {
    const res = await put({ ...extraBody(401, "25"), quoteLockHours: 99 });
    expect(res.status).toBe(200);
    expect(book(19)?.lock).toBeNull();
    expect(book(18)?.lock).toBeNull();
  });

  it("GET-shaped answer: a book with no minutes shows the 24-hour default", async () => {
    const res = await put({ kind: "rule", ruleKind: "vat", vat_rate_bps: 81 });
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data.quoteLockHours).toBe("24");
    expect(json.data).not.toHaveProperty("bands");
    expect(json.data).not.toHaveProperty("regionPremiums");
    expect(json.data).not.toHaveProperty("rules");
  });

  it("kind band is refused on PUT and DELETE; kind rule has nothing to DELETE", async () => {
    const putBand = await put({ kind: "band", vehicleClassId: CLASS_ID, fromKm: 0, perKm: { CHF: "1" } });
    expect(putBand.status).toBe(400);
    expect((await del("band", 701)).status).toBe(400);
    expect((await del("rule", 801)).status).toBe(400);
    expect(db.versions.map((v) => v.id)).toEqual([18]);
  });
});
