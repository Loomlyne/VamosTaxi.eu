import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { WEB_ROOT } from "./server-harness";

/**
 * Source of the one-page checkout the customer sees: CheckoutPage.tsx, CheckoutForm.tsx plus every
 * file in sections/. Source-assertion tests read this instead of the retired
 * multi-step client.
 */
export function readCheckoutPageSource(): string {
  const dir = join(WEB_ROOT, "app/[locale]/checkout");
  const files = [
    join(dir, "CheckoutPage.tsx"),
    join(dir, "CheckoutForm.tsx"),
    ...readdirSync(join(dir, "sections"))
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => join(dir, "sections", name)),
  ];
  return files.map((file) => readFileSync(file, "utf8")).join("\n");
}
