// apps/web/lib/ops/tickets-write.ts
//
// Persist Support ticket_status so a refresh cannot snap a ticket back to new.

import { asStaff, type VamosClaims } from "@/lib/db/identity";
import { nextTicketStatus, type TicketStatus } from "@/lib/ops/tickets-map";

const STATUSES = new Set<TicketStatus>(["new", "open", "replied", "closed"]);

function asStatus(raw: unknown): TicketStatus | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return STATUSES.has(value as TicketStatus) ? (value as TicketStatus) : null;
}

export type PatchTicketInput = {
  status?: string;
  reply?: string;
};

export type PatchTicketResult =
  | { ok: true; status: TicketStatus }
  | { ok: false; reason: "not-found" | "closed" | "invalid-status" | "empty-reply" };

export async function patchTicket(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  input: PatchTicketInput,
): Promise<PatchTicketResult> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<{ ticket_status: string | null }[]>`
      select ticket_status
      from public.contact_submissions
      where id = ${id}::uuid
      limit 1
    `;
    const current = asStatus(rows[0]?.ticket_status) ?? (rows[0] ? "new" : null);
    if (!current) return { ok: false, reason: "not-found" };

    const reply = typeof input.reply === "string" ? input.reply.trim() : "";
    const requested = input.status != null ? asStatus(input.status) : reply ? "replied" : null;
    if (input.status != null && !requested) return { ok: false, reason: "invalid-status" };
    if (input.reply != null && !reply) return { ok: false, reason: "empty-reply" };

    const next = requested ? nextTicketStatus(current, requested) : current;
    if (!next) {
      return { ok: false, reason: current === "closed" ? "closed" : "invalid-status" };
    }
    if (requested && next !== requested) {
      return { ok: false, reason: current === "closed" ? "closed" : "invalid-status" };
    }

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

    if (reply) {
      await sql`
        insert into public.support_messages (
          submission_id, direction, from_address, body_text
        )
        values (
          ${id}::uuid,
          'outbound_staff',
          'info@vamostaxi.site',
          ${reply}
        )
      `;
    }
    return { ok: true, status: next };
  });
}
