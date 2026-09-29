// packages/db/test/local/pg-types.test.ts
// Pure (no database): the array parser and serializer the Worker's clients register.
import { describe, expect, it } from "vitest";
import { parsePgArray, pgArrayTypes, serializePgArray } from "../../src/pg-types.js";

describe("pg-types", () => {
  it("parses plain, quoted, escaped, empty and NULL elements", () => {
    expect(parsePgArray("{}")).toEqual([]);
    expect(parsePgArray("{cs_1}")).toEqual(["cs_1"]);
    expect(parsePgArray('{a,"b,c","d\\"e","f\\\\g",NULL,"NULL",""}')).toEqual([
      "a", "b,c", 'd"e', "f\\g", null, "NULL", "",
    ]);
    expect(parsePgArray("{{1,2},{3,4}}")).toEqual([["1", "2"], ["3", "4"]]);
    expect(parsePgArray("[1:2]={x,y}")).toEqual(["x", "y"]);
  });

  it("serializes with every element quoted, so no value can end its element", () => {
    expect(serializePgArray([])).toBe("{}");
    expect(serializePgArray(["a"])).toBe('{"a"}');
    expect(serializePgArray(['x","y', "\\", "NULL", null])).toBe('{"x\\",\\"y","\\\\","NULL",NULL}');
    expect(parsePgArray(serializePgArray(['x","y}', "{", "\\"]))).toEqual(['x","y}', "{", "\\"]);
  });

  it("registers text[], int2[], int4[] and uuid[]", () => {
    const parse = (k: string, s: string) => (pgArrayTypes[k] as { parse: (x: string) => unknown }).parse(s);
    expect(parse("textArray", "{a,b}")).toEqual(["a", "b"]);
    expect(parse("int2Array", "{1,7}")).toEqual([1, 7]);
    expect(parse("int4Array", "{3,NULL}")).toEqual([3, null]);
    expect(parse("uuidArray", "{7d8c9c3e-1f5a-4b0e-9a55-0c4a3a1f2b10}")).toEqual(["7d8c9c3e-1f5a-4b0e-9a55-0c4a3a1f2b10"]);
  });
});
