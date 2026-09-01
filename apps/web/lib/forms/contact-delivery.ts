export type ContactDeliveryMessage = "customer" | "support";

export type ContactDeliveryClaim =
  | { state: "claimed"; leaseToken: string }
  | { state: "accepted" }
  | { state: "unavailable" };

export type ContactDeliveryGateway = {
  claim(message: ContactDeliveryMessage): Promise<ContactDeliveryClaim>;
  send(message: ContactDeliveryMessage, providerIdempotencyKey: string): Promise<{ accepted: boolean; providerSuffix?: string | null }>;
  finalize(message: ContactDeliveryMessage, leaseToken: string, providerSuffix?: string | null): Promise<"accepted" | "unavailable">;
  fail(message: ContactDeliveryMessage, leaseToken: string): Promise<void>;
};

const MESSAGES: ContactDeliveryMessage[] = ["customer", "support"];

export function contactProviderIdempotencyKey(submissionId: string, message: ContactDeliveryMessage): string {
  return `contact:${submissionId}:${message}:v1`;
}

/**
 * Sends only messages whose durable state is still unfinished. A successful
 * HTTP/provider call is insufficient: both records must finalize accepted.
 * The lease token fences every transition after the claim, and the immutable
 * provider identity survives stale-lease recovery.
 */
export async function deliverContactMessages(
  gateway: ContactDeliveryGateway,
  submissionId: string,
): Promise<{ accepted: boolean }> {
  for (const message of MESSAGES) {
    const claim = await gateway.claim(message);
    if (claim.state === "accepted") continue;
    if (claim.state !== "claimed") return { accepted: false };

    const result = await gateway.send(message, contactProviderIdempotencyKey(submissionId, message));
    if (!result.accepted) {
      await gateway.fail(message, claim.leaseToken);
      return { accepted: false };
    }
    if ((await gateway.finalize(message, claim.leaseToken, result.providerSuffix)) !== "accepted") return { accepted: false };
  }
  return { accepted: true };
}
