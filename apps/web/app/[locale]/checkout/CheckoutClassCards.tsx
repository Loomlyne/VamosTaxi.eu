"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/core";
import { classIsSelectable } from "@/lib/checkout/charge-gate";
import { peekLockClassRappen } from "@/lib/checkout/vamos-trip";

export type CheckoutClassOffer = {
  slug: string;
  name: string;
  photo: string;
  pax: number;
  bags: number;
};

export function classFits(
  id: string,
  pax: number,
  bags: number,
  offered: readonly CheckoutClassOffer[],
): boolean {
  const offer = offered.find((row) => row.slug === id);
  if (!offer) return false;
  if (offer.pax <= 0 && offer.bags <= 0) return true;
  return pax <= offer.pax && bags <= offer.bags;
}

export function firstFittingClass(
  pax: number,
  bags: number,
  offered: readonly CheckoutClassOffer[] = [],
): string {
  return offered.find((row) => classFits(row.slug, pax, bags, offered))?.slug ?? offered[0]?.slug ?? "";
}

export function CheckoutClassCards({
  vehicle,
  passengers,
  luggage,
  offered,
  lock,
  onChange,
}: {
  vehicle: string;
  passengers: number;
  luggage: number;
  offered: CheckoutClassOffer[];
  lock: string | undefined;
  onChange: (id: string) => void;
}) {
  const t = useTranslations("checkout");

  return (
    <div className="vt-checkout__classes" data-checkout-classes>
      {offered.map((offer) => {
        const picked = vehicle === offer.slug;
        const fit = classFits(offer.slug, passengers, luggage, offered);
        const priced = classIsSelectable(peekLockClassRappen(lock, offer.slug));
        const activatable = fit && priced;
        return (
          <button
            key={offer.slug}
            type="button"
            className="vt-checkout__class"
            data-picked={picked ? "true" : "false"}
            data-fit={fit ? "true" : "false"}
            data-priced={priced ? "true" : "false"}
            aria-pressed={picked}
            aria-disabled={!activatable}
            disabled={!activatable}
            onClick={() => {
              if (!activatable) return;
              onChange(offer.slug);
            }}
          >
            <span className="vt-checkout__class-img">
              {offer.photo ? <img src={offer.photo} alt="" /> : <Icon name="car" size={24} color="var(--vt-text-muted)" />}
              {picked ? (
                <span className="vt-checkout__class-check" aria-hidden="true">
                  <Icon name="check" size={16} color="var(--vt-accent)" />
                </span>
              ) : null}
            </span>
            <span className="vt-checkout__class-copy">
              <strong className="vt-dir-keep">{offer.name || offer.slug}</strong>
            </span>
            <span className="vt-checkout__class-cap">
              <span>
                <Icon name="users" size={12} color="var(--vt-text-muted)" />
                {t("upToPassengersCount", { n: offer.pax })}
              </span>
              <span>
                <Icon name="luggage" size={12} color="var(--vt-text-muted)" />
                {t("upToBagsCount", { n: offer.bags })}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
