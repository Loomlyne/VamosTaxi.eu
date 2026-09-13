import { asSystem } from "../db/identity";
import { notifyExpiredForBookings } from "./lock-mail";

/**
 * Hourly worker entry. The RPC (18-02 / D-22) cancels unpaid pending rows
 * whose price_snapshots.quote_lock_expires_at is past — not created_at + 24h
 * and not the live book's current lock hours. Paid trips are out of scope
 * (status = pending only). Then skip-send the expired mail (D-24).
 */
export async function expireUnpaidBookings(env: CloudflareEnv): Promise<number> {
  const rows = await asSystem(env, async (sql) => {
    return sql<{ booking_id: string; reference: string }[]>`
      select booking_id, reference from public.checkout_expire_unpaid()
    `;
  });
  const ids = rows
    .map((row) => String(row.booking_id ?? ""))
    .filter((id) => id.length > 0);
  await notifyExpiredForBookings(env, ids);
  return rows.length;
}
