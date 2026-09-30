// apps/web/lib/ops/tickets-map.ts
//
// Pure Support mapping. Keep Hyperdrive out of this file so vitest can import it.

import { contactCustomerSubject } from "@vamos/emails/contact";

const STATUSES: readonly string[] = Object.freeze(["new", "open", "replied", "responded", "closed"]);

export type TicketStatus = "new" | "open" | "replied" | "responded" | "closed";

export function nextTicketStatus(current: TicketStatus, requested: TicketStatus): TicketStatus | null {
  if (current === requested) return current;
  if (requested === "new") return null;
  if (current === "closed") return requested === "open" ? "open" : null;
  return requested;
}

export function staffPatchStatus(current: TicketStatus, requested: TicketStatus): TicketStatus | null {
  if (requested === "open") {
    if (current === "new" || current === "closed") return "open";
    return null;
  }
  if (requested === "closed") {
    if (current === "new" || current === "open" || current === "replied" || current === "responded" || current === "closed") {
      return "closed";
    }
    return null;
  }
  return null;
}

/** The dashboard Support page is read-only (owner, 2026-09-30): a body with a `reply` key is refused. */
export function rejectStaffReply(input: object | null | undefined): boolean {
  return !!input && Object.prototype.hasOwnProperty.call(input, "reply");
}

export type OpsTicketFile = {
  id: string;
  filename: string;
  contentType: string;
  kept: boolean;
};

export type OpsTicketMessage = {
  whoKey: "customer" | "staff" | "note";
  when: string;
  body: string;
  files?: OpsTicketFile[];
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
  /** What "Answer by e-mail" opens: this ticket's customer, subject and latest customer message. */
  reply: OpsTicketReply;
};

export type OpsTicketReply = {
  to: string;
  subject: string;
  /** RFC Message-ID the customer's mail app threads on; "" when none is stored. */
  messageId: string;
  /** Opens the device's own mail app. Carries In-Reply-To and References (RFC 6068) when an identity is stored. "" without an address. */
  mailto: string;
  /** Opens a new message in Gmail in the browser. Subject only: Gmail's address cannot carry an identity. "" without an address. */
  gmail: string;
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
  id?: string;
  submission_id: string;
  direction: string | null;
  body_text: string | null;
  created_at: string | Date;
  rfc_message_id?: string | null;
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
  return STATUSES.includes(value) ? value : "new";
}

function ticketId(id: string): string {
  return `TKT-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

const RFC_ID = /^<[^<>\s@]+@[^<>\s@]+>$/;
const ADDRESS = /^[^\s@<>,;:"'()\\]+@[^\s@<>,;:"'()\\]+\.[^\s@<>,;:"'()\\]+$/;

/**
 * Reply data for one ticket, built only from that ticket's own rows, so two tickets can
 * never share an address or a thread. The identity is the newest customer message that
 * has one (a form message carries the identity of the acknowledgement the customer got).
 */
export function ticketReply(row: SqlSubmission, messages: SqlMessage[]): OpsTicketReply {
  const email = str(row.email).trim();
  const locale = str(row.locale);
  const known = locale === "de" || locale === "fr" || locale === "ar" ? locale : "en";
  let messageId = "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || message.submission_id !== row.id) continue;
    if (whoKey(message.direction) !== "customer") continue;
    const id = str(message.rfc_message_id).trim();
    if (RFC_ID.test(id)) {
      messageId = id;
      break;
    }
  }
  const to = ADDRESS.test(email) ? email : "";
  const subject = `Re: ${contactCustomerSubject(known)}`;
  const thread = messageId
    ? `&In-Reply-To=${encodeURIComponent(messageId)}&References=${encodeURIComponent(messageId)}`
    : "";
  return {
    to,
    subject,
    messageId,
    mailto: to ? `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}${thread}` : "",
    gmail: to
      ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}`
      : "",
  };
}

export function mapTicket(
  row: SqlSubmission,
  messages: SqlMessage[],
  filesByMessageId?: Record<string, OpsTicketFile[]>,
): OpsTicketRow {
  const when = zurichStamp(row.created_at);
  const lastSource = row.last_activity_at ?? messages.at(-1)?.created_at ?? row.created_at;
  const mappedMessages: OpsTicketMessage[] =
    messages.length > 0
      ? messages.map((message) => ({
          whoKey: whoKey(message.direction),
          when: zurichStamp(message.created_at),
          body: str(message.body_text),
          files: message.id ? (filesByMessageId?.[message.id] ?? []) : [],
        }))
      : [
          {
            whoKey: "customer",
            when,
            body: str(row.message),
            files: [],
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
    reply: ticketReply(row, messages),
  };
}
