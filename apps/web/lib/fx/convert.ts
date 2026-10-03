// Display FX only. Charge currency stays CHF (ADR-004). Never invent a rate.
// Own half-up: pricing/round.ts guards numerator*denominator which FX ratios
// do not form.

export const CHF_RATE_MILLIONTHS = 1_000_000;

function roundRatioHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || numerator < 0) {
    throw new RangeError(
      `roundRatioHalfUp: numerator must be a non-negative safe integer (got ${String(numerator)})`,
    );
  }
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError(
      `roundRatioHalfUp: denominator must be a positive safe integer (got ${String(denominator)})`,
    );
  }
  const remainder = numerator % denominator;
  const quotient = (numerator - remainder) / denominator;
  if (remainder * 2 >= denominator) return quotient + 1;
  return quotient;
}

/** CHF rappen → target minor units (cents / fils / eurocents). */
export function chfRappenToMinor(rappen: number, rateMillionths: number): number {
  if (!Number.isSafeInteger(rappen) || rappen < 0) {
    throw new RangeError(
      `chfRappenToMinor: rappen must be a non-negative safe integer (got ${String(rappen)})`,
    );
  }
  if (!Number.isSafeInteger(rateMillionths) || rateMillionths <= 0) {
    throw new RangeError(
      `chfRappenToMinor: rateMillionths must be a positive safe integer (got ${String(rateMillionths)})`,
    );
  }
  if (rateMillionths === CHF_RATE_MILLIONTHS) return rappen;
  return roundRatioHalfUp(rappen * rateMillionths, CHF_RATE_MILLIONTHS);
}

export function rateToMillionths(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new RangeError(
      `rateToMillionths: rate must be a positive finite number (got ${String(rate)})`,
    );
  }
  const millionths = Math.round(rate * CHF_RATE_MILLIONTHS);
  if (millionths <= 0) {
    throw new RangeError(`rateToMillionths: rate too small (got ${String(rate)})`);
  }
  return millionths;
}
