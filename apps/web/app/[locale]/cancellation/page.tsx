import type { Metadata } from "next";
import type { ReactNode } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { Button, Card, Icon } from "@/components/core";
import { Table, type TableColumn } from "@/components/data";
import { LanguageCoverageNotice, LegalPage, PendingSlot, type LegalSection } from "@/components/legal";
import { buildAlternates } from "@/lib/metadata";

const { Link, getPathname } = createNavigation(routing);

const CANCELLATION_SECTIONS: LegalSection[] = [
  { id: "tiers", number: "01", titleKey: "legal.what-you-get-back" },
  { id: "how", number: "02", titleKey: "legal.how-to-cancel" },
  { id: "modify", number: "03", titleKey: "legal.changing-a-booking" },
  { id: "delays", number: "04", titleKey: "legal.flight-delays" },
  { id: "driver", number: "05", titleKey: "legal.if-no-driver-arrives" },
  { id: "noshow", number: "06", titleKey: "legal.no-show" },
  { id: "disruption", number: "07", titleKey: "legal.snow-strikes-closures" },
  { id: "refunds", number: "08", titleKey: "legal.how-refunds-are-paid" },
];

type TierRow = {
  slug: string;
  tier: ReactNode;
  window: ReactNode;
  outcome: ReactNode;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const tCommon = await getTranslations({ locale, namespace: "common" });
  const tLegal = await getTranslations({ locale, namespace: "legal" });
  return {
    title: tCommon("cancellation-refunds"),
    description: tLegal("plans-change-this-page-says-exactly-what-happens"),
    alternates: buildAlternates("/cancellation"),
  };
}

export default async function CancellationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tLegal = await getTranslations("legal");
  const tCommon = await getTranslations("common");
  const tOps = await getTranslations("ops");
  const manageHref = getPathname({ href: "/manage-booking", locale });
  const signInHref = getPathname({ href: "/sign-in", locale });

  const columns: TableColumn<TierRow>[] = [
    { key: "tier", header: tOps("applies-when"), render: (r) => r.tier },
    { key: "window", header: tOps("rule"), render: (r) => r.window },
    { key: "outcome", header: tOps("refund-due"), render: (r) => r.outcome },
  ];

  return (
    <LegalPage
      page="cancellation"
      sections={CANCELLATION_SECTIONS}
      titleKey="common.cancellation-refunds"
      standfirstKey="legal.plans-change-this-page-says-exactly-what-happens"
      kickerKey="common.legal"
      effectiveDateLabel="Cancellation effective date"
      versionLabel="Cancellation version"
    >
      {/* LegalPage PendingSlot: Cancellation effective date */}
      {/* LegalPage PendingSlot: Cancellation version */}
      <LanguageCoverageNotice page="cancellation" />

      <div data-flag="1">
        <p data-flag-k="1">
          <Icon name="info" size={14} color="var(--vt-charcoal-900)" /> {tLegal("this-page-governs")}
        </p>
        <p>{tLegal("where-the-faq-a-service-page-or-the-terms-say-an")}</p>
      </div>

      <section id="tiers">
        <h2>
          <span data-lg-n="1">01</span>
          {tLegal("what-you-get-back")}
        </h2>
        {/* Matches the site (refund_review_tiers.sql): more than 24 hours = automatic full refund; within 24 hours = cancelled, refund decided by an admin (owner decision open). No 6-hour line. */}
        <p>{tLegal("measured-from-the-pickup-time-in-your-confirmati")}</p>
        <div style={{ maxInlineSize: "100%", overflowInline: "auto" }}>
        <Table
          columns={columns}
          rowKey="slug"
          rows={[
            {
              slug: "full",
              tier: tLegal("more-than"),
              window: tLegal("24-hours-before-pickup"),
              outcome: tLegal("100-refunded"),
            },
            {
              slug: "within",
              tier: tLegal("less-than"),
              window: tLegal("24-hours-before-pickup"),
              outcome: <PendingSlot label="Refund within 24 hours" />,
            },
            {
              slug: "done",
              tier: tLegal("after-the-ride"),
              window: tLegal("completed-ride-or-no-show"),
              outcome: tLegal("cannot-be-cancelled"),
            },
          ]}
        />
        </div>
        <p>{tLegal("tier-full-refund-automatic")}</p>
        <p>{tLegal("tier-within-24-cancelled-no-auto-refund")}</p>
        <p>
          {tLegal("when-noshow-see-section")} <a href="#noshow">06</a>
        </p>
      </section>

      <section id="how">
        <h2>
          <span data-lg-n="1">02</span>
          {tLegal("how-to-cancel")}
        </h2>
        <p>{tLegal("two-routes-both-ending-in-the-same-written-confi")}</p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))",
            gap: 16,
            marginBlockEnd: 16,
          }}
        >
          <Card padding="lg">
            <p
              style={{
                marginBlockStart: 0,
                marginBlockEnd: 12,
                display: "flex",
                alignItems: "center",
                gap: 9,
                fontFamily: "var(--vt-font-body)",
                fontSize: "var(--vt-label-sm)",
                letterSpacing: "var(--vt-label-tracking)",
                textTransform: "uppercase",
                fontWeight: "var(--vt-label-weight)",
                color: "var(--vt-text-muted)",
              }}
            >
              <Icon name="ticket" size={16} color="var(--vt-charcoal-900)" />
              {tLegal("booked-as-a-guest")}
            </p>
            <p
              style={{
                marginBlockStart: 0,
                marginBlockEnd: 14,
                fontFamily: "var(--vt-font-body)",
                fontSize: "var(--vt-body-md)",
                color: "var(--vt-text-secondary)",
              }}
            >
              {tLegal("use-the-manage-booking-link-in-your-confirmation")}
            </p>
            <Button variant="ghost" size="md" iconEnd="arrow-right" href={manageHref}>
              {tCommon("manage-a-booking")}
            </Button>
          </Card>
          <Card padding="lg">
            <p
              style={{
                marginBlockStart: 0,
                marginBlockEnd: 12,
                display: "flex",
                alignItems: "center",
                gap: 9,
                fontFamily: "var(--vt-font-body)",
                fontSize: "var(--vt-label-sm)",
                letterSpacing: "var(--vt-label-tracking)",
                textTransform: "uppercase",
                fontWeight: "var(--vt-label-weight)",
                color: "var(--vt-text-muted)",
              }}
            >
              <Icon name="user" size={16} color="var(--vt-charcoal-900)" />
              {tLegal("you-have-an-account")}
            </p>
            <p
              style={{
                marginBlockStart: 0,
                marginBlockEnd: 14,
                fontFamily: "var(--vt-font-body)",
                fontSize: "var(--vt-body-md)",
                color: "var(--vt-text-secondary)",
              }}
            >
              {tLegal("sign-in-and-open-the-booking-under-your-reservat")}
            </p>
            <Button variant="ghost" size="md" iconEnd="arrow-right" href={signInHref}>
              {tCommon("sign-in")}
            </Button>
          </Card>
        </div>
        <p>
          {tLegal("cannot-reach-either-call")}{" "}
          <a href="tel:+41796267082">+41 79 626 70 82</a>{" "}
          {tLegal("and-quote-your-reference-we-will-do-it-for-you-a")}
        </p>
      </section>

      <section id="modify">
        <h2>
          <span data-lg-n="1">03</span>
          {tLegal("changing-a-booking")}
        </h2>
        <p>
          {tLegal("time-address-passenger-count-and-vehicle-class-c")}{" "}
          <PendingSlot label="Modification deadline" /> {tLegal("before-pickup-free-of-charge-if-the-change-moves")}
        </p>
        <p>{tLegal("a-change-requested-after-that-deadline-is-treate")}</p>
      </section>

      <section id="delays">
        <h2>
          <span data-lg-n="1">04</span>
          {tLegal("flight-delays")}
        </h2>
        <p>{tLegal("give-us-the-flight-number-and-a-delay-costs-you")}</p>
        <ul>
          <li>{tLegal("delay-within-the-same-day-the-pickup-moves-autom")}</li>
          <li>
            {tLegal("flight-cancelled-or-diverted-tell-us-as-soon-as")} <a href="#disruption">07</a>
            {tLegal("not-as-a-late-cancellation")}
          </li>
          <li>
            {tLegal("no-flight-number-on-the-booking-we-cannot-see-th")}{" "}
            <Link href="/terms">{tCommon("terms-conditions")}</Link> {tLegal("apply")}
          </li>
        </ul>
      </section>

      <section id="driver">
        <h2>
          <span data-lg-n="1">05</span>
          {tLegal("if-no-driver-arrives")}
        </h2>
        <p>{tLegal("call-the-number-in-your-confirmation-before-you")}</p>
        <p>
          {tLegal("where-our-records-show-you-were-at-the-pickup-po")}{" "}
          <PendingSlot label="Driver noshow share" /> {tCommon("back")}
        </p>
        <p>{tLegal("both-at-meeting-point-80-20")}</p>
        <div data-slot="1" data-i18n-skip>
          <p data-slot-k="1">Client legal text · consequential costs</p>
          <p>
            Must say whether anything beyond the fare is covered when a driver does not arrive — a
            replacement taxi, a missed flight — and what evidence is needed. This is the claim
            customers pursue hardest, and it has to agree with the liability section of the terms.
          </p>
        </div>
      </section>

      <section id="noshow">
        <h2>
          <span data-lg-n="1">06</span>
          {tLegal("no-show")}
        </h2>
        <p>{tLegal("noshow-becomes-not-reached-30-60")}</p>
        <p>
          {tLegal("calls-we-make-before-that")} <PendingSlot label="Noshow call attempts" />
        </p>
        <ul>
          <li>{tLegal("airport-pickups-60-minutes-landing")}</li>
          <li>{tLegal("all-other-pickups-30-minutes-booked")}</li>
        </ul>
        <p>{tLegal("extra-time-per-commenced-hour")}</p>
      </section>

      <section id="disruption">
        <h2>
          <span data-lg-n="1">07</span>
          {tLegal("snow-strikes-closures")}
        </h2>
        <p>{tLegal("where-a-journey-becomes-impossible-or-unsafe-thr")}</p>
        <div data-slot="1" data-i18n-skip>
          <p data-slot-k="1">Client legal text · disruption outcome</p>
          <p>
            Must state the outcome — refund, voucher, or re-planning at no cost — and how long a
            booking stays open before it lapses. It has to match force majeure in the terms; write
            it once, cross-link it twice.
          </p>
        </div>
      </section>

      <section id="refunds">
        <h2>
          <span data-lg-n="1">08</span>
          {tLegal("how-refunds-are-paid")}
        </h2>
        <ul>
          <li>{tLegal("always-to-the-original-payment-method-we-cannot")}</li>
          <li>
            {tLegal("approved-within")} <PendingSlot label="Refund decision days" />
          </li>
          <li>{tLegal("team-refund-paid-30-days-acceptance")}</li>
        </ul>
        <p>
          {tLegal("unhappy-with-the-outcome-the-complaints-route-is")}{" "}
          <Link href="/terms">{tCommon("terms-conditions")}</Link>
          {tLegal("and-we-resolve-within-30-days")}
        </p>
      </section>

    </LegalPage>
  );
}
