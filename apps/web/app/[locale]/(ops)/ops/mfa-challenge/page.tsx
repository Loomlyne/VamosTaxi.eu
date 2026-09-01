import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { OpsAuthCard } from "@/components/ops/OpsAuthCard";
import { OpsMfaChallengeForm } from "@/components/ops/OpsMfaChallengeForm";

export const dynamic = "force-dynamic";

export default async function OpsMfaChallengePage() {
  const t = await getTranslations("ops");
  return (
    <OpsAuthCard title={t("authenticator-app")}>
      <Suspense>
        <OpsMfaChallengeForm />
      </Suspense>
    </OpsAuthCard>
  );
}
