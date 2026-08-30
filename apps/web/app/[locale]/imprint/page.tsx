import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { LanguageCoverageNotice, LegalPage, PendingSlot, type LegalSection } from "@/components/legal";
import { buildAlternates } from "@/lib/metadata";

const { Link } = createNavigation(routing);

const IMPRINT_SECTIONS: LegalSection[] = [
  { id: "register", number: "01", titleKey: "legal.register-details" },
  { id: "kontakt", number: "02", titleKey: "common.contact" },
  { id: "vertretung", number: "03", titleKey: "legal.authorised-representative" },
  { id: "mwst", number: "04", titleKey: "legal.vat" },
  { id: "aufsicht", number: "05", titleKey: "legal.supervisory-authority-and-licence" },
  { id: "dispute", number: "06", titleKey: "legal.dispute-resolution" },
  { id: "haftung", number: "07", titleKey: "legal.liability" },
  { id: "urheberrecht", number: "08", titleKey: "legal.copyright" },
  { id: "credits", number: "09", titleKey: "legal.design-and-build" },
];

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
  const tOps = await getTranslations("ops");
  const tAbout = await getTranslations("about");
  const tContact = await getTranslations("contact");

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
      {/*
        The mock's page-local language toggle (de / en / both) is not ported.
        Under SSR the active language is the [locale] segment, and a second
        switch on this page would make one URL render content that contradicts
        its lang attribute and its hreflang alternates. German and English
        together are available through the header language switcher; the
        coverage notice is what tells a French or Arabic reader where they stand.
      */}
      <style>{`
        [data-dl] {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          margin-block: 2px 18px;
          margin-inline: 0;
          border-block-start: 1px solid var(--vt-grey-200);
        }
        [data-dl-r] {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 2px 24px;
          padding-block: 14px;
          padding-inline: 0;
          border-block-end: 1px solid var(--vt-grey-200);
        }
        [data-dl-k] {
          font-family: var(--vt-font-body);
          font-size: var(--vt-body-sm);
          font-weight: var(--vt-weight-semibold);
          color: var(--vt-text-primary);
        }
        [data-dl-v] {
          font-family: var(--vt-font-body);
          font-size: var(--vt-body-sm);
          line-height: var(--vt-body-leading);
          color: var(--vt-text-secondary);
        }
        @media (min-width: 620px) {
          [data-dl-r] {
            grid-template-columns: 230px minmax(0, 1fr);
          }
        }
      `}</style>

      <LanguageCoverageNotice page="imprint" />

      <section id="register">
        <h2>
          <span data-lg-n="1">01</span>
          {tLegal("register-details")}
        </h2>
        <dl data-dl="1">
          <div data-dl-r="1">
            <dt data-dl-k="1">{tLegal("registered-firm-name")}</dt>
            <dd data-dl-v="1">
              <span data-i18n-skip>Vamos Taxi</span> {tLegal("the-register-entry-carries-the-name-without-gmbh")}
            </dd>
          </div>
          <div data-dl-r="1">
            <dt data-dl-k="1">{tLegal("legal-form")}</dt>
            <dd data-dl-v="1">
              <span data-i18n-skip>GmbH</span> {tLegal("swiss-limited-liability-company")}
            </dd>
          </div>
          <div data-dl-r="1">
            <dt data-dl-k="1">{tLegal("company-number")}</dt>
            <dd data-dl-v="1">
              <span data-i18n-skip>CH-020.4.077.792-7</span>
            </dd>
          </div>
          <div data-dl-r="1">
            <dt data-dl-k="1">{tLegal("register-office")}</dt>
            <dd data-dl-v="1">{tAbout("canton-of-zurich")}</dd>
          </div>
          <div data-dl-r="1">
            <dt data-dl-k="1">{tContact("registered-office")}</dt>
            <dd data-dl-v="1">
              <PendingSlot label="Imprint street" />{" "}
              <PendingSlot label="Imprint postcode" />
            </dd>
          </div>
        </dl>
      </section>

      <section id="kontakt">
        <h2>
          <span data-lg-n="1">02</span>
          {tCommon("contact")}
        </h2>
        <dl data-dl="1">
          <div data-dl-r="1">
            <dt data-dl-k="1">{tCommon("email")}</dt>
            <dd data-dl-v="1">
              <a href="mailto:info@vamostaxi.eu">info@vamostaxi.eu</a>
            </dd>
          </div>
          <div data-dl-r="1">
            <dt data-dl-k="1">{tContact("telephone")}</dt>
            <dd data-dl-v="1">
              <a href="tel:+41796267082">+41 79 626 70 82</a>
            </dd>
          </div>
          <div data-dl-r="1">
            <dt data-dl-k="1">
              <span data-i18n-skip>WhatsApp</span>
            </dt>
            <dd data-dl-v="1">
              <a href="https://wa.me/41796267082" target="_blank" rel="noreferrer noopener">
                +41 79 626 70 82
              </a>
            </dd>
          </div>
          <div data-dl-r="1">
            <dt data-dl-k="1">{tOps("website")}</dt>
            <dd data-dl-v="1">
              <span data-i18n-skip>vamostaxi.eu</span>
            </dd>
          </div>
          <div data-dl-r="1">
            <dt data-dl-k="1">{tLegal("postal-address")}</dt>
            <dd data-dl-v="1">
              <span data-i18n-skip>Vamos Taxi GmbH</span>
            </dd>
          </div>
        </dl>
        <p>{tLegal("the-same-address-answers-questions-about-an-exis")}</p>
      </section>

      <section id="vertretung">
        <h2>
          <span data-lg-n="1">03</span>
          {tLegal("authorised-representative")}
        </h2>
        <dl data-dl="1">
          <div data-dl-r="1">
            <dt data-dl-k="1">{tCommon("name")}</dt>
            <dd data-dl-v="1">
              <span data-i18n-skip>Ben Othman Houssein</span>
            </dd>
          </div>
          <div data-dl-r="1">
            <dt data-dl-k="1">{tCommon("role")}</dt>
            <dd data-dl-v="1">{tLegal("owner-and-managing-director")}</dd>
          </div>
          <div data-dl-r="1">
            <dt data-dl-k="1">{tLegal("responsible-for-content")}</dt>
            <dd data-dl-v="1">
              <span data-i18n-skip>Ben Othman Houssein</span>
            </dd>
          </div>
        </dl>
      </section>

      <section id="mwst">
        <h2>
          <span data-lg-n="1">04</span>
          {tLegal("vat")}
        </h2>
        <dl data-dl="1">
          <div data-dl-r="1">
            <dt data-dl-k="1">{tLegal("uid-vat-number")}</dt>
            <dd data-dl-v="1">
              <PendingSlot label="Uid number" />
            </dd>
          </div>
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
        <dl data-dl="1">
          <div data-dl-r="1">
            <dt data-dl-k="1">{tLegal("supervisory-authority")}</dt>
            <dd data-dl-v="1">
              <PendingSlot label="Licence number" />
            </dd>
          </div>
        </dl>
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
          <Link href="/terms">{tCommon("terms-conditions")}</Link>.
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
          {tLegal("liability")}
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
          <div data-dl-r="1">
            <dt data-dl-k="1">{tLegal("image-credits")}</dt>
            <dd data-dl-v="1">
              <PendingSlot label="Photography credit" />
            </dd>
          </div>
        </dl>
      </section>

      <section id="credits">
        <h2>
          <span data-lg-n="1">09</span>
          {tLegal("design-and-build")}
        </h2>
        <dl data-dl="1">
          <div data-dl-r="1">
            <dt data-dl-k="1">{tLegal("brand-and-design")}</dt>
            <dd data-dl-v="1">
              <PendingSlot label="Brand agency credit" />
            </dd>
          </div>
          <div data-dl-r="1">
            <dt data-dl-k="1">{tOps("website")}</dt>
            <dd data-dl-v="1">
              <PendingSlot label="Build agency credit" />
            </dd>
          </div>
        </dl>
        <p>{tLegal("credit-only-where-the-agencies-agree-otherwise-t")}</p>
      </section>
    </LegalPage>
  );
}
