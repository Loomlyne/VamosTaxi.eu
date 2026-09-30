// 26.5-05: a signup mail for a user the checkout made is the "finish your account" mail;
// every other signup, and every magic-link mail, keeps its existing template.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "standardwebhooks";

const SECRET = "v1,whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ";
const sent: Array<{ subject: string; html: string }> = [];

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: {
      SEND_EMAIL_HOOK_SECRET: SECRET,
      SUPABASE_URL: "https://example.supabase.co",
      EMAIL: { send: async (m: { subject: string; html: string }) => void sent.push(m) },
    },
  }),
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

function payload(action: string, metadata: Record<string, unknown>) {
  return {
    user: { email: "mia@example.com", user_metadata: { full_name: "Mia", vamos_locale: "en", ...metadata } },
    email_data: {
      token: "123456",
      token_hash: "pkce_abc",
      redirect_to: "https://vamostaxi.site/api/auth/callback?next=%2F",
      site_url: "https://vamostaxi.site",
      email_action_type: action,
    },
  };
}

describe("email hook: checkout-made accounts", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  for (const origin of ["checkout-create", "checkout-guest"]) {
    it(`signup + ${origin} renders the finish-your-account mail with the code`, async () => {
      const res = await POST(signed(payload("signup", { vamos_account_origin: origin })));
      expect(res.status).toBe(200);
      expect(sent[0]?.html).toContain("Sign in and finish your account");
      expect(sent[0]?.html).toContain("123456");
    });
  }

  it("signup without the origin keeps the signup template", async () => {
    await POST(signed(payload("signup", {})));
    expect(sent[0]?.subject).toBe("Confirm your Vamos Taxi account");
  });

  it("magiclink with a checkout origin keeps the otp template", async () => {
    await POST(signed(payload("magiclink", { vamos_account_origin: "checkout-create" })));
    expect(sent[0]?.html).toContain("Sign in to Vamos Taxi");
    expect(sent[0]?.html).not.toContain("finish your account");
  });
});
