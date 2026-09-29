import { redirect } from "next/navigation";
import { checkoutForwardPath } from "@/lib/checkout/step-forward";

// D-31: this step no longer exists. Forward to the one-page checkout, query kept.
export default async function CheckoutStepForward({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  redirect(checkoutForwardPath(locale, await searchParams));
}
