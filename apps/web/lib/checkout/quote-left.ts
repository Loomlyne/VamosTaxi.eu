// A quote dropped by leaving /checkout/payment must not be paid again.

import type postgres from "postgres";

export async function quoteWasLeft(
  sql: postgres.TransactionSql,
  quoteId: string,
): Promise<boolean> {
  const rows = await sql<{ left: boolean | null }[]>`
    select public.checkout_quote_left(${quoteId}::uuid) as left
  `;
  return rows[0]?.left === true;
}
