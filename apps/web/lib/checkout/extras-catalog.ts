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

/** Selected passenger extras that exist on the live book. No invented rows or CHF. */
export function recapExtras(
  catalog: CheckoutExtraJson[],
  on: (code: string) => boolean,
): RecapExtraLine[] {
  const out: RecapExtraLine[] = [];
  for (const row of catalog) {
    const ui = extraUi(row.code);
    if (!ui?.toggle) continue;
    if (!on(row.code)) continue;
    out.push({ code: row.code, labelKey: ui.labelKey, icon: ui.icon });
  }
  return out;
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
