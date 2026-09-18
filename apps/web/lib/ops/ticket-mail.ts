// apps/web/lib/ops/ticket-mail.ts
//
// Plus-address + RFC threading for Support. Reply-To is replies.vamostaxi.site
// so inbound never uses apex Gmail MX. Unmatched inbound is dropped.

type TicketStatus = "new" | "open" | "replied" | "responded" | "closed";

export const REPLY_MAILBOX_HOST = "replies.vamostaxi.site";
export const CONTACT_FROM = "Vamos Taxi <noreply@vamostaxi.site>";
/** Owner flips true only after Resend verifies replies.vamostaxi.site as a sending domain (D-09). */
export const REPLIES_DOMAIN_VERIFIED = false;

const TOKEN = /^[0-9a-f]{32}$/;
const ANGLE = /^<[^>]+>$/;

export function ticketReplyAddress(token: string): string {
  return `ticket+${token}@${REPLY_MAILBOX_HOST}`;
}

export function staffSender(token: string): { from: string; replyTo: string } {
  const plus = ticketReplyAddress(token);
  if (REPLIES_DOMAIN_VERIFIED) {
    return { from: `Vamos Taxi <${plus}>`, replyTo: plus };
  }
  return { from: CONTACT_FROM, replyTo: plus };
}

export function contactMessageId(submissionId: string): string {
  return `<c.${submissionId.replace(/-/g, "")}@vamostaxi.site>`;
}

export function staffMessageId(messageId: string): string {
  return `<s.${messageId.replace(/-/g, "")}@vamostaxi.site>`;
}

export function asRfcMessageId(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  return ANGLE.test(value) ? value : `<${value}>`;
}

function addressesOf(raw: string): string[] {
  const matches = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  return matches ?? [];
}

export function parseTicketReplyToken(raw: string | string[] | undefined | null): string | null {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const value of values) {
    for (const address of addressesOf(value)) {
      const at = address.lastIndexOf("@");
      if (at < 0) continue;
      const local = address.slice(0, at);
      const host = address.slice(at + 1).toLowerCase();
      if (host !== REPLY_MAILBOX_HOST) continue;
      const prefix = "ticket+";
      if (!local.toLowerCase().startsWith(prefix)) continue;
      const token = local.slice(prefix.length).toLowerCase();
      if (TOKEN.test(token)) return token;
    }
  }
  return null;
}

export function tokenFromInboundTo(to: unknown): string | null {
  if (typeof to === "string") return parseTicketReplyToken(to);
  if (Array.isArray(to)) {
    const parts = to.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "email" in item) {
        return String((item as { email: unknown }).email ?? "");
      }
      return "";
    });
    return parseTicketReplyToken(parts);
  }
  if (to && typeof to === "object" && "email" in to) {
    return parseTicketReplyToken(String((to as { email: unknown }).email ?? ""));
  }
  return null;
}

export function tokenFromInboundTargets(to: unknown, receivedFor?: unknown): string | null {
  return tokenFromInboundTo(to) ?? tokenFromInboundTo(receivedFor);
}

function headerRecord(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    const name = key.toLowerCase();
    if (typeof value === "string") out[name] = value;
    else if (Array.isArray(value)) out[name] = value.map((item) => String(item)).join(" ");
  }
  return out;
}

function splitRfcIds(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map((part) => asRfcMessageId(part))
    .filter((id) => id.length > 0);
}

export function parseInboundHeaders(headers: unknown): {
  inReplyTo: string[];
  references: string[];
  messageId: string;
} {
  const map = headerRecord(headers);
  return {
    inReplyTo: splitRfcIds(map["in-reply-to"] ?? ""),
    references: splitRfcIds(map["references"] ?? ""),
    messageId: asRfcMessageId(map["message-id"] ?? ""),
  };
}

function cutAtQuotedBlock(raw: string): number {
  const lines = raw.split("\n");
  let seenParagraph = false;
  let blankAfterParagraph = false;
  let offset = 0;
  for (const line of lines) {
    if (seenParagraph && blankAfterParagraph && line.startsWith(">")) return offset;
    if (line.trim() === "") {
      blankAfterParagraph = seenParagraph;
    } else {
      if (!line.startsWith(">")) seenParagraph = true;
      blankAfterParagraph = false;
    }
    offset += line.length + 1;
  }
  return -1;
}

export function stripQuotedHistory(text: string): string {
  const raw = String(text ?? "").replace(/\r\n/g, "\n");
  let cut = -1;
  const onWrote = raw.search(/^On .+ wrote:$/m);
  const original = raw.search(/^-----Original Message-----/m);
  if (onWrote >= 0) cut = onWrote;
  if (original >= 0 && (cut < 0 || original < cut)) cut = original;
  const quoted = cutAtQuotedBlock(raw);
  if (quoted >= 0 && (cut < 0 || quoted < cut)) cut = quoted;
  const kept = cut >= 0 ? raw.slice(0, cut) : raw;
  return clipInboundBody(kept);
}

export function inboundTicketStatus(_current: TicketStatus): TicketStatus {
  return "responded";
}

export function threadHeaders(inReplyTo: string, priorIds: string | string[] = []): Record<string, string> {
  const parent = asRfcMessageId(inReplyTo);
  const extras = Array.isArray(priorIds) ? priorIds.map(asRfcMessageId).filter(Boolean) : [];
  const refs = [parent, ...extras].filter((id, i, all) => id && all.indexOf(id) === i);
  return {
    "In-Reply-To": parent,
    References: refs.join(" "),
  };
}

export function clipInboundBody(raw: string): string {
  const value = raw.trim();
  return value.length > 8000 ? value.slice(0, 8000) : value;
}

export type InboundPayload = {
  emailId: string;
  to: unknown;
  from?: string;
  text?: string;
  html?: string;
  subject?: string;
  receivedFor?: unknown;
  messageId?: string;
  headers?: unknown;
  attachments?: unknown;
};

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function inboundBody(payload: InboundPayload): string {
  const text = payload.text?.trim() ?? "";
  if (text) return stripQuotedHistory(text);
  const html = payload.html?.trim() ?? "";
  if (html) return stripQuotedHistory(htmlToText(html));
  return stripQuotedHistory(payload.subject ?? "");
}

export function inboundFromAddress(raw: string | undefined): string {
  const value = String(raw ?? "").trim();
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].slice(0, 320) : "";
}

export function readInboundPayload(data: unknown): InboundPayload | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const emailId = String(record.email_id ?? record.id ?? "").trim();
  if (!emailId) return null;
  const receivedFor = record.received_for ?? record.receivedFor;
  const messageIdRaw = record.message_id ?? record.messageId;
  const payload: InboundPayload = {
    emailId,
    to: record.to,
    from: typeof record.from === "string" ? record.from : undefined,
    text: typeof record.text === "string" ? record.text : undefined,
    html: typeof record.html === "string" ? record.html : undefined,
    subject: typeof record.subject === "string" ? record.subject : undefined,
  };
  if (receivedFor !== undefined) payload.receivedFor = receivedFor;
  if (typeof messageIdRaw === "string" && messageIdRaw.trim()) {
    payload.messageId = messageIdRaw;
  }
  if (record.headers !== undefined) payload.headers = record.headers;
  if (record.attachments !== undefined) payload.attachments = record.attachments;
  return payload;
}
