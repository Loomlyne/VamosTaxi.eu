import { getTranslations } from "next-intl/server";

export default async function OpsIndexPage() {
  const t = await getTranslations("ops");
  return (
    <section>
      <h1>{t("coming-soon")}</h1>
    </section>
  );
}
