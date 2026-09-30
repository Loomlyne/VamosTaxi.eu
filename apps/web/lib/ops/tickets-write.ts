// apps/web/lib/ops/tickets-write.ts
//
// Open / Close / Reopen stay staffPatchStatus; Save writes phone, booking ref, note.
// The dashboard sends no reply (read-only Support, owner decision 2026-09-30, G27).

import { asStaff, type VamosClaims } from "@/lib/db/identity";
import { resolveStaffBookingId } from "@/lib/ops/resolve-booking-id";
import { staffPatchStatus, type TicketStatus } from "@/lib/ops/tickets-map";

const STATUSES = new Set<TicketStatus>(["new", "open", "replied", "responded", "closed"]);

function asStatus(raw: unknown): TicketStatus | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return STATUSES.has(value as TicketStatus) ? (value as TicketStatus) : null;
}

export type PatchTicketInput = {
  status?: string;
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
        | "invalid-booking-ref";
    };

export async function patchTicket(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  input: PatchTicketInput,
): Promise<PatchTicketResult> {
  const hasStatus = Object.prototype.hasOwnProperty.call(input, "status");
  const hasPhone = Object.prototype.hasOwnProperty.call(input, "phone");
  const hasBookingRef = Object.prototype.hasOwnProperty.call(input, "booking_ref");
  const hasNote = Object.prototype.hasOwnProperty.call(input, "note");
  const isSave = hasPhone || hasBookingRef || hasNote;
  if (isSave && hasStatus) return { ok: false, reason: "invalid-status" };

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
