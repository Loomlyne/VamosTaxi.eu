// apps/web/lib/ops/fleet-http.ts
//
// Parse/present helpers for /api/staff/vehicles|chauffeurs|vehicle-classes.
// Accepts VehicleInput / ChauffeurInput and the DC mock field names
// (klass, year, photo, name, licence, vehicle). Never writes CHF.

import {
  ChauffeurDuplicateEmailError,
  ChauffeurInputError,
  type ChauffeurDetail,
  type ChauffeurInput,
  type ChauffeurRow,
} from "./chauffeurs-model";
import { VehicleSeatError } from "./vehicle-seats";
import { parseLeaveRanges, parseSeatId, parseShiftClock, parseShiftWeekdays } from "./chauffeur-desk";
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
import { classDisplayName, liveClassSlug } from "./class-slug";
import type { VehicleDeleteResult } from "./fleet-write";
import { jsonErr, jsonOk } from "./staff-json";
import { mapSqlState } from "./sqlstate";

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

/** D-14 display name for a live or legacy class slug; unknown slugs read Economy. */
export function slugToKlass(slug: string): string {
  return classDisplayName(slug) ?? "Economy";
}

/** Live class slug for a DC klass name or slug (D-14); First and unknown values are null. */
export function klassToSlug(klass: string): VehicleClassSlug | null {
  return liveClassSlug(klass);
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
    morningChauffeurId: row.morningChauffeurId,
    nightChauffeurId: row.nightChauffeurId,
    morning: row.morningChauffeurId ?? "",
    night: row.nightChauffeurId ?? "",
  };
}

export function presentVehicles(rows: VehicleRow[]): Record<string, unknown>[] {
  return rows.map(presentVehicle);
}

export function presentVehicleClass(row: VehicleClassRow): Record<string, unknown> {
  const photo = row.photoPath;
  return {
    id: row.id,
    slug: row.slug,
    klass: slugToKlass(row.slug),
    name: row.name || slugToKlass(row.slug),
    passengerCapacity: row.passengerCapacity,
    luggageCapacity: row.luggageCapacity,
    sortOrder: row.sortOrder,
    active: row.active,
    vehicleCount: row.vehicleCount,
    photoPath: photo && !String(photo).startsWith("data:") ? photo : "",
    photo: photo && !String(photo).startsWith("data:") ? photo : "",
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
    vehicleClassId: row.vehicleClassId ?? "",
    vehicleClassName: (row.vehicleClassName ?? "").trim(),
    className: (row.vehicleClassName ?? "").trim(),
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
    shiftWeekdays: row.shiftWeekdays,
    shiftStart: row.shiftStart,
    shiftEnd: row.shiftEnd,
    leaveRanges: row.leaveRanges,
    weekdays: row.shiftWeekdays,
    start: row.shiftStart,
    end: row.shiftEnd,
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
      morningChauffeurId: parseSeatId(rec.morningChauffeurId || rec.morning),
      nightChauffeurId: parseSeatId(rec.nightChauffeurId || rec.night),
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
      // Signed 2026-10-01: the driver form no longer carries a class; absent means keep the column.
      vehicleClassId: Object.prototype.hasOwnProperty.call(rec, "vehicleClassId")
        ? asString(rec.vehicleClassId) || null
        : undefined,
      licenceNumber: asString(rec.licenceNumber || rec.licence),
      licenceExpiresOn: asString(rec.licenceExpiresOn) || null,
      languages: languageCodes(rec.languages),
      status: rec.status as ChauffeurInput["status"],
      photoPath,
      note: asString(rec.note),
      shiftWeekdays: parseShiftWeekdays(
        Array.isArray(rec.shiftWeekdays) ? rec.shiftWeekdays : rec.weekdays,
      ),
      shiftStart: parseShiftClock(rec.shiftStart ?? rec.start),
      shiftEnd: parseShiftClock(rec.shiftEnd ?? rec.end),
      leaveRanges: parseLeaveRanges(rec.leaveRanges),
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

export function chauffeurErrorCopy(code: string): string | null {
  if (code === "chauffeurs-failure-name-required") return "Name is required.";
  if (code === "chauffeurs-failure-phone-required") return "Phone is required.";
  if (code === "chauffeurs-failure-licence-required") return "Licence number is required.";
  if (code === "chauffeurs-failure-licence-date") return "Licence expiry must be a calendar date.";
  if (code === "chauffeurs-failure-languages") return "One of the languages is not supported.";
  if (code === "chauffeurs-failure-photo") return "Photo must be an uploaded file, not an embedded image.";
  if (code === "chauffeurs-failure-vehicle") return "That vehicle is missing.";
  if (code === "chauffeurs-failure-class") return "That class is missing.";
  if (code === "chauffeurs-failure-error") return "The chauffeur could not be saved.";
  if (code === "chauffeurs-duplicate-email") return "This email is already on file.";
  if (code === "fleet-seat-morning-taken") return "This vehicle already has a Morning chauffeur.";
  if (code === "fleet-seat-night-taken") return "This vehicle already has a Night chauffeur.";
  if (code === "fleet-seat-both-taken") return "This vehicle already has Morning and Night chauffeurs.";
  if (code === "23503") return "That vehicle is missing.";
  if (code === "23505") return "That value is already on file.";
  if (code === "23514") return "One of the fields is not a valid value.";
  if (code === "22P02") return "A field is the wrong type. Check the vehicle id and languages.";
  if (code === "42501") return "You do not have permission to save this chauffeur.";
  if (code === "not-found" || code === "P0002") return "That chauffeur is gone.";
  return null;
}

function chauffeurConstraintCopy(err: unknown): string | null {
  if (typeof err !== "object" || err === null || !("constraint" in err)) return null;
  const constraint = (err as { constraint: unknown }).constraint;
  if (constraint === "chauffeurs_default_vehicle_id_fkey") return "That vehicle is missing.";
  if (constraint === "chauffeurs_vehicle_class_id_fkey") return "That class is missing.";
  if (constraint === "chauffeurs_pkey") return "That chauffeur id is already on file.";
  if (constraint === "chauffeurs_user_id_key") return "That login is already linked to a chauffeur.";
  if (typeof constraint === "string" && constraint) return "The chauffeur could not be saved.";
  return null;
}

export function fleetJsonError(err: unknown): Response {
  if (err instanceof VehicleSeatError) {
    const message = chauffeurErrorCopy(err.key) ?? "The chauffeur could not be saved.";
    return jsonErr(err.key, 409, { message });
  }
  if (err instanceof VehicleInputError) return jsonErr(err.key, 400);
  if (err instanceof VehicleClassInputError) return jsonErr(err.key, 400);
  const fleet = mapFleetSqlState(err);
  if (fleet.kind === "unique") return jsonErr("23505", 409);
  if (fleet.kind === "fk") return jsonErr("23503", 409);
  if (fleet.kind === "check") return jsonErr("23514", 400);
  return jsonErr("error", 500);
}

/**
 * DELETE /api/staff/vehicles/:id answer (quick 261001-cars-page). A refusal carries the driver
 * names and trip references so the dashboard can say it in the owner's language; `message` is
 * the English sentence for any other caller.
 */
export function vehicleDeleteJson(result: VehicleDeleteResult, id: string): Response {
  if (result.kind === "gone") {
    return jsonErr("fleet-car-gone", 404, { message: "That car is gone." });
  }
  if (result.kind === "in-use") {
    const parts: string[] = [];
    if (result.drivers.length > 0) {
      parts.push(`Driven by ${result.drivers.join(", ")}. Change the car on Chauffeurs first.`);
    }
    if (result.references.length > 0) {
      parts.push(`In use on trips not finished: ${result.references.join(", ")}. Reassign or close them first.`);
    }
    return jsonErr("fleet-car-in-use", 409, {
      drivers: result.drivers,
      references: result.references,
      message: parts.join(" "),
    });
  }
  return jsonOk({ id });
}

export function chauffeurJsonError(err: unknown): Response {
  if (err instanceof ChauffeurDuplicateEmailError) {
    return jsonErr(err.key, 409, {
      message: chauffeurErrorCopy(err.key) ?? "This email is already on file.",
      existingId: err.existingId,
      fullName: err.fullName,
    });
  }
  if (err instanceof VehicleSeatError) {
    const message = chauffeurErrorCopy(err.key) ?? "The chauffeur could not be saved.";
    return jsonErr(err.key, 409, { message });
  }
  if (err instanceof ChauffeurInputError) {
    const message = chauffeurErrorCopy(err.key) ?? "The chauffeur could not be saved.";
    return jsonErr(err.key, 400, { message });
  }
  const mapped = mapSqlState(err);
  if (sqlCode(err) === "23503") {
    const constraint =
      typeof err === "object" && err !== null && "constraint" in err
        ? String((err as { constraint: unknown }).constraint ?? "")
        : "";
    if (constraint === "chauffeurs_vehicle_class_id_fkey") {
      return jsonErr("23503", 409, { message: "That class is missing." });
    }
    return jsonErr("23503", 409, { message: chauffeurErrorCopy("23503") ?? "That vehicle is missing." });
  }
  if (mapped.kind === "unique") {
    return jsonErr("23505", 409, { message: chauffeurErrorCopy("23505") ?? "That value is already on file." });
  }
  if (mapped.kind === "check") {
    return jsonErr("23514", 400, { message: chauffeurErrorCopy("23514") ?? "One of the fields is not a valid value." });
  }
  if (mapped.kind === "privilege") {
    return jsonErr("42501", 403, { message: chauffeurErrorCopy("42501") ?? "You do not have permission to save this chauffeur." });
  }
  if (mapped.kind === "no-data") {
    return jsonErr("not-found", 404, { message: chauffeurErrorCopy("not-found") ?? "That chauffeur is gone." });
  }
  const fromConstraint = chauffeurConstraintCopy(err);
  const code = sqlCode(err);
  const fromCopy = code ? chauffeurErrorCopy(code) : null;
  if (fromCopy && code) {
    return jsonErr(code, code === "22P02" ? 400 : 500, { message: fromCopy });
  }
  if (fromConstraint) {
    return jsonErr(code || "error", 409, { message: fromConstraint });
  }
  const message = "The chauffeur could not be saved.";
  return jsonErr(code || "error", 500, { message });
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
