// apps/web/lib/ops/tickets-write.ts
//
// Persist Support ticket_status. A staff reply goes out through Resend
// first, then support_messages — never a silent local-only Send.

import { renderStaffReplyEmail } from "@vamos/emails";
import { asStaff, type VamosClaims } from "@/lib/db/identity";
import { sendContactMessage } from "@/lib/forms/notify";
import { nextTicketStatus, type TicketStatus } from "@/lib/ops/tickets-map";

const STATUSES = new Set<TicketStatus>(["new", "open", "replied", "closed"]);
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

type TicketRow = {
  ticket_status: string | null;
  email: string | null;
  locale: string | null;
};

export type PatchTicketInput = {
  status?: string;
  reply?: string;
};

export type PatchTicketResult =
  | { ok: true; status: TicketStatus }
  | { ok: false; reason: "not-found" | "closed" | "invalid-status" | "empty-reply" | "send-failed" };

export async function patchTicket(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  input: PatchTicketInput,
): Promise<PatchTicketResult> {
  const reply = typeof input.reply === "string" ? input.reply.trim() : "";
  if (input.reply != null && !reply) return { ok: false, reason: "empty-reply" };

  const loaded = await asStaff(env, claims, async (sql) => {
    const rows = await sql<TicketRow[]>`
      select ticket_status, email, locale
      from public.contact_submissions
      where id = ${id}::uuid
      limit 1
    `;
    return rows[0] ?? null;
  });
  if (!loaded) return { ok: false, reason: "not-found" };

  const current = asStatus(loaded.ticket_status) ?? "new";
  const requested = input.status != null ? asStatus(input.status) : reply ? "replied" : null;
  if (input.status != null && !requested) return { ok: false, reason: "invalid-status" };

  const next = requested ? nextTicketStatus(current, requested) : current;
  if (!next) {
    return { ok: false, reason: current === "closed" ? "closed" : "invalid-status" };
  }
  if (requested && next !== requested) {
    return { ok: false, reason: current === "closed" ? "closed" : "invalid-status" };
  }

  let resendId: string | null = null;
  if (reply) {
    const to = String(loaded.email ?? "").trim();
    const sent = await sendContactMessage(
      env.RESEND_API_KEY,
      undefined,
      to || undefined,
      `staff-reply/${id}/${crypto.randomUUID()}`,
      renderStaffReplyEmail(asEmailLocale(loaded.locale), { reply }),
    );
    if (!sent.accepted || !sent.providerId) return { ok: false, reason: "send-failed" };
    resendId = sent.providerId;
  }

  return asStaff(env, claims, async (sql) => {
    await sql`
      update public.contact_submissions
      set
        ticket_status = ${next},
        last_activity_at = now(),
        closed_at = case
          when ${next} = 'closed' then coalesce(closed_at, now())
          else closed_at
        end
      where id = ${id}::uuid
    `;
    if (reply && resendId) {
      await sql`
        insert into public.support_messages (
          submission_id, direction, from_address, body_text, resend_email_id
        )
        values (
          ${id}::uuid,
          'outbound_staff',
          ${FROM_ADDRESS},
          ${reply},
          ${resendId}
        )
      `;
    }
    return { ok: true as const, status: next };
  });
}
