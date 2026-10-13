// apps/web/lib/ops/fleet.ts
//
// Write-free fleet reader for public.vehicles / public.vehicle_classes.
// Mutations live in the vehicles route's actions.ts so 06-13 can import
// these readers without inheriting a write surface.
//
// Every query goes through asStaff on HYPERDRIVE_NOCACHE (D-02). Never
// import the driver or the db package (Phase 3's fence).

import { asStaff, type VamosClaims } from "../db/identity";
import { mapSqlState } from "./sqlstate";
import { loadDeskExtras } from "./chauffeur-desk";

export { mapSqlState };

export type VehicleStatus = "service" | "idle" | "workshop";
export type VehicleClassSlug = string;
export type VehicleClassStatus = "live" | "draft" | "retired";

export type VehicleClassRow = {
  id: string;
  slug: VehicleClassSlug;
  /** Decision 6: null while a Draft class has no seat count yet. */
  passengerCapacity: number | null;
  luggageCapacity: number | null;
  sortOrder: number;
  active: boolean;
  vehicleCount: number;
  /** Phase 30 CLS-01: server-derived state (retired > live > draft). */
  status: VehicleClassStatus;
  /** Why it was retired; "" when none was given. */
  retiredReason: string;
  /** True when the live price book has an available row for this class. */
  inLiveBook: boolean;
  /** Go-live checklist gaps, comma list of photo,seats,bags,price; "" when complete. */
  missing: string;
  /** Upcoming trips with no chauffeur that Assign would accept (one shared DB rule). */
  unassignedPaidTrips: number;
  /** D-29: typed display name. Optional until owner SQL apply. */
  name?: string | null;
  /** D-30: R2 key under classes/. Optional until owner SQL apply. */
  photoPath?: string | null;
};

export type VehicleRow = {
  id: string;
  vehicleClassId: string;
  classSlug: VehicleClassSlug;
  model: string;
  plate: string;
  firstRegistered: number | null;
  seats: number;
  bags: number;
  status: VehicleStatus;
  photoPath: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
  morningChauffeurId: string | null;
  nightChauffeurId: string | null;
};

export type VehicleInput = {
  vehicleClassId: string;
  model: string;
  plate: string;
  firstRegistered?: number | null;
  seats: number;
  bags: number;
  status?: VehicleStatus;
  photoPath?: string | null;
  note?: string;
  morningChauffeurId?: string | null;
  nightChauffeurId?: string | null;
};

export type AssertedVehicleInput = {
  vehicleClassId: string;
  model: string;
  plate: string;
  firstRegistered: number | null;
  seats: number;
  bags: number;
  status: VehicleStatus;
  photoPath: string | null;
  note: string;
  morningChauffeurId: string | null;
  nightChauffeurId: string | null;
};

export type VehicleClassInput = {
  passengerCapacity: number;
  luggageCapacity: number;
  sortOrder?: number;
  active?: boolean;
};

export type AssertedVehicleClassInput = {
  passengerCapacity: number;
  luggageCapacity: number;
  sortOrder: number;
  active: boolean;
};

export class VehicleInputError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(key);
    this.name = "VehicleInputError";
    this.key = key;
  }
}

export class VehicleClassInputError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(key);
    this.name = "VehicleClassInputError";
    this.key = key;
  }
}

const VEHICLE_STATUSES: readonly VehicleStatus[] = ["service", "idle", "workshop"];

export { vehicleClassLabelKey } from "./vehicle-class-label";

function isVehicleStatus(value: string): value is VehicleStatus {
  return (VEHICLE_STATUSES as readonly string[]).includes(value);
}

const CLASS_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isClassSlug(value: string): value is VehicleClassSlug {
  return CLASS_SLUG.test(value);
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function normalizePlate(plate: string): string {
  return plate.trim().replace(/\s+/g, " ");
}

const FK_RESTRICT = "23503";

export type FleetDbFailure =
  | ReturnType<typeof mapSqlState>
  | { kind: "fk"; code: "23503"; key: "fleet-failure-class-has-vehicles" };

/**
 * mapSqlState covers 23505 (duplicate plate) and 23514 (capacity/year CHECK).
 * 23503 is ON DELETE RESTRICT from vehicles → vehicle_classes: a class that
 * still has vehicles cannot be deleted. "This class still has vehicles" is
 * actionable; "foreign key violation" is not.
 */
export function mapFleetSqlState(err: unknown): FleetDbFailure {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (code === FK_RESTRICT) {
      return {
        kind: "fk",
        code: "23503",
        key: "fleet-failure-class-has-vehicles",
      };
    }
  }
  return mapSqlState(err);
}

export function assertVehicleInput(input: VehicleInput): AssertedVehicleInput {
  const vehicleClassId = input.vehicleClassId.trim();
  if (!vehicleClassId) {
    throw new VehicleInputError("fleet-failure-class-required");
  }

  const model = input.model.trim();
  if (!model) {
    throw new VehicleInputError("fleet-failure-model-required");
  }

  const plate = normalizePlate(input.plate);
  if (!plate) {
    throw new VehicleInputError("fleet-failure-plate-required");
  }

  const seats = input.seats;
  if (!Number.isInteger(seats) || seats < 1 || seats > 16) {
    throw new VehicleInputError("fleet-failure-seats");
  }

  const bags = input.bags;
  if (!Number.isInteger(bags) || bags < 0 || bags > 16) {
    throw new VehicleInputError("fleet-failure-bags");
  }

  const firstRegistered =
    input.firstRegistered === undefined ? null : input.firstRegistered;
  if (firstRegistered !== null) {
    if (
      !Number.isInteger(firstRegistered) ||
      firstRegistered < 1990 ||
      firstRegistered > 2100
    ) {
      throw new VehicleInputError("fleet-failure-year");
    }
  }

  const status: VehicleStatus =
    input.status && isVehicleStatus(input.status) ? input.status : "service";

  const photoPath = input.photoPath === undefined ? null : input.photoPath;
  if (photoPath !== null && photoPath.startsWith("data:")) {
    throw new VehicleInputError("fleet-failure-photo");
  }

  return {
    vehicleClassId,
    model,
    plate,
    firstRegistered,
    seats,
    bags,
    status,
    photoPath,
    note: input.note === undefined ? "" : input.note,
    morningChauffeurId: input.morningChauffeurId ?? null,
    nightChauffeurId: input.nightChauffeurId ?? null,
  };
}

export function assertVehicleClassInput(
  input: VehicleClassInput,
): AssertedVehicleClassInput {
  const passengerCapacity = input.passengerCapacity;
  if (
    !Number.isInteger(passengerCapacity) ||
    passengerCapacity < 1 ||
    passengerCapacity > 16
  ) {
    throw new VehicleClassInputError("fleet-failure-passengers");
  }

  const luggageCapacity = input.luggageCapacity;
  if (
    !Number.isInteger(luggageCapacity) ||
    luggageCapacity < 0 ||
    luggageCapacity > 16
  ) {
    throw new VehicleClassInputError("fleet-failure-luggage");
  }

  return {
    passengerCapacity,
    luggageCapacity,
    sortOrder: input.sortOrder === undefined ? 0 : input.sortOrder,
    active: input.active !== false,
  };
}

type ClassSqlRow = {
  id: string;
  slug: string;
  passenger_capacity: number | null;
  luggage_capacity: number | null;
  sort_order: number;
  active: boolean;
  vehicle_count: number;
  state: string;
  hidden_reason: string | null;
  in_live_book: boolean;
  missing: string | null;
  unassigned_paid_trips: number | string | null;
  name?: string | null;
  photo_path?: string | null;
};

type VehicleSqlRow = {
  id: string;
  vehicle_class_id: string;
  class_slug: string;
  model: string;
  plate: string;
  first_registered: number | null;
  seats: number;
  bags: number;
  status: string;
  photo_path: string | null;
  note: string;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapClassRow(row: ClassSqlRow): VehicleClassRow {
  const slug = isClassSlug(row.slug) ? row.slug : "economy";
  return {
    id: row.id,
    slug,
    passengerCapacity: row.passenger_capacity ?? null,
    luggageCapacity: row.luggage_capacity ?? null,
    sortOrder: row.sort_order,
    active: row.active,
    vehicleCount: row.vehicle_count,
    status:
      row.state === "live" || row.state === "retired" || row.state === "draft"
        ? row.state
        : "draft",
    retiredReason: typeof row.hidden_reason === "string" ? row.hidden_reason : "",
    inLiveBook: row.in_live_book === true,
    missing: typeof row.missing === "string" ? row.missing : "",
    unassignedPaidTrips: Number(row.unassigned_paid_trips) || 0,
    name: typeof row.name === "string" ? row.name : null,
    photoPath: typeof row.photo_path === "string" ? row.photo_path : null,
  };
}

function mapVehicleRow(row: VehicleSqlRow): VehicleRow {
  const classSlug = isClassSlug(row.class_slug) ? row.class_slug : "economy";
  const status: VehicleStatus = isVehicleStatus(row.status) ? row.status : "service";
  return {
    id: row.id,
    vehicleClassId: row.vehicle_class_id,
    classSlug,
    model: row.model,
    plate: row.plate,
    firstRegistered: row.first_registered,
    seats: row.seats,
    bags: row.bags,
    status,
    photoPath: row.photo_path,
    note: row.note,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    morningChauffeurId: null,
    nightChauffeurId: null,
  };
}

export async function loadVehicleClasses(
  env: CloudflareEnv,
  claims: VamosClaims,
): Promise<VehicleClassRow[]> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<ClassSqlRow[]>`
      select
        vc.id,
        vc.slug,
        vc.passenger_capacity,
        vc.luggage_capacity,
        vc.sort_order,
        vc.active,
        vc.name,
        vc.photo_path,
        (
          select count(*)::int
          from public.vehicles v
          where v.vehicle_class_id = vc.id
        ) as vehicle_count,
        case
          when vc.hidden_at is not null then 'retired'
          when vc.active then 'live'
          else 'draft'
        end as state,
        vc.hidden_reason,
        exists (
          select 1
          from public.distance_rates d
          join public.rate_versions rv on rv.id = d.rate_version_id
          where rv.status = 'live' and d.vehicle_class_id = vc.id and d.available
        ) as in_live_book,
        coalesce(public.ops_vehicle_class_missing(vc.id), '') as missing,
        coalesce(public.ops_vehicle_class_unassigned_paid_trips(vc.id), 0) as unassigned_paid_trips
      from public.vehicle_classes vc
      order by vc.sort_order
    `;
    return rows.map(mapClassRow);
  });
}

export async function loadVehicles(
  env: CloudflareEnv,
  claims: VamosClaims,
): Promise<VehicleRow[]> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<VehicleSqlRow[]>`
      select
        v.id,
        v.vehicle_class_id,
        vc.slug as class_slug,
        v.model,
        v.plate,
        v.first_registered,
        v.seats,
        v.bags,
        v.status,
        v.photo_path,
        v.note,
        v.created_at,
        v.updated_at
      from public.vehicles v
      inner join public.vehicle_classes vc on vc.id = v.vehicle_class_id
      order by vc.sort_order, v.plate
    `;
    const extras = await loadDeskExtras(sql);
    return rows.map((row) => {
      const mapped = mapVehicleRow(row);
      const seats = extras.seatsByVehicle.get(mapped.id);
      return {
        ...mapped,
        morningChauffeurId: seats?.morningId ?? null,
        nightChauffeurId: seats?.nightId ?? null,
      };
    });
  });
}
