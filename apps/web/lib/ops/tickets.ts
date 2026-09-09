// apps/web/lib/ops/tickets.ts
//
// Read-only ops Support board. Source is contact_submissions + support_messages.
// No fixture rows. Contact-form writes already land in Postgres.

import { asStaff, type VamosClaims } from "@/lib/db/identity";
import {
  mapTicket,
  type OpsTicketRow,
  type SqlMessage,
  type SqlSubmission,
} from "@/lib/ops/tickets-map";

export type { OpsTicketRow } from "@/lib/ops/tickets-map";
export { mapTicket } from "@/lib/ops/tickets-map";

export const dynamic = "force-dynamic";

export async function loadTickets(env: CloudflareEnv, claims: VamosClaims): Promise<OpsTicketRow[]> {
  return asStaff(env, claims, async (sql) => {
    const submissions = await sql<SqlSubmission[]>`
      select
        s.id,
        s.name,
        s.email::text as email,
        s.phone,
        s.booking_ref,
        s.message,
        s.locale,
        s.ticket_status,
        s.created_at,
        s.last_activity_at
      from public.contact_submissions s
      order by s.created_at desc
    `;
    if (submissions.length === 0) return [];
    const ids = submissions.map((row) => row.id);
    const messages = await sql<SqlMessage[]>`
      select
        m.submission_id,
        m.direction,
        m.body_text,
        m.created_at
      from public.support_messages m
      where m.submission_id in ${sql(ids)}
      order by m.created_at asc
    `;
    const bySubmission = new Map<string, SqlMessage[]>();
    for (const message of messages) {
      const list = bySubmission.get(message.submission_id) ?? [];
      list.push(message);
      bySubmission.set(message.submission_id, list);
    }
    return submissions.map((row) => mapTicket(row, bySubmission.get(row.id) ?? []));
  });
}
