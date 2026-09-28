import { describe, expect, it } from "vitest";
import {
  asVehicleClassUuid,
  classDeleteReply,
  parseClassDeleteReason,
  planVehicleClassWrite,
} from "./vehicle-class-write";

const economy = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  slug: "economy",
};
const catalog = [economy];
const minted = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("planVehicleClassWrite", () => {
  it("updates when the incoming id is already in the catalog", () => {
    expect(planVehicleClassWrite(economy.id, "economy", catalog)).toEqual({
      mode: "update",
      id: economy.id,
    });
  });

  it("reattaches by slug when the photo picker minted a UUID that is not a class", () => {
    expect(planVehicleClassWrite(minted, "economy", catalog)).toEqual({
      mode: "update",
      id: economy.id,
    });
  });

  it("inserts with the minted UUID when the name is a new class", () => {
    expect(planVehicleClassWrite(minted, "suv", catalog)).toEqual({
      mode: "insert",
      id: minted,
    });
  });

  it("inserts without an id when Add has no photo mint", () => {
    expect(planVehicleClassWrite("", "suv", catalog)).toEqual({
      mode: "insert",
      id: null,
    });
  });

  it("reattaches by slug when Add has no photo and the name already exists", () => {
    expect(planVehicleClassWrite("", "economy", catalog)).toEqual({
      mode: "update",
      id: economy.id,
    });
  });

  it("ignores a non-uuid vehicleClassId so a photo mint is required to pin the id", () => {
    expect(asVehicleClassUuid("not-a-uuid")).toBe("");
    expect(planVehicleClassWrite("not-a-uuid", "suv", catalog)).toEqual({
      mode: "insert",
      id: null,
    });
  });
});

describe("class delete-or-hide (26.1-19 D-15)", () => {
  it("reads the optional hide reason: trimmed, blank means none", () => {
    expect(parseClassDeleteReason(undefined)).toEqual({ ok: true, reason: null });
    expect(parseClassDeleteReason(null)).toEqual({ ok: true, reason: null });
    expect(parseClassDeleteReason("   ")).toEqual({ ok: true, reason: null });
    expect(parseClassDeleteReason("  Retired from the fleet ")).toEqual({
      ok: true,
      reason: "Retired from the fleet",
    });
  });

  it("refuses a reason over 140 characters or a non-string", () => {
    expect(parseClassDeleteReason("x".repeat(140))).toEqual({ ok: true, reason: "x".repeat(140) });
    expect(parseClassDeleteReason("x".repeat(141))).toEqual({ ok: false });
    expect(parseClassDeleteReason(42)).toEqual({ ok: false });
  });

  it("maps the database answer to the JSON door", () => {
    const id = economy.id;
    expect(classDeleteReply(id, "deleted")).toEqual({
      status: 200,
      body: { ok: true, data: { id, result: "deleted" } },
    });
    expect(classDeleteReply(id, "hidden")).toEqual({
      status: 200,
      body: { ok: true, data: { id, result: "hidden" } },
    });
    expect(classDeleteReply(id, "in-use")).toEqual({
      status: 409,
      body: { ok: false, code: "in-use" },
    });
  });
});
