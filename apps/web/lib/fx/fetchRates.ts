// Live CHF→EUR/USD/AED for display. Charge stays CHF. No invented rate.

export type FxRates = {
  CHF: 1;
  EUR: number;
  USD: number;
  AED: number;
};

export type FxPayload = {
  base: "CHF";
  rates: FxRates;
  as_of: string;
  source: string;
};

function pickPositive(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

function payload(
  rates: { EUR: number; USD: number; AED: number },
  as_of: string,
  source: string,
): FxPayload {
  return { base: "CHF", rates: { CHF: 1, ...rates }, as_of, source };
}

export function parseErApi(json: unknown): FxPayload | null {
  if (!json || typeof json !== "object") return null;
  const row = json as Record<string, unknown>;
  if (row.result !== "success") return null;
  const raw = row.rates;
  if (!raw || typeof raw !== "object") return null;
  const rates = raw as Record<string, unknown>;
  const EUR = pickPositive(rates.EUR);
  const USD = pickPositive(rates.USD);
  const AED = pickPositive(rates.AED);
  if (EUR === null || USD === null || AED === null) return null;
  const asOf =
    typeof row.time_last_update_utc === "string" ? row.time_last_update_utc : "";
  return payload({ EUR, USD, AED }, asOf, "open.er-api.com");
}

export function parseFawaz(json: unknown): FxPayload | null {
  if (!json || typeof json !== "object") return null;
  const row = json as Record<string, unknown>;
  const chf = row.chf;
  if (!chf || typeof chf !== "object") return null;
  const rates = chf as Record<string, unknown>;
  const EUR = pickPositive(rates.eur);
  const USD = pickPositive(rates.usd);
  const AED = pickPositive(rates.aed);
  if (EUR === null || USD === null || AED === null) return null;
  const asOf = typeof row.date === "string" ? row.date : "";
  return payload({ EUR, USD, AED }, asOf, "fawazahmed0/currency-api");
}

const UPSTREAMS: {
  url: string;
  parse: (json: unknown) => FxPayload | null;
}[] = [
  { url: "https://open.er-api.com/v6/latest/CHF", parse: parseErApi },
  {
    url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/chf.json",
    parse: parseFawaz,
  },
];

const UA = "VamosTaxi/1.0 (https://vamostaxi.site)";

export async function loadFxRates(
  fetchImpl: typeof fetch = fetch,
): Promise<FxPayload> {
  for (const upstream of UPSTREAMS) {
    try {
      const res = await fetchImpl(upstream.url, {
        headers: { Accept: "application/json", "User-Agent": UA },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue;
      const parsed = upstream.parse(await res.json());
      if (parsed) return parsed;
    } catch {
      /* next upstream */
    }
  }
  throw new Error("fx_unavailable");
}
