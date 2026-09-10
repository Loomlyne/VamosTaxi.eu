// apps/web/lib/ops/ticket-inbound.ts
//
// Resend email.received → support_messages inbound_email. Unmatched To is dropped.

import { asSystem } from "@/lib/db/identity";
import {
  inboundBody,
  inboundFromAddress,
  inboundTicketStatus,
  tokenFromInboundTo,
  type InboundPayload,
} from "@/lib/ops/ticket-mail";
import type { TicketStatus } from "@/lib/ops/tickets-map";

export type { InboundPayload };
export { inboundBody, readInboundPayload } from "@/lib/ops/ticket-mail";

const STATUSES = new Set<TicketStatus>(["new", "open", "replied", "responded", "closed"]);

function asStatus(raw: string | null): TicketStatus {
  const value = String(raw ?? "").trim().toLowerCase();
  return STATUSES.has(value as TicketStatus) ? (value as TicketStatus) : "new";
}

export async function ingestInboundEmail(
  env: CloudflareEnv,
  payload: InboundPayload,
): Promise<"ok" | "drop" | "unavailable"> {
  const token = tokenFromInboundTo(payload.to);
  const body = inboundBody(payload);
  const fromAddress = inboundFromAddress(payload.from);
  if (!token || !body) return "drop";

  try {
    return await asSystem(env, async (sql) => {
      const inserted = await sql<{ email_id: string }[]>`
        insert into public.support_inbound_events (email_id)
        values (${payload.emailId})
        on conflict (email_id) do nothing
        returning email_id
      `;
      if (inserted.length === 0) return "ok";

      const tickets = await sql<{ id: string; ticket_status: string | null }[]>`
        select id, ticket_status
        from public.contact_submissions
        where reply_token = ${token}
        limit 1
      `;
      const ticket = tickets[0];
      if (!ticket) return "drop";

      const next = inboundTicketStatus(asStatus(ticket.ticket_status));
      await sql`
        insert into public.support_messages (
          submission_id, direction, from_address, body_text
        )
        values (
          ${ticket.id}::uuid,
          'inbound_email',
          ${fromAddress},
          ${body}
        )
      `;
      await sql`
        update public.contact_submissions
        set
          ticket_status = ${next},
          last_activity_at = now(),
          closed_at = null
        where id = ${ticket.id}::uuid
      `;
      return "ok";
    });
  } catch {
    return "unavailable";
  }
}
