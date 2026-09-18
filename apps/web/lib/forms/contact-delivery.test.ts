import { describe, expect, it, vi } from "vitest";
import {
  deliverContactMessages,
  type ContactDeliveryClaim,
  type ContactDeliveryGateway,
  type ContactDeliveryMessage,
} from "./contact-delivery";

const submissionId = "00000000-0000-0000-0000-000000000026";

function claimed(leaseToken: string): ContactDeliveryClaim {
  return { state: "claimed", leaseToken };
}

function gatewayFor(
  states: Record<ContactDeliveryMessage, "pending" | "accepted">,
): ContactDeliveryGateway & { sent: ContactDeliveryMessage[]; finalized: ContactDeliveryMessage[];
 failed: ContactDeliveryMessage[]; sendMock: ReturnType<typeof vi.fn> } {
  const sent: ContactDeliveryMessage[] = [];
  const finalized: ContactDeliveryMessage[] = [];
  const failed: ContactDeliveryMessage[] = [];
  const sendMock = vi.fn(async (message: ContactDeliveryMessage) => {
    sent.push(message);
    return { accepted: true };
  });
  return {
    sent,
    finalized,
    failed,
    sendMock,
    claim: vi.fn(async (message: ContactDeliveryMessage): Promise<ContactDeliveryClaim> => (
      states[message] === "accepted" ? { state: "accepted" } : claimed(`${message}-lease`)
    )),
    send: sendMock,
    finalize: vi.fn(async (message: ContactDeliveryMessage): Promise<"accepted"> => {
      finalized.push(message);
      states[message] = "accepted";
      return "accepted";
    }),
    fail: vi.fn(async (message) => {
      failed.push(message);
    }),
  };
}

describe("deliverContactMessages", () => {
  it("only reports accepted after both durable provider acceptances finalize", async () => {
    const gateway = gatewayFor({ customer: "pending", support: "pending" });

    await expect(deliverContactMessages(gateway, submissionId)).resolves.toEqual({ accepted: true });
    expect(gateway.sent).toEqual(["customer", "support"]);
    expect(gateway.finalized).toEqual(["customer", "support"]);
  });

  it("resumes only unfinished delivery and never re-sends a terminal message", async () => {
    const gateway = gatewayFor({ customer: "accepted", support: "pending" });

    await expect(deliverContactMessages(gateway, submissionId)).resolves.toEqual({ accepted: true });
    expect(gateway.sent).toEqual(["support"]);
    expect(gateway.finalized).toEqual(["support"]);
  });

  it("does not report success when a provider acceptance is unavailable", async () => {
    const gateway = gatewayFor({ customer: "pending", support: "pending" });
    gateway.sendMock.mockResolvedValueOnce({ accepted: false });

    await expect(deliverContactMessages(gateway, submissionId)).resolves.toEqual({ accepted: false });
    expect(gateway.finalized).toEqual([]);
    expect(gateway.failed).toEqual(["customer"]);
    expect(gateway.send).toHaveBeenCalledWith("customer", `contact:${submissionId}:customer:v1`);
    expect(gateway.send).toHaveBeenCalledTimes(1);
  });

  it("sends after reclaiming a lease that expired before its provider call", async () => {
    const gateway: ContactDeliveryGateway = {
      claim: vi.fn(async (message): Promise<ContactDeliveryClaim> => (
        message === "customer" ? claimed("reclaimed-before-send") : { state: "accepted" }
      )),
      send: vi.fn(async () => ({ accepted: true })),
      finalize: vi.fn(async (): Promise<"accepted"> => "accepted"),
      fail: vi.fn(async () => undefined),
    };

    await expect(deliverContactMessages(gateway, submissionId)).resolves.toEqual({ accepted: true });
    expect(gateway.send).toHaveBeenCalledWith("customer", `contact:${submissionId}:customer:v1`);
    expect(gateway.finalize).toHaveBeenCalledWith("customer", "reclaimed-before-send", undefined);
  });

  it("reuses the provider idempotency identity after acceptance before a fenced finalization", async () => {
    const claim = vi.fn()
      .mockResolvedValueOnce(claimed("first-lease"))
      .mockResolvedValueOnce(claimed("reclaimed-lease"))
      .mockResolvedValue({ state: "accepted" });
    const send = vi.fn(async () => ({ accepted: true }));
    const finalize = vi.fn()
      .mockResolvedValueOnce("unavailable")
      .mockResolvedValueOnce("accepted");
    const gateway: ContactDeliveryGateway = {
      claim,
      send,
      finalize,
      fail: vi.fn(async () => undefined),
    };

    await expect(deliverContactMessages(gateway, submissionId)).resolves.toEqual({ accepted: false });
    await expect(deliverContactMessages(gateway, submissionId)).resolves.toEqual({ accepted: true });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, "customer", `contact:${submissionId}:customer:v1`);
    expect(send).toHaveBeenNthCalledWith(2, "customer", `contact:${submissionId}:customer:v1`);
    expect(finalize).toHaveBeenNthCalledWith(1, "customer", "first-lease", undefined);
    expect(finalize).toHaveBeenNthCalledWith(2, "customer", "reclaimed-lease", undefined);
  });

  it("reports accepted when send carries GET identity and still finalizes providerSuffix", async () => {
    const finalize = vi.fn(async (): Promise<"accepted"> => "accepted");
    const gateway: ContactDeliveryGateway = {
      claim: vi.fn(async (message): Promise<ContactDeliveryClaim> => (
        message === "customer" ? claimed("customer-lease") : { state: "accepted" }
      )),
      send: vi.fn(async () => ({
        accepted: true,
        providerSuffix: "re_suffix12ab",
        providerId: "re_1234567890ab",
        rfcMessageId: "<abc123@resend.dev>",
        channel: "resend" as const,
      })),
      finalize,
      fail: vi.fn(async () => undefined),
    };

    await expect(deliverContactMessages(gateway, submissionId)).resolves.toEqual({ accepted: true });
    expect(finalize).toHaveBeenCalledWith("customer", "customer-lease", "re_suffix12ab");
  });
});
