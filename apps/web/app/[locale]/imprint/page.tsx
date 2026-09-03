import type { Metadata } from "next";
import type { ReactNode } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { Button } from "@/components/core";
import { LanguageCoverageNotice, LegalPage, PendingSlot, type LegalSection } from "@/components/legal";
import { buildAlternates } from "@/lib/metadata";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_HREF } from "@/lib/contact-channels";
import "./imprint.css";

const { Link } = createNavigation(routing);

const IMPRINT_SECTIONS: LegalSection[] = [
  { id: "register", number: "01", titleKey: "legal.register-details" },
  { id: "kontakt", number: "02", titleKey: "common.contact" },
  { id: "vertretung", number: "03", titleKey: "legal.authorised-representative" },
  { id: "mwst", number: "04", titleKey: "legal.vat" },
  { id: "aufsicht", number: "05", titleKey: "legal.supervisory-authority-and-licence" },
  { id: "dispute", number: "06", titleKey: "legal.dispute-resolution" },
  { id: "haftung", number: "07", titleKey: "home.disclaimer" },
  { id: "urheberrecht", number: "08", titleKey: "legal.copyright" },
  { id: "credits", number: "09", titleKey: "legal.design-and-build" },
];

function DlRow({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <div data-dl-r="1">
      <dt data-dl-k="1">{term}</dt>
      <dd data-dl-v="1">{children}</dd>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const tCommon = await getTranslations({ locale, namespace: "common" });
  const tLegal = await getTranslations({ locale, namespace: "legal" });
  return {
    title: tCommon("imprint"),
    description: tLegal("who-stands-behind-this-site-where-the-company-is"),
    alternates: buildAlternates("/imprint"),
  };
}

export default async function ImprintPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tLegal = await getTranslations("legal");
  const tCommon = await getTranslations("common");
  const tContact = await getTranslations("contact");
  const tOps = await getTranslations("ops");
  const tAbout = await getTranslations("about");
  const tHome = await getTranslations("home");

  // The mock's DE/EN/both CSS toggle is not ported. Under SSR the active
  // language is the [locale] segment; a page-local second switch would make
  // one URL render content that contradicts its lang attribute and its
  // hreflang alternates. German+English together is the header language
  // switcher; LanguageCoverageNotice tells a French or Arabic reader where
  // they stand. LEGAL_LANGUAGES.imprint stays ['en','de'] (plan 05-03).

  return (
    <LegalPage
      page="imprint"
      sections={IMPRINT_SECTIONS}
      titleKey="common.imprint"
      standfirstKey="legal.who-stands-behind-this-site-where-the-company-is"
      kickerKey="common.legal"
      effectiveDateLabel="Imprint effective date"
      versionLabel="Imprint version"
    >
      {/* LegalPage PendingSlot: Imprint effective date */}
      {/* LegalPage PendingSlot: Imprint version */}
      <LanguageCoverageNotice page="imprint" />

      <section id="register">
        <h2>
          <span data-lg-n="1">01</span>
          {tLegal("register-details")}
        </h2>
        <dl data-dl="1">
          <DlRow term={tLegal("registered-firm-name")}>
            <span data-i18n-skip>Vamos Taxi</span> {tLegal("the-register-entry-carries-the-name-without-gmbh")}
          </DlRow>
          <DlRow term={tLegal("legal-form")}>
            <span data-i18n-skip>GmbH</span> {tLegal("swiss-limited-liability-company")}
          </DlRow>
          <DlRow term={tLegal("company-number")}>
            <span data-i18n-skip>CH-020.4.077.792-7</span>
          </DlRow>
          <DlRow term={tLegal("register-office")}>{tAbout("canton-of-zurich")}</DlRow>
          <DlRow term={tContact("registered-office")}>
            <PendingSlot label="Imprint street" />, <PendingSlot label="Imprint postcode" />
            {tContact("switzerland")}
          </DlRow>
        </dl>
      </section>

      <section id="kontakt">
        <h2>
          <span data-lg-n="1">02</span>
          {tCommon("contact")}
        </h2>
        <dl data-dl="1">
          <DlRow term={tCommon("email")}>
            <a href={SUPPORT_EMAIL_HREF}>{SUPPORT_EMAIL}</a>
          </DlRow>
          <DlRow term={tContact("telephone")}>
            <a href="tel:+41796267082">+41 79 626 70 82</a>
          </DlRow>
          <DlRow term={<span data-i18n-skip>WhatsApp</span>}>
            <a href="https://wa.me/41796267082" target="_blank" rel="noreferrer noopener">
              +41 79 626 70 82
            </a>
          </DlRow>
          <DlRow term={tOps("website")}>
            <span data-i18n-skip>vamostaxi.site</span>
          </DlRow>
          <DlRow term={tLegal("postal-address")}>
            <span data-i18n-skip>Vamos Taxi GmbH</span>, <PendingSlot label="Imprint postal address" />
          </DlRow>
        </dl>
        <p>{tLegal("the-same-address-answers-questions-about-an-exis")}</p>
      </section>

      <section id="vertretung">
        <h2>
          <span data-lg-n="1">03</span>
          {tLegal("authorised-representative")}
        </h2>
        <dl data-dl="1">
          <DlRow term={tCommon("name")}>
            <span data-i18n-skip>Ben Othman Houssein</span>
          </DlRow>
          <DlRow term={tCommon("role")}>{tLegal("owner-and-managing-director")}</DlRow>
          <DlRow term={tLegal("responsible-for-content")}>
            <span data-i18n-skip>Ben Othman Houssein</span>
          </DlRow>
        </dl>
      </section>

      <section id="mwst">
        <h2>
          <span data-lg-n="1">04</span>
          {tLegal("vat")}
        </h2>
        <dl data-dl="1">
          <DlRow term={tLegal("uid-vat-number")}>
            <PendingSlot label="Uid number" />
          </DlRow>
        </dl>
        <div data-slot="1" data-i18n-skip>
          <p data-slot-k="1">Client input · UID</p>
          <p>
            The number appears nowhere on the previous site. It is not invented here: either the
            real UID in the CHE format with the VAT suffix, or the row comes out if the company is
            not VAT-registered. A wrong UID is worse than none.
          </p>
        </div>
      </section>

      <section id="aufsicht">
        <h2>
          <span data-lg-n="1">05</span>
          {tLegal("supervisory-authority-and-licence")}
        </h2>
        <div data-slot="1" data-i18n-skip>
          <p data-slot-k="1">Client input · licence</p>
          <p>
            Carrying passengers in the Canton of Zurich requires a licence. The issuing authority
            and the licence number belong here — they are a trust signal, not small print. Both are
            missing from the previous site.
          </p>
        </div>
      </section>

      <section id="dispute">
        <h2>
          <span data-lg-n="1">06</span>
          {tLegal("dispute-resolution")}
        </h2>
        <p>
          {tLegal("we-take-complaints-directly-the-route-is-in-the")}{" "}
          <Link href="/terms#complaints">{tCommon("terms-conditions")}</Link>.
        </p>
        <div data-slot="1" data-i18n-skip>
          <p data-slot-k="1">Client input · dispute body</p>
          <p>
            If an ombudsman or conciliation body applies, it is named here; for EU guests, also
            whether an online dispute-resolution platform applies. One answer fills this slot and
            the matching one in the terms.
          </p>
        </div>
      </section>

      <section id="haftung">
        <h2>
          <span data-lg-n="1">07</span>
          {tHome("disclaimer")}
        </h2>
        <div data-slot="1" data-i18n-skip>
          <p data-slot-k="1">Client input · content and links</p>
          <p>
            Standard wording on content, external links and availability. It does not replace
            liability for the journey itself, which sits in the terms — the two must not contradict
            each other.
          </p>
        </div>
      </section>

      <section id="urheberrecht">
        <h2>
          <span data-lg-n="1">08</span>
          {tLegal("copyright")}
        </h2>
        <p>{tLegal("text-images-the-brand-and-the-design-of-this-sit")}</p>
        <dl data-dl="1">
          <DlRow term={tLegal("image-credits")}>
            <PendingSlot label="Photography credit" />
          </DlRow>
        </dl>
      </section>

      <section id="credits">
        <h2>
          <span data-lg-n="1">09</span>
          {tLegal("design-and-build")}
        </h2>
        <dl data-dl="1">
          <DlRow term={tLegal("brand-and-design")}>
            <PendingSlot label="Brand agency credit" />
          </DlRow>
          <DlRow term={tOps("website")}>
            <PendingSlot label="Build agency credit" />
          </DlRow>
        </dl>
        <p>{tLegal("credit-only-where-the-agencies-agree-otherwise-t")}</p>
      </section>

      <div className="vt-imprint-cta" data-lg-noprint="1">
        <div className="vt-imprint-cta__copy">
          <h2>{tContact("reach-us-directly")}</h2>
          <p>{tLegal("one-number-one-address-one-person-who-answers")}</p>
        </div>
        <div className="vt-imprint-cta__actions">
          <Button variant="secondary" size="md" icon="phone" href="tel:+41796267082">
            +41 79 626 70 82
          </Button>
          <Button variant="ghost" size="md" href={SUPPORT_EMAIL_HREF}>
            {SUPPORT_EMAIL}
          </Button>
        </div>
      </div>
    </LegalPage>
  );
}
