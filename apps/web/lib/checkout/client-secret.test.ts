import { describe, expect, it } from "vitest";
import { decodeClientSecret } from "./client-secret";

describe("decodeClientSecret", () => {
  it("keeps %2F inside a Checkout Session secret", () => {
    const secret =
      "cs_test_a1_secret_fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdwbEhqYWAnPydmcHZxamgneCUl";
    expect(decodeClientSecret(secret, undefined)).toBe(secret);
    expect(decodeClientSecret(secret, undefined)).toContain("%2F");
  });

  it("prefers hex so JSON cannot eat the secret", () => {
    const secret = "cs_test_secret_with_%2F_slash";
    const hex = Buffer.from(secret, "utf8").toString("hex");
    expect(decodeClientSecret("ignored", hex)).toBe(secret);
  });
});
