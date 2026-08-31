// apps/web/lib/ops/chauffeurs.ts
//
// Write-free chauffeur reader for public.chauffeurs. Mutations live in the
// chauffeurs route's actions.ts so other screens can import these helpers
// without inheriting a write surface.
//
// Every query goes through asStaff on HYPERDRIVE_NOCACHE (D-02). Never
// import the driver or the db package (Phase 3's fence). This module
// never logs: the fields it handles must not reach Logpush.

import { asStaff, type VamosClaims } from "../db/identity";
import { mapSqlState } from "./sqlstate";

export { mapSqlState };

export type ChauffeurStatus = "shift" | "off" | "leave";
export type LicenceState = "unknown" | "valid" | "expiring" | "expired";

export type SpokenLanguage = {
  code: string;
  key: string;
};

/**
 * Closed spoken-language list. A superset of the four platform locales
 * plus the codes a Zurich operator realistically needs. The code is data
 * and is never translated; `key` is the dictionary path for the name.
 */
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

const SPOKEN_CODES: readonly string[] = SPOKEN_LANGUAGES.map((entry) => entry.code);

const CHAUFFEUR_STATUSES: readonly ChauffeurStatus[] = ["shift", "off", "leave"];

/** Licence dates this many Zurich civil days out (inclusive) read as expiring. */
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

const FK_MISSING = "23503";

export type ChauffeurDbFailure =
  | ReturnType<typeof mapSqlState>
  | { kind: "fk"; code: "23503"; key: "chauffeurs-failure-vehicle" };

/**
 * mapSqlState covers 23514 (CHECK) and the shared ops codes.
 * 23503 is a default vehicle that no longer exists — ON DELETE SET NULL
 * handles deletes; a stale id on insert/update is a foreign-key miss.
 */
export function mapChauffeurSqlState(err: unknown): ChauffeurDbFailure {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (code === FK_MISSING) {
      return {
        kind: "fk",
        code: "23503",
        key: "chauffeurs-failure-vehicle",
      };
    }
  }
  return mapSqlState(err);
}

function isChauffeurStatus(value: string): value is ChauffeurStatus {
  return (CHAUFFEUR_STATUSES as readonly string[]).includes(value);
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function toCivilDate(value: string | Date): string | null {
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

function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  let compact = trimmed.replace(/[^\d+]/g, "");
  if (compact.startsWith("00")) compact = `+${compact.slice(2)}`;
  else if (compact.startsWith("0")) compact = `+41${compact.slice(1)}`;
  else if (!compact.startsWith("+")) compact = `+${compact}`;
  const digits = compact.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function normalizeLanguages(input: string[] | undefined): string[] {
  const source = input ?? [];
  const seen = new Set<string>();
  for (const entry of source) {
    const code = entry.trim();
    if (!SPOKEN_CODES.includes(code)) {
      throw new ChauffeurInputError("chauffeurs-failure-languages");
    }
    seen.add(code);
  }
  return [...seen].sort();
}

export function assertChauffeurInput(input: ChauffeurInput): AssertedChauffeurInput {
  const fullName = input.fullName.trim();
  if (!fullName) {
    throw new ChauffeurInputError("chauffeurs-failure-name-required");
  }

  const phone = normalizePhone(input.phone);
  if (!phone) {
    throw new ChauffeurInputError("chauffeurs-failure-phone-required");
  }

  const licenceNumber = input.licenceNumber.trim();
  if (!licenceNumber) {
    throw new ChauffeurInputError("chauffeurs-failure-licence-required");
  }

  const emailRaw = input.email == null ? "" : input.email.trim();
  const email = emailRaw === "" ? null : emailRaw;

  const vehicleRaw = input.defaultVehicleId == null ? "" : input.defaultVehicleId.trim();
  const defaultVehicleId = vehicleRaw === "" ? null : vehicleRaw;

  const expiryRaw = input.licenceExpiresOn == null ? "" : input.licenceExpiresOn.trim();
  let licenceExpiresOn: string | null = null;
  if (expiryRaw !== "") {
    const day = toCivilDate(expiryRaw);
    if (!day) {
      throw new ChauffeurInputError("chauffeurs-failure-licence-date");
    }
    licenceExpiresOn = day;
  }

  const status: ChauffeurStatus =
    input.status && isChauffeurStatus(input.status) ? input.status : "off";

  const photoPath = input.photoPath === undefined ? null : input.photoPath;
  if (photoPath !== null && photoPath.startsWith("data:")) {
    throw new ChauffeurInputError("chauffeurs-failure-photo");
  }

  return {
    fullName,
    phone,
    email,
    defaultVehicleId,
    licenceNumber,
    licenceExpiresOn,
    languages: normalizeLanguages(input.languages),
    status,
    photoPath,
    note: input.note === undefined ? "" : input.note,
  };
}

type ListSqlRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  default_vehicle_id: string | null;
  default_vehicle_plate: string | null;
  licence_expires_on: Date | string | null;
  languages: string[] | null;
  status: string;
  photo_path: string | null;
  note: string;
  active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

type DetailSqlRow = ListSqlRow & {
  licence_number: string;
};

function mapLanguages(value: string[] | null): string[] {
  return Array.isArray(value) ? value : [];
}

function mapListRow(row: ListSqlRow): ChauffeurRow {
  const status: ChauffeurStatus = isChauffeurStatus(row.status) ? row.status : "off";
  const expiry =
    row.licence_expires_on == null ? null : toCivilDate(row.licence_expires_on);
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    defaultVehicleId: row.default_vehicle_id,
    defaultVehiclePlate: row.default_vehicle_plate,
    licenceExpiresOn: expiry,
    languages: mapLanguages(row.languages),
    status,
    photoPath: row.photo_path,
    note: row.note,
    active: row.active,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapDetailRow(row: DetailSqlRow): ChauffeurDetail {
  return {
    ...mapListRow(row),
    licenceNumber: row.licence_number,
  };
}

// List projection omits the licence number on purpose: no component change
// and no accidental column spread can put it into a table, a CSV export or
// a client payload. loadChauffeur is the only reader that selects it.
export async function loadChauffeurs(
  env: CloudflareEnv,
  claims: VamosClaims,
): Promise<ChauffeurRow[]> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<ListSqlRow[]>`
      select
        c.id,
        c.full_name,
        c.phone,
        c.email,
        c.default_vehicle_id,
        v.plate as default_vehicle_plate,
        c.licence_expires_on,
        c.languages,
        c.status,
        c.photo_path,
        c.note,
        c.active,
        c.created_at,
        c.updated_at
      from public.chauffeurs c
      left join public.vehicles v on v.id = c.default_vehicle_id
      order by c.active desc, c.licence_expires_on asc nulls last, c.full_name asc
    `;
    return rows.map(mapListRow);
  });
}

export async function loadChauffeur(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
): Promise<ChauffeurDetail | null> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<DetailSqlRow[]>`
      select
        c.id,
        c.full_name,
        c.phone,
        c.email,
        c.default_vehicle_id,
        v.plate as default_vehicle_plate,
        c.licence_number,
        c.licence_expires_on,
        c.languages,
        c.status,
        c.photo_path,
        c.note,
        c.active,
        c.created_at,
        c.updated_at
      from public.chauffeurs c
      left join public.vehicles v on v.id = c.default_vehicle_id
      where c.id = ${id}
      limit 1
    `;
    const row = rows[0];
    return row ? mapDetailRow(row) : null;
  });
}
