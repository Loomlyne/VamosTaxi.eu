import type { ReactNode } from "react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { CheckerMark } from "@/components/core";
import "./auth-page.css";

const { Link } = createNavigation(routing);

export async function AuthSplit({
  children,
  guestNote = false,
}: {
  children: ReactNode;
  guestNote?: boolean;
}) {
  const tAuth = await getTranslations("auth");
  const tCommon = await getTranslations("common");

  return (
    <main data-auth="1">
      <div data-auth-col="1">
        <div data-auth-inner="1">
          {children}
          {guestNote ? (
            <p data-auth-guest="1">
              {tAuth("you-never-need-an-account-to-book-guest-checkout")}{" "}
              <Link href="/">{tCommon("book-a-transfer")}</Link>
            </p>
          ) : null}
        </div>
      </div>
      <aside data-auth-panel="1">
        <Image
          src="/brand/photography/fleet-van-street.jpg"
          alt={tAuth("a-vamos-taxi-v-class-waiting-on-a-city-street")}
          fill
          sizes="50vw"
          priority
          className="vt-auth-panel-photo"
        />
        <div className="vt-auth-panel-scrim" aria-hidden="true" />
        <div className="vt-auth-panel-checker" aria-hidden="true">
          <CheckerMark size={74} opacity={0.9} />
        </div>
        <div className="vt-auth-panel-copy">
          <p data-panel-line="1">{tAuth("ride-with-class")}</p>
          <p data-panel-sub="1">{tAuth("booked-ahead-priced-up-front-and-your-assigned-d")}</p>
        </div>
      </aside>
    </main>
  );
}
