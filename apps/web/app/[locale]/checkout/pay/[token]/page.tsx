import type { Metadata } from "next";
import { PayClient } from "./PayClient";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function CheckoutPayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PayClient token={token} />;
}
