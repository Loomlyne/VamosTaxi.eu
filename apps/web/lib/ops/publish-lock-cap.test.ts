// Quick 261015-6om (PR #85 review, Low 1): Publish re-applies the owner's 24-hour cap on "Price stays
// valid for" (signed 2026-10-15). A draft holding more than 1440 minutes is refused with 409
// `lock-over-cap` before any write; the ops Pricing screen shows the field's own line in four languages.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const statements: string[] = [];
let draftMinutes: number | null = 1500;
const notified = { count: 0 };

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: {} }) }));
vi.mock("@/lib/ops/staff-json", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ops/staff-json")>();
  return {
    ...real,
    withAdmin: (handler: (claims: { sub: string }) => Promise<Response>) => () => handler({ sub: "admin-1" }),
  };
});
vi.mock("@/lib/ops/pricing", () => ({ loadCompleteness: async () => [] }));
vi.mock("@/lib/checkout/lock-mail", () => ({
  notifyPriceChangedForUnpaid: async () => {
    notified.count += 1;
  },
}));
vi.mock("@/lib/ops/class-photo-sweep", () => ({ removeUnusedClassPhotos: async () => undefined }));
vi.mock("@/lib/ops/rate-book", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ops/rate-book")>();
  return { ...real, pruneExtraLabels: async () => undefined };
});
vi.mock("@/lib/db/identity", () => ({
  asStaff: async (_env: unknown, _claims: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = Object.assign(
      async (strings: TemplateStringsArray) => {
        const text = strings.join("?").replace(/\s+/g, " ").trim();
        statements.push(text);
        if (/^select id, label, status/.test(text)) {
          return [
            { id: 23, label: "Book draft", status: "draft", vat_rate_bps: null, quote_lock_minutes: draftMinutes, service_area_geojson: null },
          ];
        }
        return [];
      },
      { json: (v: unknown) => v },
    );
    return fn(tx);
  },
}));

async function publish(): Promise<{ status: number; body: { ok: boolean; code?: string } }> {
  const { POST } = await import("@/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route");
  const res = await POST(new Request("https://dashboard.localhost/api/staff/rate-versions/23/publish", { method: "POST" }), {
    params: Promise.resolve({ id: "23" }),
  });
  return { status: res.status, body: (await res.json()) as { ok: boolean; code?: string } };
}

describe("Publish re-applies the 24-hour cap (Low 1)", () => {
  beforeEach(() => {
    statements.length = 0;
    notified.count = 0;
  });

  it("refuses a draft above 1440 minutes with 409 lock-over-cap and writes nothing", async () => {
    draftMinutes = 1441;
    const { status, body } = await publish();
    expect(status).toBe(409);
    expect(body).toMatchObject({ ok: false, code: "lock-over-cap" });
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/^select id, label, status/);
    expect(statements.some((s) => /^(update|insert|delete)\b/i.test(s))).toBe(false);
    expect(notified.count).toBe(0);
  });

  it("publishes a draft at exactly 1440 minutes", async () => {
    draftMinutes = 1440;
    const { status, body } = await publish();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(statements.some((s) => /update public\.rate_versions set status = 'live'/.test(s))).toBe(true);
    expect(statements.some((s) => /insert into public\.settings_versions/.test(s))).toBe(true);
  });

  it("the Pricing screen names lock-over-cap with the field's own line in four languages", () => {
    const html = readFileSync(join(here, "../../../../app/ops/OpsPricing.dc.html"), "utf8");
    const caps = [...html.matchAll(/lockMaxError:'([^']+)'/g)].map((m) => m[1]);
    const mapped = [...html.matchAll(/'lock-over-cap':'([^']+)'/g)].map((m) => m[1]);
    expect(caps).toEqual(["Use 24 hours or less.", "Gib 24 Stunden oder weniger ein.", "Saisissez 24 heures ou moins.", "أدخل 24 ساعة أو أقل."]);
    expect(mapped).toEqual(caps);
  });
});
