import { describe, expect, it, vi } from "vitest";
import {
  deliverContactMessages,
  type ContactDeliveryGateway,
  type ContactDeliveryMessage,
} from "./contact-delivery";

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
    claim: vi.fn(async (message: ContactDeliveryMessage): Promise<"claimed" | "accepted"> => (states[message] === "accepted" ? "accepted" : "claimed")),
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

    await expect(deliverContactMessages(gateway)).resolves.toEqual({ accepted: true });
    expect(gateway.sent).toEqual(["customer", "support"]);
    expect(gateway.finalized).toEqual(["customer", "support"]);
  });

  it("resumes only unfinished delivery and never re-sends a terminal message", async () => {
    const gateway = gatewayFor({ customer: "accepted", support: "pending" });

    await expect(deliverContactMessages(gateway)).resolves.toEqual({ accepted: true });
    expect(gateway.sent).toEqual(["support"]);
    expect(gateway.finalized).toEqual(["support"]);
  });

  it("does not report success when a provider acceptance is unavailable", async () => {
    const gateway = gatewayFor({ customer: "pending", support: "pending" });
    gateway.sendMock.mockResolvedValueOnce({ accepted: false });

    await expect(deliverContactMessages(gateway)).resolves.toEqual({ accepted: false });
    expect(gateway.finalized).toEqual([]);
    expect(gateway.failed).toEqual(["customer"]);
    expect(gateway.send).toHaveBeenCalledWith("customer");
    expect(gateway.send).toHaveBeenCalledTimes(1);
  });
});
