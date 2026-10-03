import { Fragment, type ReactNode } from "react";
import type { useTranslations } from "next-intl";
import type { IconName } from "../core";

/**
 * 261003 fare lines: the label and icon of the airport pickup fee and the route extra, one place
 * for /checkout, the confirmation page and the pay-link page. The route label names both towns as
 * quoted (a map-lookup name, any language): each name stays left-to-right inside Arabic text and is
 * left out of the in-place translator (`vt-dir-keep`, `data-vt-no-i18n`). With no names it reads
 * the plain "Route price" label.
 */
export const AIRPORT_FEE_ICON: IconName = "plane-landing";
export const ROUTE_ICON: IconName = "map-pin";

type Translator = ReturnType<typeof useTranslations>;

/** `tPrice` is the `price` namespace translator. */
export function airportFeeLabel(tPrice: Translator): string {
  return tPrice("line.airport_fee");
}

// Private-use markers: the translated sentence keeps its own word order, the two names go where
// the markers land. Nothing in a message or a place name uses these code points.
const MARK_ORIGIN = "";
const MARK_DESTINATION = "";

function Name({ children }: { children: string }) {
  return (
    <span className="vt-dir-keep" data-vt-no-i18n dir="auto">
      {children}
    </span>
  );
}

/** "{origin} – {destination} route" with both names kept as quoted, or "Route price". */
export function routeLabel(
  tCheckout: Translator,
  origin: string | null | undefined,
  destination: string | null | undefined,
): ReactNode {
  const o = typeof origin === "string" ? origin.trim() : "";
  const d = typeof destination === "string" ? destination.trim() : "";
  if (!o || !d) return tCheckout("routePairPlain");
  const sentence = tCheckout("routePair", { origin: MARK_ORIGIN, destination: MARK_DESTINATION });
  // One inline span: the price row's label is a flex box, and loose pieces would each become a flex item.
  return (
    <span>
      {sentence.split(/([])/).map((part, i) => {
        if (part === MARK_ORIGIN) return <Name key={i}>{o}</Name>;
        if (part === MARK_DESTINATION) return <Name key={i}>{d}</Name>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </span>
  );
}
