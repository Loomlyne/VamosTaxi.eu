// apps/web/lib/ops/ticket-inbound.ts
//
// Resend email.received → support_messages inbound_email. Unmatched To is dropped.

import { asSystem } from "@/lib/db/identity";
import {
  asRfcMessageId,
  inboundBody,
  inboundFromAddress,
  inboundTicketStatus,
  parseInboundHeaders,
  publicPrefixFromInboundTargets,
  tokenFromInboundTargets,
  type InboundPayload,
} from "./ticket-mail";
import { storeInboundFiles } from "./ticket-inbound-files";
import type { TicketStatus } from "./tickets-map";

export type { InboundPayload };
export { inboundBody, readInboundPayload } from "./ticket-mail";

const STATUSES = new Set<TicketStatus>(["new", "open", "replied", "responded", "closed"]);
const UNREADABLE = "Message could not be read.";
const KEPT_FILES_BODY = "Attachment received.";

function asStatus(raw: string | null): TicketStatus {
  const value = String(raw ?? "").trim().toLowerCase();
  return STATUSES.has(value as TicketStatus) ? (value as TicketStatus) : "new";
}

function inboundStoredBody(payload: InboundPayload): string {
  const body = inboundBody(payload);
  if (body) return body;
  const files = payload.attachments;
  if (Array.isArray(files) && files.length > 0) return KEPT_FILES_BODY;
  return UNREADABLE;
}

export async function ingestInboundEmail(
  env: CloudflareEnv,
  payload: InboundPayload,
): Promise<"ok" | "drop" | "unavailable"> {
  const token = tokenFromInboundTargets(payload.to, payload.receivedFor);
  const publicPrefix = publicPrefixFromInboundTargets(payload.to, payload.receivedFor);
  const parsed = parseInboundHeaders(payload.headers);
  const rfcIds = [...parsed.inReplyTo, ...parsed.references].filter((id) => id.length > 0);
  const body = inboundStoredBody(payload);
  const fromAddress = inboundFromAddress(payload.from);
  const inboundRfc = payload.messageId ? asRfcMessageId(payload.messageId) : "";

  try {
    return await asSystem(env, async (sql) => {
      let ticket: { id: string; ticket_status: string | null } | undefined;

      if (token) {
        const tickets = await sql<{ id: string; ticket_status: string | null }[]>`
          select id, ticket_status
          from public.contact_submissions
          where reply_token = ${token}
          limit 1
        `;
        ticket = tickets[0];
      }

      if (!ticket && publicPrefix) {
        const tickets = await sql<{ id: string; ticket_status: string | null }[]>`
          select id, ticket_status
          from public.contact_submissions
          where lower(id::text) like ${`${publicPrefix}-%`}
          limit 2
        `;
        if (tickets.length === 1) ticket = tickets[0];
      }

      if (!ticket) {
        for (const rfcId of rfcIds) {
          const rows = await sql<{ submission_id: string }[]>`
            select submission_id
            from public.support_messages
            where rfc_message_id = ${rfcId}
            limit 1
          `;
          const submissionId = rows[0]?.submission_id;
          if (submissionId) {
            ticket = { id: submissionId, ticket_status: "open" };
            break;
          }
        }
      }

      if (!ticket) {
        await sql`
          insert into public.support_inbound_events (email_id)
          values (${payload.emailId})
          on conflict (email_id) do nothing
        `;
        return "drop";
      }

      const inserted = await sql<{ email_id: string }[]>`
        insert into public.support_inbound_events (email_id)
        values (${payload.emailId})
        on conflict (email_id) do nothing
        returning email_id
      `;
      if (inserted.length === 0) return "ok";

      const next = inboundTicketStatus(asStatus(ticket.ticket_status));
      const insertedMsg = await sql<{ id: string }[]>`
        insert into public.support_messages (
          submission_id, direction, from_address, body_text, rfc_message_id, resend_email_id
        )
        values (
          ${ticket.id}::uuid,
          'inbound_email',
          ${fromAddress},
          ${body},
          ${inboundRfc || null},
          ${payload.emailId}
        )
        returning id
      `;
      const messageId = insertedMsg[0]?.id;
      if (messageId) {
        const nextBody = await storeInboundFiles(env, payload.attachments, {
          sql,
          submissionId: ticket.id,
          messageId,
          bodyText: body,
        });
        if (nextBody !== body) {
          await sql`
            update public.support_messages
            set body_text = ${nextBody}
            where id = ${messageId}::uuid
          `;
        }
      }
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
