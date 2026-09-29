// packages/db/src/pg-types.ts
//
// Array parsing and serializing for the Worker's postgres.js clients (quick 260929-pga).
//
// Both clients (`identity.ts` `client()`, `public.ts` `publicSql()`) keep `fetch_types: false`
// so a cold Worker request does not spend a round trip reading pg_type. With that option
// postgres.js registers NO array handling: a `text[]` column arrives as the string
// "{a,b}", and a JS array parameter is sent as `String(array)` ("a,b"), which Postgres refuses
// ("malformed array literal"). The array oids below are fixed by Postgres and never change, so
// they are registered here once, for both clients, instead of being fetched.
//
// Binding rule: postgres.js types a plain JS array parameter as 0 ("unknown"), and no
// serializer runs for type 0. Bind arrays with an explicit oid: `sql.array(values, PG_OID.text_array)`.
// A string already shaped like an array literal (`pgTextArrayLiteral(...)` + `::text[]`) is a
// plain string parameter of type 0, is never touched by these serializers, and needs no change.

import type postgres from "postgres";

/** Array type oids (pg_type.oid of `_text`, `_int2`, `_int4`, `_uuid`). Fixed across Postgres. */
export const PG_OID = {
  text_array: 1009,
  int2_array: 1005,
  int4_array: 1007,
  uuid_array: 2951,
} as const;

type Element = string | null | Element[];

/**
 * Parse a Postgres array literal ("{a,\"b,c\",NULL}") into strings, `null` for an unquoted
 * NULL. Nested arrays parse recursively. `{}` is `[]`. Element parsing (numbers) is the caller's.
 */
export function parsePgArray(literal: string): Element[] {
  // Optional dimension decoration: "[1:2]={a,b}".
  const start = literal.startsWith("[") ? literal.indexOf("=") + 1 : 0;
  let i = start;
  if (literal[i] !== "{") throw new Error("malformed array literal from Postgres");

  function readArray(): Element[] {
    i += 1; // consume "{"
    const out: Element[] = [];
    if (literal[i] === "}") {
      i += 1;
      return out;
    }
    for (;;) {
      const ch = literal[i];
      if (ch === "{") {
        out.push(readArray());
      } else if (ch === '"') {
        i += 1;
        let text = "";
        for (;;) {
          const c = literal[i];
          if (c === undefined) throw new Error("malformed array literal from Postgres");
          if (c === "\\") {
            text += literal[i + 1] ?? "";
            i += 2;
          } else if (c === '"') {
            i += 1;
            break;
          } else {
            text += c;
            i += 1;
          }
        }
        out.push(text);
      } else {
        let end = i;
        while (end < literal.length && literal[end] !== "," && literal[end] !== "}") end += 1;
        const raw = literal.slice(i, end);
        out.push(raw === "NULL" ? null : raw);
        i = end;
      }
      const sep = literal[i];
      i += 1;
      if (sep === "}") return out;
      if (sep !== ",") throw new Error("malformed array literal from Postgres");
    }
  }

  return readArray();
}

function serializeElement(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (Array.isArray(value)) return `{${value.map(serializeElement).join(",")}}`;
  const text = typeof value === "string" ? value : String(value);
  // Always quoted: escapes backslash and double quote; also keeps "NULL", "", commas and braces literal.
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** JS array to a Postgres array literal. Every element is quoted, so nothing in a value can end the element. */
export function serializePgArray(values: readonly unknown[]): string {
  return `{${values.map(serializeElement).join(",")}}`;
}

function mapLeaves(tree: Element[], leaf: (raw: string) => unknown): unknown[] {
  return tree.map((node) => (Array.isArray(node) ? mapLeaves(node, leaf) : node === null ? null : leaf(node)));
}

const asString = (raw: string): string => raw;
const asInt = (raw: string): number => Number.parseInt(raw, 10);

function arrayType(oid: number, leaf: (raw: string) => unknown) {
  return {
    to: oid,
    from: [oid],
    serialize: (value: unknown): string =>
      Array.isArray(value) ? serializePgArray(value) : (value as string),
    parse: (literal: string): unknown => mapLeaves(parsePgArray(literal), leaf),
  };
}

/**
 * postgres.js `types` option, shared by both Worker clients. text[], int2[], int4[] and uuid[]
 * cover every array type the Worker reads or writes (audit in `.planning/quick/260929-pga-*`).
 * jsonb needs nothing here: postgres.js parses json/jsonb by default, including arrays inside it.
 */
export const pgArrayTypes: Record<string, postgres.PostgresType> = {
  textArray: arrayType(PG_OID.text_array, asString),
  int2Array: arrayType(PG_OID.int2_array, asInt),
  int4Array: arrayType(PG_OID.int4_array, asInt),
  uuidArray: arrayType(PG_OID.uuid_array, asString),
};
