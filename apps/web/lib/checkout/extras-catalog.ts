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
  amount_rappen: number;
};

const RECAP_FALLBACK: RecapExtraLine[] = [
  { code: "child_seat", labelKey: "childSeat", amount_rappen: 0 },
  { code: "oversized_luggage", labelKey: "extraOversized", amount_rappen: 0 },
  { code: "extra_stop", labelKey: "additional-stop-2", amount_rappen: 0 },
  { code: "ski", labelKey: "extraSki", amount_rappen: 0 },
];

/** Selected passenger extras for the recap rail. Amounts come from the live book only. */
export function recapExtras(
  catalog: CheckoutExtraJson[],
  on: (code: string) => boolean,
): RecapExtraLine[] {
  const seen = new Set<string>();
  const out: RecapExtraLine[] = [];
  for (const row of catalog) {
    const ui = extraUi(row.code);
    if (!ui?.toggle) continue;
    if (!on(row.code)) continue;
    seen.add(row.code);
    out.push({
      code: row.code,
      labelKey: ui.labelKey,
      amount_rappen: row.kind === "amount" && row.amount_rappen != null ? row.amount_rappen : 0,
    });
  }
  for (const row of RECAP_FALLBACK) {
    if (seen.has(row.code) || (row.code === "ski" && seen.has("ski_rack"))) continue;
    if (!on(row.code) && !(row.code === "ski" && on("ski_rack"))) continue;
    out.push(row);
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
