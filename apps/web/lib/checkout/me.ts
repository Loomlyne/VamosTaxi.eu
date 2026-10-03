// apps/web/lib/checkout/me.ts
//
// GET /api/checkout/me — pure logic (D-13). Prefill for a signed-in customer:
// name, e-mail and phone. Guests, and erased customers (customer_id_for_user
// returns null for them), get only { signed_in: false }.

export type MeRow = { full_name: string; email: string; phone: string };

export type MeAnswer =
  | { signed_in: false }
  /** 27.1: an account the sign-in link made that has not finished; the page sends it to the finish step. */
  | { signed_in: true; finish_required: true }
  | { signed_in: true; email: string; first_name: string; last_name: string; phone: string };

export type MeDeps = {
  /** customers.id of the verified session, null for guests and erased customers. */
  customerId: () => Promise<string | null>;
  /** Own-row read under RLS with the verified claims. */
  readOwnRow: () => Promise<MeRow | null>;
  /** 27.1: public.account_finish_required for the session; false when the read fails (never locks out). */
  finishRequired?: () => Promise<boolean>;
};

export function splitName(fullName: string): { first: string; last: string } {
  const trimmed = fullName.trim();
  const at = trimmed.indexOf(" ");
  if (at < 0) return { first: trimmed, last: "" };
  return { first: trimmed.slice(0, at), last: trimmed.slice(at + 1).trim() };
}

export async function meWithDeps(deps: MeDeps): Promise<MeAnswer> {
  if (deps.finishRequired && (await deps.finishRequired())) return { signed_in: true, finish_required: true };
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
