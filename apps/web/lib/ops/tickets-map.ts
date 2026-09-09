// apps/web/lib/ops/tickets-map.ts
//
// Pure Support mapping. Keep Hyperdrive out of this file so vitest can import it.

const STATUSES = new Set(["new", "open", "replied", "closed"]);

export type TicketStatus = "new" | "open" | "replied" | "closed";

export function nextTicketStatus(current: TicketStatus, requested: TicketStatus): TicketStatus | null {
  if (current === requested) return current;
  if (current === "closed") return null;
  if (requested === "new") return null;
  return requested;
}

export type OpsTicketMessage = {
  whoKey: "customer" | "staff" | "note";
  when: string;
  body: string;
};

export type OpsTicketRow = {
  id: string;
  ticketId: string;
  status: string;
  name: string;
  email: string;
  phone: string;
  bookingRef: string;
  locale: string;
  when: string;
  last: string;
  note: string;
  messages: OpsTicketMessage[];
};

export type SqlSubmission = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  booking_ref: string | null;
  message: string;
  locale: string | null;
  ticket_status: string | null;
  created_at: string | Date;
  last_activity_at: string | Date | null;
};

export type SqlMessage = {
  submission_id: string;
  direction: string | null;
  body_text: string | null;
  created_at: string | Date;
};

function str(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

function asDate(value: string | Date): Date {
  return typeof value === "string" ? new Date(value) : value;
}

export function zurichStamp(value: string | Date): string {
  const date = asDate(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts: Record<string, string> = {};
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .forEach((part) => {
      parts[part.type] = part.value;
    });
  return `${parts.day ?? ""} ${parts.month ?? ""} ${parts.year ?? ""} · ${parts.hour ?? "00"}:${parts.minute ?? "00"}`;
}

function whoKey(direction: string | null): OpsTicketMessage["whoKey"] {
  const value = str(direction).toLowerCase();
  if (value === "note" || value === "staff_note") return "note";
  if (value === "outbound" || value === "outbound_staff" || value === "staff" || value === "reply") return "staff";
  return "customer";
}

function ticketStatus(raw: string | null): string {
  const value = str(raw).toLowerCase();
  return STATUSES.has(value) ? value : "new";
}

function ticketId(id: string): string {
  return `TKT-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function mapTicket(row: SqlSubmission, messages: SqlMessage[]): OpsTicketRow {
  const when = zurichStamp(row.created_at);
  const lastSource = row.last_activity_at ?? messages.at(-1)?.created_at ?? row.created_at;
  const mappedMessages: OpsTicketMessage[] =
    messages.length > 0
      ? messages.map((message) => ({
          whoKey: whoKey(message.direction),
          when: zurichStamp(message.created_at),
          body: str(message.body_text),
        }))
      : [
          {
            whoKey: "customer",
            when,
            body: str(row.message),
          },
        ];
  return {
    id: row.id,
    ticketId: ticketId(row.id),
    status: ticketStatus(row.ticket_status),
    name: str(row.name),
    email: str(row.email),
    phone: str(row.phone),
    bookingRef: str(row.booking_ref),
    locale: str(row.locale) || "en",
    when,
    last: zurichStamp(lastSource),
    note: "",
    messages: mappedMessages,
  };
}
