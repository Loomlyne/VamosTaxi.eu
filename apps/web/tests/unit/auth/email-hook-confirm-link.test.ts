// F12: every session-creating link in the hook mail goes to the confirm page with a sealed address.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "standardwebhooks";
import { openAddress } from "@/lib/auth/sealed-address";

const SECRET = "v1,whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ";
const sent: { to: string; html: string; text: string }[] = [];

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: {
      SEND_EMAIL_HOOK_SECRET: SECRET,
      SUPABASE_URL: "https://example.supabase.co",
      EMAIL: { send: async (m: (typeof sent)[number]) => void sent.push(m) },
    },
  }),
}));

const { POST } = await import("@/app/api/auth/email-hook/route");

function signed(body: unknown): Request {
  const payload = JSON.stringify(body);
  const ts = new Date();
  const signature = new Webhook(SECRET.slice("v1,whsec_".length)).sign("msg_1", ts, payload);
  return new Request("https://vamostaxi.site/api/auth/email-hook", {
    method: "POST",
    body: payload,
    headers: {
      "content-type": "application/json",
      "webhook-id": "msg_1",
      "webhook-timestamp": String(Math.floor(ts.getTime() / 1000)),
      "webhook-signature": signature,
    },
  });
}

function payload(action: string, redirect: string) {
  return {
    user: { email: "mia@example.com", user_metadata: { full_name: "Mia" } },
    email_data: {
      token: "123456",
      token_hash: "hash_abc",
      redirect_to: redirect,
      site_url: "https://vamostaxi.site",
      email_action_type: action,
    },
  };
}

function linkIn(mail: { html: string; text: string }): URL {
  const m = /https?:\/\/[^\s"'<>]*(?:confirm|auth\/v1\/verify)[^\s"'<>]*/.exec(mail.text + " " + mail.html);
  if (!m) throw new Error("no link in mail");
  return new URL(m[0].replace(/&amp;/g, "&"));
}

describe("email hook builds confirm links", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  for (const action of ["signup", "magiclink", "recovery", "email_change"]) {
    it(`${action} points at /sign-in/confirm with a sealed address`, async () => {
      const res = await POST(signed(payload(action, "https://vamostaxi.site/api/auth/callback?next=%2Faccount")));
      expect(res.status).toBe(200);
      const url = linkIn(sent[0]!);
      expect(url.host).toBe("vamostaxi.site");
      expect(url.pathname).toBe("/sign-in/confirm");
      expect(url.searchParams.get("token_hash")).toBe("hash_abc");
      expect(url.searchParams.get("type")).toBe(action);
      expect(url.searchParams.get("next")).toBe("/account");
      const e = url.searchParams.get("e");
      expect(e).toBeTruthy();
      expect(await openAddress(e, "hash_abc", SECRET)).toBe("mia@example.com");
      expect(sent[0]!.html + sent[0]!.text).not.toContain("/auth/v1/verify");
    });
  }

  it("keeps nextb for a checkout return", async () => {
    await POST(signed(payload("magiclink", "https://vamostaxi.site/api/auth/callback?nextb=L2NoZWNrb3V0")));
    expect(linkIn(sent[0]!).searchParams.get("nextb")).toBe("L2NoZWNrb3V0");
  });

  it("uses /login/confirm on the dashboard host", async () => {
    await POST(signed(payload("magiclink", "https://dashboard.vamostaxi.site/api/auth/callback?next=%2Fdashboard")));
    const url = linkIn(sent[0]!);
    expect(url.host).toBe("dashboard.vamostaxi.site");
    expect(url.pathname).toBe("/login/confirm");
  });

  it("keeps the invite link confirm-only (Supabase verify URL)", async () => {
    await POST(signed(payload("invite", "https://dashboard.vamostaxi.site/login")));
    // invite is skipped by the hook today (no mail kind) or stays on the verify URL; never a confirm link
    for (const m of sent) expect(m.text + m.html).not.toContain("/sign-in/confirm");
  });

  it("does not build a confirm link for an untrusted redirect_to host", async () => {
    await POST(signed(payload("magiclink", "https://evil.example/api/auth/callback?next=%2F")));
    for (const m of sent) expect(m.text + m.html).not.toContain("evil.example");
  });
});
