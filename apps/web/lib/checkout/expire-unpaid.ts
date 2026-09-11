import { asSystem } from "../db/identity";

export async function expireUnpaidBookings(env: CloudflareEnv): Promise<number> {
  const rows = await asSystem(env, async (sql) => {
    return sql<{ reference: string }[]>`
      select reference from public.checkout_expire_unpaid()
    `;
  });
  return rows.length;
}
