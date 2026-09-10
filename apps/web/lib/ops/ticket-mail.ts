// apps/web/lib/ops/ticket-mail.ts
//
// RFC threading for Support staff replies. In-Reply-To the contact ack
// Message-ID so Gmail/Outlook keep one thread.

const ANGLE = /^<[^>]+>$/;

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

export function threadHeaders(inReplyTo: string, outboundId: string): Record<string, string> {
  const parent = asRfcMessageId(inReplyTo);
  const child = staffMessageId(outboundId);
  return {
    "Message-ID": child,
    "In-Reply-To": parent,
    References: `${parent} ${child}`,
  };
}
