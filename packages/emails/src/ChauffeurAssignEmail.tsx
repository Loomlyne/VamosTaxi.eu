// packages/emails/src/ChauffeurAssignEmail.tsx
//
// D-51 assign mail. PayLink envelope (logo, yellow bar, grey page). No CHF,
// no driver-app CTA, no WhatsApp.

import type { ReactNode } from "react";
import {
  Body,
  Column,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { EmailLocale } from "./lib/types";
import { t } from "./lib/t";
import { formatPickup } from "./PayLinkEmail";

const CHARCOAL = "#1E1F1F";
const GREY = "#DEDEDE";
const MUTED = "#545756";
const YELLOW = "#FDC20B";
const WHITE = "#FFFFFF";
const DISPLAY_FONT = "Qurova, Poppins, system-ui, sans-serif";
const BODY_FONT = 'Poppins, system-ui, -apple-system, "Segoe UI", sans-serif';
const LOGO = "https://vamostaxi.site/brand/logo/wordmark-email.png";

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

export type ChauffeurDispatchForEmail = {
  reference: string;
  locale: EmailLocale;
  pickupText: string;
  dropoffText: string;
  scheduledLocal: string;
};

export type ChauffeurDispatchKind = "assign" | "unassign";

function ltr(value: string) {
  return (
    <span style={{ unicodeBidi: "isolate", direction: "ltr", whiteSpace: "nowrap" }}>
      {value}
    </span>
  );
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

function ns(kind: ChauffeurDispatchKind): "chauffeurAssign" | "chauffeurUnassign" {
  return kind === "unassign" ? "chauffeurUnassign" : "chauffeurAssign";
}

export function ChauffeurDispatchEmail({
  trip,
  kind,
}: {
  trip: ChauffeurDispatchForEmail;
  kind: ChauffeurDispatchKind;
}) {
  const locale = trip.locale;
  const dir = locale === "ar" ? "rtl" : "ltr";
  const prefix = ns(kind);
  const pickupWhen = trip.scheduledLocal ? formatPickup(trip.scheduledLocal, locale) : "";

  return (
    <Html lang={locale} dir={dir}>
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
        <style>{`:root{color-scheme:light only!important}body{background-color:${GREY}!important;color:${CHARCOAL}!important}`}</style>
      </Head>
      <Preview>{t(locale, `${prefix}.preheader`, { reference: trip.reference })}</Preview>
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
              {t(locale, `${prefix}.headline`)}
            </Text>
            <Text style={{ margin: "10px 0 0", fontSize: "14px", color: MUTED }}>
              {t(locale, "referenceLabel")} {ltr(trip.reference)}
            </Text>
          </Section>

          <Section style={{ height: "4px", backgroundColor: YELLOW, fontSize: 0, lineHeight: "4px" }}>
            &nbsp;
          </Section>

          {trip.pickupText || trip.dropoffText ? (
            <Section style={{ backgroundColor: WHITE, padding: "24px 32px 8px" }}>
              {trip.pickupText ? (
                <Row>
                  <Column style={{ width: "22px", verticalAlign: "top", paddingTop: "4px" }}>
                    <Pip fill={YELLOW} />
                  </Column>
                  <Column style={{ verticalAlign: "top" }}>
                    <Text style={kicker}>{t(locale, "fromLabel")}</Text>
                    <Text style={place}>{trip.pickupText}</Text>
                  </Column>
                </Row>
              ) : null}
              {trip.pickupText && trip.dropoffText ? (
                <Row>
                  <Column style={{ width: "22px", verticalAlign: "top", padding: "2px 0" }}>
                    <Text style={{ margin: 0, fontSize: "12px", lineHeight: "20px", color: GREY }}>│</Text>
                  </Column>
                  <Column>&nbsp;</Column>
                </Row>
              ) : null}
              {trip.dropoffText ? (
                <Row>
                  <Column style={{ width: "22px", verticalAlign: "top", paddingTop: "4px" }}>
                    <Pip fill={CHARCOAL} />
                  </Column>
                  <Column style={{ verticalAlign: "top" }}>
                    <Text style={kicker}>{t(locale, "toLabel")}</Text>
                    <Text style={place}>{trip.dropoffText}</Text>
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
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function ChauffeurAssignEmail({ trip }: { trip: ChauffeurDispatchForEmail }) {
  return <ChauffeurDispatchEmail trip={trip} kind="assign" />;
}

export function chauffeurDispatchPlainText(
  trip: ChauffeurDispatchForEmail,
  kind: ChauffeurDispatchKind,
): string {
  const locale = trip.locale;
  const prefix = ns(kind);
  const lines = [
    t(locale, `${prefix}.headline`),
    `${t(locale, "referenceLabel")} ${trip.reference}`,
  ];
  if (trip.pickupText) lines.push(`${t(locale, "fromLabel")}: ${trip.pickupText}`);
  if (trip.dropoffText) lines.push(`${t(locale, "toLabel")}: ${trip.dropoffText}`);
  if (trip.scheduledLocal) {
    lines.push(`${t(locale, "timeLabel")} ${formatPickup(trip.scheduledLocal, locale)}`);
  }
  return lines.join("\n");
}

export function chauffeurDispatchSubject(
  trip: ChauffeurDispatchForEmail,
  kind: ChauffeurDispatchKind,
): string {
  return t(trip.locale, `${ns(kind)}.subject`, { reference: trip.reference });
}

export function chauffeurAssignPlainText(trip: ChauffeurDispatchForEmail): string {
  return chauffeurDispatchPlainText(trip, "assign");
}

export function chauffeurAssignSubject(trip: ChauffeurDispatchForEmail): string {
  return chauffeurDispatchSubject(trip, "assign");
}
