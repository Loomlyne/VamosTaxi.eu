// apps/web/lib/ops/tickets-write.ts
//
// Persist Support ticket_status. Phase 12 writes Open / Close / Reopen only.
// Staff reply insert is Phase 13.

import { asStaff, type VamosClaims } from "@/lib/db/identity";
import { rejectStaffReply, staffPatchStatus, type TicketStatus } from "@/lib/ops/tickets-map";

const STATUSES = new Set<TicketStatus>(["new", "open", "replied", "responded", "closed"]);

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
  | { ok: false; reason: "not-found" | "invalid-status" | "reply-not-this-phase" };

export async function patchTicket(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  input: PatchTicketInput,
): Promise<PatchTicketResult> {
  return asStaff(env, claims, async (sql) => {
    if (rejectStaffReply(input)) return { ok: false, reason: "reply-not-this-phase" };

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
