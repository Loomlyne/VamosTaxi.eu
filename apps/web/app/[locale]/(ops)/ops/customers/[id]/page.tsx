import { notFound } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { BookingHistoryList } from "@/components/ops/BookingHistoryList";
import { CustomerDetail } from "@/components/ops/CustomerDetail";
import { loadCustomerHistory } from "@/lib/ops/customers";
import { requireStaffClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OpsCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
  const claims = await requireStaffClaims(supabase);
  const { env } = getCloudflareContext();
  const history = await loadCustomerHistory(env, claims, id);
  if (!history) {
    notFound();
  } else {
    return (
      <section data-page="ops-customer-detail">
        <CustomerDetail customer={history.customer} />
        <BookingHistoryList bookings={history.bookings} />
      </section>
    );
  }
}
