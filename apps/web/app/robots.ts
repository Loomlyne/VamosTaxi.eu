import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
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
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
