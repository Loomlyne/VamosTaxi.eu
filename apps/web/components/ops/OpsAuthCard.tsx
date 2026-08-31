import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Card, Icon, Logo } from "@/components/core";
import "./OpsAuthCard.css";

type OpsAuthCardProps = {
  title: string;
  children: ReactNode;
};

export async function OpsAuthCard({ title, children }: OpsAuthCardProps) {
  const t = await getTranslations("ops");
  return (
    <div className="ops-auth">
      <div className="ops-auth__check" aria-hidden="true" />
      <div className="ops-auth__inner">
        <Logo variant="reversed" height={28} />
        <Card padding="lg" className="ops-auth__card">
          <h1 className="ops-auth__title">{title}</h1>
          {children}
        </Card>
        <p className="ops-auth__note">{t("internal-tool-note")}</p>
        <a className="ops-auth__back" href="https://vamostaxi.site">
          <Icon name="chevron-left" size={14} color="currentColor" />
          {t("vamos-taxi-site")}
        </a>
      </div>
    </div>
  );
}
