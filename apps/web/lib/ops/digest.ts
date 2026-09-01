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
}): DigestLeg {
  return {
    reference: String(row.reference ?? ""),
    scheduledLocal: String(row.scheduledLocal ?? row.scheduled_local ?? ""),
    pickupText: String(row.pickupText ?? row.pickup_text ?? ""),
    dropoffText: String(row.dropoffText ?? row.dropoff_text ?? ""),
    status: String(row.status ?? ""),
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

function renderDigest(date: string, legs: DigestLeg[]): RenderedDigest {
  const subject = `Vamos Taxi staff digest — ${date}`;
  if (legs.length === 0) {
    return {
      subject,
      text: `Staff digest for ${date}\n\nNo booking legs are scheduled for Zurich today.`,
      html: `<p>Staff digest for ${escapeHtml(date)}</p><p>No booking legs are scheduled for Zurich today.</p>`,
    };
  }

  const lines = legs.map(
    (leg) => `${leg.scheduledLocal} · ${leg.reference} · ${leg.pickupText} → ${leg.dropoffText} (${leg.status})`,
  );
  return {
    subject,
    text: `Staff digest for ${date}\n\n${lines.join("\n")}`,
    html: `<p>Staff digest for ${escapeHtml(date)}</p><ul>${legs
      .map((leg) => `<li>${escapeHtml(`${leg.scheduledLocal} · ${leg.reference} · ${leg.pickupText} → ${leg.dropoffText} (${leg.status})`)}</li>`)
      .join("")}</ul>`,
  };
}

/**
 * Claims the database ledger before each provider call. `claim` is true only for a fresh or
 * retryable failed row; a successful row cannot be sent twice on cron replay.
 */
export async function runStaffDigest(at: Date, deps: DigestDependencies): Promise<DigestResult> {
  const date = zurichDigestDate(at);
  const [recipients, legs] = await Promise.all([deps.recipients(), deps.legs(date)]);
  const digest = renderDigest(date, legs);
  const result: DigestResult = { date, recipients: recipients.length, sent: 0, failed: 0, skipped: 0 };

  for (const recipient of recipients) {
    if (!(await deps.claim(recipient.userId, date))) {
      result.skipped += 1;
      continue;
    }
    try {
      await deps.send(recipient, digest);
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
