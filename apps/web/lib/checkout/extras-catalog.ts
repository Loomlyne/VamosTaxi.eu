// Checkout extras tiles follow the live rate book — the same rows ops priced.
// Unknown codes (night, weekend, …) stay off the passenger extras card.

export type CheckoutExtraJson = {
  code: string;
  kind: "amount" | "percent" | "included";
  amount_rappen: number | null;
  percent: number | string | null;
  toggle: boolean;
};

export type ExtraUi = {
  icon: "baby" | "user" | "luggage" | "map-pin" | "snowflake";
  labelKey: "childSeat" | "meetGreet" | "extraOversized" | "additional-stop-2" | "extraSki";
  toggle: boolean;
};

const EXTRA_UI: Record<string, ExtraUi> = {
  child_seat: { icon: "baby", labelKey: "childSeat", toggle: true },
  meet_greet: { icon: "user", labelKey: "meetGreet", toggle: false },
  extra_stop: { icon: "map-pin", labelKey: "additional-stop-2", toggle: true },
  oversized_luggage: { icon: "luggage", labelKey: "extraOversized", toggle: true },
  ski: { icon: "snowflake", labelKey: "extraSki", toggle: true },
  ski_rack: { icon: "snowflake", labelKey: "extraSki", toggle: true },
};

export function extraUi(code: string): ExtraUi | null {
  return EXTRA_UI[code] ?? null;
}

export type RecapExtraLine = {
  code: string;
  labelKey: ExtraUi["labelKey"];
  icon: ExtraUi["icon"];
};

export type RecapExtraFare = RecapExtraLine & {
  amount_rappen: number | null;
};

export type LockExtrasPeek = {
  child_seats?: number | null;
  extra_stops?: number | null;
  oversized_luggage?: boolean | null;
};

export function lockHasExtra(extras: LockExtrasPeek | null | undefined, code: string): boolean {
  if (!extras) return false;
  if (code === "child_seat") return extras.child_seats === 1;
  if (code === "oversized_luggage") return extras.oversized_luggage === true;
  if (code === "extra_stop") return (extras.extra_stops ?? 0) > 0;
  return false;
}

export type SnapshotExtraFare = {
  code: string;
  amount_rappen: number;
};

/** Selected extras with a book amount — for the snapshot recap, not a live catalog paint. */
export function extraFaresOn(
  catalog: CheckoutExtraJson[],
  on: (code: string) => boolean,
): SnapshotExtraFare[] {
  const out: SnapshotExtraFare[] = [];
  for (const row of recapExtraFares(catalog, on)) {
    if (row.amount_rappen == null || !Number.isFinite(row.amount_rappen) || row.amount_rappen <= 0) {
      continue;
    }
    out.push({ code: row.code, amount_rappen: row.amount_rappen });
  }
  return out;
}

/** Selected passenger extras that exist on the live book. Amounts stay the book values. */
export function recapExtraFares(
  catalog: CheckoutExtraJson[],
  on: (code: string) => boolean,
): RecapExtraFare[] {
  const out: RecapExtraFare[] = [];
  for (const row of catalog) {
    const ui = extraUi(row.code);
    if (!ui?.toggle) continue;
    if (!on(row.code)) continue;
    out.push({
      code: row.code,
      labelKey: ui.labelKey,
      icon: ui.icon,
      amount_rappen: row.kind === "amount" ? row.amount_rappen : null,
    });
  }
  return out;
}

/** Selected passenger extras that exist on the live book. No invented rows or CHF. */
export function recapExtras(
  catalog: CheckoutExtraJson[],
  on: (code: string) => boolean,
): RecapExtraLine[] {
  return recapExtraFares(catalog, on).map(({ code, labelKey, icon }) => ({ code, labelKey, icon }));
}

/** Catalog extras the lock does not already pin — never invent a CHF. */
export function extraRappenOutsideLock(
  extras: LockExtrasPeek | null | undefined,
  catalog: CheckoutExtraJson[],
  on: (code: string) => boolean,
): number {
  let add = 0;
  for (const row of catalog) {
    if (!on(row.code)) continue;
    if (row.kind !== "amount" || row.amount_rappen == null) continue;
    if (lockHasExtra(extras, row.code)) continue;
    add += row.amount_rappen;
  }
  return add;
}

type SurchargeLike = {
  code: string;
  kind: "amount" | "percent" | "included";
  amount_rappen: number | null;
  percent: number | string | null;
  active: boolean;
};

export function catalogFromSurcharges(rows: SurchargeLike[]): CheckoutExtraJson[] {
  const out: CheckoutExtraJson[] = [];
  for (const row of rows) {
    if (!row.active) continue;
    const ui = extraUi(row.code);
    if (!ui) continue;
    out.push({
      code: row.code,
      kind: row.kind,
      amount_rappen: row.amount_rappen,
      percent: row.percent,
      toggle: ui.toggle,
    });
  }
  return out;
}
