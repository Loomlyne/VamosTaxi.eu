// apps/web/lib/checkout/me.ts
//
// GET /api/checkout/me — pure logic (D-13). Prefill for a signed-in customer:
// name, e-mail and phone. Guests, and erased customers (customer_id_for_user
// returns null for them), get only { signed_in: false }.

export type MeRow = { full_name: string; email: string; phone: string };

export type MeAnswer =
  | { signed_in: false }
  | { signed_in: true; email: string; first_name: string; last_name: string; phone: string };

export type MeDeps = {
  /** customers.id of the verified session, null for guests and erased customers. */
  customerId: () => Promise<string | null>;
  /** Own-row read under RLS with the verified claims. */
  readOwnRow: () => Promise<MeRow | null>;
};

export function splitName(fullName: string): { first: string; last: string } {
  const trimmed = fullName.trim();
  const at = trimmed.indexOf(" ");
  if (at < 0) return { first: trimmed, last: "" };
  return { first: trimmed.slice(0, at), last: trimmed.slice(at + 1).trim() };
}

export async function meWithDeps(deps: MeDeps): Promise<MeAnswer> {
  const id = await deps.customerId();
  if (!id) return { signed_in: false };
  const row = await deps.readOwnRow();
  if (!row) return { signed_in: false };
  const { first, last } = splitName(row.full_name ?? "");
  return {
    signed_in: true,
    email: row.email ?? "",
    first_name: first,
    last_name: last,
    phone: row.phone ?? "",
  };
}
