import type { IconName } from "@/components/core";

export type OpsNavItem = {
  key: string;
  href: string;
  icon: IconName;
  labelKey: string;
  enabled: boolean;
};

export type OpsNavGroup = {
  key: string;
  labelKey: string;
  icon?: IconName;
  expandable: boolean;
  items: OpsNavItem[];
};

const ADMIN_ONLY = ["pricing", "staff"] as const;
const PHASE_8 = ["dashboard", "bookings", "calendar", "board"] as const;

function item(
  key: string,
  href: string,
  icon: IconName,
  labelKey: string,
  role: "dispatcher" | "admin",
): OpsNavItem | null {
  if ((ADMIN_ONLY as readonly string[]).includes(key) && role !== "admin") {
    return null;
  }
  return {
    key,
    href,
    icon,
    labelKey,
    enabled: !(PHASE_8 as readonly string[]).includes(key),
  };
}

function compact<T>(rows: Array<T | null>): T[] {
  return rows.filter((row): row is T => row !== null);
}

export function buildOpsNav(role: "dispatcher" | "admin"): OpsNavGroup[] {
  return [
    {
      key: "dispatch",
      labelKey: "dispatch",
      expandable: false,
      items: compact([
        item("dashboard", "/ops", "layout-dashboard", "dashboard", role),
        item("bookings", "/ops/bookings", "receipt", "bookings", role),
        item("calendar", "/ops/calendar", "calendar-days", "calendar", role),
        item("board", "/ops/board", "list", "board", role),
      ]),
    },
    {
      key: "fleet",
      labelKey: "fleet",
      icon: "car-front",
      expandable: true,
      items: compact([
        item("vehicles", "/ops/vehicles", "car", "vehicles", role),
        item("chauffeurs", "/ops/chauffeurs", "users", "chauffeurs", role),
      ]),
    },
    {
      key: "commerce",
      labelKey: "operation",
      expandable: false,
      items: compact([
        item("pricing", "/ops/pricing", "banknote", "pricing-routes", role),
        item("customers", "/ops/customers", "user", "customers", role),
        item("coupons", "/ops/coupons", "ticket", "coupons", role),
        item("staff", "/ops/staff", "users", "staff", role),
      ]),
    },
    {
      key: "content",
      labelKey: "content",
      icon: "file-text",
      expandable: true,
      items: compact([
        item("pages", "/ops/pages", "globe", "pages", role),
        item("legal", "/ops/legal", "shield-check", "legal", role),
        item("reviews", "/ops/reviews", "star", "reviews", role),
      ]),
    },
  ];
}
