// apps/web/lib/checkout/set-pay-link.ts

import type postgres from "postgres";

export async function setPayLink(
  sql: postgres.TransactionSql,
  args: {
    bookingId: string;
    billingKind: "individual" | "company";
    companyName: string;
    companyAddress: string;
    companyVat: string;
    payerEmail: string;
    tokenHash: Uint8Array;
    tokenExpiresAt: Date;
  },
): Promise<string> {
  const rows = await sql`
    select public.checkout_set_pay_link(
      ${args.bookingId}::uuid,
      ${args.billingKind},
      ${args.companyName},
      ${args.companyAddress},
      ${args.companyVat},
      ${args.payerEmail},
      ${args.tokenHash},
      ${args.tokenExpiresAt.toISOString()}::timestamptz
    ) as sent_at
  `;
  const sent = rows[0]?.sent_at;
  return sent instanceof Date ? sent.toISOString() : String(sent);
}
