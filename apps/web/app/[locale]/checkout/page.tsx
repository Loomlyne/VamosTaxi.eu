"use client";

import { useEffect } from "react";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { bareCheckoutPath } from "@/lib/checkout/steps";
import { readVamosTrip } from "@/lib/checkout/vamos-trip";

const { useRouter } = createNavigation(routing);

export default function CheckoutIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(bareCheckoutPath(readVamosTrip()));
  }, [router]);

  return <div data-checkout-redirect aria-busy="true" />;
}
