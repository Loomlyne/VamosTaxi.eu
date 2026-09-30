import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { SITE_URL } from "@/lib/metadata";

const PRIVATE_PATHS = [
  "/api/",
  "/app/",
  "/dev",
  "/dev/",
  "/ops",
  "/ops/",
  "/checkout",
  "/confirmation",
  "/bookings",
  "/account",
  "/sign-in",
  "/sign-up",
  "/manage-booking",
  "/reset-password",
  "/review",
  "/coming-soon",
  "/booking-detail",
  "/sitemap",
];

// Answers depend on the host, so it must not be prerendered at build.
export const dynamic = "force-dynamic";

function isDashboardHost(host: string | null): boolean {
  const name = (host ?? "").split(":")[0]?.toLowerCase() ?? "";
  return name === "dashboard.vamostaxi.site" || name === "dashboard.localhost";
}

/** Public site: open except the private paths, with the sitemap. Dashboard host: closed. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const list = await headers();
  if (isDashboardHost(list.get("x-vamos-request-host") ?? list.get("host"))) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
