// Quick 261002 (B5 follow-up 1): the three doors that bring a mobile number to the customer row,
// through the real route handlers with Supabase and the database replaced by recorders:
//  - POST /api/auth update-profile {phone}   (account page)     -> replace the row's number
//  - POST /api/auth verify-code              (sign-up code)     -> fill a blank number from the sign-up metadata
//  - POST /api/auth/callback                 (confirm button)   -> the same
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; user_metadata: Record<string, unknown> },
  updateUser: null as unknown as ReturnType<typeof vi.fn<(...a: any[]) => any>>,
  statements: [] as { text: string; values: unknown[]; claims: unknown }[],
  dbFails: false,
  row: "22222222-2222-4222-8222-222222222222",
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) } } }),
}));
vi.mock("@/lib/db/identity", () => ({
  // public.customer_id_for_user: the customer's live row (an erased row answers null).
  asCheckout: async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
    if (state.dbFails) throw new Error("db down");
    return fn(() => Promise.resolve([{ id: state.row }]));
  },
  asCustomer: async (_env: unknown, claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
    if (state.dbFails) throw new Error("db down");
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      state.statements.push({ text: strings.join("?").replace(/\s+/g, " ").trim(), values, claims });
      return Promise.resolve([{ id: "row" }]);
    };
    return fn(sql);
  },
  asSystem: async () => [],
}));
// The finish step is not under test here: no account has to finish.
vi.mock("@/lib/auth/finish-target", () => ({
  mustFinish: async () => false,
  finishRequiredStrict: async () => false,
  markFinished: async () => true,
  markFinishPending: async () => undefined,
  finishTarget: (_l: string, t: string | null) => t ?? "/account",
}));
vi.mock("@/lib/auth/sealed-address", () => ({
  openAddress: async () => "mia@example.test",
  sealSecretFrom: () => "secret",
}));
vi.mock("@/lib/supabase/server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/server")>("@/lib/supabase/server");
  return {
    ...actual,
    createServerSupabaseClient: async () => ({
      auth: {
        getUser: async () => ({ data: { user: state.user }, error: null }),
        verifyOtp: async () => ({ data: { user: state.user, session: { access_token: "t" } }, error: null }),
        updateUser: (...a: unknown[]) => state.updateUser(...a),
        signOut: async () => ({ error: null }),
      },
    }),
  };
});

import { POST as authPost } from "./route";
import { POST as callbackPost } from "./callback/route";

const MIA = { id: "11111111-1111-4111-8111-111111111111", email: "mia@example.test" };

function post(path: string, body: Record<string, unknown>): Promise<Response> {
  const host = "vamostaxi.site";
  const request = new Request(`https://${host}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: `https://${host}`, "cf-connecting-ip": "1.2.3.4" },
    body: JSON.stringify(body),
  });
  return path === "/api/auth/callback" ? callbackPost(request) : authPost(request);
}

beforeEach(() => {
  state.user = { ...MIA, user_metadata: { full_name: "Mia Keller", phone: "+41790000001" } };
  state.updateUser = vi.fn(async () => ({ error: null }));
  state.statements.length = 0;
  state.dbFails = false;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("account page: update-profile {phone}", () => {
  it("saves the number in the auth profile and replaces it on the customer row", async () => {
    const res = await post("/api/auth", { action: "update-profile", locale: "en", phone: "+41 79 626 70 82" });
    expect(await res.json()).toEqual({ ok: true });
    expect(state.updateUser).toHaveBeenCalledWith({ data: { phone: "+41 79 626 70 82" } });
    expect(state.statements).toHaveLength(1);
    expect(state.statements[0]!.text).toBe("update public.customers set phone = ? where id = ?::uuid and user_id = ?::uuid returning id");
    expect(state.statements[0]!.values).toEqual(["+41 79 626 70 82", state.row, MIA.id]);
    expect(state.statements[0]!.claims).toEqual({ sub: MIA.id, role: "authenticated", email: MIA.email });
  });

  it("a name change touches the auth profile only", async () => {
    const res = await post("/api/auth", { action: "update-profile", locale: "en", firstName: "Mia", lastName: "Keller" });
    expect(await res.json()).toEqual({ ok: true });
    expect(state.statements).toHaveLength(0);
  });

  it("when the customer row cannot be written the page is told, so the person tries again", async () => {
    state.dbFails = true;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const res = await post("/api/auth", { action: "update-profile", locale: "en", phone: "+41 79 626 70 82" });
    expect(await res.json()).toEqual({ ok: false, reason: "throw" });
  });
});

describe("sign-up code (verify-code)", () => {
  it("fills a blank customer number from the number given at sign-up, only then", async () => {
    const res = await post("/api/auth", { locale: "en", mode: "verify-code", email: MIA.email, code: "123456" });
    expect(await res.json()).toEqual({ ok: true });
    expect(state.statements).toHaveLength(1);
    expect(state.statements[0]!.text).toBe("update public.customers set phone = ? where id = ?::uuid and user_id = ?::uuid and phone = '' returning id");
    expect(state.statements[0]!.values).toEqual(["+41790000001", state.row, MIA.id]);
  });

  it("a sign-up without a number writes nothing, and a database failure never blocks the sign-in", async () => {
    state.user = { ...MIA, user_metadata: { full_name: "Mia Keller" } };
    await post("/api/auth", { locale: "en", mode: "verify-code", email: MIA.email, code: "123456" });
    expect(state.statements).toHaveLength(0);

    state.user = { ...MIA, user_metadata: { phone: "+41790000001" } };
    state.dbFails = true;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const res = await post("/api/auth", { locale: "en", mode: "verify-code", email: MIA.email, code: "123456" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("confirm button (callback POST)", () => {
  const body = { token_hash: "hash", type: "signup", e: "sealed", next: "/account" };

  it("fills a blank customer number from the number given at sign-up", async () => {
    const res = await post("/api/auth/callback", body);
    expect(await res.json()).toEqual({ ok: true, target: "/account" });
    expect(state.statements).toHaveLength(1);
    expect(state.statements[0]!.text).toContain("and phone = ''");
    expect(state.statements[0]!.values).toEqual(["+41790000001", state.row, MIA.id]);
  });

  it("a database failure never blocks the sign-in", async () => {
    state.dbFails = true;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const res = await post("/api/auth/callback", body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, target: "/account" });
  });
});
