export type DigestRecipient = {
  userId: string;
  email: string;
  fullName: string;
  language: string;
};

export type DigestLeg = {
  reference: string;
  scheduledLocal: string;
  pickupText: string;
  dropoffText: string;
  status: string;
  guest?: boolean;
};

export function mapDigestRecipient(row: {
  user_id?: string | null;
  userId?: string | null;
  email?: string | null;
  full_name?: string | null;
  fullName?: string | null;
  lang?: string | null;
  language?: string | null;
}): DigestRecipient {
  return {
    userId: String(row.userId ?? row.user_id ?? ""),
    email: String(row.email ?? ""),
    fullName: String(row.fullName ?? row.full_name ?? ""),
    language: String(row.language ?? row.lang ?? "en"),
  };
}

export function mapDigestLeg(row: {
  reference?: string | null;
  scheduled_local?: string | null;
  scheduledLocal?: string | null;
  pickup_text?: string | null;
  pickupText?: string | null;
  dropoff_text?: string | null;
  dropoffText?: string | null;
  status?: string | null;
  guest?: boolean | null;
  is_guest?: boolean | null;
}): DigestLeg {
  return {
    reference: String(row.reference ?? ""),
    scheduledLocal: String(row.scheduledLocal ?? row.scheduled_local ?? ""),
    pickupText: String(row.pickupText ?? row.pickup_text ?? ""),
    dropoffText: String(row.dropoffText ?? row.dropoff_text ?? ""),
    status: String(row.status ?? ""),
    ...(row.guest === true || row.is_guest === true ? { guest: true } : {}),
  };
}

export type RenderedDigest = { subject: string; html: string; text: string };

export type DigestDependencies = {
  recipients(): Promise<DigestRecipient[]>;
  legs(date: string): Promise<DigestLeg[]>;
  claim(staffUserId: string, date: string): Promise<boolean>;
  markSent(staffUserId: string, date: string): Promise<void>;
  markFailed(staffUserId: string, date: string): Promise<void>;
  send(recipient: DigestRecipient, digest: RenderedDigest): Promise<void>;
};

export type DigestResult = {
  date: string;
  recipients: number;
  sent: number;
  failed: number;
  skipped: number;
};

const zurichFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Zurich",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function zurichParts(at: Date): Record<string, string> {
  return Object.fromEntries(
    zurichFormatter
      .formatToParts(at)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

/** Cloudflare invokes hourly; the timezone conversion makes 06:00 exact through DST changes. */
export function isZurichDigestTime(at: Date): boolean {
  const parts = zurichParts(at);
  return parts.hour === "06" && parts.minute === "00";
}

export function zurichDigestDate(at: Date): string {
  const parts = zurichParts(at);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === '"') return "&quot;";
    return "&#39;";
  });
}

const digestCopy = {
  en: { subject: "Staff digest", heading: "Morning dispatch", bookings: "bookings", guest: "Guest booking", none: "No booking legs are scheduled for Zurich today.", pickup: "Pickup", route: "Route" },
  de: { subject: "Team-Digest", heading: "Morgendisposition", bookings: "Buchungen", guest: "Gastbuchung", none: "Für heute sind in Zürich keine Buchungsfahrten geplant.", pickup: "Abholung", route: "Fahrt" },
  fr: { subject: "Résumé équipe", heading: "Dispatch du matin", bookings: "réservations", guest: "Réservation invité", none: "Aucun trajet n’est prévu à Zurich aujourd’hui.", pickup: "Prise en charge", route: "Trajet" },
  ar: { subject: "ملخص الفريق", heading: "تنسيق الصباح", bookings: "حجوزات", guest: "حجز ضيف", none: "لا توجد رحلات مجدولة في زيورخ اليوم.", pickup: "الاستلام", route: "المسار" },
} as const;

function renderDigest(date: string, legs: DigestLeg[], language: string): RenderedDigest {
  const copy = digestCopy[language as keyof typeof digestCopy] ?? digestCopy.en;
  const subject = `Vamos Taxi ${copy.subject} — ${date}`;
  const count = `${legs.length} ${copy.bookings}`;
  if (legs.length === 0) {
    return {
      subject,
      text: `Vamos Taxi — ${copy.heading}\n${date} · ${count}\n\n${copy.none}`,
      html: `<div style="background:#f6f6f6;padding:24px;font-family:Arial,sans-serif;color:#1e1f1f"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:auto;background:#fff;border:1px solid #e4e4e4"><tr><td style="padding:24px 28px;background:#1e1f1f;color:#fdc20b;font-size:21px;font-weight:700">Vamos Taxi</td></tr><tr><td style="padding:28px"><p style="margin:0 0 6px;font-size:20px;font-weight:700">${escapeHtml(copy.heading)}</p><p style="margin:0 0 20px;color:#666">${escapeHtml(date)} · ${escapeHtml(count)}</p><p style="margin:0">${escapeHtml(copy.none)}</p></td></tr></table></div>`,
    };
  }
  const lines = legs.map((leg) => `${leg.scheduledLocal} · ${leg.reference}${leg.guest ? ` · ${copy.guest}` : ""}\n${copy.pickup}: ${leg.pickupText}\n${copy.route}: ${leg.dropoffText} (${leg.status})`);
  const rows = legs.map((leg) => `<tr><td style="padding:14px 0;border-top:1px solid #e4e4e4"><strong>${escapeHtml(leg.scheduledLocal)} · ${escapeHtml(leg.reference)}</strong>${leg.guest ? `<span style="margin-left:8px;color:#746000;font-size:12px">${escapeHtml(copy.guest)}</span>` : ""}<div style="margin-top:6px;color:#555"><strong>${escapeHtml(copy.pickup)}:</strong> ${escapeHtml(leg.pickupText)}</div><div style="margin-top:3px;color:#555"><strong>${escapeHtml(copy.route)}:</strong> ${escapeHtml(leg.dropoffText)} (${escapeHtml(leg.status)})</div></td></tr>`).join("");
  return {
    subject,
    text: `Vamos Taxi — ${copy.heading}\n${date} · ${count}\n\n${lines.join("\n\n")}`,
    html: `<div style="background:#f6f6f6;padding:24px;font-family:Arial,sans-serif;color:#1e1f1f"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:auto;background:#fff;border:1px solid #e4e4e4"><tr><td style="padding:24px 28px;background:#1e1f1f;color:#fdc20b;font-size:21px;font-weight:700">Vamos Taxi</td></tr><tr><td style="padding:28px"><p style="margin:0 0 6px;font-size:20px;font-weight:700">${escapeHtml(copy.heading)}</p><p style="margin:0 0 20px;color:#666">${escapeHtml(date)} · ${escapeHtml(count)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table></td></tr></table></div>`,
  };
}

/**
 * Claims the database ledger before each provider call. `claim` is true only for a fresh or
 * retryable failed row; a successful row cannot be sent twice on cron replay.
 */
export async function runStaffDigest(at: Date, deps: DigestDependencies): Promise<DigestResult> {
  const date = zurichDigestDate(at);
  const [recipients, legs] = await Promise.all([deps.recipients(), deps.legs(date)]);
  const result: DigestResult = { date, recipients: recipients.length, sent: 0, failed: 0, skipped: 0 };

  for (const recipient of recipients) {
    if (!(await deps.claim(recipient.userId, date))) {
      result.skipped += 1;
      continue;
    }
    try {
      await deps.send(recipient, renderDigest(date, legs, recipient.language));
      await deps.markSent(recipient.userId, date);
      result.sent += 1;
    } catch {
      result.failed += 1;
      try {
        await deps.markFailed(recipient.userId, date);
      } catch {
        // The scheduled handler logs aggregate outcome only; never recipient details.
      }
    }
  }
  return result;
}
