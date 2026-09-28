import { describe, expect, it } from "vitest";
import { classDisplayName, liveClassSlug } from "./class-slug";

// D-14: Economy (saden), Business (mercedes-benz-v-class), Van luxury (van-luxury).

describe("liveClassSlug (D-14)", () => {
  it("resolves the three display names to the live slugs", () => {
    expect(liveClassSlug("Economy")).toBe("saden");
    expect(liveClassSlug("Business")).toBe("mercedes-benz-v-class");
    expect(liveClassSlug("Van luxury")).toBe("van-luxury");
    expect(liveClassSlug("  van LUXURY ")).toBe("van-luxury");
  });

  it("accepts the live slugs themselves", () => {
    expect(liveClassSlug("saden")).toBe("saden");
    expect(liveClassSlug("mercedes-benz-v-class")).toBe("mercedes-benz-v-class");
    expect(liveClassSlug("van-luxury")).toBe("van-luxury");
    expect(liveClassSlug("Saden")).toBe("saden");
  });

  it("moves legacy names onto the live class", () => {
    expect(liveClassSlug("economy")).toBe("saden");
    expect(liveClassSlug("business")).toBe("mercedes-benz-v-class");
    expect(liveClassSlug("Van")).toBe("van-luxury");
  });

  it("does not resolve First or unknown values", () => {
    expect(liveClassSlug("First")).toBeNull();
    expect(liveClassSlug("first")).toBeNull();
    expect(liveClassSlug("")).toBeNull();
    expect(liveClassSlug("toString")).toBeNull();
    expect(liveClassSlug("mahaha")).toBeNull();
  });
});

describe("classDisplayName (D-14)", () => {
  it("names live and legacy slugs by the three classes", () => {
    expect(classDisplayName("saden")).toBe("Economy");
    expect(classDisplayName("economy")).toBe("Economy");
    expect(classDisplayName("mercedes-benz-v-class")).toBe("Business");
    expect(classDisplayName("business")).toBe("Business");
    expect(classDisplayName("van-luxury")).toBe("Van luxury");
    expect(classDisplayName("van")).toBe("Van luxury");
  });

  it("never returns First", () => {
    expect(classDisplayName("first")).not.toBe("First");
  });
});
