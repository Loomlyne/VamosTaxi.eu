// 26.1-11 / UI-SPEC §8: "every component of the charge is a labelled line the
// customer can point to". The airport pickup fee (D-08b) and the matched city or
// canton pair (D-09/D-09a) become their own PriceSummary rows. Pure — no React.
//
// Display only. The charge still comes from the signed lock's class_totals and
// the kernel re-run at intent time; these rows never feed a payable amount.
// Amounts go through the caller's `toAmount` (FX display conversion); a null
// amount stays null so PriceSummary renders `formatAmount(null)` — the Law 04
// `CHF 000` mark — and nothing here ever invents a figure.
import { base64urlDecode } from "../crypto/hmac";

/** The two kernel line codes this builder turns into rows. */
export type BreakdownCode = "airport_fee" | "fixed_route";

/** A kernel line, or the lock's pinned copy of one — only these fields are read. */
export interface BreakdownLine {
  code: string;
  amount_rappen: number | null;
  params?: Record<string, string | number | null>;
}

export type BreakdownLabelKey = "airport_fee" | "routePair" | "routePairPlain";

/** Label resolver — the caller maps keys onto its i18n namespaces. */
export type BreakdownT = (
  key: BreakdownLabelKey,
  values?: { origin: string; destination: string },
) => string;

/** PriceSummary-compatible row (`label`, `amount`, `icon`) plus its source figure. */
export interface BreakdownRow {
  code: BreakdownCode;
  label: string;
  icon: "plane-landing" | "map-pin";
  /** Display amount from `toAmount`; null renders the CHF 000 mark. */
  amount: number | null;
  /** CHF rappen from the kernel line, so the caller can keep the fare row honest. */
  amount_rappen: number | null;
}

function placeNames(
  params: BreakdownLine["params"],
): { origin: string; destination: string } | null {
  const origin = params?.origin;
  const destination = params?.destination;
  if (typeof origin !== "string" || typeof destination !== "string") return null;
  if (!origin.trim() || !destination.trim()) return null;
  return { origin: origin.trim(), destination: destination.trim() };
}

/**
 * One row per `airport_fee` line (icon `plane-landing`) and per `fixed_route`
 * line (icon `map-pin`, "{origin} – {destination} route" or the plain label
 * when the names are unknown), in line order. Every other code is ignored —
 * fare, extras, VAT and coupon rows stay where checkout already draws them.
 */
export function breakdownRows(
  lines: readonly BreakdownLine[],
  t: BreakdownT,
  toAmount: (rappen: number | null) => number | null,
): BreakdownRow[] {
  const rows: BreakdownRow[] = [];
  for (const line of lines) {
    if (line.code === "airport_fee") {
      rows.push({
        code: "airport_fee",
        label: t("airport_fee"),
        icon: "plane-landing",
        amount: toAmount(line.amount_rappen),
        amount_rappen: line.amount_rappen,
      });
    } else if (line.code === "fixed_route") {
      const names = placeNames(line.params);
      rows.push({
        code: "fixed_route",
        label: names ? t("routePair", names) : t("routePairPlain"),
        icon: "map-pin",
        amount: toAmount(line.amount_rappen),
        amount_rappen: line.amount_rappen,
      });
    }
  }
  return rows;
}

/** Sum of the rows' known CHF rappen — what the fare row must not repeat. */
export function breakdownRappen(rows: readonly BreakdownRow[]): number {
  return rows.reduce((sum, row) => sum + (row.amount_rappen ?? 0), 0);
}

function cleanRappen(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Display-only peek at the lock's `price_rows` for one class (26.1-11). Does
 * not verify the HMAC — same contract as `peekLockClassRappen`. An older lock
 * without `price_rows`, another class, or an unreadable token returns [].
 */
export function peekLockPriceRows(lock: string | undefined, slug: string): BreakdownLine[] {
  if (!lock || !slug) return [];
  const parts = lock.split(".");
  if (parts.length !== 3 || !parts[1]) return [];
  try {
    const payload: unknown = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));
    if (!payload || typeof payload !== "object") return [];
    const all = (payload as { price_rows?: unknown }).price_rows;
    if (!Array.isArray(all)) return [];
    const entry: unknown = all.find(
      (row: unknown) => !!row && typeof row === "object" && (row as { slug?: unknown }).slug === slug,
    );
    const lines = entry ? (entry as { lines?: unknown }).lines : null;
    if (!Array.isArray(lines)) return [];
    const out: BreakdownLine[] = [];
    for (const raw of lines as unknown[]) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as { code?: unknown; amount_rappen?: unknown; params?: unknown };
      if (r.code !== "airport_fee" && r.code !== "fixed_route") continue;
      const names =
        r.params && typeof r.params === "object"
          ? placeNames(r.params as BreakdownLine["params"])
          : null;
      out.push({
        code: r.code,
        amount_rappen: cleanRappen(r.amount_rappen),
        ...(names ? { params: names } : {}),
      });
    }
    return out;
  } catch {
    return [];
  }
}
