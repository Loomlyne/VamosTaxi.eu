"use client";

import "./OpsSidebar.css";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { Icon, Logo } from "@/components/core";
import type { OpsNavGroup, OpsNavItem } from "@/lib/ops/nav";

const { Link } = createNavigation(routing);

const COLLAPSE_KEY = "vamosOpsNavCollapsed";
const PUBLIC_SITE = "https://vamostaxi.site";

export type OpsSidebarStaff = {
  fullName: string;
  role: "dispatcher" | "admin";
  avatarPath: string | null;
};

export function OpsSidebar({
  groups,
  activePath,
  staff,
  signOut,
}: {
  groups: OpsNavGroup[];
  activePath: string;
  staff: OpsSidebarStaff;
  signOut: () => Promise<void>;
}) {
  const t = useTranslations("ops");
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const persistCollapsed = (next: boolean) => {
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {
      /* private mode */
    }
  };

  const groupFollowsRoute = (group: OpsNavGroup) =>
    group.items.some((item) => item.enabled && isActive(activePath, item.href));

  const isGroupOpen = (group: OpsNavGroup) =>
    openGroups[group.key] ?? groupFollowsRoute(group);

  const roleLabel = staff.role === "admin" ? t("admin-role") : t("dispatcher-role");

  return (
    <aside
      className="ops-sidebar"
      data-lenis-prevent="1"
      data-collapsed={collapsed ? "1" : undefined}
    >
      <div className="ops-sidebar__brand">
        <Logo
          className="ops-sidebar__brand-link"
          variant="reversed"
          form={collapsed ? "mark" : "wordmark"}
          height={collapsed ? 26 : 22}
          href="/ops"
        />
      </div>

      <p className="ops-sidebar__kicker">{t("dispatch")}</p>

      <nav className="ops-sidebar__nav" aria-label={t("dispatch")}>
        {groups.map((group, index) => {
          if (!group.expandable) {
            return (
              <div key={group.key}>
                {index === 2 ? <div className="ops-sidebar__rule" /> : null}
                {group.items.map((item) => (
                  <NavRow key={item.key} item={item} activePath={activePath} collapsed={collapsed} t={t} />
                ))}
              </div>
            );
          }

          const open = !collapsed && isGroupOpen(group);
          const childActive = groupFollowsRoute(group);
          return (
            <div key={group.key}>
              {group.key === "content" ? <div className="ops-sidebar__rule" /> : null}
              <button
                type="button"
                className="ops-sidebar__row"
                title={t(group.labelKey)}
                aria-expanded={open}
                data-active={childActive && !open ? "1" : undefined}
                onClick={() =>
                  setOpenGroups((current) => ({
                    ...current,
                    [group.key]: !(current[group.key] ?? groupFollowsRoute(group)),
                  }))
                }
              >
                {group.icon ? <Icon name={group.icon} size={18} color="currentColor" /> : null}
                <span className="ops-sidebar__label ops-sidebar__label--grow">{t(group.labelKey)}</span>
                <Icon name={open ? "chevron-up" : "chevron-down"} size={16} color="currentColor" />
              </button>
              {open ? (
                <div className="ops-sidebar__children">
                  {group.items.map((item) => (
                    <ChildRow key={item.key} item={item} activePath={activePath} t={t} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="ops-sidebar__foot">
        <button
          type="button"
          className="ops-sidebar__toggle"
          title={collapsed ? t("expand-sidebar") : t("collapse-sidebar")}
          aria-label={collapsed ? t("expand-sidebar") : t("collapse-sidebar")}
          aria-expanded={!collapsed}
          onClick={() => persistCollapsed(!collapsed)}
        >
          <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={16} color="currentColor" />
          <span className="ops-sidebar__label">{collapsed ? t("expand-sidebar") : t("collapse-sidebar")}</span>
        </button>

        <div className="ops-sidebar__profile-wrap">
          {menuOpen ? (
            <>
              <div className="ops-sidebar__scrim" onClick={() => setMenuOpen(false)} />
              <div className="ops-sidebar__menu" role="menu">
                <Link href="/ops/profile" role="menuitem" className="ops-sidebar__menu-item" onClick={() => setMenuOpen(false)}>
                  <Icon name="user" size={16} color="currentColor" />
                  {t("profile")}
                </Link>
                <Link href="/ops/settings" role="menuitem" className="ops-sidebar__menu-item" onClick={() => setMenuOpen(false)}>
                  <Icon name="settings" size={16} color="currentColor" />
                  {t("settings")}
                </Link>
                <a
                  href={PUBLIC_SITE}
                  role="menuitem"
                  className="ops-sidebar__menu-item ops-sidebar__menu-item--muted"
                >
                  <Icon name="external-link" size={16} color="currentColor" />
                  {t("vamos-taxi-site")}
                </a>
                <div className="ops-sidebar__menu-rule" />
                <form action={signOut}>
                  <button type="submit" role="menuitem" className="ops-sidebar__menu-item ops-sidebar__menu-item--danger">
                    <Icon name="log-out" size={16} color="currentColor" />
                    {t("sign-out")}
                  </button>
                </form>
              </div>
            </>
          ) : null}

          <button
            type="button"
            className="ops-sidebar__profile"
            title={staff.fullName}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="ops-sidebar__avatar">
              {staff.avatarPath ? (
                <img src={staff.avatarPath} alt="" />
              ) : (
                <Icon name="user" size={16} color="var(--vt-accent)" />
              )}
            </span>
            <span className="ops-sidebar__meta">
              {staff.fullName}
              <br />
              <span className="ops-sidebar__role">{roleLabel}</span>
            </span>
            <Icon name={menuOpen ? "chevron-up" : "chevron-down"} size={16} color="var(--vt-text-inverse-muted)" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function isActive(activePath: string, href: string): boolean {
  if (href === "/ops") return activePath === "/ops";
  return activePath === href || activePath.startsWith(`${href}/`);
}

function NavRow({
  item,
  activePath,
  collapsed,
  t,
}: {
  item: OpsNavItem;
  activePath: string;
  collapsed: boolean;
  t: (key: string) => string;
}) {
  const label = t(item.labelKey);
  const active = item.enabled && isActive(activePath, item.href);
  const className = "ops-sidebar__row";
  if (!item.enabled) {
    return (
      <span className={className} title={label} data-muted="1">
        <Icon name={item.icon} size={18} color="currentColor" />
        {collapsed ? null : <span className="ops-sidebar__label">{label}</span>}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      className={className}
      title={label}
      data-active={active ? "1" : undefined}
    >
      <Icon name={item.icon} size={18} color="currentColor" />
      {collapsed ? null : <span className="ops-sidebar__label">{label}</span>}
    </Link>
  );
}

function ChildRow({
  item,
  activePath,
  t,
}: {
  item: OpsNavItem;
  activePath: string;
  t: (key: string) => string;
}) {
  const label = t(item.labelKey);
  const active = item.enabled && isActive(activePath, item.href);
  if (!item.enabled) {
    return (
      <span className="ops-sidebar__child" title={label} data-muted="1">
        <Icon name={item.icon} size={16} color="currentColor" />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      className="ops-sidebar__child"
      title={label}
      data-active={active ? "1" : undefined}
    >
      <Icon name={item.icon} size={16} color="currentColor" />
      <span>{label}</span>
    </Link>
  );
}
