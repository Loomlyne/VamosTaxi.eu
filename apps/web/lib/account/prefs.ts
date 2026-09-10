// Mail preference mapping for Resend topics. Network I/O stays in the route.

export const RECEIPTS_TOPIC_ID = "fa668cd7-8192-4b41-9307-bfd44754100b";
export const OFFERS_TOPIC_ID = "732b5f33-10ed-4baf-819c-910abccf2c38";
export const GENERAL_SEGMENT_ID = "eaa0e51b-1f43-489f-b0f1-95be76cfb9bf";

export type MailPrefs = {
  receipts: boolean;
  offers: boolean;
};

export type ResendTopicSub = {
  id: string;
  subscription: "opt_in" | "opt_out";
};

export function prefsFromMetadata(meta: Record<string, unknown> | undefined): {
  prefs: MailPrefs;
  synced: boolean;
} {
  const receiptsRaw = meta?.receipts;
  const offersRaw = meta?.offers;
  const synced = receiptsRaw !== undefined || offersRaw !== undefined;
  return {
    prefs: {
      receipts: receiptsRaw !== false && receiptsRaw !== "false",
      offers: offersRaw === true || offersRaw === "true",
    },
    synced,
  };
}

export function prefsToMetadata(prefs: MailPrefs): Record<string, string> {
  return {
    receipts: prefs.receipts ? "true" : "false",
    offers: prefs.offers ? "true" : "false",
  };
}

export function topicsFromPrefs(prefs: MailPrefs): ResendTopicSub[] {
  return [
    {
      id: RECEIPTS_TOPIC_ID,
      subscription: prefs.receipts ? "opt_in" : "opt_out",
    },
    {
      id: OFFERS_TOPIC_ID,
      subscription: prefs.offers ? "opt_in" : "opt_out",
    },
  ];
}

export function nameParts(meta: Record<string, unknown> | undefined): {
  firstName?: string;
  lastName?: string;
} {
  if (!meta) return {};
  const first = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
  const last = typeof meta.last_name === "string" ? meta.last_name.trim() : "";
  if (first || last) {
    return {
      firstName: first || undefined,
      lastName: last || undefined,
    };
  }
  const full = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  if (!full) return {};
  const [firstName, ...rest] = full.split(/\s+/);
  return {
    firstName: firstName || undefined,
    lastName: rest.join(" ") || undefined,
  };
}

export function parsePrefsBody(raw: unknown): MailPrefs | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const receipts = (raw as { receipts?: unknown }).receipts;
  const offers = (raw as { offers?: unknown }).offers;
  if (typeof receipts !== "boolean" || typeof offers !== "boolean") return null;
  return { receipts, offers };
}
