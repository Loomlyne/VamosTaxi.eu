// F12: the address in an e-mailed sign-in link is sealed, bound to its token_hash.
import { describe, expect, it } from "vitest";
import { openAddress, sealAddress } from "@/lib/auth/sealed-address";

const SECRET = "v1,whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ";

describe("sealed address", () => {
  it("round-trips the address for the same token_hash", async () => {
    const sealed = await sealAddress("Mia@Example.com", "hash-1", SECRET);
    expect(sealed).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain("mia");
    expect(await openAddress(sealed, "hash-1", SECRET)).toBe("mia@example.com");
  });

  it("does not seal the same address twice to the same string", async () => {
    const a = await sealAddress("mia@example.com", "hash-1", SECRET);
    const b = await sealAddress("mia@example.com", "hash-1", SECRET);
    expect(a).not.toBe(b);
  });

  it("refuses a different token_hash (cannot be moved to another link)", async () => {
    const sealed = await sealAddress("mia@example.com", "hash-1", SECRET);
    expect(await openAddress(sealed, "hash-2", SECRET)).toBeNull();
  });

  it("refuses a tampered value", async () => {
    const sealed = (await sealAddress("mia@example.com", "hash-1", SECRET)) as string;
    const flipped = sealed.slice(0, -2) + (sealed.endsWith("AA") ? "BB" : "AA");
    expect(await openAddress(flipped, "hash-1", SECRET)).toBeNull();
    expect(await openAddress("not-a-seal", "hash-1", SECRET)).toBeNull();
    expect(await openAddress("", "hash-1", SECRET)).toBeNull();
    expect(await openAddress(null, "hash-1", SECRET)).toBeNull();
  });

  it("refuses a seal made with another secret", async () => {
    const sealed = await sealAddress("mia@example.com", "hash-1", "other-secret");
    expect(await openAddress(sealed, "hash-1", SECRET)).toBeNull();
  });

  it("answers null (not a crash) when the secret is missing", async () => {
    expect(await sealAddress("mia@example.com", "hash-1", undefined)).toBeNull();
    expect(await sealAddress("mia@example.com", "hash-1", "")).toBeNull();
    const sealed = await sealAddress("mia@example.com", "hash-1", SECRET);
    expect(await openAddress(sealed, "hash-1", undefined)).toBeNull();
  });

  it("refuses an empty token_hash", async () => {
    expect(await sealAddress("mia@example.com", "", SECRET)).toBeNull();
  });
});
