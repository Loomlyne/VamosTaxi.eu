// apps/web/lib/ops/tickets.ts
//
// Read-only ops Support board. Source is contact_submissions + support_messages.
// No fixture rows. Contact-form writes already land in Postgres.

import { asStaff, type VamosClaims } from "@/lib/db/identity";
import {
  mapTicket,
  type OpsTicketFile,
  type OpsTicketRow,
  type SqlMessage,
  type SqlSubmission,
} from "@/lib/ops/tickets-map";

export type { OpsTicketRow } from "@/lib/ops/tickets-map";
export { mapTicket } from "@/lib/ops/tickets-map";

export const dynamic = "force-dynamic";

function isMissingRelation(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  if (err?.code === "42P01") return true;
  const message = String(err?.message ?? "").toLowerCase();
  return (
    message.includes("undefined_table") ||
    message.includes("undefined table") ||
    message.includes("does not exist")
  );
}

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
        m.id,
        m.submission_id,
        m.direction,
        m.body_text,
        m.created_at,
        m.rfc_message_id
      from public.support_messages m
      where m.submission_id in ${sql(ids)}
      order by m.created_at asc
    `;
    const bySubmission = new Map<string, SqlMessage[]>();
    const messageIds: string[] = [];
    for (const message of messages) {
      const list = bySubmission.get(message.submission_id) ?? [];
      list.push(message);
      bySubmission.set(message.submission_id, list);
      if (message.id) messageIds.push(message.id);
    }
    const filesByMessageId: Record<string, OpsTicketFile[]> = {};
    if (messageIds.length > 0) {
      try {
        const files = await sql<
          {
            id: string;
            message_id: string;
            filename: string;
            content_type: string;
            kept: boolean;
          }[]
        >`
          select id, message_id, filename, content_type, kept
          from public.support_message_files
          where message_id in ${sql(messageIds)}
        `;
        for (const file of files) {
          const list = filesByMessageId[file.message_id] ?? [];
          list.push({
            id: file.id,
            filename: file.filename,
            contentType: file.content_type,
            kept: file.kept,
          });
          filesByMessageId[file.message_id] = list;
        }
      } catch (error) {
        if (!isMissingRelation(error)) throw error;
      }
    }
    return submissions.map((row) => mapTicket(row, bySubmission.get(row.id) ?? [], filesByMessageId));
  });
}
