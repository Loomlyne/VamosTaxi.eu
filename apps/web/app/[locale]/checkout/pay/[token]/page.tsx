import { PayClient } from "./PayClient";

export default async function CheckoutPayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PayClient token={token} />;
}
