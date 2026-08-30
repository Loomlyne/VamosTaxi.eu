// apps/web/components/marketing/PageHero.tsx
// Charcoal marketing hero shared by about/faq/contact. Photo optional.

import type { ReactNode } from "react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { CheckerMark } from "@/components/core";
import "./PageHero.css";

const { Link } = createNavigation(routing);

export async function PageHero({
  kickerKey,
  titleKey,
  standfirstKey,
  crumbCurrentKey,
  photo,
  altKey,
  children,
}: {
  kickerKey: string;
  titleKey: string;
  standfirstKey: string;
  crumbCurrentKey: string;
  photo?: string;
  altKey?: string;
  children?: ReactNode;
}) {
  const tAbout = await getTranslations("about");
  const tCommon = await getTranslations("common");

  return (
    <header data-mh-hero="1">
      <div className="vt-mh-hero-inner">
        <div className="vt-mh-checker" aria-hidden="true">
          <CheckerMark size={56} opacity={0.9} />
        </div>
        <nav aria-label={tCommon("breadcrumb")} className="vt-mh-crumb">
          <Link href="/">{tCommon("home")}</Link>
          <span aria-hidden="true">/</span>
          <span>{tAbout(crumbCurrentKey)}</span>
        </nav>
        <p className="vt-mh-kicker">{tAbout(kickerKey)}</p>
        <h1>{tAbout(titleKey)}</h1>
        <p className="vt-mh-standfirst">{tAbout(standfirstKey)}</p>
        {children}
      </div>
      {photo && altKey ? (
        <div className="vt-mh-photo">
          <Image src={photo} alt={tAbout(altKey)} fill sizes="100vw" priority />
        </div>
      ) : null}
    </header>
  );
}
