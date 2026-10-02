// 261002 settle safety: which errors of the Stripe-event settle a retry can cure.
import { describe, expect, it } from "vitest";
import { PAID_ERROR_RETRY_SECONDS, retryDelaySeconds, settleErrorKind, sqlStateOf } from "./settle-errors";

function pg(code: string): Error & { code: string } {
  return Object.assign(new Error(`pg ${code}`), { code });
}

describe("sqlStateOf", () => {
  it("reads a string code and nothing else", () => {
    expect(sqlStateOf(pg("40P01"))).toBe("40P01");
    expect(sqlStateOf(new Error("x"))).toBeUndefined();
    expect(sqlStateOf({ code: 40 })).toBeUndefined();
    expect(sqlStateOf(null)).toBeUndefined();
    expect(sqlStateOf("40P01")).toBeUndefined();
  });
});

describe("settleErrorKind / retryDelaySeconds", () => {
  const table: Array<[string, unknown, "transient" | "permanent", number | null]> = [
    ["08006 connection failure", pg("08006"), "transient", 60],
    ["08P01 protocol violation (class 08)", pg("08P01"), "transient", 60],
    ["53300 too many connections", pg("53300"), "transient", 60],
    ["58030 io error", pg("58030"), "transient", 60],
    ["40001 serialization failure", pg("40001"), "transient", 5],
    ["40P01 deadlock detected", pg("40P01"), "transient", 5],
    ["55P03 lock not available", pg("55P03"), "transient", 5],
    ["57014 query canceled", pg("57014"), "transient", 60],
    ["57P01 admin shutdown", pg("57P01"), "transient", 60],
    ["57P02 crash shutdown", pg("57P02"), "transient", 60],
    ["57P03 cannot connect now", pg("57P03"), "transient", 60],
    ["a thrown Error with no code", new Error("socket hang up"), "transient", 60],
    ["postgres.js CONNECTION_CLOSED", Object.assign(new Error("closed"), { code: "CONNECTION_CLOSED" }), "transient", 60],
    ["postgres.js CONNECTION_ENDED", Object.assign(new Error("ended"), { code: "CONNECTION_ENDED" }), "transient", 60],
    ["postgres.js CONNECTION_DESTROYED", Object.assign(new Error("gone"), { code: "CONNECTION_DESTROYED" }), "transient", 60],
    ["postgres.js CONNECT_TIMEOUT", Object.assign(new Error("slow"), { code: "CONNECT_TIMEOUT" }), "transient", 60],
    ["ECONNRESET", Object.assign(new Error("reset"), { code: "ECONNRESET" }), "transient", 60],
    ["a non-error value", "boom", "transient", 60],
    ["P0001 raised by the function", pg("P0001"), "permanent", null],
    ["P0002 no data found", pg("P0002"), "permanent", null],
    ["23505 unique violation", pg("23505"), "permanent", null],
    ["23P01 exclusion violation", pg("23P01"), "permanent", null],
    ["22023 invalid parameter", pg("22023"), "permanent", null],
    ["42501 insufficient privilege", pg("42501"), "permanent", null],
    ["XX000 internal error", pg("XX000"), "permanent", null],
  ];

  it.each(table)("%s", (_name, err, kind, delay) => {
    expect(settleErrorKind(err)).toBe(kind);
    if (kind === "transient") expect(retryDelaySeconds(err)).toBe(delay);
  });

  it("waits 300 seconds after a permanent error once money was captured", () => {
    expect(PAID_ERROR_RETRY_SECONDS).toBe(300);
  });
});
