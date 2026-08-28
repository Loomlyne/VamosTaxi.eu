// apps/web/lib/pricing/round.ts
//
// Integer rounding kernel for every priced line in Phase 4 (D-07, D-53).
// Exact integer-ratio arithmetic, half-up once per line. Metres in, never
// 2-dp km. A numeric(5,2) percent string is parsed with a digit regex into
// hundredths of one percent — never a floating-point parse.
//
// Law: each price line is rounded half-up to the whole integer when computed;
// a total is the sum of already-rounded lines (packages/db types domain).
// Discounts are computed as a positive magnitude; their sign lives on the
// line's kind, so half-up and half-away-from-zero coincide and no negative
// ever enters this module (D-07).
//
// Negative space: this module calls no Date API, reads no environment,
// imports nothing, and never formats. Formatting is lib/currency.ts's
// formatAmount — the only place a currency mark is written. Float rounding
// helpers and floating-point string coercion are structurally absent.
//
// U8 / D-53: perKm divides by 1 000. If a future rate matrix lands a
// fractional-rappen per-km figure, the fix is a per_km_millirappen column
// and a 10 000 denominator. The line amount stays an integer either way —
// do not widen pre-emptively.

/**
 * Exact integer ratio, half-up. Both arguments must be safe integers;
 * denominator must be > 0. Returns a non-negative integer quotient.
 */
export function roundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator)) {
    throw new RangeError(
      `roundHalfUp: numerator must be a safe integer (got ${String(numerator)})`,
    );
  }
  if (!Number.isSafeInteger(denominator)) {
    throw new RangeError(
      `roundHalfUp: denominator must be a safe integer (got ${String(denominator)})`,
    );
  }
  if (denominator <= 0) {
    throw new RangeError(
      `roundHalfUp: denominator must be > 0 (got ${String(denominator)})`,
    );
  }

  // Guard the product before forming it — isSafeInteger on the product is too
  // late once the product has already lost integer precision.
  if (numerator !== 0 && denominator > Math.floor(Number.MAX_SAFE_INTEGER / Math.abs(numerator))) {
    throw new RangeError(
      `roundHalfUp: numerator * denominator would exceed Number.MAX_SAFE_INTEGER`,
    );
  }

  // Integer quotient and remainder without float helpers: for safe integers
  // the remainder operator yields an exact integer residue.
  const remainder = numerator % denominator;
  const quotient = (numerator - remainder) / denominator;
  // Half-up: increment when twice the remainder is at least the denominator.
  if (remainder * 2 >= denominator) {
    return quotient + 1;
  }
  return quotient;
}

/**
 * Parse a numeric(5,2)-shaped percent string into hundredths of one percent.
 * '7.35' -> 735. Digit regex and char-code arithmetic only.
 */
export function percentToHundredths(numericString: string): number {
  // 1–3 integer digits, optional '.' + 1–2 fractional digits. No sign, no
  // exponent, no whitespace, no comma decimal, no trailing bare dot.
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(numericString);
  if (!m) {
    throw new RangeError(
      `percentToHundredths: expected numeric(5,2)-shaped digit string (got ${JSON.stringify(numericString)})`,
    );
  }
  const whole = m[1]!;
  const frac = m[2] ?? "";
  // Build integer hundredths by string padding — '7.35' -> 735, '10' -> 1000.
  const fracPadded = (frac + "00").slice(0, 2);
  // Integer from digit characters only (char codes, never float coercion).
  let value = 0;
  for (let i = 0; i < whole.length; i++) {
    value = value * 10 + (whole.charCodeAt(i) - 48);
  }
  value = value * 100;
  value = value + (fracPadded.charCodeAt(0) - 48) * 10 + (fracPadded.charCodeAt(1) - 48);
  return value;
}

/** roundHalfUp(baseRappen * hundredths, 10_000) */
export function percentOf(baseRappen: number, hundredths: number): number {
  return roundHalfUp(baseRappen * hundredths, 10_000);
}

/**
 * roundHalfUp(perKmRappen * distanceMetres, 1_000).
 * U8/D-53 open: do not pre-emptively switch to millirappen / 10_000.
 */
export function perKm(perKmRappen: number, distanceMetres: number): number {
  return roundHalfUp(perKmRappen * distanceMetres, 1_000);
}
