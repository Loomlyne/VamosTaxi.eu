// apps/web/lib/ops/tickets-write.ts
//
// Open / Close / Reopen stay staffPatchStatus. A staff reply goes out through
// Resend first (same Gmail thread), then support_messages.

import { renderContactCustomerEmail, renderStaffReplyEmail } from "@vamos/emails";
import { asStaff, type VamosClaims } from "@/lib/db/identity";
import { sendContactMessage } from "@/lib/forms/notify";
import { SUPPORT_EMAIL } from "@/lib/contact-channels";
import { contactMessageId, ticketReplyAddress, threadHeaders } from "@/lib/ops/ticket-mail";
import { staffPatchStatus, type TicketStatus } from "@/lib/ops/tickets-map";

const STATUSES = new Set<TicketStatus>(["new", "open", "replied", "responded", "closed"]);
const FROM_ADDRESS = "noreply@vamostaxi.site";

function asStatus(raw: unknown): TicketStatus | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return STATUSES.has(value as TicketStatus) ? (value as TicketStatus) : null;
}

function asEmailLocale(raw: string | null): "en" | "de" | "fr" | "ar" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "de" || value === "fr" || value === "ar") return value;
  return "en";
}

type LoadedTicket = {
  ticket_status: string | null;
  email: string | null;
  locale: string | null;
  replyToken: string;
  parentId: string;
};

export type PatchTicketInput = {
  status?: string;
  reply?: string;
};

export type PatchTicketResult =
  | { ok: true; status: TicketStatus }
  | { ok: false; reason: "not-found" | "invalid-status" | "empty-reply" | "send-failed" };

export async function patchTicket(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  input: PatchTicketInput,
): Promise<PatchTicketResult> {
  const hasReply = Object.prototype.hasOwnProperty.call(input, "reply");
  const reply = typeof input.reply === "string" ? input.reply.trim() : "";
  if (hasReply && !reply) return { ok: false, reason: "empty-reply" };

  if (!hasReply) {
    return asStaff(env, claims, async (sql) => {
      const rows = await sql<{ ticket_status: string | null }[]>`
        select ticket_status
        from public.contact_submissions
        where id = ${id}::uuid
        limit 1
      `;
      const current = asStatus(rows[0]?.ticket_status) ?? (rows[0] ? "new" : null);
      if (!current) return { ok: false, reason: "not-found" };

      if (input.status == null) return { ok: false, reason: "invalid-status" };
      const requested = asStatus(input.status);
      if (!requested) return { ok: false, reason: "invalid-status" };

      const next = staffPatchStatus(current, requested);
      if (!next) return { ok: false, reason: "invalid-status" };

      await sql`
        update public.contact_submissions
        set
          ticket_status = ${next},
          last_activity_at = now(),
          closed_at = case
            when ${next} = 'closed' then coalesce(closed_at, now())
            when ${next} = 'open' then null
            else closed_at
          end
        where id = ${id}::uuid
      `;
      return { ok: true, status: next };
    });
  }

  const loaded = await asStaff(env, claims, async (sql) => {
    const rows = await sql<{
      ticket_status: string | null;
      email: string | null;
      locale: string | null;
      reply_token: string | null;
    }[]>`
      select ticket_status, email, locale, reply_token
      from public.contact_submissions
      where id = ${id}::uuid
      limit 1
    `;
    const ticket = rows[0];
    if (!ticket) return null;
    const replyToken = String(ticket.reply_token ?? "").trim();
    const thread = await sql<{ rfc_message_id: string | null }[]>`
      select rfc_message_id
      from public.support_messages
      where submission_id = ${id}::uuid
        and rfc_message_id is not null
        and rfc_message_id <> ''
      order by created_at asc
      limit 1
    `;
    const parentId = thread[0]?.rfc_message_id ?? contactMessageId(id);
    return { ...ticket, replyToken, parentId } satisfies LoadedTicket;
  });
  if (!loaded) return { ok: false, reason: "not-found" };

  const current = asStatus(loaded.ticket_status) ?? "new";
  if (current === "closed") return { ok: false, reason: "invalid-status" };

  const to = String(loaded.email ?? "").trim();
  if (!to || !loaded.replyToken) return { ok: false, reason: "send-failed" };

  const outboundId = crypto.randomUUID();
  const headers = threadHeaders(loaded.parentId, outboundId);
  const locale = asEmailLocale(loaded.locale);
  const replyMail = renderStaffReplyEmail(locale, { reply });
  const ackSubject = renderContactCustomerEmail(locale, { name: "there", message: "." }).subject;
  const rendered = { ...replyMail, subject: `Re: ${ackSubject}` };
  const rfcId = headers["Message-ID"] ?? null;

  const replyTo = ticketReplyAddress(loaded.replyToken);
  const sent = await sendContactMessage(
    env.RESEND_API_KEY,
    undefined,
    to,
    `staff-reply/${id}/${outboundId}`,
    rendered,
    undefined,
    {
      headers,
      replyTo,
      bcc: SUPPORT_EMAIL,
      allowEmailFallback: false,
    },
  );
  if (!sent.accepted || !sent.providerId) return { ok: false, reason: "send-failed" };

  return asStaff(env, claims, async (sql) => {
    await sql`
      update public.contact_submissions
      set
        ticket_status = 'replied',
        last_activity_at = now(),
        closed_at = null
      where id = ${id}::uuid
    `;
    await sql`
      insert into public.support_messages (
        submission_id, direction, from_address, body_text, resend_email_id, rfc_message_id
      )
      values (
        ${id}::uuid,
        'outbound_staff',
        ${FROM_ADDRESS},
        ${reply},
        ${sent.providerId},
        ${rfcId}
      )
    `;
    return { ok: true as const, status: "replied" as const };
  });
}
