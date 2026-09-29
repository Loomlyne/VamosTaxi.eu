// apps/web/lib/ops/tickets-write.ts
//
// Open / Close / Reopen stay staffPatchStatus. A staff reply goes out through
// Resend first (same Gmail thread), then support_messages.

import { renderContactCustomerEmail, renderStaffReplyEmail } from "@vamos/emails";
import { asStaff, type VamosClaims } from "@/lib/db/identity";
import { sendContactMessage } from "@/lib/forms/notify";
import { SUPPORT_EMAIL } from "@/lib/contact-channels";
import { contactMessageId, staffSender, threadHeaders } from "@/lib/ops/ticket-mail";
import { resolveStaffBookingId } from "@/lib/ops/resolve-booking-id";
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
  name: string;
  bookingRef: string;
  replyToken: string;
  parentId: string;
  chain: string[];
};

export type PatchTicketInput = {
  status?: string;
  reply?: string;
  phone?: string;
  booking_ref?: string;
  note?: string;
};

export type PatchTicketResult =
  | { ok: true; status: TicketStatus }
  | {
      ok: false;
      reason:
        | "not-found"
        | "invalid-status"
        | "empty-reply"
        | "invalid-reply"
        | "send-failed"
        | "invalid-booking-ref";
    };

export async function patchTicket(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  input: PatchTicketInput,
): Promise<PatchTicketResult> {
  const hasReply = Object.prototype.hasOwnProperty.call(input, "reply");
  const hasStatus = Object.prototype.hasOwnProperty.call(input, "status");
  const hasPhone = Object.prototype.hasOwnProperty.call(input, "phone");
  const hasBookingRef = Object.prototype.hasOwnProperty.call(input, "booking_ref");
  const hasNote = Object.prototype.hasOwnProperty.call(input, "note");
  const isSave = hasPhone || hasBookingRef || hasNote;
  if (isSave && (hasReply || hasStatus)) return { ok: false, reason: "invalid-status" };

  const reply = typeof input.reply === "string" ? input.reply.trim() : "";
  if (hasReply && !reply) return { ok: false, reason: "empty-reply" };
  if (hasReply && reply.length > 8000) return { ok: false, reason: "invalid-reply" };

  if (isSave) {
    const loaded = await asStaff(env, claims, async (sql) => {
      const rows = await sql<{
        ticket_status: string | null;
        phone: string | null;
        booking_ref: string | null;
      }[]>`
        select ticket_status, phone, booking_ref
        from public.contact_submissions
        where id = ${id}::uuid
        limit 1
      `;
      return rows[0] ?? null;
    });
    if (!loaded) return { ok: false, reason: "not-found" };
    const current = asStatus(loaded.ticket_status) ?? "new";
    const nextPhone = hasPhone ? String(input.phone ?? "") : String(loaded.phone ?? "");
    const nextRef = hasBookingRef ? String(input.booking_ref ?? "") : String(loaded.booking_ref ?? "");
    const trimmedRef = nextRef.trim();
    if (hasBookingRef && trimmedRef) {
      const resolved = await resolveStaffBookingId(env, claims, trimmedRef);
      if (!resolved) return { ok: false, reason: "invalid-booking-ref" };
    }
    const note = hasNote ? String(input.note ?? "").trim() : "";
    return asStaff(env, claims, async (sql) => {
      await sql`
        update public.contact_submissions
        set
          phone = ${nextPhone},
          booking_ref = ${hasBookingRef ? trimmedRef : nextRef},
          last_activity_at = now()
        where id = ${id}::uuid
      `;
      if (note) {
        await sql`
          insert into public.support_messages (
            submission_id, direction, from_address, body_text, resend_email_id, rfc_message_id
          )
          values (
            ${id}::uuid,
            'staff_note',
            ${null},
            ${note},
            ${null},
            ${null}
          )
        `;
      }
      return { ok: true as const, status: current };
    });
  }

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
      name: string | null;
      booking_ref: string | null;
      email: string | null;
      locale: string | null;
      reply_token: string | null;
    }[]>`
      select ticket_status, name, booking_ref, email, locale, reply_token
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
    `;
    const chain = thread
      .map((row) => String(row.rfc_message_id ?? "").trim())
      .filter(Boolean);
    const parentId = chain[0] ?? contactMessageId(id);
    return {
      ticket_status: ticket.ticket_status,
      email: ticket.email,
      locale: ticket.locale,
      name: String(ticket.name ?? "").trim(),
      bookingRef: String(ticket.booking_ref ?? "").trim(),
      replyToken,
      parentId,
      chain,
    } satisfies LoadedTicket;
  });
  if (!loaded) return { ok: false, reason: "not-found" };

  const current = asStatus(loaded.ticket_status) ?? "new";
  if (current === "closed") return { ok: false, reason: "invalid-status" };

  const to = String(loaded.email ?? "").trim();
  if (!to || !loaded.replyToken) return { ok: false, reason: "send-failed" };

  const outboundId = crypto.randomUUID();
  // Overlay retry of send-without-insert can duplicate (Pitfall 5); key is per-attempt UUID on purpose.
  const sender = staffSender(loaded.replyToken, id);
  const headers = threadHeaders(loaded.parentId, loaded.chain);
  const locale = asEmailLocale(loaded.locale);
  const replyMail = renderStaffReplyEmail(
    locale,
    loaded.bookingRef
      ? { reply, name: loaded.name, bookingRef: loaded.bookingRef }
      : { reply, name: loaded.name },
  );
  const ackSubject = renderContactCustomerEmail(locale, { name: loaded.name, message: "." }).subject;
  const rendered = { ...replyMail, subject: `Re: ${ackSubject}` };

  const sent = await sendContactMessage(
    env.RESEND_API_KEY,
    undefined,
    to,
    `staff-reply/${id}/${outboundId}`,
    rendered,
    undefined,
    {
      headers,
      replyTo: sender.replyTo,
      bcc: SUPPORT_EMAIL,
      allowEmailFallback: false,
      from: sender.from,
    },
  );
  const rfcMessageId = sent.rfcMessageId ?? "";
  if (
    !sent.accepted ||
    !sent.providerId ||
    !sent.rfcMessageId ||
    sent.rfcMessageId === sent.providerId ||
    !/^<.+@.+>$/.test(rfcMessageId)
  ) {
    return { ok: false, reason: "send-failed" };
  }

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
        ${sent.rfcMessageId}
      )
    `;
    return { ok: true as const, status: "replied" as const };
  });
}
