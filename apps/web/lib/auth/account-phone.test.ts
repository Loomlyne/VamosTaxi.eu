// Quick 261002 (B5 follow-up 1): the number from sign-up / finish / the account page reaches the
// customer row, which is what the dashboard Customers list and checkout read.
import { afterEach, describe, expect, it, vi } from "vitest";

type Call = { text: string; values: unknown[]; claims: unknown };
const calls: Call[] = [];
let rowsChanged = 1;
let dbFails = false;

vi.mock("../db/identity", () => ({
  // The real asCustomer opens a database connection; here it runs the statement against a recorder.
  asCustomer: vi.fn(async (_env: unknown, claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
    if (dbFails) throw new Error("db down");
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join("?").replace(/\s+/g, " ").trim(), values, claims });
      return Promise.resolve(Array.from({ length: rowsChanged }, (_, i) => ({ id: `row-${i}` })));
    };
    return fn(sql);
  }),
}));

const { cleanAccountPhone, writeOwnCustomerPhone, storeProfilePhone, syncSignupPhone } = await import("./account-phone");
const { runUpdateProfile } = await import("./run");

const env = {} as CloudflareEnv;
const ctx = { requestId: "r", route: "/api/auth", locale: "en" };
const USER = { id: "11111111-1111-4111-8111-111111111111", email: "mia@example.test" };

afterEach(() => {
  calls.length = 0;
  rowsChanged = 1;
  dbFails = false;
  vi.restoreAllMocks();
});

describe("cleanAccountPhone", () => {
  it("keeps a number with at least 9 digits and at most 32 characters, trimmed", () => {
    expect(cleanAccountPhone(" +41 79 626 70 82 ")).toBe("+41 79 626 70 82");
    expect(cleanAccountPhone("+41796267082")).toBe("+41796267082");
  });
  it("refuses anything else", () => {
    for (const bad of ["", "   ", "12345678", "abc", "+".repeat(33), `+${"1".repeat(32)}`, null, undefined, 4179626, {}, ["+41796267082"]]) {
      expect(cleanAccountPhone(bad)).toBeNull();
    }
  });
});

describe("writeOwnCustomerPhone", () => {
  it("replace: writes the signed-in customer's own row as that customer, nothing else", async () => {
    expect(await writeOwnCustomerPhone(env, USER, "+41796267082", "replace")).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.claims).toEqual({ sub: USER.id, role: "authenticated", email: USER.email });
    expect(calls[0]!.text).toBe("update public.customers set phone = ? where user_id = ?::uuid returning id");
    expect(calls[0]!.values).toEqual(["+41796267082", USER.id]);
  });

  it("if-empty: only fills a blank phone", async () => {
    await writeOwnCustomerPhone(env, USER, "+41796267082", "if-empty");
    expect(calls[0]!.text).toBe("update public.customers set phone = ? where user_id = ?::uuid and phone = '' returning id");
  });

  it("reports 0 when no row changed", async () => {
    rowsChanged = 0;
    expect(await writeOwnCustomerPhone(env, { id: USER.id }, "+41796267082", "replace")).toBe(0);
    expect(calls[0]!.claims).toEqual({ sub: USER.id, role: "authenticated" });
  });
});

describe("storeProfilePhone (account page)", () => {
  it("replaces the number on the customer row", async () => {
    await storeProfilePhone(env, USER, "+41796267082", ctx);
    expect(calls[0]!.text).not.toContain("phone = ''");
  });

  it("a missing customer row is logged, not an error", async () => {
    rowsChanged = 0;
    const out = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(storeProfilePhone(env, USER, "+41796267082", ctx)).resolves.toBeUndefined();
    expect(String(out.mock.calls[0]?.[0])).toContain("phone-no-customer-row");
  });

  it("a database failure throws, so the page says it could not save", async () => {
    dbFails = true;
    await expect(storeProfilePhone(env, USER, "+41796267082", ctx)).rejects.toThrow("db down");
  });
});

describe("syncSignupPhone (first confirmed session)", () => {
  it("copies the sign-up number from the auth metadata when the row has none", async () => {
    await syncSignupPhone(env, { ...USER, user_metadata: { full_name: "Mia Keller", phone: "+41790000000" } }, ctx);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.text).toContain("and phone = ''");
    expect(calls[0]!.values).toEqual(["+41790000000", USER.id]);
  });

  it("does nothing, and asks the database nothing, without a usable number", async () => {
    for (const user_metadata of [undefined, null, {}, { phone: "" }, { phone: "123" }, { phone: 4179 }, [], "x"]) {
      await syncSignupPhone(env, { ...USER, user_metadata }, ctx);
    }
    expect(calls).toHaveLength(0);
  });

  it("never blocks the sign-in: a database failure is logged by reason only", async () => {
    dbFails = true;
    const out = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(syncSignupPhone(env, { ...USER, user_metadata: { phone: "+41790000000" } }, ctx)).resolves.toBeUndefined();
    const line = String(out.mock.calls[0]?.[0]);
    expect(line).toContain("phone-sync-failed");
    expect(line).not.toContain("41790000000");
    expect(line).not.toContain("mia@example.test");
  });
});

describe("runUpdateProfile hands the saved number to the customer row", () => {
  const sb = (updateUser = vi.fn(async () => ({ error: null as { code?: string } | null }))) =>
    ({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: USER.id, email: USER.email } }, error: null })),
        updateUser,
      },
    }) as unknown as Parameters<typeof runUpdateProfile>[0];

  it("calls storePhone with the user and the number after the metadata is saved", async () => {
    const storePhone = vi.fn(async () => undefined);
    const out = await runUpdateProfile(sb(), { phone: "+41 79 626 70 82" }, { storePhone });
    expect(out).toEqual({ result: { ok: true }, reason: null });
    expect(storePhone).toHaveBeenCalledWith({ id: USER.id, email: USER.email }, "+41 79 626 70 82");
  });

  it("is not called for a name or e-mail change, nor when the metadata write failed", async () => {
    const storePhone = vi.fn(async () => undefined);
    await runUpdateProfile(sb(), { firstName: "Mia", lastName: "Keller" }, { storePhone });
    await runUpdateProfile(sb(), { email: "mia@example.test" }, { storePhone });
    await runUpdateProfile(sb(vi.fn(async () => ({ error: { code: "x" } }))), { phone: "+41 79 626 70 82" }, { storePhone });
    expect(storePhone).not.toHaveBeenCalled();
  });

  it("a failing customer-row write answers not-ok, so the page asks again", async () => {
    const storePhone = vi.fn(async () => {
      throw new Error("db down");
    });
    const out = await runUpdateProfile(sb(), { phone: "+41 79 626 70 82" }, { storePhone });
    expect(out).toEqual({ result: { ok: false, reason: "throw" }, reason: "throw" });
  });
});
