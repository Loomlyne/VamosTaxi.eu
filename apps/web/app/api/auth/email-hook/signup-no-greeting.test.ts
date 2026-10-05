// Security S5 (owner, 2026-10-05): through the real hook route, the sign-up confirmation does not greet by the
// name typed at the form (the address is not confirmed yet), in every language. Other mails keep their greeting.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "standardwebhooks";

const SECRET = "v1,whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ";
const sent: Array<{ subject: string; html: string; text: string }> = [];

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: {
      SEND_EMAIL_HOOK_SECRET: SECRET,
      SUPABASE_URL: "https://example.supabase.co",
      EMAIL: { send: async (m: { subject: string; html: string; text: string }) => void sent.push(m) },
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

function payload(action: string, locale: string) {
  return {
    user: { email: "victim@example.com", user_metadata: { full_name: "Mallory Typedname", vamos_locale: locale } },
    email_data: {
      token: "123456",
      token_hash: "pkce_abc",
      redirect_to: "https://vamostaxi.site/api/auth/callback?next=%2F",
      site_url: "https://vamostaxi.site",
      email_action_type: action,
    },
  };
}

describe("email hook: sign-up confirmation without the typed name", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  for (const locale of ["en", "de", "fr", "ar"]) {
    it(`${locale}: the sign-up mail carries no name and no greeting`, async () => {
      const res = await POST(signed(payload("signup", locale)));
      expect(res.status).toBe(200);
      expect(sent).toHaveLength(1);
      expect(sent[0]!.html).not.toContain("Mallory");
      expect(sent[0]!.text).not.toContain("Mallory");
      expect(sent[0]!.subject).not.toContain("Mallory");
      expect(sent[0]!.html).toContain("123456");
    });
  }

  it("the sign-in code mail (magiclink) still greets by name", async () => {
    await POST(signed(payload("magiclink", "en")));
    expect(sent[0]!.html).toContain("Hello Mallory Typedname.");
  });

  it("the recovery mail still greets by name", async () => {
    await POST(signed(payload("recovery", "en")));
    expect(sent[0]!.html).toContain("Hello Mallory Typedname.");
  });
});
