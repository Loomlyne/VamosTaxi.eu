import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendContactMessage } from "./notify";

const rendered = { subject: "Hello", html: "<p>Hi</p>", text: "Hi" };

const { sendResend } = vi.hoisted(() => ({ sendResend: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendResend };
  },
}));

describe("sendContactMessage", () => {
  beforeEach(() => {
    sendResend.mockReset();
  });
  it("sends through Resend when the API key is present, even if EMAIL is bound", async () => {
    sendResend.mockResolvedValueOnce({ data: { id: "re_message-abcdef123456" }, error: null });
    const send = vi.fn(async () => ({ messageId: "cf-unused" }));
    await expect(
      sendContactMessage("re_key", "ignored@example.test", "guest@example.test", "idem-1", rendered, { send }),
    ).resolves.toEqual({ accepted: true, providerSuffix: "abcdef123456", providerId: "re_message-abcdef123456" });
    expect(sendResend).toHaveBeenCalledTimes(1);
    expect(sendResend.mock.calls[0]?.[0]).toEqual({
      from: "Vamos Taxi <noreply@vamostaxi.site>",
      to: "guest@example.test",
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("passes Reply-To and thread headers to Resend", async () => {
    sendResend.mockResolvedValueOnce({ data: { id: "re_thread-abcdef123456" }, error: null });
    await expect(
      sendContactMessage("re_key", undefined, "guest@example.test", "idem-thread", rendered, undefined, {
        replyTo: "ticket+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@replies.vamostaxi.site",
        headers: { "Message-ID": "<c.abc@vamostaxi.site>", "In-Reply-To": "<c.abc@vamostaxi.site>" },
      }),
    ).resolves.toEqual({ accepted: true, providerSuffix: "abcdef123456", providerId: "re_thread-abcdef123456" });
    expect(sendResend.mock.calls[0]?.[0]).toMatchObject({
      from: "Vamos Taxi <noreply@vamostaxi.site>",
      replyTo: "ticket+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@replies.vamostaxi.site",
      headers: { "Message-ID": "<c.abc@vamostaxi.site>", "In-Reply-To": "<c.abc@vamostaxi.site>" },
    });
  });

  it("falls back to Cloudflare Email when Resend rejects", async () => {
    sendResend.mockResolvedValueOnce({ data: null, error: { message: "rejected" } });
    const send = vi.fn(async () => ({ messageId: "cf-message-abcdef123456" }));
    await expect(
      sendContactMessage("re_key", undefined, "guest@example.test", "idem-2", rendered, { send }),
    ).resolves.toEqual({ accepted: true, providerSuffix: "abcdef123456", providerId: "cf-message-abcdef123456" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends through Cloudflare Email when Resend is not configured", async () => {
    const send = vi.fn(async () => ({ messageId: "cf-message-abcdef123456" }));
    await expect(
      sendContactMessage(undefined, undefined, "guest@example.test", "idem-3", rendered, { send }),
    ).resolves.toEqual({ accepted: true, providerSuffix: "abcdef123456", providerId: "cf-message-abcdef123456" });
    expect(sendResend).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({
      to: "guest@example.test",
      from: { email: "noreply@vamostaxi.site", name: "Vamos Taxi" },
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
    });
  });

  it("fails closed when Cloudflare Email throws and Resend is absent", async () => {
    const send = vi.fn(async () => {
      throw new Error("send failed");
    });
    await expect(
      sendContactMessage(undefined, undefined, "guest@example.test", "idem-4", rendered, { send }),
    ).resolves.toEqual({ accepted: false, providerSuffix: null, providerId: null });
  });

  it("fails closed without a recipient", async () => {
    const send = vi.fn(async () => ({ messageId: "unused" }));
    await expect(
      sendContactMessage("re_key", undefined, undefined, "idem-5", rendered, { send }),
    ).resolves.toEqual({ accepted: false, providerSuffix: null, providerId: null });
    expect(sendResend).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
