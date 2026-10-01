// 27.1 (27 D-37): the finish step's server side and where a must-finish account lands.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/identity", () => ({ asSystem: vi.fn() }));
vi.mock("../db/system-reads", () => ({ readAccountFinishRequired: vi.fn() }));

const { finishAccount, NOT_SIGNED_IN, FINISH_INVALID } = await import("./account-finish");
const { finishTarget, mustFinish } = await import("./finish-target");
const reads = await import("../db/system-reads");
const { CONSENT_REQUIRED, SIGNUP_UNAVAILABLE } = await import("./signup-agreement");
const { signUpPasswordSchema, signUpMagicSchema, finishAccountSchema } = await import("./schemas");

function deps(over: Partial<Parameters<typeof finishAccount>[0]> = {}) {
  const calls: string[] = [];
  const d = {
    getUser: vi.fn(async () => ({ id: "user-1", email: "mia@example.test" })),
    finishRequired: vi.fn(async () => true),
    record: vi.fn(async (email: string) => {
      calls.push(`record:${email}`);
      return true;
    }),
    updateProfile: vi.fn(async (data: Record<string, string>) => {
      calls.push(`profile:${JSON.stringify(data)}`);
      return null;
    }),
    ...over,
  };
  return { d, calls };
}

const body = { firstName: " Mia ", lastName: "Keller", consent: true };

describe("finishAccount", () => {
  it("records the tick for the session's own e-mail first, then saves the names", async () => {
    const { d, calls } = deps();
    const out = await finishAccount(d, { ...body, phone: "+41 79 000 00 00" });
    expect(out).toEqual({ result: { ok: true }, reason: null });
    expect(calls).toEqual([
      "record:mia@example.test",
      `profile:${JSON.stringify({ first_name: "Mia", last_name: "Keller", full_name: "Mia Keller", phone: "+41 79 000 00 00" })}`,
    ]);
  });

  it("never takes an e-mail from the client", async () => {
    const { d } = deps();
    const out = await finishAccount(d, { ...body, email: "someone@else.test" });
    expect(out.result).toEqual(FINISH_INVALID);
    expect(d.record).not.toHaveBeenCalled();
  });

  it("refuses without the tick before reading anything", async () => {
    const { d } = deps();
    for (const consent of [false, "true", 1, undefined]) {
      expect((await finishAccount(d, { ...body, consent })).result).toEqual(CONSENT_REQUIRED);
    }
    expect(d.getUser).not.toHaveBeenCalled();
    expect(d.record).not.toHaveBeenCalled();
    expect(d.updateProfile).not.toHaveBeenCalled();
  });

  it("checks names and the optional phone", async () => {
    const { d } = deps();
    expect((await finishAccount(d, { ...body, firstName: " " })).result).toEqual(FINISH_INVALID);
    expect((await finishAccount(d, { ...body, lastName: "x".repeat(81) })).result).toEqual(FINISH_INVALID);
    expect((await finishAccount(d, { ...body, phone: "079" })).result).toEqual(FINISH_INVALID);
    expect((await finishAccount(d, { ...body, phone: "+41 79 000 00 00 00 00 00 00 00 00 00" })).result).toEqual(FINISH_INVALID);
    expect(d.record).not.toHaveBeenCalled();
  });

  it("answers no-user when nobody is signed in", async () => {
    const { d } = deps({ getUser: vi.fn(async () => null) });
    expect((await finishAccount(d, body)).result).toEqual(NOT_SIGNED_IN);
    expect(d.record).not.toHaveBeenCalled();
  });

  it("writes nothing for an account that no longer has to finish (second press)", async () => {
    const { d } = deps({ finishRequired: vi.fn(async () => false) });
    expect(await finishAccount(d, body)).toEqual({ result: { ok: true }, reason: null });
    expect(d.record).not.toHaveBeenCalled();
    expect(d.updateProfile).not.toHaveBeenCalled();
  });

  it("writes no profile when the record could not be stored", async () => {
    const { d } = deps({ record: vi.fn(async () => false) });
    expect(await finishAccount(d, body)).toEqual({ result: SIGNUP_UNAVAILABLE, reason: "record-failed" });
    expect(d.updateProfile).not.toHaveBeenCalled();
  });

  it("leaves the phone out when none was given", async () => {
    const { d } = deps();
    await finishAccount(d, body);
    expect(d.updateProfile).toHaveBeenCalledWith({ first_name: "Mia", last_name: "Keller", full_name: "Mia Keller" });
  });
});

describe("finishTarget", () => {
  it("is the localized finish step", () => {
    expect(finishTarget("en", "/account")).toBe("/sign-up?state=finish");
    expect(finishTarget("de", "/de/account")).toBe("/de/sign-up?state=finish");
    expect(finishTarget("xx", null)).toBe("/sign-up?state=finish");
  });

  it("carries a checkout target as returnTo, nothing else", () => {
    const co = "/fr/checkout?from=Zurich%20Airport&class=business";
    const out = new URL(finishTarget("fr", co), "https://vamostaxi.site");
    expect(out.pathname).toBe("/fr/sign-up");
    expect(out.searchParams.get("state")).toBe("finish");
    expect(out.searchParams.get("returnTo")).toBe(co);
    expect(new URL(finishTarget("en", "//evil.test/checkout"), "https://vamostaxi.site").searchParams.has("returnTo")).toBe(false);
  });
});

describe("mustFinish", () => {
  const ctx = { requestId: "r", route: "/t", locale: null };
  it("passes the reader's answer through", async () => {
    vi.mocked(reads.readAccountFinishRequired).mockResolvedValueOnce(true);
    expect(await mustFinish({} as CloudflareEnv, "u", ctx)).toBe(true);
  });
  it("answers false when the read fails, so nobody is locked out", async () => {
    vi.mocked(reads.readAccountFinishRequired).mockRejectedValueOnce(new Error("down"));
    expect(await mustFinish({} as CloudflareEnv, "u", ctx)).toBe(false);
  });
});

describe("sign-up schemas take the optional phone", () => {
  const base = { mode: "signup", email: "a@b.co", firstName: "A", lastName: "B", consent: true } as const;
  it("password and link sign-up accept a dialable number or none", () => {
    expect(signUpPasswordSchema.safeParse({ ...base, method: "password", password: "12345678", phone: "+41790000000" }).success).toBe(true);
    expect(signUpMagicSchema.safeParse({ ...base, method: "magic", phone: "+41 79 000 00 00" }).success).toBe(true);
    expect(signUpMagicSchema.safeParse({ ...base, method: "magic" }).success).toBe(true);
  });
  it("refuse a number that is too short", () => {
    expect(signUpMagicSchema.safeParse({ ...base, method: "magic", phone: "079" }).success).toBe(false);
    expect(finishAccountSchema.safeParse({ firstName: "A", lastName: "B", consent: true, phone: "12" }).success).toBe(false);
  });
});
