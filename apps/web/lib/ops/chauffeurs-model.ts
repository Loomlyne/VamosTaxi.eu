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

const ISO_WEEKDAY: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export type LeaveRange = {
  from: string;
  until: string;
};

export type DutyWindow = {
  weekdays: readonly number[];
  start: string | null;
  end: string | null;
  leaveRanges?: readonly LeaveRange[];
};

export type ChauffeurRow = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  defaultVehicleId: string | null;
  defaultVehiclePlate: string | null;
  vehicleClassId: string | null;
  vehicleClassName: string | null;
  /** chauffeurs.plate (20261007160000): the plate number that tells two drivers apart. */
  plate: string | null;
  licenceExpiresOn: string | null;
  languages: string[];
  status: ChauffeurStatus;
  photoPath: string | null;
  note: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  shiftWeekdays: number[];
  shiftStart: string | null;
  shiftEnd: string | null;
  leaveRanges: LeaveRange[];
};

export type ChauffeurDetail = ChauffeurRow & {
  licenceNumber: string;
};

export type ChauffeurInput = {
  fullName: string;
  phone: string;
  email?: string | null;
  defaultVehicleId?: string | null;
  vehicleClassId?: string | null;
  /** undefined = keep the stored plate; "" or null = none. */
  plate?: string | null;
  licenceNumber: string;
  licenceExpiresOn?: string | null;
  languages?: string[];
  status?: ChauffeurStatus;
  photoPath?: string | null;
  note?: string;
  shiftWeekdays?: number[];
  shiftStart?: string | null;
  shiftEnd?: string | null;
  leaveRanges?: LeaveRange[];
};

export type AssertedChauffeurInput = {
  fullName: string;
  phone: string;
  email: string | null;
  defaultVehicleId: string | null;
  /** undefined = keep the stored class (the driver form no longer sends one, signed 2026-10-01). */
  vehicleClassId: string | null | undefined;
  /** Required (decision 7); undefined = keep the stored plate (the caller did not send one). */
  plate: string | undefined;
  licenceNumber: string;
  licenceExpiresOn: string | null;
  languages: string[];
  status: ChauffeurStatus;
  photoPath: string | null;
  note: string;
  shiftWeekdays: number[];
  shiftStart: string | null;
  shiftEnd: string | null;
  leaveRanges: LeaveRange[];
};

/**
 * What deleteChauffeurRow found (chauffeurs-write.ts); fleet-http.ts chauffeurDeleteJson answers it.
 * Decision 7: `unassigned` = the references of his trips that were not finished, now unassigned.
 */
export type ChauffeurDeleteResult =
  | { kind: "gone" }
  | { kind: "deleted"; unassigned: string[] };

export class ChauffeurInputError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(key);
    this.name = "ChauffeurInputError";
    this.key = key;
  }
}

export class ChauffeurDuplicateEmailError extends Error {
  readonly key = "chauffeurs-duplicate-email";
  readonly existingId: string;
  readonly fullName: string;

  constructor(existingId: string, fullName: string) {
    super("chauffeurs-duplicate-email");
    this.name = "ChauffeurDuplicateEmailError";
    this.existingId = existingId;
    this.fullName = fullName;
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

function zurichClock(now: Date): { civil: string; weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZURICH_TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdayName = pick("weekday");
  const weekday = ISO_WEEKDAY[weekdayName] ?? 0;
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  let hour = Number(pick("hour"));
  if (hour === 24) hour = 0;
  const minute = Number(pick("minute"));
  return {
    civil: `${year}-${month}-${day}`,
    weekday,
    minutes: hour * 60 + minute,
  };
}

function parseHm(value: string | null): number | null {
  if (value == null) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

function inLeave(today: string, ranges: readonly LeaveRange[] | undefined): boolean {
  if (!ranges?.length) return false;
  return ranges.some((range) => {
    const from = toCivilDate(range.from);
    const until = toCivilDate(range.until);
    if (!from || !until) return false;
    return from <= today && today <= until;
  });
}

function inShiftWindow(nowMinutes: number, start: number, end: number): boolean {
  if (start === end) return true;
  if (end > start) return nowMinutes >= start && nowMinutes < end;
  return nowMinutes >= start || nowMinutes < end;
}

export function dutyStatus(input: DutyWindow, now: Date = new Date()): ChauffeurStatus {
  const clock = zurichClock(now);
  if (inLeave(clock.civil, input.leaveRanges)) return "leave";
  const start = parseHm(input.start);
  const end = parseHm(input.end);
  if (start == null || end == null) return "off";
  if (!input.weekdays.includes(clock.weekday)) return "off";
  return inShiftWindow(clock.minutes, start, end) ? "shift" : "off";
}
