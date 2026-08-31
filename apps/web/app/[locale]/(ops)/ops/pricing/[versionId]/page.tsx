import { notFound } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createNavigation } from "next-intl/navigation";
import { getTranslations } from "next-intl/server";
import { RateBookTabs } from "@/components/ops/RateBookTabs";
import { routing } from "@/i18n/routing";
import {
  loadRateBook,
  loadServiceZones,
  loadVehicleClassOptions,
} from "@/lib/ops/rate-book";
import { OpsAuthError, requireAdminClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const { Link } = createNavigation(routing);

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ versionId: string; locale: string }>;
};

function parseVersionId(raw: string): number | null {
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return null;
  return value;
}

const sectionStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 20,
  minInlineSize: 0,
};

const headerStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 14,
};

const titleStyle = {
  margin: 0,
  fontFamily: "var(--vt-font-display)",
  fontSize: "var(--vt-heading-2)",
  fontWeight: "var(--vt-weight-semibold)",
  letterSpacing: "var(--vt-heading-tracking)",
};

const subtitleStyle = {
  margin: "4px 0 0",
  fontFamily: "var(--vt-font-body)",
  fontSize: "var(--vt-body-xs)",
  color: "var(--vt-text-muted)",
};

export default async function OpsRateBookPage({ params }: PageProps) {
  const { versionId: rawId } = await params;
  const versionId = parseVersionId(rawId);
  if (versionId == null) {
    notFound();
    return null;
  }

  const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
  let claims;
  try {
    claims = await requireAdminClaims(supabase);
  } catch (error) {
    if (error instanceof OpsAuthError && error.reason === "not-admin") {
      notFound();
      return null;
    }
    throw error;
  }

  const { env } = getCloudflareContext();
  const [book, zones, classes] = await Promise.all([
    loadRateBook(env, claims, versionId),
    loadServiceZones(env, claims),
    loadVehicleClassOptions(env, claims),
  ]);
  if (!book) {
    notFound();
    return null;
  }

  const t = await getTranslations("ops");

  return (
    <section data-ops-rate-book="1" data-ops-version-id={book.versionId} style={sectionStyle}>
      <header style={headerStyle}>
        <div>
          <p style={{ ...subtitleStyle, margin: 0 }}>
            <Link href="/ops/pricing">{t("pricing.rateBook.back")}</Link>
          </p>
          <h1 style={titleStyle}>{book.label}</h1>
          <p style={subtitleStyle}>{t("pricing.rateBook.subtitle")}</p>
        </div>
      </header>
      <RateBookTabs book={book} zones={zones} classes={classes} />
    </section>
  );
}
