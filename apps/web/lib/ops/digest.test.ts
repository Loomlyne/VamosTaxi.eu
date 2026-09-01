import { describe, expect, it } from "vitest";
import {
  isZurichDigestTime,
  mapDigestLeg,
  mapDigestRecipient,
  runStaffDigest,
  type DigestDependencies,
} from "./digest";

type Call = "claim" | "send" | "sent" | "failed";

function dependencies(calls: Call[], claim = true): DigestDependencies {
  return {
    recipients: async () => [
      { userId: "staff-1", email: "dispatch@example.test", fullName: "Dispatch", language: "en" },
    ],
    legs: async () => [
      {
        reference: "VT-26-0001",
        scheduledLocal: "2026-10-25T08:30",
        pickupText: "Zurich Airport",
        dropoffText: "Zermatt",
        status: "confirmed",
      },
    ],
    claim: async () => {
      calls.push("claim");
      return claim;
    },
    markSent: async () => {
      calls.push("sent");
    },
    markFailed: async () => {
      calls.push("failed");
    },
    send: async () => {
      calls.push("send");
    },
  };
}

describe("Zurich scheduled staff digest", () => {
  it("runs only at 06:00 Europe/Zurich across both DST offsets", () => {
    expect(isZurichDigestTime(new Date("2026-01-15T05:00:00.000Z"))).toBe(true);
    expect(isZurichDigestTime(new Date("2026-07-15T04:00:00.000Z"))).toBe(true);
    expect(isZurichDigestTime(new Date("2026-07-15T05:00:00.000Z"))).toBe(false);
  });

  it("claims the per-staff Zurich-date ledger before real send and records success", async () => {
    const calls: Call[] = [];
    const result = await runStaffDigest(
      new Date("2026-10-25T05:00:00.000Z"),
      dependencies(calls),
    );
    expect(result).toEqual({ date: "2026-10-25", recipients: 1, sent: 1, failed: 0, skipped: 0 });
    expect(calls).toEqual(["claim", "send", "sent"]);
  });

  it("sends a safe zero-bookings digest rather than omitting the day", async () => {
    const calls: Call[] = [];
    const deps = dependencies(calls);
    deps.legs = async () => [];
    let text = "";
    deps.send = async (_recipient, digest) => {
      calls.push("send");
      text = digest.text;
    };
    const result = await runStaffDigest(new Date("2026-10-25T05:00:00.000Z"), deps);
    expect(result.sent).toBe(1);
    expect(text).toContain("No booking legs are scheduled");
  });

  it("does not send when an existing successful ledger row cannot be claimed", async () => {
    const calls: Call[] = [];
    const result = await runStaffDigest(
      new Date("2026-10-25T05:00:00.000Z"),
      dependencies(calls, false),
    );
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(calls).toEqual(["claim"]);
  });

  it("records a retryable failed ledger state when the provider rejects a send", async () => {
    const calls: Call[] = [];
    const deps = dependencies(calls);
    deps.send = async () => {
      calls.push("send");
      throw new Error("provider unavailable");
    };
    const result = await runStaffDigest(new Date("2026-10-25T05:00:00.000Z"), deps);
    expect(result.failed).toBe(1);
    expect(calls).toEqual(["claim", "send", "failed"]);
  });
});

describe("digest RPC row mapping", () => {
  it("maps staff_digest_recipients snake_case columns onto DigestRecipient", () => {
    expect(
      mapDigestRecipient({
        user_id: "staff-1",
        email: "dispatch@example.test",
        full_name: "Dispatch",
        lang: "de",
      }),
    ).toEqual({
      userId: "staff-1",
      email: "dispatch@example.test",
      fullName: "Dispatch",
      language: "de",
    });
  });

  it("maps staff_digest_legs snake_case columns onto DigestLeg", () => {
    expect(
      mapDigestLeg({
        reference: "VT-26-0001",
        scheduled_local: "2026-10-25T08:30",
        pickup_text: "Zurich Airport",
        dropoff_text: "Zermatt",
        status: "confirmed",
      }),
    ).toEqual({
      reference: "VT-26-0001",
      scheduledLocal: "2026-10-25T08:30",
      pickupText: "Zurich Airport",
      dropoffText: "Zermatt",
      status: "confirmed",
    });
  });
});
