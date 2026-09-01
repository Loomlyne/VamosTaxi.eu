export type ContactDeliveryMessage = "customer" | "support";
type ClaimResult = "claimed" | "accepted" | "unavailable";

export type ContactDeliveryGateway = {
  claim(message: ContactDeliveryMessage): Promise<ClaimResult>;
  send(message: ContactDeliveryMessage): Promise<{ accepted: boolean; providerSuffix?: string | null }>;
  finalize(message: ContactDeliveryMessage, providerSuffix?: string | null): Promise<"accepted" | "unavailable">;
  fail(message: ContactDeliveryMessage): Promise<void>;
};

const MESSAGES: ContactDeliveryMessage[] = ["customer", "support"];

/**
 * Sends only messages whose durable state is still unfinished. A successful
 * HTTP/provider call is insufficient: both records must finalize accepted.
 */
export async function deliverContactMessages(
  gateway: ContactDeliveryGateway,
): Promise<{ accepted: boolean }> {
  for (const message of MESSAGES) {
    const claim = await gateway.claim(message);
    if (claim === "accepted") continue;
    if (claim !== "claimed") return { accepted: false };

    const result = await gateway.send(message);
    if (!result.accepted) {
      await gateway.fail(message);
      return { accepted: false };
    }
    if ((await gateway.finalize(message, result.providerSuffix)) !== "accepted") return { accepted: false };
  }
  return { accepted: true };
}
