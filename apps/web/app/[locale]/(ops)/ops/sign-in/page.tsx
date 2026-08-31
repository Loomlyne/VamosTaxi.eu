import { getTranslations } from "next-intl/server";
import { OpsAuthCard } from "@/components/ops/OpsAuthCard";
import { OpsSignInForm } from "@/components/ops/OpsSignInForm";

export const dynamic = "force-dynamic";

export default async function OpsSignInPage() {
  const t = await getTranslations("ops");
  return (
    <OpsAuthCard title={t("staff-sign-in")}>
      <OpsSignInForm />
    </OpsAuthCard>
  );
}
