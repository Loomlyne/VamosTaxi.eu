// Supabase Auth only accepts a Send Email Hook answer that carries
// `Content-Type: application/json`. Without it the sign-up (or token) is
// rolled back after the mail went out, so every link in the mail is dead
// (live 2026-09-29 12:12 UTC, error hook_payload_invalid_content_type).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "standardwebhooks";

const SECRET = "v1,whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ";
const sent: unknown[] = [];

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: {
      SEND_EMAIL_HOOK_SECRET: SECRET,
      SUPABASE_URL: "https://example.supabase.co",
      EMAIL: { send: async (m: unknown) => void sent.push(m) },
    },
  }),
}));

const { POST } = await import("@/app/api/auth/email-hook/route");

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

const signup = {
  user: { email: "mia@example.com", user_metadata: { full_name: "Mia", locale: "de" } },
  email_data: {
    token: "123456",
    token_hash: "pkce_abc",
    redirect_to: "https://vamostaxi.site/api/auth/callback?next=%2F",
    site_url: "https://vamostaxi.site",
    email_action_type: "signup",
  },
};

describe("email hook answer", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it("answers a sent mail with JSON {} so Supabase keeps the sign-up", async () => {
    const res = await POST(signed(signup));
    expect(sent).toHaveLength(1);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({});
  });

  it("answers a skipped action with JSON {}", async () => {
    const res = await POST(
      signed({ ...signup, email_data: { ...signup.email_data, email_action_type: "invite" } }),
    );
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  it("answers an unsigned call with a JSON error, not an empty body", async () => {
    const res = await POST(
      new Request("https://vamostaxi.site/api/auth/email-hook", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ error: { http_code: 401, message: "email-hook" } });
  });
});
