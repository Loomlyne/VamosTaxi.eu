"use client";

import "./OpsShell.css";
import { type ReactNode, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, Logo } from "@/components/core";
import { OpsSidebar, type OpsSidebarStaff } from "./OpsSidebar";
import type { OpsNavGroup } from "@/lib/ops/nav";

export function OpsShell({
  groups,
  activePath,
  staff,
  signOut,
  children,
}: {
  groups: OpsNavGroup[];
  activePath: string;
  staff: OpsSidebarStaff;
  signOut: () => Promise<void>;
  children: ReactNode;
}) {
  const t = useTranslations("ops");
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="ops-shell" data-drawer={drawer ? "1" : undefined}>
      <div className="ops-shell__bar">
        <Logo variant="reversed" form="mark" height={26} href="/" />
        <button
          type="button"
          className="ops-shell__menu-btn"
          aria-label={t("open-menu")}
          onClick={() => setDrawer(true)}
        >
          <Icon name="menu" size={20} color="currentColor" />
        </button>
      </div>
      <div className="ops-shell__rail">
        <OpsSidebar groups={groups} activePath={activePath} staff={staff} signOut={signOut} />
      </div>
      {drawer ? (
        <div className="ops-shell__drawer" onClick={() => setDrawer(false)}>
          <div className="ops-shell__drawer-rail" onClick={(event) => event.stopPropagation()}>
            <OpsSidebar groups={groups} activePath={activePath} staff={staff} signOut={signOut} />
          </div>
        </div>
      ) : null}
      <main className="ops-shell__main">{children}</main>
    </div>
  );
}
