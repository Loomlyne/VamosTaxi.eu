// apps/web/lib/ops/fleet-http.ts
//
// Parse/present helpers for /api/staff/vehicles|chauffeurs|vehicle-classes.
// Accepts VehicleInput / ChauffeurInput and the DC mock field names
// (klass, year, photo, name, licence, vehicle). Never writes CHF.

import {
  ChauffeurInputError,
  type ChauffeurDetail,
  type ChauffeurInput,
  type ChauffeurRow,
} from "./chauffeurs-model";
import {
  VehicleClassInputError,
  VehicleInputError,
  mapFleetSqlState,
  type VehicleClassInput,
  type VehicleClassRow,
  type VehicleClassSlug,
  type VehicleInput,
  type VehicleRow,
} from "./fleet";
import { jsonErr } from "./staff-json";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LANG_NAME_TO_CODE: Record<string, string> = {
  german: "de",
  french: "fr",
  italian: "it",
  english: "en",
  arabic: "ar",
  de: "de",
  fr: "fr",
  it: "it",
  en: "en",
  ar: "ar",
};

const LANG_CODE_TO_NAME: Record<string, string> = {
  de: "German",
  fr: "French",
  it: "Italian",
  en: "English",
  ar: "Arabic",
};

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function slugToKlass(slug: string): string {
  if (slug === "economy") return "Economy";
  if (slug === "business") return "Business";
  if (slug === "van") return "Van";
  return "Economy";
}

export function klassToSlug(klass: string): VehicleClassSlug | null {
  const n = klass.trim().toLowerCase();
  if (n === "economy" || n === "business" || n === "van") return n;
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

function asInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function photoKey(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value);
  if (!s) return null;
  if (s.startsWith("data:")) {
    throw new VehicleInputError("fleet-failure-photo");
  }
  return s;
}

function chauffeurPhotoKey(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value);
  if (!s) return null;
  if (s.startsWith("data:")) {
    throw new ChauffeurInputError("chauffeurs-failure-photo");
  }
  return s;
}

export function presentVehicle(row: VehicleRow): Record<string, unknown> {
  const photo = row.photoPath;
  return {
    id: row.id,
    vehicleClassId: row.vehicleClassId,
    classSlug: row.classSlug,
    klass: slugToKlass(row.classSlug),
    model: row.model,
    plate: row.plate,
    firstRegistered: row.firstRegistered,
    year: row.firstRegistered == null ? "" : String(row.firstRegistered),
    seats: row.seats,
    bags: row.bags,
    status: row.status,
    photoPath: photo,
    photo,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function presentVehicles(rows: VehicleRow[]): Record<string, unknown>[] {
  return rows.map(presentVehicle);
}

export function presentVehicleClass(row: VehicleClassRow): Record<string, unknown> {
  return {
    id: row.id,
    slug: row.slug,
    klass: slugToKlass(row.slug),
    passengerCapacity: row.passengerCapacity,
    luggageCapacity: row.luggageCapacity,
    sortOrder: row.sortOrder,
    active: row.active,
    vehicleCount: row.vehicleCount,
  };
}

function languageCodes(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  const raw: unknown[] = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,|]/)
      : [];
  const out: string[] = [];
  for (const entry of raw) {
    const token = String(entry).trim();
    if (!token) continue;
    const code = LANG_NAME_TO_CODE[token.toLowerCase()] ?? token;
    out.push(code);
  }
  return out;
}

function languageNames(codes: string[]): string[] {
  return codes.map((code) => LANG_CODE_TO_NAME[code] ?? code);
}

export function presentChauffeur(
  row: ChauffeurRow | ChauffeurDetail,
): Record<string, unknown> {
  const photo = row.photoPath;
  const licenceNumber = "licenceNumber" in row ? row.licenceNumber : "";
  return {
    id: row.id,
    fullName: row.fullName,
    name: row.fullName,
    phone: row.phone,
    email: row.email ?? "",
    defaultVehicleId: row.defaultVehicleId,
    vehicle: row.defaultVehicleId ?? "",
    licenceNumber,
    licence: licenceNumber,
    licenceExpiresOn: row.licenceExpiresOn,
    languages: languageNames(row.languages),
    status: row.status,
    photoPath: photo,
    photo,
    note: row.note,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function presentChauffeurs(rows: ChauffeurRow[]): Record<string, unknown>[] {
  return rows.map(presentChauffeur);
}

export type ParsedVehicleBody = {
  id: string | null;
  classSlug: VehicleClassSlug | null;
  input: VehicleInput;
};

export function parseVehicleBody(body: unknown): ParsedVehicleBody {
  const rec = asRecord(body);
  if (!rec) throw new VehicleInputError("fleet-failure-error");
  const idRaw = asString(rec.id);
  const id = isUuid(idRaw) ? idRaw : null;
  const classSlug = klassToSlug(asString(rec.classSlug || rec.klass || rec.slug));
  const yearRaw = rec.firstRegistered !== undefined ? rec.firstRegistered : rec.year;
  let firstRegistered: number | null | undefined;
  if (yearRaw === undefined) firstRegistered = undefined;
  else if (yearRaw === null || asString(yearRaw) === "") firstRegistered = null;
  else firstRegistered = asInt(yearRaw) ?? null;

  const vehicleClassId = asString(rec.vehicleClassId);
  const photoPath = photoKey(rec.photoPath !== undefined ? rec.photoPath : rec.photo);

  return {
    id,
    classSlug,
    input: {
      vehicleClassId,
      model: asString(rec.model),
      plate: asString(rec.plate),
      firstRegistered,
      seats: asInt(rec.seats) ?? 0,
      bags: asInt(rec.bags) ?? 0,
      status: rec.status as VehicleInput["status"],
      photoPath,
      note: asString(rec.note),
    },
  };
}

export function parseChauffeurBody(body: unknown): { id: string | null; input: ChauffeurInput } {
  const rec = asRecord(body);
  if (!rec) throw new ChauffeurInputError("chauffeurs-failure-error");
  const idRaw = asString(rec.id);
  const id = isUuid(idRaw) ? idRaw : null;
  const photoPath = chauffeurPhotoKey(rec.photoPath !== undefined ? rec.photoPath : rec.photo);
  return {
    id,
    input: {
      fullName: asString(rec.fullName || rec.name),
      phone: asString(rec.phone),
      email: asString(rec.email) || null,
      defaultVehicleId: asString(rec.defaultVehicleId || rec.vehicle) || null,
      licenceNumber: asString(rec.licenceNumber || rec.licence),
      licenceExpiresOn: asString(rec.licenceExpiresOn) || null,
      languages: languageCodes(rec.languages),
      status: rec.status as ChauffeurInput["status"],
      photoPath,
      note: asString(rec.note),
    },
  };
}

export function parseVehicleClassPatch(body: unknown): { id: string; input: VehicleClassInput } {
  const rec = asRecord(body);
  if (!rec) throw new VehicleClassInputError("fleet-failure-error");
  if (Object.prototype.hasOwnProperty.call(rec, "slug")) {
    throw new VehicleClassInputError("fleet-failure-slug");
  }
  const id = asString(rec.id);
  if (!isUuid(id)) throw new VehicleClassInputError("fleet-failure-error");
  return {
    id,
    input: {
      passengerCapacity: asInt(rec.passengerCapacity) ?? 0,
      luggageCapacity: asInt(rec.luggageCapacity) ?? 0,
    },
  };
}

function sqlCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function fleetJsonError(err: unknown): Response {
  if (err instanceof VehicleInputError) return jsonErr(err.key, 400);
  if (err instanceof VehicleClassInputError) return jsonErr(err.key, 400);
  const fleet = mapFleetSqlState(err);
  if (fleet.kind === "unique") return jsonErr("23505", 409);
  if (fleet.kind === "fk") return jsonErr("23503", 409);
  if (fleet.kind === "check") return jsonErr("23514", 400);
  return jsonErr("error", 500);
}

export function chauffeurJsonError(err: unknown): Response {
  if (err instanceof ChauffeurInputError) return jsonErr(err.key, 400);
  const code = sqlCode(err);
  if (code === "23503") return jsonErr("23503", 409, { message: "That vehicle is missing." });
  if (code === "23514") return jsonErr("23514", 400, { message: "One of the fields is not a valid value." });
  const rec = err && typeof err === "object" ? (err as { message?: string }) : null;
  const message = rec && rec.message ? String(rec.message) : "The chauffeur could not be saved.";
  return jsonErr("error", 500, { message });
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
