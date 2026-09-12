// packages/emails/src/lib/lifecycle-mail.tsx
//
// PayLink envelope (logo, yellow bar, grey page) for Phase 9 lifecycle mail.
// No WhatsApp. No SMS. No invented CHF.

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
import type { EmailLocale } from "./types";
import { t } from "./t";
import { formatPickup } from "../PayLinkEmail";

export const CHARCOAL = "#1E1F1F";
export const GREY = "#DEDEDE";
export const MUTED = "#545756";
export const YELLOW = "#FDC20B";
export const WHITE = "#FFFFFF";
export const DISPLAY_FONT = "Qurova, Poppins, system-ui, sans-serif";
export const BODY_FONT = 'Poppins, system-ui, -apple-system, "Segoe UI", sans-serif';
export const LOGO = "https://vamostaxi.site/brand/logo/wordmark-email.png";

export const kicker = {
  margin: 0,
  fontSize: "11px",
  fontWeight: 600,
  color: MUTED,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};

export const place = {
  margin: "4px 0 0",
  fontSize: "16px",
  lineHeight: "22px",
  fontWeight: 600,
  color: CHARCOAL,
};

export function ltr(value: string) {
  return (
    <span style={{ unicodeBidi: "isolate", direction: "ltr", whiteSpace: "nowrap" }}>
      {value}
    </span>
  );
}

export function Fact({
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

export type LifecycleTripBits = {
  reference: string;
  locale: EmailLocale;
  pickupText?: string;
  dropoffText?: string;
  scheduledLocal?: string;
};

export function tripLines(trip: LifecycleTripBits): string[] {
  const locale = trip.locale;
  const lines: string[] = [`${t(locale, "referenceLabel")} ${trip.reference}`];
  if (trip.pickupText) lines.push(`${t(locale, "fromLabel")}: ${trip.pickupText}`);
  if (trip.dropoffText) lines.push(`${t(locale, "toLabel")}: ${trip.dropoffText}`);
  if (trip.scheduledLocal) {
    lines.push(`${t(locale, "timeLabel")} ${formatPickup(trip.scheduledLocal, locale)}`);
  }
  return lines;
}

export function LifecycleMail({
  locale,
  preview,
  headline,
  reference,
  intro,
  pickupText,
  dropoffText,
  scheduledLocal,
  children,
  cta,
}: {
  locale: EmailLocale;
  preview: string;
  headline: string;
  reference: string;
  intro?: string;
  pickupText?: string;
  dropoffText?: string;
  scheduledLocal?: string;
  children?: ReactNode;
  cta?: { href: string; label: string };
}) {
  const dir = locale === "ar" ? "rtl" : "ltr";
  const pickupWhen = scheduledLocal ? formatPickup(scheduledLocal, locale) : "";

  return (
    <Html lang={locale} dir={dir}>
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
        <style>{`:root{color-scheme:light only!important}body{background-color:${GREY}!important;color:${CHARCOAL}!important}`}</style>
      </Head>
      <Preview>{preview}</Preview>
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
              {headline}
            </Text>
            <Text style={{ margin: "10px 0 0", fontSize: "14px", color: MUTED }}>
              {t(locale, "referenceLabel")} {ltr(reference)}
            </Text>
            {intro ? (
              <Text style={{ margin: "10px 0 0", fontSize: "14px", color: MUTED, lineHeight: "22px" }}>
                {intro}
              </Text>
            ) : null}
          </Section>

          <Section style={{ height: "4px", backgroundColor: YELLOW, fontSize: 0, lineHeight: "4px" }}>
            &nbsp;
          </Section>

          {pickupText || dropoffText ? (
            <Section style={{ backgroundColor: WHITE, padding: "24px 32px 8px" }}>
              {pickupText ? (
                <Row>
                  <Column style={{ width: "22px", verticalAlign: "top", paddingTop: "4px" }}>
                    <Text style={{ margin: 0, fontSize: "10px", lineHeight: "14px", color: YELLOW }}>●</Text>
                  </Column>
                  <Column style={{ verticalAlign: "top" }}>
                    <Text style={kicker}>{t(locale, "fromLabel")}</Text>
                    <Text style={place}>{pickupText}</Text>
                  </Column>
                </Row>
              ) : null}
              {pickupText && dropoffText ? (
                <Row>
                  <Column style={{ width: "22px", verticalAlign: "top", padding: "2px 0" }}>
                    <Text style={{ margin: 0, fontSize: "12px", lineHeight: "20px", color: GREY }}>│</Text>
                  </Column>
                  <Column>&nbsp;</Column>
                </Row>
              ) : null}
              {dropoffText ? (
                <Row>
                  <Column style={{ width: "22px", verticalAlign: "top", paddingTop: "4px" }}>
                    <Text style={{ margin: 0, fontSize: "10px", lineHeight: "14px", color: CHARCOAL }}>●</Text>
                  </Column>
                  <Column style={{ verticalAlign: "top" }}>
                    <Text style={kicker}>{t(locale, "toLabel")}</Text>
                    <Text style={place}>{dropoffText}</Text>
                  </Column>
                </Row>
              ) : null}
            </Section>
          ) : null}

          <Section style={{ backgroundColor: WHITE, padding: "24px 32px 32px" }}>
            {pickupWhen ? (
              <Fact label={t(locale, "timeLabel")} first>
                {ltr(pickupWhen)}
              </Fact>
            ) : null}
            {children}
            {cta ? (
              <>
                <Button
                  href={cta.href}
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
                  {cta.label}
                </Button>
                <Text style={{ margin: "16px 0 0", fontSize: "13px", lineHeight: "20px", color: CHARCOAL, wordBreak: "break-all" }}>
                  <Link href={cta.href} style={{ color: CHARCOAL, unicodeBidi: "isolate" }}>
                    {cta.href}
                  </Link>
                </Text>
              </>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
