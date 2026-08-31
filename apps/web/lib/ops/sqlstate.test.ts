// apps/web/lib/ops/sqlstate.test.ts
//
// Branches on err.code only. No CHF figures.

import { describe, expect, it } from "vitest";
import { OPS_SQLSTATE, mapSqlState } from "./sqlstate";

describe("mapSqlState", () => {
  it("maps 23001 to restrict", () => {
    const result = mapSqlState({ code: "23001" });
    expect(result).toEqual({
      kind: "restrict",
      code: OPS_SQLSTATE.restrict,
      key: "pricing.failure-restrict",
    });
  });

  it("maps 23505 to unique", () => {
    const result = mapSqlState({ code: "23505" });
    expect(result).toEqual({
      kind: "unique",
      code: OPS_SQLSTATE.unique,
      key: "pricing.failure-unique",
    });
  });

  it("maps 23514 to check", () => {
    const result = mapSqlState({ code: "23514" });
    expect(result).toEqual({
      kind: "check",
      code: OPS_SQLSTATE.check,
      key: "pricing.failure-check",
    });
  });

  it("maps 42501 to privilege", () => {
    const result = mapSqlState({ code: "42501" });
    expect(result).toEqual({
      kind: "privilege",
      code: OPS_SQLSTATE.privilege,
      key: "pricing.failure-privilege",
    });
  });

  it("maps P0002 to no-data", () => {
    const result = mapSqlState({ code: "P0002" });
    expect(result).toEqual({
      kind: "no-data",
      code: OPS_SQLSTATE.noData,
      key: "pricing.failure-no-data",
    });
  });

  it("returns unknown for any other code", () => {
    expect(mapSqlState({ code: "25P02" })).toEqual({ kind: "unknown" });
    expect(mapSqlState({})).toEqual({ kind: "unknown" });
    expect(mapSqlState(null)).toEqual({ kind: "unknown" });
  });

  it("reads only code, never other enumerable fields", () => {
    const result = mapSqlState({
      code: "23001",
      detail: "rate_version 1 has 3 unpriced distance_rates rows",
    });
    expect(result.kind).toBe("restrict");
    expect(JSON.stringify(result)).not.toMatch(/unpriced/);
  });
});

describe("OPS_SQLSTATE", () => {
  it("is frozen and lists the five codes", () => {
    expect(Object.isFrozen(OPS_SQLSTATE)).toBe(true);
    expect(OPS_SQLSTATE).toEqual({
      restrict: "23001",
      unique: "23505",
      check: "23514",
      privilege: "42501",
      noData: "P0002",
    });
  });
});
