// apps/web/lib/checkout/pg-array.ts
//
// Postgres `text[]` literal. A 1-element JS array binds as a scalar through the Worker's client
// (`fetch_types: false`); `::text[]` then throws 22P02. Pass the literal and cast it.
export function pgTextArrayLiteral(values: string[]): string {
  return `{${values.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}
