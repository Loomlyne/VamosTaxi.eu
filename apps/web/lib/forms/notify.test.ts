import { beforeEach, describe, expect, it, vi } from "vitest";
import { staffMessageId } from "../ops/ticket-mail";
import { RFC_MESSAGE_ID_GET_GAPS_MS, sendContactMessage } from "./notify";

const rendered = { subject: "Hello", html: "<p>Hi</p>", text: "Hi" };
const RESEND_UUID = "37e4414c-5e25-4dbc-a071-43552a4bd53b";
const GET_RFC = "<111-222-333@email.example.com>";
const STAFF_FROM = "Vamos Taxi <noreply@vamostaxi.site>";

const { sendResend, getResend } = vi.hoisted(() => ({ sendResend: vi.fn(), getResend: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendResend, get: getResend };
  },
}));

describe("sendContactMessage", () => {
  beforeEach(() => {
    sendResend.mockReset();
    getResend.mockReset();
    getResend.mockResolvedValue({ data: { id: RESEND_UUID, message_id: GET_RFC }, error: null });
  });
  it("sends through Resend when the API key is present, even if EMAIL is bound", async () => {
    sendResend.mockResolvedValueOnce({ data: { id: "re_message-abcdef123456" }, error: null });
    const send = vi.fn(async () => ({ messageId: "cf-unused" }));
    await expect(
      sendContactMessage("re_key", "ignored@example.test", "guest@example.test", "idem-1", rendered, { send }),
    ).resolves.toMatchObject({ accepted: true, providerSuffix: "abcdef123456", providerId: "re_message-abcdef123456" });
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
    ).resolves.toMatchObject({ accepted: true, providerSuffix: "abcdef123456", providerId: "re_thread-abcdef123456" });
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
    ).resolves.toMatchObject({ accepted: true, providerSuffix: "abcdef123456", providerId: "cf-message-abcdef123456" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not use Cloudflare Email when staff replies disable fallback", async () => {
    sendResend.mockResolvedValueOnce({ data: null, error: { message: "rejected" } });
    const send = vi.fn(async () => ({ messageId: "cf-unused" }));
    await expect(
      sendContactMessage("re_key", undefined, "guest@example.test", "idem-staff", rendered, { send }, {
        allowEmailFallback: false,
        bcc: "info@vamostaxi.site",
        replyTo: "ticket+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@replies.vamostaxi.site",
      }),
    ).resolves.toMatchObject({ accepted: false, providerSuffix: null, providerId: null });
    expect(send).not.toHaveBeenCalled();
    expect(sendResend.mock.calls[0]?.[0]).toMatchObject({
      bcc: "info@vamostaxi.site",
    });
  });

  it("sends through Cloudflare Email when Resend is not configured", async () => {
    const send = vi.fn(async () => ({ messageId: "cf-message-abcdef123456" }));
    await expect(
      sendContactMessage(undefined, undefined, "guest@example.test", "idem-3", rendered, { send }),
    ).resolves.toMatchObject({ accepted: true, providerSuffix: "abcdef123456", providerId: "cf-message-abcdef123456" });
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
    ).resolves.toMatchObject({ accepted: false, providerSuffix: null, providerId: null });
  });

  it("fails closed without a recipient", async () => {
    const send = vi.fn(async () => ({ messageId: "unused" }));
    await expect(
      sendContactMessage("re_key", undefined, undefined, "idem-5", rendered, { send }),
    ).resolves.toMatchObject({ accepted: false, providerSuffix: null, providerId: null });
    expect(sendResend).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  describe("D-01 D-06 GET-after-send rfcMessageId", () => {
    it("persists the angle-bracketed GET message_id, not the UUID, suffix, or staffMessageId", async () => {
      sendResend.mockResolvedValueOnce({ data: { id: RESEND_UUID }, error: null });
      getResend.mockResolvedValueOnce({ data: { id: RESEND_UUID, message_id: GET_RFC }, error: null });
      const result = await sendContactMessage("re_key", undefined, "guest@example.test", "idem-get", rendered);
      expect(getResend).toHaveBeenCalledWith(RESEND_UUID);
      expect(result).toMatchObject({ accepted: true, providerId: RESEND_UUID, rfcMessageId: GET_RFC });
      expect(result.rfcMessageId).toMatch(/^<.+@.+>$/);
      expect(result.rfcMessageId).not.toBe(RESEND_UUID);
      expect(result.rfcMessageId).not.toBe(RESEND_UUID.slice(-12));
      expect(result.rfcMessageId).not.toBe(staffMessageId(RESEND_UUID));
    });

    it("polls emails.get while message_id is null (queued), then returns the RFC id", async () => {
      vi.useFakeTimers();
      sendResend.mockResolvedValueOnce({ data: { id: RESEND_UUID }, error: null });
      getResend
        .mockResolvedValueOnce({ data: { id: RESEND_UUID, message_id: null }, error: null })
        .mockResolvedValueOnce({ data: { id: RESEND_UUID, message_id: null }, error: null })
        .mockResolvedValueOnce({ data: { id: RESEND_UUID, message_id: GET_RFC }, error: null });
      try {
        const pending = sendContactMessage(
          "re_key",
          undefined,
          "guest@example.test",
          "idem-retry",
          rendered,
          undefined,
          { allowEmailFallback: false },
        );
        await vi.runAllTimersAsync();
        await expect(pending).resolves.toMatchObject({ accepted: true, rfcMessageId: GET_RFC });
        expect(getResend).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    });

    it("fail-closes when GET stays empty and never calls Cloudflare EMAIL (D-06)", async () => {
      vi.useFakeTimers();
      sendResend.mockResolvedValueOnce({ data: { id: RESEND_UUID }, error: null });
      getResend.mockResolvedValue({ data: { id: RESEND_UUID, message_id: "" }, error: null });
      const send = vi.fn(async () => ({ messageId: "cf-unused" }));
      try {
        const pending = sendContactMessage(
          "re_key",
          undefined,
          "guest@example.test",
          "idem-empty-get",
          rendered,
          { send },
          { allowEmailFallback: false },
        );
        await vi.runAllTimersAsync();
        await expect(pending).resolves.toMatchObject({ accepted: false, rfcMessageId: null });
        expect(getResend).toHaveBeenCalledTimes(RFC_MESSAGE_ID_GET_GAPS_MS.length);
        expect(send).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("copies options.from Vamos Taxi <noreply@vamostaxi.site> onto the send payload (D-01)", async () => {
      sendResend.mockResolvedValueOnce({ data: { id: RESEND_UUID }, error: null });
      await sendContactMessage(
        "re_key",
        undefined,
        "guest@example.test",
        "idem-from",
        rendered,
        undefined,
        { allowEmailFallback: false, from: STAFF_FROM } as { allowEmailFallback: boolean; from: string },
      );
      expect(sendResend.mock.calls[0]?.[0]).toMatchObject({ from: STAFF_FROM });
    });
  });
});
