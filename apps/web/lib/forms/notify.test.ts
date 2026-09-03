import { describe, expect, it, vi } from "vitest";
import { sendContactMessage } from "./notify";

const rendered = { subject: "Hello", html: "<p>Hi</p>", text: "Hi" };

describe("sendContactMessage", () => {
  it("sends through Cloudflare Email when the binding exists", async () => {
    const send = vi.fn(async () => ({ messageId: "cf-message-abcdef123456" }));
    await expect(
      sendContactMessage(undefined, undefined, "guest@example.test", "idem-1", rendered, { send }),
    ).resolves.toEqual({ accepted: true, providerSuffix: "abcdef123456" });
    expect(send).toHaveBeenCalledWith({
      to: "guest@example.test",
      from: { email: "noreply@vamostaxi.site", name: "Vamos Taxi" },
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
    });
  });

  it("accepts Cloudflare Email even when the provider omits messageId", async () => {
    const send = vi.fn(async () => ({}));
    await expect(
      sendContactMessage("resend-key", "ignored@example.test", "guest@example.test", "idem-2", rendered, { send }),
    ).resolves.toEqual({ accepted: true, providerSuffix: null });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("fails closed when Cloudflare Email throws", async () => {
    const send = vi.fn(async () => {
      throw new Error("send failed");
    });
    await expect(
      sendContactMessage(undefined, undefined, "guest@example.test", "idem-3", rendered, { send }),
    ).resolves.toEqual({ accepted: false, providerSuffix: null });
  });

  it("fails closed without a recipient", async () => {
    const send = vi.fn(async () => ({ messageId: "unused" }));
    await expect(
      sendContactMessage(undefined, undefined, undefined, "idem-4", rendered, { send }),
    ).resolves.toEqual({ accepted: false, providerSuffix: null });
    expect(send).not.toHaveBeenCalled();
  });
});
