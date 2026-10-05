// Defence in depth for S5: /api/auth answers some requests with an address no account can have
// (no-recovery-<uuid>@invalid.invalid, no-link-<uuid>@invalid.invalid) so the answer is the same whoever the
// address is. If Supabase ever reaches the send-email hook for one of them, nothing is mailed and the hook still
// answers 200, so Supabase does not roll back; the log line carries no address.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "standardwebhooks";

const SECRET = "v1,whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ";
const emailSends: Array<{ to: string }> = [];
const resendSends: Array<{ to: string }> = [];
const bindings = vi.hoisted(() => ({ useResend: false }));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: {
      SEND_EMAIL_HOOK_SECRET: SECRET,
      SUPABASE_URL: "https://example.supabase.co",
      ...(bindings.useResend
        ? { RESEND_API_KEY: "re_test" }
        : { EMAIL: { send: async (m: { to: string }) => void emailSends.push({ to: m.to }) } }),
    },
  }),
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (m: { to: string }) => {
        resendSends.push({ to: m.to });
        return { error: null };
      },
    };
  },
}));

const { POST } = await import("./route");

function signed(body: unknown): Request {
  const payload = JSON.stringify(body);
  const id = "msg_test";
  const ts = new Date();
  const signature = new Webhook(SECRET.slice("v1,whsec_".length)).sign(id, ts, payload);
  return new Request("https://vamostaxi.site/api/auth/email-hook", {
    method: "POST",
    body: payload,
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(Math.floor(ts.getTime() / 1000)),
      "webhook-signature": signature,
    },
  });
}

function payload(email: string, action = "recovery") {
  return {
    user: { email, user_metadata: { vamos_locale: "en" } },
    email_data: {
      token: "123456",
      token_hash: "pkce_abc",
      redirect_to: "https://dashboard.vamostaxi.site/reset-password",
      site_url: "https://vamostaxi.site",
      email_action_type: action,
    },
  };
}

let logged: string[];

beforeEach(() => {
  emailSends.length = 0;
  resendSends.length = 0;
  bindings.useResend = false;
  logged = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => void logged.push(String(line)));
});
afterEach(() => vi.restoreAllMocks());

describe("email hook: an address no account can have is never mailed", () => {
  it.each([
    ["recovery", "no-recovery-2f1c9b52-8d41-4d57-9d0a-4a3f6a7d1c11@invalid.invalid"],
    ["magiclink", "no-link-2f1c9b52-8d41-4d57-9d0a-4a3f6a7d1c11@invalid.invalid"],
    ["signup", "No-Link-2F1C9B52@INVALID.INVALID"],
  ])("%s to %s: nothing is sent, the hook answers 200", async (action, address) => {
    const res = await POST(signed(payload(address, action)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    expect(emailSends).toEqual([]);
    expect(resendSends).toEqual([]);
  });

  it("the same through the Resend path (no EMAIL binding)", async () => {
    bindings.useResend = true;
    const res = await POST(signed(payload("no-recovery-abc@invalid.invalid")));
    expect(res.status).toBe(200);
    expect(resendSends).toEqual([]);
  });

  it("one log line says it was skipped and carries no address, token or link", async () => {
    const address = "no-recovery-2f1c9b52-8d41-4d57-9d0a-4a3f6a7d1c11@invalid.invalid";
    await POST(signed(payload(address)));
    const lines = logged.map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l.skipped === "decoy-recipient");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: "info", type: "email-hook", route: "/api/auth/email-hook" });
    const all = logged.join("\n");
    expect(all).not.toContain("invalid.invalid");
    expect(all).not.toContain("2f1c9b52");
    expect(all).not.toContain("pkce_abc");
    expect(all).not.toContain("123456");
  });

  it("a real address, and a look-alike that only contains the text, are still mailed", async () => {
    for (const address of ["mia@example.com", "mia@invalid.invalid.example.com", "invalid.invalid@example.com"]) {
      emailSends.length = 0;
      const res = await POST(signed(payload(address)));
      expect(res.status).toBe(200);
      expect(emailSends.map((m) => m.to)).toEqual([address]);
    }
  });
});
