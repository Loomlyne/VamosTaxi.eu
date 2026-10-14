// apps/web/lib/ops/reply-translate.test.ts
//
// Phase 32 plan 07 (D-07, D-08, T-32-28/29): POST /api/staff/tickets/:id/reply-translate translates his
// reply into the customer's language, en/de/fr/ar only, and returns text; it never sends anything and
// stores nothing. The real withStaff runs (session, CSRF origin, active staff row are stand-ins); the
// real translator runs against a stub model binding, so no test reaches the network.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gemmaReply, stubAi, type StubAi } from "../translate/ai-stub";

const asStaff = vi.fn();
const requireAdminClaims = vi.fn();
const staffRowActive = vi.fn();
let ai: StubAi | undefined;

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { AI: ai } }),
}));
vi.mock("@/lib/db/identity", () => ({ asStaff: (...args: unknown[]) => asStaff(...args) }));
vi.mock("./session", async () => {
  const actual = await vi.importActual<typeof import("./session")>("./session");
  return {
    ...actual,
    requireAdminClaims: (...args: unknown[]) => requireAdminClaims(...args),
    requireStaffClaims: (...args: unknown[]) => requireAdminClaims(...args),
  };
});
vi.mock("../supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("./staff-active", () => ({ staffRowActive: (...args: unknown[]) => staffRowActive(...args) }));

const { OpsAuthError } = await import("./session");
const { POST } = await import("../../app/[locale]/(ops)/api/staff/tickets/[id]/reply-translate/route");
const mount = await import("../../app/api/staff/tickets/[id]/reply-translate/route");

const TICKET = "66666666-6666-4666-8666-666666666666";
const REPLY = "We will be there at 8.";
const DE = "Wir sind um 8 Uhr da.";
const ORIGIN = "https://dashboard.vamostaxi.site";

function call(body: unknown, opts: { id?: string; origin?: string | null; raw?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const origin = opts.origin === undefined ? ORIGIN : opts.origin;
  if (origin) headers.origin = origin;
  const request = new Request(`${ORIGIN}/api/staff/tickets/${opts.id ?? TICKET}/reply-translate`, {
    method: "POST",
    headers,
    body: opts.raw ?? JSON.stringify(body),
  });
  return (POST as unknown as (r: Request) => Promise<Response>)(request);
}

const consoleLines: string[] = [];

beforeEach(() => {
  asStaff.mockReset();
  requireAdminClaims.mockReset();
  staffRowActive.mockReset();
  requireAdminClaims.mockResolvedValue({ sub: "11111111-1111-4111-8111-111111111111", role: "authenticated", aal: "aal2" });
  staffRowActive.mockResolvedValue(true);
  asStaff.mockImplementation(async (_env: unknown, _claims: unknown, fn: (sql: unknown) => unknown) =>
    fn(async (_s: TemplateStringsArray, ...values: unknown[]) => (values[0] === TICKET ? [{ id: TICKET }] : [])),
  );
  ai = stubAi(() => gemmaReply({ de: DE }));
  consoleLines.length = 0;
  for (const m of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      consoleLines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function data(res: Response): Promise<Record<string, unknown>> {
  const json = (await res.json()) as { ok: boolean; data?: Record<string, unknown>; code?: string };
  return json.ok ? (json.data ?? {}) : { code: json.code };
}

describe("POST /api/staff/tickets/:id/reply-translate", () => {
  it("translates his reply into the customer's language: ready with the German text", async () => {
    const res = await call({ text: REPLY, lang: "de", from: "en" });
    expect(res.status).toBe(200);
    expect(await data(res)).toEqual({ status: "ready", text: DE });
    expect(ai?.calls).toHaveLength(1);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("without `from`, detects his language and translates", async () => {
    ai = stubAi(() => gemmaReply({ lang: "en", de: DE }));
    const res = await call({ text: REPLY, lang: "de" });
    expect(await data(res)).toEqual({ status: "ready", text: DE });
  });

  it("without `from`, his text already in the customer's language: skipped", async () => {
    ai = stubAi(() => gemmaReply({ lang: "de", de: DE }));
    const res = await call({ text: DE, lang: "de" });
    expect(await data(res)).toEqual({ status: "skipped" });
  });

  it.each(["it", "es", "", "xx", "DE"])("customer language %j outside the four: skipped, no model call", async (lang) => {
    const res = await call({ text: REPLY, lang, from: "en" });
    expect(res.status).toBe(200);
    expect(await data(res)).toEqual({ status: "skipped" });
    expect(ai?.calls).toHaveLength(0);
  });

  it("a missing or non-string lang: skipped, no model call", async () => {
    expect(await data(await call({ text: REPLY, from: "en" }))).toEqual({ status: "skipped" });
    expect(await data(await call({ text: REPLY, lang: 7, from: "en" }))).toEqual({ status: "skipped" });
    expect(ai?.calls).toHaveLength(0);
  });

  it("from equal to lang: skipped, no model call", async () => {
    const res = await call({ text: REPLY, lang: "fr", from: "fr" });
    expect(await data(res)).toEqual({ status: "skipped" });
    expect(ai?.calls).toHaveLength(0);
  });

  it("engine failure: failed, never an empty text", async () => {
    ai = stubAi(() => {
      throw new Error("model down");
    });
    const res = await call({ text: REPLY, lang: "de", from: "en" });
    expect(res.status).toBe(200);
    const d = await data(res);
    expect(d).toEqual({ status: "failed" });
    expect(d).not.toHaveProperty("text");
  });

  it("target rejected by the guard (untranslated echo): failed", async () => {
    ai = stubAi(() => gemmaReply({ de: REPLY }));
    expect(await data(await call({ text: REPLY, lang: "de", from: "en" }))).toEqual({ status: "failed" });
  });

  it("no model binding: failed", async () => {
    ai = undefined;
    expect(await data(await call({ text: REPLY, lang: "de", from: "en" }))).toEqual({ status: "failed" });
  });

  it("unknown or foreign ticket id: 404 not-found, no model call", async () => {
    const res = await call({ text: REPLY, lang: "de", from: "en" }, { id: "77777777-7777-4777-8777-777777777777" });
    expect(res.status).toBe(404);
    expect(await data(res)).toEqual({ code: "not-found" });
    expect(ai?.calls).toHaveLength(0);
  });

  it("a malformed ticket id: 404 not-found with no database call", async () => {
    const res = await call({ text: REPLY, lang: "de", from: "en" }, { id: "not-a-uuid" });
    expect(res.status).toBe(404);
    expect(asStaff).not.toHaveBeenCalled();
  });

  it("a database fault while checking the ticket: 503, no model call", async () => {
    asStaff.mockRejectedValue(new Error("db down"));
    const res = await call({ text: REPLY, lang: "de", from: "en" });
    expect(res.status).toBe(503);
    expect(ai?.calls).toHaveLength(0);
  });

  it.each([
    ["empty", ""],
    ["blank", "   \n "],
    ["over 4000 chars", "a".repeat(4001)],
    ["not a string", 42],
  ])("text %s: 400 invalid-text", async (_name, text) => {
    const res = await call({ text, lang: "de", from: "en" });
    expect(res.status).toBe(400);
    expect(await data(res)).toEqual({ code: "invalid-text" });
    expect(ai?.calls).toHaveLength(0);
  });

  it("exactly 4000 chars is accepted", async () => {
    ai = stubAi(() => gemmaReply({ de: "Wir sind da. ".repeat(300).trim() }));
    const res = await call({ text: "We are here. ".repeat(307).slice(0, 4000), lang: "de", from: "en" });
    expect(res.status).toBe(200);
  });

  it.each([
    ["broken JSON", "{nope"],
    ["an array", "[]"],
    ["null", "null"],
  ])("%s: 400 invalid-json", async (_name, raw) => {
    const res = await call(null, { raw });
    expect(res.status).toBe(400);
    expect(await data(res)).toEqual({ code: "invalid-json" });
  });

  it("no staff session: refused by withStaff (401 no-session), no model call", async () => {
    requireAdminClaims.mockRejectedValue(new OpsAuthError("no-session"));
    const res = await call({ text: REPLY, lang: "de", from: "en" });
    expect(res.status).toBe(401);
    expect(await data(res)).toEqual({ code: "no-session" });
    expect(ai?.calls).toHaveLength(0);
  });

  it("a cross-origin or origin-less POST: refused by withStaff (403 csrf)", async () => {
    for (const origin of ["https://evil.example", null]) {
      const res = await call({ text: REPLY, lang: "de", from: "en" }, { origin });
      expect(res.status).toBe(403);
      expect(await data(res)).toEqual({ code: "csrf" });
    }
    expect(ai?.calls).toHaveLength(0);
  });

  it("logs never carry his text; the answer names no vendor or model", async () => {
    ai = stubAi(() => {
      throw new Error("model down");
    });
    await call({ text: REPLY, lang: "de", from: "en" });
    ai = stubAi(() => gemmaReply({ de: DE }));
    const ok = await call({ text: REPLY, lang: "de", from: "en" });
    const bodyText = JSON.stringify(await ok.json());
    for (const line of consoleLines) expect(line).not.toContain(REPLY);
    expect(bodyText).not.toContain(REPLY);
    expect(bodyText).not.toMatch(/gemma|workers ai|cloudflare|model|@cf\//i);
  });

  it("the dual mount re-exports the same POST and is force-dynamic", () => {
    expect(mount.POST).toBe(POST);
    expect(mount.dynamic).toBe("force-dynamic");
  });
});
