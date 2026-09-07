"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/core";

const CLASS_SLUGS = ["economy", "business", "first", "van"] as const;

type ClassSlug = (typeof CLASS_SLUGS)[number];

const CLASS_META: Record<
  ClassSlug,
  {
    image: string;
    pax: number;
    bags: number;
    nameKey: "classEconomy" | "classBusiness" | "classFirst" | "classVan";
  }
> = {
  economy: {
    image: "/assets/photography/class-economy.jpg",
    pax: 4,
    bags: 3,
    nameKey: "classEconomy",
  },
  business: {
    image: "/assets/photography/class-business.jpg",
    pax: 4,
    bags: 3,
    nameKey: "classBusiness",
  },
  first: {
    image: "/assets/photography/class-first.jpg",
    pax: 4,
    bags: 3,
    nameKey: "classFirst",
  },
  van: {
    image: "/assets/photography/class-van.jpg",
    pax: 7,
    bags: 8,
    nameKey: "classVan",
  },
};

export function classFits(id: string, pax: number, bags: number): boolean {
  if (!CLASS_SLUGS.includes(id as ClassSlug)) return false;
  const meta = CLASS_META[id as ClassSlug];
  return pax <= meta.pax && bags <= meta.bags;
}

export function firstFittingClass(pax: number, bags: number): ClassSlug {
  return CLASS_SLUGS.find((id) => classFits(id, pax, bags)) ?? "van";
}

function classExample(
  id: ClassSlug,
  tCommon: ReturnType<typeof useTranslations<"common">>,
  tHome: ReturnType<typeof useTranslations<"home">>,
): string {
  if (id === "economy") return tCommon("sedan-or-similar");
  if (id === "business") return tHome("executive-sedan");
  if (id === "first") return tHome("s-class-or-similar");
  return tHome("minivan-or-similar");
}

export function CheckoutClassCards({
  vehicle,
  passengers,
  luggage,
  onChange,
}: {
  vehicle: string;
  passengers: number;
  luggage: number;
  onChange: (id: string) => void;
}) {
  const t = useTranslations("checkout");
  const tCommon = useTranslations("common");
  const tHome = useTranslations("home");

  return (
    <div className="vt-checkout__classes" data-checkout-classes>
      {CLASS_SLUGS.map((id) => {
        const meta = CLASS_META[id];
        const picked = vehicle === id;
        const fit = classFits(id, passengers, luggage);
        const name = t(meta.nameKey);
        const example = classExample(id, tCommon, tHome);
        return (
          <button
            key={id}
            type="button"
            className="vt-checkout__class"
            data-picked={picked ? "true" : "false"}
            data-fit={fit ? "true" : "false"}
            aria-pressed={picked}
            aria-disabled={!fit}
            disabled={!fit}
            onClick={() => {
              if (fit) onChange(id);
            }}
          >
            <span className="vt-checkout__class-img">
              <img src={meta.image} alt="" />
              {picked ? (
                <span className="vt-checkout__class-check" aria-hidden="true">
                  <Icon name="check" size={16} color="var(--vt-accent)" />
                </span>
              ) : null}
            </span>
            <span className="vt-checkout__class-copy">
              <strong className="vt-dir-keep">{name}</strong>
              <span>{example}</span>
            </span>
            <span className="vt-checkout__class-cap">
              <span>
                <Icon name="users" size={12} color="var(--vt-text-muted)" />
                {t("upToPassengersCount", { n: meta.pax })}
              </span>
              <span>
                <Icon name="luggage" size={12} color="var(--vt-text-muted)" />
                {t("upToBagsCount", { n: meta.bags })}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
