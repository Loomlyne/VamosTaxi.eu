// apps/web/lib/ops/tickets-map.ts
//
// Pure Support mapping. Keep Hyperdrive out of this file so vitest can import it.

import { contactCustomerSubject } from "@vamos/emails/contact";
import { isLang, type Lang } from "@/lib/translate/model";

const STATUSES: readonly string[] = Object.freeze(["new", "open", "replied", "responded", "closed"]);

export type TicketStatus = "new" | "open" | "replied" | "responded" | "closed";

export function staffPatchStatus(current: TicketStatus, requested: TicketStatus): TicketStatus | null {
  if (requested === "open") {
    if (current === "new" || current === "closed") return "open";
    return null;
  }
  if (requested === "closed") return "closed";
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

/**
 * Phase 32: a customer message in the dashboard language. `text` is "" unless `status` is "ready".
 * ready = translated; same = already in his language (or no language to detect); pending = just
 * arrived, the translate job has not run yet; failed = no usable translation (he reads the original).
 */
export type OpsTicketTranslation = { text: string; status: "ready" | "pending" | "failed" | "same" };

export type OpsTicketMessage = {
  whoKey: "customer" | "staff" | "note";
  when: string;
  /** Always the original text, as the customer wrote it. */
  body: string;
  files?: OpsTicketFile[];
  /** Detected language of a customer message (ISO 639); "" for staff, notes, and unknown or not yet detected. */
  lang: string;
  /** Translation into the requested dashboard language; null for staff messages and notes. */
  translation: OpsTicketTranslation | null;
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
  /**
   * Phase 32: the language his reply is translated into: the latest detected customer language, else the
   * ticket locale, else "". It can be outside en/de/fr/ar; the reply route then leaves his text as written.
   */
  lang: string;
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
  /** Phase 32: support_messages.detected_lang (null until the translate job ran). */
  detected_lang?: string | null;
  /** Phase 32: support_message_translations row for the requested language (left join). */
  tr_body?: string | null;
  tr_status?: string | null;
};

/** How long a not-yet-detected customer message counts as "pending" before it reads as failed. */
export const TRANSLATION_PENDING_MS = 15 * 60 * 1000;

/** Options of the Phase 32 read model: the dashboard language (anything but en/de/fr/ar is en) and the clock. */
export type TicketView = { lang?: string; now?: Date | number };

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

/** A usable detected language, or "" (null, blank and "und" are unknown). */
function detectedLang(raw: string | null | undefined): string {
  const value = str(raw).trim().toLowerCase();
  return /^[a-z]{2,3}$/.test(value) && value !== "und" ? value : "";
}

/**
 * Status of one customer message in the requested language `lang` (contract of plan 32-07):
 * detected language equals `lang` or is "und" -> same; a done row -> ready; a rejected or failed row
 * -> failed; no row, not detected and younger than 15 minutes -> pending; anything else -> failed.
 */
export function messageTranslation(message: SqlMessage, lang: Lang, now: number): OpsTicketTranslation {
  const detected = str(message.detected_lang).trim().toLowerCase();
  if (detected === lang || detected === "und") return { status: "same", text: "" };
  const status = str(message.tr_status);
  const body = str(message.tr_body);
  if (status === "done" && body.trim().length > 0) return { status: "ready", text: body };
  if (status === "rejected" || status === "failed") return { status: "failed", text: "" };
  if (!status && !detected) {
    const at = asDate(message.created_at).getTime();
    if (!Number.isNaN(at) && now - at < TRANSLATION_PENDING_MS) return { status: "pending", text: "" };
  }
  return { status: "failed", text: "" };
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
  let replyLang = "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || message.submission_id !== row.id) continue;
    if (whoKey(message.direction) !== "customer") continue;
    if (!replyLang) replyLang = detectedLang(message.detected_lang);
    const id = str(message.rfc_message_id).trim();
    if (!messageId && RFC_ID.test(id)) messageId = id;
    if (messageId && replyLang) break;
  }
  if (!replyLang) replyLang = detectedLang(locale);
  const to = ADDRESS.test(email) ? email : "";
  // Phase 32: the subject is in the customer's language when his reply is translated (one of the four);
  // otherwise the ticket locale's subject, as before.
  const subject = `Re: ${contactCustomerSubject(isLang(replyLang) ? replyLang : known)}`;
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
    lang: replyLang,
  };
}

export function mapTicket(
  row: SqlSubmission,
  messages: SqlMessage[],
  filesByMessageId?: Record<string, OpsTicketFile[]>,
  view: TicketView = {},
): OpsTicketRow {
  const lang: Lang = isLang(view.lang) ? view.lang : "en";
  const now = view.now === undefined ? Date.now() : typeof view.now === "number" ? view.now : view.now.getTime();
  const when = zurichStamp(row.created_at);
  const lastSource = row.last_activity_at ?? messages.at(-1)?.created_at ?? row.created_at;
  const mappedMessages: OpsTicketMessage[] =
    messages.length > 0
      ? messages.map((message) => {
          const who = whoKey(message.direction);
          const customer = who === "customer";
          return {
            whoKey: who,
            when: zurichStamp(message.created_at),
            body: str(message.body_text),
            files: message.id ? (filesByMessageId?.[message.id] ?? []) : [],
            lang: customer ? detectedLang(message.detected_lang) : "",
            translation: customer ? messageTranslation(message, lang, now) : null,
          };
        })
      : [
          {
            whoKey: "customer",
            when,
            body: str(row.message),
            files: [],
            lang: "",
            translation: null,
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
