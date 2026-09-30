// apps/web/lib/pricing/predicates.ts
//
// Pure evaluation of surcharges.predicate discriminators (D-09, D-10, D-39).
//
// Hard rules:
// (1) The only inputs are the predicate object, the leg's scheduled_local text,
//     the resolved zone rows, and client-supplied extras quantities — there is
//     no hour-constant branch anywhere. Window bounds live on the predicate.
// (2) Migration …008_rate_versions.sql commented that the night window is a
//     settings_versions fact. For the **engine** that comment is superseded by
//     D-09/D-39: the versioned surcharge predicate is authoritative.
//     settings_versions.night_window_start/end/tz is the owner-authoring source
//     plan 04-04's seed copies into that predicate, so the two can never drift
//     without the 04-04 consistency assertion failing.
//
// Negative space: no Date, no Intl, no timezone conversion, and never infer
// airport from a code field (D-10). An empty / unknown / unresolved predicate
// is not-applicable with an explicit unresolved reason — never silently true,
// never raises.

import type { SurchargePredicate, ZoneRow, ZoneType } from "./types";

export interface PredicateContext {
  scheduledLocal: string;
  originZoneId: string | null;
  destZoneId: string | null;
  zones: Map<string, ZoneRow>;
  /** Quantity resolved from surcharges.quantity_source (extras / stops / bags). */
  quantity: number;
}

export interface PredicateResult {
  applies: boolean;
  quantity: number;
  why: Record<string, string | number>;
  unresolved?: string;
}

/**
 * Compare the "HH:MM" slice of scheduled_local lexicographically against from/to.
 * Zero-padded 24-hour clock strings compare correctly as text — that is why the
 * wall-clock column exists and why no Date/Intl/timezone library is needed (T2).
 *
 * Wrap (from > to):  (t >= from || t < to)   — e.g. evening through morning
 * Non-wrap (from <= to): (t >= from && t < to) — half-open on the right
 */
export function isWithinLocalWindow(
  scheduledLocal: string,
  from: string,
  to: string,
): boolean {
  // scheduled_local is YYYY-MM-DDTHH:MM[…] — take the HH:MM after 'T'
  const tIndex = scheduledLocal.indexOf("T");
  const t =
    tIndex >= 0
      ? scheduledLocal.slice(tIndex + 1, tIndex + 6)
      : scheduledLocal.slice(0, 5);

  if (from > to) {
    // Wraps midnight: in-window on the late side or the early side.
    return t >= from || t < to;
  }
  // Same-day half-open interval [from, to).
  return t >= from && t < to;
}

function notApplicable(reason: string, quantity = 0): PredicateResult {
  return {
    applies: false,
    quantity,
    why: {},
    unresolved: reason,
  };
}

function resolveZone(
  zones: Map<string, ZoneRow>,
  zoneId: string | null,
  role: "origin" | "dest",
): { zone: ZoneRow } | { unresolved: string } {
  if (zoneId === null || zoneId === "") {
    return { unresolved: `${role}_zone_missing` };
  }
  const zone = zones.get(zoneId);
  if (!zone) {
    return { unresolved: `${role}_zone_unresolved:${zoneId}` };
  }
  return { zone };
}

/**
 * Evaluate one surcharge predicate against leg context.
 * Result carries applies + why so callers can build §13 basis.why without
 * re-deriving. Never raises; unknown shapes return applies:false + unresolved.
 */
export function evaluatePredicate(
  predicate: SurchargePredicate | Record<string, unknown>,
  ctx: PredicateContext,
): PredicateResult {
  const kind =
    predicate && typeof predicate === "object" && "kind" in predicate
      ? (predicate as { kind?: unknown }).kind
      : undefined;

  if (kind === undefined || kind === null || kind === "") {
    return notApplicable("empty_predicate");
  }

  switch (kind as SurchargePredicate["kind"] | string) {
    case "always": {
      return {
        applies: true,
        quantity: 0,
        why: { predicate: "always" },
      };
    }

    case "pickup_zone_type": {
      const wanted = (predicate as { zone_type: ZoneType }).zone_type;
      const resolved = resolveZone(ctx.zones, ctx.originZoneId, "origin");
      if ("unresolved" in resolved) {
        return notApplicable(resolved.unresolved);
      }
      const applies = resolved.zone.zone_type === wanted;
      return {
        applies,
        quantity: 0,
        why: {
          predicate: "pickup_zone_type",
          zone_type: resolved.zone.zone_type,
          zone_slug: resolved.zone.slug,
          wanted: wanted,
        },
      };
    }

    case "dest_zone_tag": {
      const tag = (predicate as { tag: string }).tag;
      const resolved = resolveZone(ctx.zones, ctx.destZoneId, "dest");
      if ("unresolved" in resolved) {
        return notApplicable(resolved.unresolved);
      }
      const applies = resolved.zone.tags.includes(tag);
      return {
        applies,
        quantity: 0,
        why: {
          predicate: "dest_zone_tag",
          tag,
          zone_slug: resolved.zone.slug,
        },
      };
    }

    case "local_time_window": {
      const p = predicate as {
        tz: string;
        from: string;
        to: string;
      };
      const applies = isWithinLocalWindow(ctx.scheduledLocal, p.from, p.to);
      return {
        applies,
        quantity: 0,
        why: {
          predicate: "local_time_window",
          tz: p.tz,
          from: p.from,
          to: p.to,
          scheduled_local: ctx.scheduledLocal,
        },
      };
    }

    case "quantity": {
      const q = ctx.quantity;
      const applies = q > 0;
      return {
        applies,
        quantity: q,
        why: {
          predicate: "quantity",
          quantity: q,
        },
      };
    }

    case "manual": {
      // Chosen by the customer on /checkout and charged there. Never added by the quote.
      return {
        applies: false,
        quantity: 0,
        why: { predicate: "manual" },
      };
    }

    default: {
      // Exhaustiveness for known kinds; unknown kind is not-applicable (T-04-03).
      const _exhaustive: never = kind as never;
      void _exhaustive;
      return notApplicable(`unknown_kind:${String(kind)}`);
    }
  }
}
