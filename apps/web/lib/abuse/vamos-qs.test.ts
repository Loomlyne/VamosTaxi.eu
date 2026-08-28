// apps/web/lib/abuse/vamos-qs.test.ts
//
// Signed visitor cookie proofs (D-36). Secrets are obviously-fake fixed strings.

import { describe, expect, it } from "vitest";
import {
  mintVamosQs,
  VAMOS_QS_ATTRS,
  VAMOS_QS_COOKIE,
  verifyVamosQs,
} from "./vamos-qs";

/** Obviously-fake visitor-cookie secret — not a real credential shape. */
const FAKE_QS_SECRET = "test-vamos-qs-secret-not-a-real-credential-00";

describe("VAMOS_QS constants", () => {
  it("exports the cookie name and exact attribute string", () => {
    expect(VAMOS_QS_COOKIE).toBe("vamos_qs");
    expect(VAMOS_QS_ATTRS).toBe(
      "HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400",
    );
  });
});

describe("mintVamosQs / verifyVamosQs", () => {
  it("mints visitorId.mac and verifies back to the same id", async () => {
    const visitorId = "00000000-0000-4000-8000-0000000000aa";
    const token = await mintVamosQs(FAKE_QS_SECRET, visitorId);
    expect(token.startsWith(`${visitorId}.`)).toBe(true);
    expect(token.split(".")).toHaveLength(2);
    expect(await verifyVamosQs(FAKE_QS_SECRET, token)).toBe(visitorId);
  });

  it("is stable for the same secret and visitor id", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const a = await mintVamosQs(FAKE_QS_SECRET, id);
    const b = await mintVamosQs(FAKE_QS_SECRET, id);
    expect(a).toBe(b);
  });

  it("returns null for an unsigned bare UUID (indistinguishable from missing)", async () => {
    const bare = "22222222-2222-4222-8222-222222222222";
    expect(await verifyVamosQs(FAKE_QS_SECRET, bare)).toBeNull();
  });

  it("returns null for a wrong MAC", async () => {
    const id = "33333333-3333-4333-8333-333333333333";
    const token = await mintVamosQs(FAKE_QS_SECRET, id);
    const [vid, mac] = token.split(".") as [string, string];
    const flipped = `${vid}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`;
    expect(await verifyVamosQs(FAKE_QS_SECRET, flipped)).toBeNull();
  });

  it("returns null for malformed values and missing cookie", async () => {
    expect(await verifyVamosQs(FAKE_QS_SECRET, "")).toBeNull();
    expect(await verifyVamosQs(FAKE_QS_SECRET, null)).toBeNull();
    expect(await verifyVamosQs(FAKE_QS_SECRET, undefined)).toBeNull();
    expect(await verifyVamosQs(FAKE_QS_SECRET, ".")).toBeNull();
    expect(await verifyVamosQs(FAKE_QS_SECRET, ".maconly")).toBeNull();
    expect(await verifyVamosQs(FAKE_QS_SECRET, "idonly.")).toBeNull();
    expect(await verifyVamosQs(FAKE_QS_SECRET, "a.b.c")).toBeNull();
  });

  it("does not accept a token signed with a different secret", async () => {
    const id = "44444444-4444-4444-8444-444444444444";
    const token = await mintVamosQs(FAKE_QS_SECRET, id);
    expect(
      await verifyVamosQs("other-fake-vamos-qs-secret-xx", token),
    ).toBeNull();
  });
});
