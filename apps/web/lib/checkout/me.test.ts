import { describe, expect, it, vi } from "vitest";
import { meWithDeps, splitName } from "./me";

describe("meWithDeps", () => {
  it("guest -> signed_in false, no row read", async () => {
    const readOwnRow = vi.fn();
    expect(await meWithDeps({ customerId: async () => null, readOwnRow })).toEqual({ signed_in: false });
    expect(readOwnRow).not.toHaveBeenCalled();
  });

  it("signed in -> name split on the first space", async () => {
    const a = await meWithDeps({
      customerId: async () => "c1",
      readOwnRow: async () => ({ full_name: "Ada van Rider", email: "ada@example.test", phone: "+41000000001" }),
    });
    expect(a).toEqual({
      signed_in: true,
      email: "ada@example.test",
      first_name: "Ada",
      last_name: "van Rider",
      phone: "+41000000001",
    });
  });

  it("single name -> empty last name", async () => {
    const a = await meWithDeps({
      customerId: async () => "c1",
      readOwnRow: async () => ({ full_name: "Ada", email: "a@example.test", phone: "" }),
    });
    expect(a).toMatchObject({ signed_in: true, first_name: "Ada", last_name: "" });
  });

  it("erased customer (no id) or hidden row -> signed_in false", async () => {
    expect(await meWithDeps({ customerId: async () => null, readOwnRow: async () => ({ full_name: "x", email: "x", phone: "" }) })).toEqual({ signed_in: false });
    expect(await meWithDeps({ customerId: async () => "c1", readOwnRow: async () => null })).toEqual({ signed_in: false });
  });

  it("splitName trims", () => {
    expect(splitName("  Ada   Rider ")).toEqual({ first: "Ada", last: "Rider" });
  });
});

describe("meWithDeps, 27.1 finish step", () => {
  it("an unfinished sign-in-link account answers finish_required and reads nothing else", async () => {
    const customerId = vi.fn(async () => "c1");
    const readOwnRow = vi.fn();
    const a = await meWithDeps({ customerId, readOwnRow, finishRequired: async () => true });
    expect(a).toEqual({ signed_in: true, finish_required: true });
    expect(customerId).not.toHaveBeenCalled();
    expect(readOwnRow).not.toHaveBeenCalled();
  });

  it("a finished account gets the usual prefill", async () => {
    const a = await meWithDeps({
      customerId: async () => "c1",
      readOwnRow: async () => ({ full_name: "Mia Keller", email: "mia@example.test", phone: "+41790000000" }),
      finishRequired: async () => false,
    });
    expect(a).toEqual({ signed_in: true, email: "mia@example.test", first_name: "Mia", last_name: "Keller", phone: "+41790000000" });
  });
});
