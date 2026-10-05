// Security S5 review (2026-10-05, controller decision): forgot-password on the dashboard host asks the visitor for no
// check, so a recovery link is mailed to an ACTIVE staff row only. Any other address gets the same neutral "sent" and
// nothing is mailed: Supabase is called with an address no account can have, so the answer, the verifier cookie and
// the work done are those of any unknown address. The public host and the dashboard's sign-in are unchanged.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authPost, resetHarness, state, writeCookies } from "./harness";

const staff = vi.hoisted(() => ({ asked: [] as string[], answer: (async () => true) as (email: string) => Promise<boolean> }));

vi.mock("@opennextjs/cloudflare", async () => (await import("./harness")).cloudflareMock);
vi.mock("next/headers", async () => (await import("./harness")).headersMock);
vi.mock("@supabase/ssr", async () => (await import("./harness")).ssrMock);
vi.mock("@/lib/turnstile", async () => (await import("./harness")).turnstileMock);
vi.mock("@/lib/db/identity", () => ({
  asSystem: async (_env: unknown, fn: (tx: unknown) => Promise<unknown>) => fn(async () => []),
}));
vi.mock("@/lib/db/system-reads", () => ({
  markAccountFinishPending: async () => undefined,
  staffActiveForEmail: async (_env: unknown, email: string) => {
    staff.asked.push(email);
    return staff.answer(email);
  },
}));

const { POST } = await import("@/app/api/auth/route");

const DASH = "dashboard.vamostaxi.site";
const verifierCookie = { name: "sb-lab-auth-token-code-verifier", value: "verifier", options: { path: "/" } };
let resetCalls: string[];

beforeEach(() => {
  resetHarness();
  staff.asked = [];
  staff.answer = async () => true;
  resetCalls = [];
  // The PKCE flow stores its verifier cookie before it asks Supabase, whoever the address is.
  state.auth.resetPasswordForEmail = (async (email: string) => {
    resetCalls.push(email);
    writeCookies(verifierCookie as never);
    return { error: null };
  }) as never;
});

async function ask(email: string, host = DASH) {
  const res = await POST(authPost({ mode: "forgot", email, ...(host === DASH ? {} : { turnstileToken: "tok" }) }, host));
  return { status: res.status, body: await res.json(), cookies: res.headers.getSetCookie().length };
}

describe("S5 review: dashboard forgot-password goes to active staff only", () => {
  it("an active staff address: the real address reaches Supabase once, the answer is 'sent'", async () => {
    const out = await ask("ops@vamostaxi.eu");
    expect(out).toMatchObject({ status: 200, body: { stage: "sent" } });
    expect(staff.asked).toEqual(["ops@vamostaxi.eu"]);
    expect(resetCalls).toEqual(["ops@vamostaxi.eu"]);
  });

  it("any other address (a customer, an unknown one): the real address never reaches Supabase, the answer is the same 'sent'", async () => {
    staff.answer = async () => false;
    const out = await ask("customer@example.com");
    expect(out).toMatchObject({ status: 200, body: { stage: "sent" } });
    expect(resetCalls).toHaveLength(1);
    expect(resetCalls[0]).toMatch(/^no-recovery-[0-9a-f-]{36}@invalid\.invalid$/);
    expect(JSON.stringify(resetCalls)).not.toContain("customer@example.com");
  });

  it("the decoy address is new for every request", async () => {
    staff.answer = async () => false;
    await ask("a@example.com");
    await ask("b@example.com");
    expect(new Set(resetCalls).size).toBe(2);
  });

  it("staff and everyone else get the same body, status and cookies, so the answer tells nothing", async () => {
    const asStaff = await ask("ops@vamostaxi.eu");
    staff.answer = async () => false;
    const asOther = await ask("customer@example.com");
    expect(asOther).toEqual(asStaff);
    expect(asStaff.cookies).toBeGreaterThan(0);
  });

  it("a staff check that cannot be made fails closed: no mail address goes out, the answer is still 'sent'", async () => {
    staff.answer = async () => {
      throw new Error("db down");
    };
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const out = await ask("ops@vamostaxi.eu");
    err.mockRestore();
    expect(out).toMatchObject({ status: 200, body: { stage: "sent" } });
    expect(JSON.stringify(resetCalls)).not.toContain("ops@vamostaxi.eu");
  });

  it("every dashboard answer is held to the same floor (staff or not), the public host's is not", async () => {
    vi.useFakeTimers();
    try {
      const done = { staff: false, other: false, pub: false };
      staff.answer = async (email) => email.startsWith("ops@");
      const a = POST(authPost({ mode: "forgot", email: "ops@vamostaxi.eu" }, DASH)).then(() => void (done.staff = true));
      const b = POST(authPost({ mode: "forgot", email: "customer@example.com" }, DASH)).then(() => void (done.other = true));
      const c = POST(authPost({ mode: "forgot", email: "customer@example.com", turnstileToken: "tok" })).then(() => void (done.pub = true));
      await vi.advanceTimersByTimeAsync(1000);
      expect(done).toEqual({ staff: false, other: false, pub: true });
      await vi.advanceTimersByTimeAsync(500);
      await Promise.all([a, b, c]);
      expect(done).toEqual({ staff: true, other: true, pub: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it("the public host is unchanged: no staff question, the real address goes to Supabase, the check still applies", async () => {
    staff.answer = async () => false;
    const out = await ask("customer@example.com", "vamostaxi.site");
    expect(out).toMatchObject({ status: 200, body: { stage: "sent" } });
    expect(staff.asked).toEqual([]);
    expect(resetCalls).toEqual(["customer@example.com"]);
    expect(state.turnstileCalls).toHaveLength(1);
  });

  it("the dashboard's sign-in is untouched: a password sign-in never asks who is staff", async () => {
    await POST(authPost({ mode: "signin", method: "password", email: "ops@vamostaxi.eu", password: "wrong-password-1" }, DASH));
    expect(staff.asked).toEqual([]);
  });
});
