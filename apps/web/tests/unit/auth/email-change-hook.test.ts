// Secure e-mail change: Supabase issues two tokens; the hook mails one link to each address.
// Pairing (Supabase Send Email Hook docs): token_hash_new + token go with the CURRENT address
// (user.email); token_hash + token_new go with the NEW address (user.new_email).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "standardwebhooks";
import { openAddress } from "@/lib/auth/sealed-address";

const SECRET = "v1,whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ";
const sent: { to: string; subject: string; html: string; text: string }[] = [];

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

function change(data: Record<string, string>, locale = "en") {
  return {
    user: {
      email: "old@example.com",
      new_email: "new@example.com",
      user_metadata: { full_name: "Mia", locale },
    },
    email_data: {
      token: "111111",
      token_hash: "hash_for_new",
      redirect_to: "https://vamostaxi.site/api/auth/callback?next=%2Faccount",
      site_url: "https://vamostaxi.site",
      email_action_type: "email_change",
      ...data,
    },
  };
}

function linkIn(mail: { html: string; text: string }): URL {
  const m = /https?:\/\/[^\s"'<>]*confirm[^\s"'<>]*/.exec(mail.text + " " + mail.html);
  if (!m) throw new Error("no link in mail");
  return new URL(m[0].replace(/&amp;/g, "&"));
}

describe("email hook: e-mail change", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it("double confirm sends two mails with the documented token/address pairing", async () => {
    const res = await POST(signed(change({ token_new: "222222", token_hash_new: "hash_for_old" })));
    expect(res.status).toBe(200);
    expect(sent.map((m) => m.to).sort()).toEqual(["new@example.com", "old@example.com"]);
    const toOld = sent.find((m) => m.to === "old@example.com")!;
    const toNew = sent.find((m) => m.to === "new@example.com")!;
    const oldUrl = linkIn(toOld);
    const newUrl = linkIn(toNew);
    expect(oldUrl.searchParams.get("token_hash")).toBe("hash_for_old");
    expect(newUrl.searchParams.get("token_hash")).toBe("hash_for_new");
    expect(oldUrl.searchParams.get("type")).toBe("email_change");
    expect(newUrl.searchParams.get("type")).toBe("email_change");
    expect(await openAddress(oldUrl.searchParams.get("e"), "hash_for_old", SECRET)).toBe("old@example.com");
    expect(await openAddress(newUrl.searchParams.get("e"), "hash_for_new", SECRET)).toBe("new@example.com");
    // an address's seal does not open for the other address's token
    expect(await openAddress(oldUrl.searchParams.get("e"), "hash_for_new", SECRET)).toBeNull();
    expect(toOld.html).toContain("111111");
    expect(toNew.html).toContain("222222");
    expect(toOld.subject).not.toBe(toNew.subject);
  });

  it("single confirm (one token) sends one mail to the new address", async () => {
    const res = await POST(signed(change({ token_new: "", token_hash_new: "" })));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("new@example.com");
    const url = linkIn(sent[0]!);
    expect(url.searchParams.get("token_hash")).toBe("hash_for_new");
    expect(await openAddress(url.searchParams.get("e"), "hash_for_new", SECRET)).toBe("new@example.com");
  });

  it("the mail to the current address is localised", async () => {
    await POST(signed(change({ token_new: "222222", token_hash_new: "hash_for_old" }, "de")));
    const toOld = sent.find((m) => m.to === "old@example.com")!;
    expect(toOld.subject).toContain("E-Mail");
    expect(toOld.html + toOld.text).not.toContain("ß");
  });
});
