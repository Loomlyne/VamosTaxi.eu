// packages/emails/src/PayLinkEmail.tsx
//
// Unpaid pay-link. Light brand voucher: white card, grey page, charcoal type.
// Real wordmark (charcoal + yellow tittles). Not a confirmation clone.
// Hex from design-system tokens — email clients cannot use var(--vt-*).
// Yellow: PAY NOW, 4px bar, route start pip. Do not invent CHF.

import type { ReactNode } from "react";
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { EmailExtraLine, EmailLocale, PayLinkForEmail } from "./lib/types";
import { extraNames } from "./lib/extras";
import { paxBagsLine, t } from "./lib/t";
import { formatPaidTotal } from "./ConfirmationEmail";
import { formatPickup } from "./lib/pickup-time";
import {
  BODY_FONT,
  CHARCOAL,
  DISPLAY_FONT,
  GREY,
  LOGO,
  MUTED,
  WHITE,
  YELLOW,
} from "./chrome";

const WHATSAPP_HREF = "https://wa.me/41796267082";
const LOCK_HOURS = 24;

const VEHICLE_KEY: Record<string, string> = {
  economy: "payLink.vehicleEconomy",
  business: "payLink.vehicleBusiness",
  first: "payLink.vehicleFirst",
  van: "payLink.vehicleVan",
};

function vehicleLabel(locale: EmailLocale, slug: string): string {
  const key = VEHICLE_KEY[slug];
  return key ? t(locale, key) : slug;
}

const kicker = {
  margin: 0,
  fontSize: "11px",
  fontWeight: 600,
  color: MUTED,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};

const place = {
  margin: "4px 0 0",
  fontSize: "16px",
  lineHeight: "22px",
  fontWeight: 600,
  color: CHARCOAL,
};

function ltr(value: string) {
  return (
    <span style={{ unicodeBidi: "isolate", direction: "ltr", whiteSpace: "nowrap" }}>
      {value}
    </span>
  );
}

function extraLabels(locale: EmailLocale, extras: EmailExtraLine[]): string[] {
  return extraNames(locale, extras);
}

function telHref(display: string): string {
  return `tel:${display.replace(/[^\d+]/g, "")}`;
}

function stripPhone(templateKey: string, locale: EmailLocale): string {
  return t(locale, templateKey, { phone: "" }).replace(/\s+/g, " ").trim();
}


function Pip({ fill }: { fill: string }) {
  return <Text style={{ margin: 0, fontSize: "10px", lineHeight: "14px", color: fill }}>●</Text>;
}

function Fact({
  label,
  children,
  first,
}: {
  label: string;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <Row>
      <Column style={{ paddingTop: first ? 0 : 16 }}>
        <Text style={kicker}>{label}</Text>
        <Text style={place}>{children}</Text>
      </Column>
    </Row>
  );
}

function inkLink(href: string, label: string) {
  return (
    <Link href={href} style={{ color: CHARCOAL, textDecoration: "none", fontWeight: 600 }}>
      {ltr(label)}
    </Link>
  );
}

export function PayLinkEmail({ link }: { link: PayLinkForEmail }) {
  const locale: EmailLocale = link.locale;
  const dir = locale === "ar" ? "rtl" : "ltr";
  const amount = formatPaidTotal(link.totalRappen);
  const extras = extraLabels(locale, link.extras);
  const vehicle = vehicleLabel(locale, link.vehicleClass);
  const hours = { hours: LOCK_HOURS };
  const pickupWhen = link.scheduledLocal ? formatPickup(link.scheduledLocal, locale) : "";

  return (
    <Html lang={locale} dir={dir}>
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
        <style>{`:root{color-scheme:light only!important}body{background-color:${GREY}!important;color:${CHARCOAL}!important}`}</style>
      </Head>
      <Preview>{t(locale, "payLink.preheader", hours)}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: GREY, color: CHARCOAL, fontFamily: BODY_FONT }}>
        <Container style={{ backgroundColor: WHITE, maxWidth: "560px", margin: "32px auto", padding: "0" }}>
          <Section style={{ backgroundColor: WHITE, padding: "28px 32px 20px" }}>
            <Img
              src={LOGO}
              width={216}
              height={30}
              alt="Vamos Taxi"
              style={{ display: "block", border: "0", outline: "none", width: "216px", height: "30px" }}
            />
            <Text
              style={{
                margin: "20px 0 0",
                fontFamily: DISPLAY_FONT,
                fontSize: "28px",
                lineHeight: "34px",
                fontWeight: 600,
                color: CHARCOAL,
              }}
            >
              {t(locale, "payLink.headline")}
            </Text>
            <Text style={{ margin: "10px 0 0", fontSize: "14px", color: MUTED }}>
              {t(locale, "payLink.referenceLabel")} {ltr(link.reference)}
            </Text>
            <Text style={{ margin: "8px 0 0", fontSize: "14px", color: MUTED }}>
              {t(locale, "payLink.unpaid")}
            </Text>
          </Section>

          <Section style={{ height: "4px", backgroundColor: YELLOW, fontSize: 0, lineHeight: "4px" }}>
            &nbsp;
          </Section>

          <Section style={{ backgroundColor: WHITE, padding: "28px 32px 8px" }}>
            <Text style={kicker}>{t(locale, "payLink.amountLabel")}</Text>
            <Text
              style={{
                margin: "8px 0 0",
                fontFamily: DISPLAY_FONT,
                fontSize: "36px",
                lineHeight: "40px",
                fontWeight: 700,
                color: CHARCOAL,
              }}
            >
              {ltr(amount)}
            </Text>
            <Button
              href={link.payUrl}
              style={{
                backgroundColor: YELLOW,
                color: CHARCOAL,
                fontFamily: BODY_FONT,
                fontSize: "16px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textDecoration: "none",
                padding: "16px 28px",
                marginTop: "24px",
                borderRadius: "999px",
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                textAlign: "center",
              }}
            >
              {t(locale, "payLink.payCta")}
            </Button>
            <Text style={{ margin: "16px 0 0", fontSize: "12px", color: MUTED }}>
              {t(locale, "payLink.linkLabel")}
            </Text>
            <Text style={{ margin: "6px 0 0", fontSize: "13px", lineHeight: "20px", color: CHARCOAL, wordBreak: "break-all" }}>
              <Link href={link.payUrl} style={{ color: CHARCOAL, unicodeBidi: "isolate" }}>
                {link.payUrl}
              </Link>
            </Text>
            <Text style={{ margin: "16px 0 0", fontSize: "13px", color: MUTED }}>
              {t(locale, "payLink.holdLine", hours)}
            </Text>
          </Section>

          {link.pickupText || link.dropoffText ? (
            <Section style={{ backgroundColor: WHITE, padding: "24px 32px 8px" }}>
              {link.pickupText ? (
                <Row>
                  <Column style={{ width: "22px", verticalAlign: "top", paddingTop: "4px" }}>
                    <Pip fill={YELLOW} />
                  </Column>
                  <Column style={{ verticalAlign: "top" }}>
                    <Text style={kicker}>{t(locale, "fromLabel")}</Text>
                    <Text style={place}>{link.pickupText}</Text>
                  </Column>
                </Row>
              ) : null}
              {link.pickupText && link.dropoffText ? (
                <Row>
                  <Column style={{ width: "22px", verticalAlign: "top", padding: "2px 0" }}>
                    <Text style={{ margin: 0, fontSize: "12px", lineHeight: "20px", color: GREY }}>│</Text>
                  </Column>
                  <Column>&nbsp;</Column>
                </Row>
              ) : null}
              {link.dropoffText ? (
                <Row>
                  <Column style={{ width: "22px", verticalAlign: "top", paddingTop: "4px" }}>
                    <Pip fill={CHARCOAL} />
                  </Column>
                  <Column style={{ verticalAlign: "top" }}>
                    <Text style={kicker}>{t(locale, "toLabel")}</Text>
                    <Text style={place}>{link.dropoffText}</Text>
                  </Column>
                </Row>
              ) : null}
            </Section>
          ) : null}

          <Section style={{ backgroundColor: WHITE, padding: "24px 32px 8px" }}>
            {pickupWhen ? (
              <Fact label={t(locale, "timeLabel")} first>
                {ltr(pickupWhen)}
              </Fact>
            ) : null}
            {link.flightNo ? (
              <Fact label={t(locale, "payLink.flightLabel")} first={!pickupWhen}>
                {ltr(link.flightNo)}
              </Fact>
            ) : null}
            <Fact
              label={t(locale, "vehicleLabel")}
              first={!pickupWhen && !link.flightNo}
            >
              {vehicle}
              {link.pax > 0 ? (
                <>
                  <br />
                  {paxBagsLine(locale, link.pax, link.bags)}
                </>
              ) : null}
            </Fact>
            {extras.length > 0 ? (
              <Fact label={t(locale, "payLink.extrasLabel")}>{extras.join(" · ")}</Fact>
            ) : null}
            {link.coupon ? (
              <Fact label={t(locale, "payLink.couponLabel")}>{link.coupon}</Fact>
            ) : null}
          </Section>

          <Section style={{ backgroundColor: WHITE, padding: "24px 32px 32px" }}>
            {link.contactName ? (
              <Fact label={t(locale, "payLink.passengerLabel")} first>
                {link.contactName}
              </Fact>
            ) : null}
            {link.contactPhone ? (
              <Fact label={t(locale, "payLink.phoneLabel")} first={!link.contactName}>
                {inkLink(telHref(link.contactPhone), link.contactPhone)}
              </Fact>
            ) : null}
            {link.companyName ? (
              <Fact
                label={t(locale, "payLink.companyLabel")}
                first={!link.contactName && !link.contactPhone}
              >
                {[link.companyName, link.companyAddress, link.companyVat]
                  .filter(Boolean)
                  .join(" · ")}
              </Fact>
            ) : null}
            <Button
              href={WHATSAPP_HREF}
              style={{
                backgroundColor: CHARCOAL,
                color: WHITE,
                fontFamily: DISPLAY_FONT,
                fontSize: "14px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                textDecoration: "none",
                padding: "14px 24px",
                borderRadius: "999px",
                display: "block",
                textAlign: "center",
                margin: "24px 0 0",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              {stripPhone("payLink.whatsapp", locale)}
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function payLinkPlainText(link: PayLinkForEmail): string {
  const locale = link.locale;
  const extras = extraLabels(locale, link.extras);
  const hours = { hours: LOCK_HOURS };
  const lines = [
    t(locale, "payLink.headline"),
    `${t(locale, "payLink.referenceLabel")} ${link.reference}`,
    t(locale, "payLink.unpaid"),
    `${t(locale, "payLink.amountLabel")} ${formatPaidTotal(link.totalRappen)}`,
    t(locale, "payLink.payCta"),
    link.payUrl,
    t(locale, "payLink.holdLine", hours),
  ];
  if (link.pickupText) lines.push(`${t(locale, "fromLabel")}: ${link.pickupText}`);
  if (link.dropoffText) lines.push(`${t(locale, "toLabel")}: ${link.dropoffText}`);
  if (link.scheduledLocal) {
    lines.push(`${t(locale, "timeLabel")} ${formatPickup(link.scheduledLocal, locale)}`);
  }
  if (link.flightNo) lines.push(`${t(locale, "payLink.flightLabel")} ${link.flightNo}`);
  lines.push(`${t(locale, "vehicleLabel")} ${vehicleLabel(locale, link.vehicleClass)}`);
  if (link.pax > 0) lines.push(paxBagsLine(locale, link.pax, link.bags));
  if (extras.length > 0) lines.push(`${t(locale, "payLink.extrasLabel")} ${extras.join(" · ")}`);
  if (link.coupon) lines.push(`${t(locale, "payLink.couponLabel")} ${link.coupon}`);
  if (link.contactName) {
    lines.push(`${t(locale, "payLink.passengerLabel")} ${link.contactName}`);
  }
  if (link.contactPhone) {
    lines.push(`${t(locale, "payLink.phoneLabel")} ${link.contactPhone}`);
  }
  if (link.companyName) {
    lines.push(
      [t(locale, "payLink.companyLabel"), link.companyName, link.companyAddress, link.companyVat]
        .filter(Boolean)
        .join(" "),
    );
  }
  lines.push(stripPhone("payLink.whatsapp", locale));
  lines.push(WHATSAPP_HREF);
  return lines.join("\n");
}

export function payLinkSubject(link: PayLinkForEmail): string {
  return t(link.locale, "payLink.subject", { reference: link.reference });
}

export { formatPickup };
