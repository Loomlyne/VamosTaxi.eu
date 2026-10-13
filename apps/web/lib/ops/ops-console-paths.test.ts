import { describe, expect, it } from "vitest";
import {
  isOpsConsolePath,
  legacyChauffeursPath,
  normalizeDashboardPath,
} from "./console-paths";

const ID = "8f14e45f-ceea-467a-9575-1f8a0b1a2c3d";

describe("ops console paths (Phase 30 CLS-11)", () => {
  it("serves /chauffeurs and /chauffeurs/<id> as console paths", () => {
    expect(isOpsConsolePath("/chauffeurs")).toBe(true);
    expect(isOpsConsolePath("/chauffeurs/")).toBe(true);
    expect(isOpsConsolePath(`/chauffeurs/${ID}`)).toBe(true);
    expect(isOpsConsolePath("/chauffeurs/a/b")).toBe(false);
  });

  it("keeps the other console paths", () => {
    for (const p of ["/dashboard", "/bookings", "/bookings/new", "/bookings/VT-1", "/customers", "/customers/c1", "/pricing", "/settings"]) {
      expect(isOpsConsolePath(p)).toBe(true);
    }
    expect(isOpsConsolePath("/nope")).toBe(false);
  });

  it("no longer serves the fleet addresses as console paths", () => {
    expect(isOpsConsolePath("/fleet")).toBe(false);
    expect(isOpsConsolePath("/fleet/chauffeurs")).toBe(false);
    expect(isOpsConsolePath(`/fleet/chauffeurs/${ID}`)).toBe(false);
  });

  it("maps the three old forms to /chauffeurs", () => {
    expect(legacyChauffeursPath("/fleet")).toBe("/chauffeurs");
    expect(legacyChauffeursPath("/fleet/chauffeurs")).toBe("/chauffeurs");
    expect(legacyChauffeursPath("/fleet/chauffeurs/")).toBe("/chauffeurs");
    expect(legacyChauffeursPath(`/fleet/chauffeurs/${ID}`)).toBe(`/chauffeurs/${ID}`);
  });

  it("returns null for anything else", () => {
    for (const p of ["/fleetx", "/pricing", "/chauffeurs", "/fleet/other", "/fleet/chauffeurs/a/b"]) {
      expect(legacyChauffeursPath(p)).toBeNull();
    }
  });

  it("normalizes a trailing slash and leaves the root alone", () => {
    expect(normalizeDashboardPath("/bookings/")).toBe("/bookings");
    expect(normalizeDashboardPath("/")).toBe("/");
    expect(normalizeDashboardPath("/bookings")).toBe("/bookings");
  });
});
