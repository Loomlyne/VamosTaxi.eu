import type { MetadataRoute } from "next";
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

/** Public site: open except the private paths, with the sitemap. The dashboard host is closed
 *  by worker.ts before this route runs (a host-blind static file cannot do it). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
