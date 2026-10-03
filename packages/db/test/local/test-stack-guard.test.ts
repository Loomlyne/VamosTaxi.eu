import { describe, expect, it } from "vitest";
import { assertThrowawayTestStack } from "../support/test-stack-guard";

const url = process.env.VAMOS_TEST_DB_URL;
const port = process.env.VAMOS_TEST_DB_PORT ?? "";

describe("assertThrowawayTestStack", () => {
  it("rejects a non-loopback host without connecting", async () => {
    await expect(
      assertThrowawayTestStack("postgres://u:p@db.example.supabase.co:5432/postgres", "5432"),
    ).rejects.toThrow(/not loopback/);
  });

  it("rejects a loopback URL on the wrong port without connecting", async () => {
    await expect(
      assertThrowawayTestStack("postgres://u:p@127.0.0.1:54322/postgres", "57322"),
    ).rejects.toThrow(/not the expected 57322/);
  });

  it.skipIf(!url)("rejects a loopback DB that lacks the marker role", async () => {
    await expect(
      assertThrowawayTestStack(url!, port, { markerRole: "vamos_no_such_marker_role" }),
    ).rejects.toThrow(/not a throwaway test stack/);
  });

  it.skipIf(!url)("resolves on a loopback DB with the marker role", async () => {
    await expect(assertThrowawayTestStack(url!, port)).resolves.toBeUndefined();
  });
});
