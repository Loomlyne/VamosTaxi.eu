// apps/web/lib/ops/chauffeurs.ts
//
// Write-free chauffeur reader for public.chauffeurs. Mutations live in the
// chauffeurs route's actions.ts so other screens can import these helpers
// without inheriting a write surface.
//
// Every query goes through asStaff on HYPERDRIVE_NOCACHE (D-02). Never
// import the driver or the db package (Phase 3's fence). This module
// never logs: the fields it handles must not reach Logpush.

import {
  parseLeaveRanges,
  parseShiftClock,
  parseShiftWeekdays,
  loadDeskExtras,
  derivedDuty,
  type DeskExtras,
} from "./chauffeur-desk";
import { asStaff, type VamosClaims } from "../db/identity";
import { mapSqlState } from "./sqlstate";
import {
  SPOKEN_CODES,
  ChauffeurInputError,
  isChauffeurStatus,
  toCivilDate,
  type AssertedChauffeurInput,
  type ChauffeurDetail,
  type ChauffeurInput,
  type ChauffeurRow,
  type ChauffeurStatus,
} from "./chauffeurs-model";

export { mapSqlState };
export {
  CHAUFFEUR_STATUSES,
  LICENCE_EXPIRING_WITHIN_DAYS,
  SPOKEN_CODES,
  SPOKEN_LANGUAGES,
  ChauffeurDuplicateEmailError,
  ChauffeurInputError,
  isChauffeurStatus,
  licenceState,
  dutyStatus,
  type AssertedChauffeurInput,
  type ChauffeurDetail,
  type ChauffeurInput,
  type ChauffeurRow,
  type ChauffeurStatus,
  type LicenceState,
  type SpokenLanguage,
} from "./chauffeurs-model";

const FK_MISSING = "23503";

export type ChauffeurDbFailure =
  | ReturnType<typeof mapSqlState>
  | { kind: "fk"; code: "23503"; key: "chauffeurs-failure-vehicle" | "chauffeurs-failure-class" };

/**
 * mapSqlState covers 23514 (CHECK) and the shared ops codes.
 * 23503 is a default vehicle that no longer exists — ON DELETE SET NULL
 * handles deletes; a stale id on insert/update is a foreign-key miss.
 */
export function mapChauffeurSqlState(err: unknown): ChauffeurDbFailure {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (code === FK_MISSING) {
      const constraint =
        "constraint" in err ? String((err as { constraint: unknown }).constraint ?? "") : "";
      return {
        kind: "fk",
        code: "23503",
        key: constraint.includes("vehicle_class_id")
          ? "chauffeurs-failure-class"
          : "chauffeurs-failure-vehicle",
      };
    }
  }
  return mapSqlState(err);
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // "+41 (0)79 ..." writes the national trunk zero in brackets; it is not dialled after the country code.
  let compact = trimmed.replace(/\(\s*0\s*\)/g, "").replace(/[^\d+]/g, "");
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

export function normalizeChauffeurEmail(email: string | null | undefined): string | null {
  const trimmed = (email ?? "").trim().toLowerCase();
  return trimmed || null;
}

export function emailsMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = normalizeChauffeurEmail(left);
  const b = normalizeChauffeurEmail(right);
  return a !== null && a === b;
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

  const licenceNumber = (input.licenceNumber ?? "").trim();

  const emailRaw = input.email == null ? "" : input.email.trim();
  const email = emailRaw === "" ? null : emailRaw;

  const vehicleRaw = input.defaultVehicleId == null ? "" : input.defaultVehicleId.trim();
  const defaultVehicleId = vehicleRaw === "" ? null : vehicleRaw;
  if (defaultVehicleId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(defaultVehicleId)) {
    throw new ChauffeurInputError("chauffeurs-failure-vehicle");
  }

  const classRaw = input.vehicleClassId == null ? "" : input.vehicleClassId.trim();
  const vehicleClassId = classRaw === "" ? null : classRaw;
  if (
    vehicleClassId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(vehicleClassId)
  ) {
    throw new ChauffeurInputError("chauffeurs-failure-class");
  }

  const expiryRaw = input.licenceExpiresOn == null ? "" : input.licenceExpiresOn.trim();
  let licenceExpiresOn: string | null = null;
  if (expiryRaw !== "") {
    const day = toCivilDate(expiryRaw);
    if (!day) {
      throw new ChauffeurInputError("chauffeurs-failure-licence-date");
    }
    licenceExpiresOn = day;
  }

  const status: ChauffeurStatus = "off";

  const photoPath = input.photoPath === undefined ? null : input.photoPath;
  if (photoPath !== null && photoPath.startsWith("data:")) {
    throw new ChauffeurInputError("chauffeurs-failure-photo");
  }

  return {
    fullName,
    phone,
    email,
    defaultVehicleId,
    vehicleClassId,
    licenceNumber,
    licenceExpiresOn,
    languages: normalizeLanguages(input.languages),
    status,
    photoPath,
    note: input.note === undefined ? "" : input.note,
    shiftWeekdays: parseShiftWeekdays(input.shiftWeekdays ?? []),
    shiftStart: parseShiftClock(input.shiftStart ?? null),
    shiftEnd: parseShiftClock(input.shiftEnd ?? null),
    leaveRanges: parseLeaveRanges(input.leaveRanges ?? []),
  };
}

type ListSqlRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  default_vehicle_id: string | null;
  default_vehicle_plate: string | null;
  vehicle_class_id: string | null;
  vehicle_class_name: string | null;
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

function rowText(row: object, snake: string, camel: string): string | null {
  const bag = row as Record<string, unknown>;
  const raw = bag[snake] ?? bag[camel];
  if (raw == null) return null;
  const text = String(raw).trim();
  return text || null;
}

function mapListRow(row: ListSqlRow): ChauffeurRow {
  const status: ChauffeurStatus = isChauffeurStatus(row.status) ? row.status : "off";
  const expiryRaw = (row as { licence_expires_on?: Date | string | null }).licence_expires_on
    ?? (row as { licenceExpiresOn?: Date | string | null }).licenceExpiresOn;
  const expiry = expiryRaw == null ? null : toCivilDate(expiryRaw);
  return {
    id: row.id,
    fullName: rowText(row, "full_name", "fullName") ?? "",
    phone: rowText(row, "phone", "phone") ?? "",
    email: row.email ?? (row as { email?: string | null }).email ?? null,
    defaultVehicleId: rowText(row, "default_vehicle_id", "defaultVehicleId"),
    defaultVehiclePlate: rowText(row, "default_vehicle_plate", "defaultVehiclePlate"),
    vehicleClassId: rowText(row, "vehicle_class_id", "vehicleClassId"),
    vehicleClassName: rowText(row, "vehicle_class_name", "vehicleClassName"),
    licenceExpiresOn: expiry,
    languages: mapLanguages(row.languages),
    status,
    photoPath: row.photo_path,
    note: row.note,
    active: row.active,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    shiftWeekdays: [],
    shiftStart: null,
    shiftEnd: null,
    leaveRanges: [],
  };
}

function applyDesk(row: ChauffeurRow, extras: DeskExtras): ChauffeurRow {
  const shift = extras.shiftByChauffeur.get(row.id);
  const leaveRanges = extras.leaveByChauffeur.get(row.id) ?? [];
  const shiftWeekdays = shift?.weekdays ?? [];
  const shiftStart = shift?.start ?? null;
  const shiftEnd = shift?.end ?? null;
  return {
    ...row,
    shiftWeekdays,
    shiftStart,
    shiftEnd,
    leaveRanges,
    status: derivedDuty({ shiftWeekdays, shiftStart, shiftEnd, leaveRanges }),
  };
}

function mapDetailRow(row: DetailSqlRow): ChauffeurDetail {
  return {
    ...mapListRow(row),
    licenceNumber: rowText(row, "licence_number", "licenceNumber") ?? "",
  };
}

function applyDeskDetail(row: ChauffeurDetail, extras: DeskExtras): ChauffeurDetail {
  return { ...applyDesk(row, extras), licenceNumber: row.licenceNumber };
}

// List projection omits the licence number on purpose: no component change
// and no accidental column spread can put it into a table, a CSV export or
// a client payload. loadChauffeur is the only reader that selects it.
export async function loadChauffeurDetailsList(
  env: CloudflareEnv,
  claims: VamosClaims,
): Promise<ChauffeurDetail[]> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<DetailSqlRow[]>`
      select
        c.id,
        c.full_name,
        c.phone,
        c.email,
        c.default_vehicle_id,
        v.plate as default_vehicle_plate,
        c.vehicle_class_id,
        cls.name as vehicle_class_name,
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
      left join public.vehicle_classes cls on cls.id = c.vehicle_class_id
      order by c.active desc, c.licence_expires_on asc nulls last, c.full_name asc
    `;
    const extras = await loadDeskExtras(sql);
    return rows.map((row) => applyDeskDetail(mapDetailRow(row), extras));
  });
}

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
        c.vehicle_class_id,
        cls.name as vehicle_class_name,
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
      left join public.vehicle_classes cls on cls.id = c.vehicle_class_id
      order by c.active desc, c.licence_expires_on asc nulls last, c.full_name asc
    `;
    const extras = await loadDeskExtras(sql);
    return rows.map((row) => applyDesk(mapListRow(row), extras));
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
        c.vehicle_class_id,
        cls.name as vehicle_class_name,
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
      left join public.vehicle_classes cls on cls.id = c.vehicle_class_id
      where c.id = ${id}
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    const extras = await loadDeskExtras(sql);
    return applyDeskDetail(mapDetailRow(row), extras);
  });
}

export async function loadChauffeurByEmail(
  env: CloudflareEnv,
  claims: VamosClaims,
  email: string,
): Promise<ChauffeurDetail | null> {
  const normalized = normalizeChauffeurEmail(email);
  if (!normalized) return null;
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<DetailSqlRow[]>`
      select
        c.id,
        c.full_name,
        c.phone,
        c.email,
        c.default_vehicle_id,
        v.plate as default_vehicle_plate,
        c.vehicle_class_id,
        cls.name as vehicle_class_name,
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
      left join public.vehicle_classes cls on cls.id = c.vehicle_class_id
      where c.email is not null
        and length(trim(c.email)) > 0
        and lower(trim(c.email)) = ${normalized}
      limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    const extras = await loadDeskExtras(sql);
    return applyDeskDetail(mapDetailRow(row), extras);
  });
}
