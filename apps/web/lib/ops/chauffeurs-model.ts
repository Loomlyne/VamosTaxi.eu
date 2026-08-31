// Client-safe chauffeur types and helpers. chauffeurs.ts imports identity;
// tables must not.

export type ChauffeurStatus = "shift" | "off" | "leave";
export type LicenceState = "unknown" | "valid" | "expiring" | "expired";

export type SpokenLanguage = {
  code: string;
  key: string;
};

export const SPOKEN_LANGUAGES: readonly SpokenLanguage[] = [
  { code: "en", key: "ops.spoken.en" },
  { code: "de", key: "ops.spoken.de" },
  { code: "fr", key: "ops.spoken.fr" },
  { code: "ar", key: "ops.spoken.ar" },
  { code: "it", key: "ops.spoken.it" },
  { code: "es", key: "ops.spoken.es" },
  { code: "pt", key: "ops.spoken.pt" },
  { code: "ru", key: "ops.spoken.ru" },
  { code: "tr", key: "ops.spoken.tr" },
  { code: "sq", key: "ops.spoken.sq" },
  { code: "hr", key: "ops.spoken.hr" },
  { code: "pl", key: "ops.spoken.pl" },
];

export const SPOKEN_CODES: readonly string[] = SPOKEN_LANGUAGES.map((entry) => entry.code);

export const CHAUFFEUR_STATUSES: readonly ChauffeurStatus[] = ["shift", "off", "leave"];

export const LICENCE_EXPIRING_WITHIN_DAYS = 60;

const ZURICH_TZ = "Europe/Zurich";

export type ChauffeurRow = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  defaultVehicleId: string | null;
  defaultVehiclePlate: string | null;
  licenceExpiresOn: string | null;
  languages: string[];
  status: ChauffeurStatus;
  photoPath: string | null;
  note: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChauffeurDetail = ChauffeurRow & {
  licenceNumber: string;
};

export type ChauffeurInput = {
  fullName: string;
  phone: string;
  email?: string | null;
  defaultVehicleId?: string | null;
  licenceNumber: string;
  licenceExpiresOn?: string | null;
  languages?: string[];
  status?: ChauffeurStatus;
  photoPath?: string | null;
  note?: string;
};

export type AssertedChauffeurInput = {
  fullName: string;
  phone: string;
  email: string | null;
  defaultVehicleId: string | null;
  licenceNumber: string;
  licenceExpiresOn: string | null;
  languages: string[];
  status: ChauffeurStatus;
  photoPath: string | null;
  note: string;
};

export class ChauffeurInputError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(key);
    this.name = "ChauffeurInputError";
    this.key = key;
  }
}

export function toCivilDate(value: string | Date): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  return match?.[1] ?? null;
}

function zurichCivilDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZURICH_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function addCivilDays(iso: string, days: number): string {
  const parts = iso.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (y === undefined || m === undefined || d === undefined) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function licenceState(
  expiry: string | Date | null | undefined,
  now: Date = new Date(),
): LicenceState {
  if (expiry == null) return "unknown";
  const day = toCivilDate(expiry);
  if (!day) return "unknown";
  const today = zurichCivilDate(now);
  if (day < today) return "expired";
  const limit = addCivilDays(today, LICENCE_EXPIRING_WITHIN_DAYS);
  if (day <= limit) return "expiring";
  return "valid";
}

export function isChauffeurStatus(value: string): value is ChauffeurStatus {
  return (CHAUFFEUR_STATUSES as readonly string[]).includes(value);
}
